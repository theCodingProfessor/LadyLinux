"""
Lady Linux Capstone Project - RAG Layer
File: vector_store.py
Description: Wraps the qdrant-client SDK to manage the Qdrant collection:
             creating it on first run, upserting new embeddings with metadata
             payloads, and performing similarity searches given a query vector.

Sprint 1: runs Qdrant **in-memory** (no server required).
"""

import hashlib
import logging
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from rag_layer.config import (
    COLLECTION_NAME,
    QDRANT_HOST,
    QDRANT_MODE,
    QDRANT_PORT,
    VECTOR_DIM,
)

log = logging.getLogger("rag_layer.vector_store")

# ── Singleton client ─────────────────────────────────────────────────
_client: QdrantClient | None = None


def _get_client() -> QdrantClient:
    """Return (and lazily create) the module-level QdrantClient."""
    global _client
    if _client is None:
        if QDRANT_MODE == "memory":
            log.info("Initialising Qdrant client in **in-memory** mode")
            _client = QdrantClient(":memory:")
        else:
            log.info(
                "Connecting to Qdrant server at %s:%s",
                QDRANT_HOST,
                QDRANT_PORT,
            )
            _client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    return _client


# ── Deterministic point ID ───────────────────────────────────────────

def _chunk_id(source_path: str, offset: int, text: str) -> str:
    """Generate a deterministic UUID for a chunk identity.

    Re-ingesting the same chunk becomes an idempotent upsert rather than a
    duplicate insert.
    """
    raw = f"{source_path}::{offset}::{text[:128]}"
    return str(uuid.UUID(hashlib.md5(raw.encode()).hexdigest()))


# ── Public API ───────────────────────────────────────────────────────

def ensure_collection() -> None:
    """Create the Qdrant collection if it does not already exist."""
    client = _get_client()

    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME in existing:
        log.info(
            "Collection '%s' already exists — skipping creation",
            COLLECTION_NAME,
        )
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=VECTOR_DIM,
            distance=Distance.COSINE,
        ),
    )
    log.info(
        "Created collection '%s' (dim=%d, cosine)",
        COLLECTION_NAME,
        VECTOR_DIM,
    )


def upsert_chunks(chunks: list[dict], vectors: list[list[float]]) -> int:
    """Upsert *chunks* (from chunker) with their *vectors* (from embedder)
    into the Qdrant collection.

    Each point's payload carries the full chunk metadata so the retriever
    can return source attribution alongside the text.

    Returns the number of points upserted.
    """
    if len(chunks) != len(vectors):
        raise ValueError(
            "chunks "
            f"({len(chunks)}) and vectors ({len(vectors)}) must be the same length"
        )

    client = _get_client()

    points = []
    for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
        if not isinstance(vector, list) or len(vector) != VECTOR_DIM:
            actual_len = len(vector) if isinstance(vector, list) else "non-list"
            raise ValueError(
                "Invalid embedding vector for "
                f"{chunk.get('source_path', 'unknown-source')} "
                f"(expected {VECTOR_DIM} floats, got {actual_len})"
            )

        provided_id = chunk.get("chunk_id")
        point_id = None
        if provided_id:
            try:
                point_id = str(uuid.UUID(str(provided_id)))
            except (TypeError, ValueError):
                log.warning(
                    "Invalid chunk_id '%s' for %s; using deterministic UUID fallback",
                    provided_id,
                    chunk.get("source_path", "unknown-source"),
                )

        if not point_id:
            point_id = _chunk_id(
                chunk["source_path"],
                chunk.get("line_start", idx),
                chunk["text"],
            )
        points.append(
            PointStruct(
                id=point_id,
                vector=vector,
                payload={
                    "text": chunk["text"],
                    "source_path": chunk["source_path"],
                    "line_start": chunk.get("line_start", 0),
                    "line_end": chunk.get("line_end", 0),
                    "timestamp": chunk.get("timestamp", ""),
                    "domain": chunk.get("domain", "general"),
                },
            )
        )

    client.upsert(collection_name=COLLECTION_NAME, points=points)
    log.info("Upserted %d point(s) into '%s'", len(points), COLLECTION_NAME)
    return len(points)


def search(
    query_vector: list[float],
    top_k: int = 5,
    domain: str | None = None,
) -> list[dict]:
    """Return the *top_k* most similar chunks for *query_vector*.

    If *domain* is provided (e.g. ``"firewall"``), results are filtered to
    only that domain via a Qdrant payload filter.

    Each result dict contains:
        text, source_path, line_start, line_end, timestamp, domain, score
    """
    client = _get_client()

    query_filter = None
    if domain:
        query_filter = Filter(
            must=[FieldCondition(key="domain", match=MatchValue(value=domain))]
        )

    if hasattr(client, "search"):
        hits = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector,
            query_filter=query_filter,
            limit=top_k,
        )
    else:
        query_result = client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=query_filter,
            limit=top_k,
        )
        hits = getattr(query_result, "points", query_result)

    results = []
    for hit in hits:
        payload = hit.payload or {}
        results.append({
            "text": payload.get("text", ""),
            "source_path": payload.get("source_path", ""),
            "line_start": payload.get("line_start", 0),
            "line_end": payload.get("line_end", 0),
            "timestamp": payload.get("timestamp", ""),
            "domain": payload.get("domain", "general"),
            "score": hit.score,
        })

    log.info(
        "Search returned %d result(s) (domain=%s)",
        len(results),
        domain or "any",
    )
    return results