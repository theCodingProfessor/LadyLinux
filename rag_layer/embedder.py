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

from rag_layer.config import (
    EMBEDDING_MODEL,
    OLLAMA_EMBED_URL,
    VECTOR_DIM,
)

log = logging.getLogger("rag_layer.embedder")

# ── Internal constants ───────────────────────────────────────────────
_MAX_RETRIES = 3
_RETRY_DELAY = 2          # seconds between retries
_REQUEST_TIMEOUT = 30     # seconds per HTTP call


# ── Helpers ──────────────────────────────────────────────────────────

def _embed_single(text: str) -> list[float]:
    """Call Ollama for a single text and return the raw embedding vector.

    Raises on non-200 responses after exhausting retries.
    """
    payload = {"model": EMBEDDING_MODEL, "prompt": text}

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = requests.post(
                OLLAMA_EMBED_URL,
                json=payload,
                timeout=_REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            vector = resp.json().get("embedding", [])

            if len(vector) != VECTOR_DIM:
                log.warning(
                    "Unexpected vector dim %d (expected %d) — padding/truncating",
                    len(vector),
                    VECTOR_DIM,
                )
                # Pad with zeros or truncate to match expected dimension
                vector = (vector + [0.0] * VECTOR_DIM)[:VECTOR_DIM]

            return vector

        except requests.RequestException as exc:
            last_exc = exc
            log.warning(
                "Ollama embed attempt %d/%d failed: %s",
                attempt,
                _MAX_RETRIES,
                exc,
            )
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY)

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
        vectors.append(_embed_single(text))

    log.info("Embedded %d chunk(s) via %s", total, EMBEDDING_MODEL)
    return vectors
