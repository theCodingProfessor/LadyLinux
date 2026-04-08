"""
Lady Linux Capstone Project - RAG Layer
File: vector_store.py
Description: Wraps the qdrant-client SDK to manage the Qdrant collection:
             creating it on first run, upserting new embeddings with metadata
             payloads, and performing similarity searches given a query vector.

Persistence modes (set via QDRANT_MODE env var):
  memory — in-process, wiped on restart (dev/test only)
  local  — embedded on-disk via qdrant-client path= (default for prod)
  server — remote Qdrant server (Docker / dedicated instance)
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

from core.rag.config import (
    COLLECTION_NAME,
    QDRANT_HOST,
    QDRANT_MODE,
    QDRANT_PATH,
    QDRANT_PORT,
    VECTOR_DIM,
)

log = logging.getLogger("rag_layer.vector_store")

# ── Singleton client ───────────────────────────────────────────────────────────
_client: QdrantClient | None = None


def _get_client() -> QdrantClient:
    """Return (and lazily create) the module-level QdrantClient."""
    global _client
    if _client is None:
        if QDRANT_MODE == "memory":
            log.info("Initialising Qdrant client in **in-memory** mode")
            _client = QdrantClient(":memory:")
        elif QDRANT_MODE == "server":
            log.info("Connecting to Qdrant server at %s:%s", QDRANT_HOST, QDRANT_PORT)
            _client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        else:
            # "local" mode — embedded on-disk persistence, no server needed
            log.info("Initialising Qdrant client in **local** mode (path=%s)", QDRANT_PATH)
            _client = QdrantClient(path=QDRANT_PATH)
    return _client


def client() -> QdrantClient:
    """
    Public client accessor used by startup/health checks.
    Keeps connection creation centralized.
    """
    return _get_client()


# ── Deterministic point ID ─────────────────────────────────────────────────────

def _chunk_id(source_path: str, offset: int, text: str) -> str:
    """Generate deterministic UUID so re-ingestion becomes idempotent."""
    raw = f"{source_path}::{offset}::{text[:128]}"
    return str(uuid.UUID(hashlib.md5(raw.encode()).hexdigest()))


# ── Collection Management ──────────────────────────────────────────────────────

def ensure_collection() -> None:
    """Create the Qdrant collection if it does not already exist."""
    client = _get_client()

    existing = [c.name for c in client.get_collections().collections]

    if COLLECTION_NAME in existing:
        log.info("Collection '%s' already exists — skipping creation", COLLECTION_NAME)
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


# ── Upsert Embeddings ──────────────────────────────────────────────────────────

def upsert_chunks(chunks: list[dict], vectors: list[list[float]]) -> int:
    """
    Upsert chunk embeddings into Qdrant.
    """
    if len(chunks) != len(vectors):
        raise ValueError(
            f"chunks ({len(chunks)}) and vectors ({len(vectors)}) must be same length"
        )

    client = _get_client()

    points = []

    for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
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
                    "filepath": chunk.get("filepath", chunk["source_path"]),
                    "filename": chunk.get("filename", ""),
                    "directory": chunk.get("directory", ""),
                    "filetype": chunk.get("filetype", "text"),
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


# ── Similarity Search ──────────────────────────────────────────────────────────

def search(
    query_vector: list[float],
    top_k: int = 5,
    domain: str | None = "any",
) -> list[dict]:
    """
    Return top_k most similar chunks.
    """
    client = _get_client()

    query_filter = None

    if domain and domain != "any":
        query_filter = Filter(
            must=[FieldCondition(key="domain", match=MatchValue(value=domain))]
        )

    # qdrant-client >= 1.16 uses query_points(); search() was removed.
    # with_vectors=False avoids returning full vectors in each hit, reducing
    # response payload size and improving query performance.
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=query_filter,
        limit=top_k,
        with_vectors=False,
    )

    hits = response.points

    results = []

    for hit in hits:
        payload = hit.payload or {}

        results.append(
            {
                "text": payload.get("text", ""),
                "source_path": payload.get("source_path", ""),
                "filepath": payload.get("filepath", payload.get("source_path", "")),
                "filename": payload.get("filename", ""),
                "directory": payload.get("directory", ""),
                "filetype": payload.get("filetype", "text"),
                "line_start": payload.get("line_start", 0),
                "line_end": payload.get("line_end", 0),
                "timestamp": payload.get("timestamp", ""),
                "domain": payload.get("domain", "general"),
                "score": hit.score,
            }
        )

    log.info(
        "Search returned %d result(s) (domain=%s)",
        len(results),
        domain or "any",
    )

    return results