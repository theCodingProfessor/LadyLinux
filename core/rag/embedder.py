"""
Lady Linux Capstone Project - RAG Layer
File: embedder.py
Description: Takes text passages and converts them into numerical vector
             embeddings by calling Ollama's /api/embeddings endpoint, returning
             a list of float vectors aligned with the input texts.
"""

import logging
import time

import requests

from core.rag.config import (
    EMBEDDING_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_EMBED_URL,
    VECTOR_DIM,
)

log = logging.getLogger("core.rag.embedder")

# ── Internal constants ───────────────────────────────────────────────
_MAX_RETRIES = 3
_RETRY_DELAY = 2          # seconds between retries
_REQUEST_TIMEOUT = 30     # seconds per HTTP call
_LEGACY_OLLAMA_EMBED_URL = f"{OLLAMA_BASE_URL}/api/embeddings"
_EMBED_ENDPOINTS = (
    (_LEGACY_OLLAMA_EMBED_URL, "prompt"),
    (OLLAMA_EMBED_URL, "input"),
)
_endpoint_cache: tuple[str, str] | bool | None = None


# ── Helpers ──────────────────────────────────────────────────────────


class EmbeddingResponseError(ValueError):
    """Raised when Ollama returns malformed or empty embedding data."""


def _coerce_vector(raw_vector, *, url: str) -> list[float]:
    if not isinstance(raw_vector, list):
        raise EmbeddingResponseError(
            f"Embedding payload from {url} was not a list."
        )

    if not raw_vector:
        raise EmbeddingResponseError(
            f"Embedding payload from {url} was empty."
        )

    try:
        vector = [float(value) for value in raw_vector]
    except (TypeError, ValueError) as exc:
        raise EmbeddingResponseError(
            f"Embedding payload from {url} contained non-numeric values."
        ) from exc

    if len(vector) != VECTOR_DIM:
        log.warning(
            "Unexpected vector dim %d (expected %d) — padding/truncating",
            len(vector),
            VECTOR_DIM,
        )
        vector = (vector + [0.0] * VECTOR_DIM)[:VECTOR_DIM]

    return vector


def _extract_vector(body: dict, *, url: str) -> list[float]:
    if not isinstance(body, dict):
        raise EmbeddingResponseError(
            f"Embedding response from {url} was not valid JSON object data."
        )

    if "embedding" in body:
        return _coerce_vector(body["embedding"], url=url)

    if "embeddings" in body:
        embeddings = body["embeddings"]
        if not isinstance(embeddings, list) or not embeddings:
            raise EmbeddingResponseError(
                f"Embedding response from {url} did not include any embeddings."
            )
        return _coerce_vector(embeddings[0], url=url)

    raise EmbeddingResponseError(
        f"Embedding response from {url} did not include 'embedding' or 'embeddings'."
    )


def _embed_single(text: str) -> list[float]:
    """Call Ollama for a single text and return the raw embedding vector.

    Raises on non-200 responses after exhausting retries.
    """
    global _endpoint_cache

    if _endpoint_cache is False:
        raise ConnectionError(
            "Ollama embedding APIs are unavailable or returning invalid payloads. "
            "Skipping embedding until support is available."
        )

    endpoint_candidates = (
        [_endpoint_cache]
        if isinstance(_endpoint_cache, tuple)
        else list(_EMBED_ENDPOINTS)
    )

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        all_404 = True
        for url, text_key in endpoint_candidates:
            payload = {"model": EMBEDDING_MODEL, text_key: text}
            try:
                resp = requests.post(
                    url,
                    json=payload,
                    timeout=_REQUEST_TIMEOUT,
                )
                if resp.status_code == 404:
                    last_exc = requests.HTTPError(
                        f"404 Client Error: Not Found for url: {url}"
                    )
                    log.info(
                        "Ollama embed endpoint not available at %s; trying fallback",
                        url,
                    )
                    continue

                all_404 = False

                resp.raise_for_status()

                body = resp.json()
                vector = _extract_vector(body, url=url)

                _endpoint_cache = (url, text_key)

                return vector

            except requests.HTTPError as exc:
                last_exc = exc
                all_404 = False
                log.warning(
                    "Ollama embed attempt %d/%d failed at %s: %s",
                    attempt,
                    _MAX_RETRIES,
                    url,
                    exc,
                )
                continue
            except requests.RequestException as exc:
                last_exc = exc
                all_404 = False
                log.warning(
                    "Ollama embed attempt %d/%d failed at %s: %s",
                    attempt,
                    _MAX_RETRIES,
                    url,
                    exc,
                )
                continue
            except (EmbeddingResponseError, ValueError) as exc:
                last_exc = exc
                all_404 = False
                if _endpoint_cache == (url, text_key):
                    _endpoint_cache = None
                log.warning(
                    "Ollama embed attempt %d/%d returned invalid data at %s: %s",
                    attempt,
                    _MAX_RETRIES,
                    url,
                    exc,
                )
                continue

        if all_404:
            _endpoint_cache = False
            raise ConnectionError(
                "Ollama embedding APIs returned 404 for all known endpoints."
            )

        endpoint_candidates = list(_EMBED_ENDPOINTS)

        if attempt < _MAX_RETRIES:
            time.sleep(_RETRY_DELAY)

    if isinstance(last_exc, EmbeddingResponseError):
        _endpoint_cache = False

    raise ConnectionError(
        f"Ollama embedding failed after {_MAX_RETRIES} attempts: {last_exc}"
    )


# ── Public API ───────────────────────────────────────────────────────

def embed_query(text: str) -> list[float]:
    """Embed a single query string and return its vector.

    This is the convenience wrapper used at **query time** by retriever.py.
    """
    return _embed_single(text)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of text passages and return a list of vectors.

    Vectors are returned in the same order as *texts* so they can be
    zipped with the chunk dicts produced by chunker.py.

    Note: Ollama's /api/embeddings accepts one prompt at a time, so we
    loop.  If Ollama adds native batching later, this is the single
    place to upgrade.
    """
    vectors: list[list[float]] = []
    total = len(texts)

    for idx, text in enumerate(texts, 1):
        log.debug("Embedding chunk %d/%d (%d chars)", idx, total, len(text))
        try:
            vectors.append(_embed_single(text))
        except Exception as exc:  # noqa: BLE001
            raise ConnectionError(
                f"Failed to embed chunk {idx}/{total} ({len(text)} chars): {exc}"
            ) from exc

    log.info("Embedded %d chunk(s) via %s", total, EMBEDDING_MODEL)
    return vectors