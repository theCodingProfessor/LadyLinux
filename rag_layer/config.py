"""
Lady Linux Capstone Project - RAG Layer
File: config.py
Description: Holds every tunable constant in one place: watched directories,
             chunk size/overlap, Qdrant host/port/collection name, embedding
             model name, and the allow-listed paths.
"""

import os

# ── Qdrant ────────────────────────────────────────────────────────────
# For Sprint 1 we run Qdrant **in-memory** via the Python client.
# Set QDRANT_MODE=server to switch to a Docker/remote instance later.
QDRANT_MODE = os.getenv("QDRANT_MODE", "memory")          # "memory" | "server"
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ladylinux")

# ── Embedding model (Ollama) ─────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBED_URL = f"{OLLAMA_BASE_URL}/api/embeddings"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
VECTOR_DIM = int(os.getenv("VECTOR_DIM", "768"))           # nomic-embed-text → 768

# ── Chunking ─────────────────────────────────────────────────────────
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "512"))            # characters per chunk
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "64"))       # overlap between chunks

# ── Retrieval ────────────────────────────────────────────────────────
TOP_K = int(os.getenv("TOP_K", "5"))

# ── File safety limits ───────────────────────────────────────────────
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(1 * 1024 * 1024)))  # 1 MB

# ── Allowlist / Denylist ─────────────────────────────────────────────
# Only files whose path starts with an ALLOWED entry *and* does NOT
# start with a DENIED entry will be ingested.
ALLOWED_PATHS: list[str] = [
    "/etc/ufw/",
    "/etc/ssh/sshd_config",
    "/etc/hostname",
    "/etc/hosts",
    "/etc/passwd",
    "/etc/group",
    "/etc/network/",
    "/etc/netplan/",
    "/etc/systemd/",
    "/var/log/syslog",
    "/var/log/auth.log",
    "/var/log/ufw.log",
]

DENIED_PATHS: list[str] = [
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/ssh/ssh_host_",       # private host keys
    "/etc/ssl/private/",
]

# ── Domain tagging (used by payload filtering in Qdrant) ─────────────
# Maps path prefixes to a human-readable domain label.
DOMAIN_MAP: dict[str, str] = {
    "/etc/ufw/":       "firewall",
    "/var/log/ufw":    "firewall",
    "/etc/ssh/":       "os",
    "/etc/hostname":   "os",
    "/etc/hosts":      "os",
    "/etc/network/":   "os",
    "/etc/netplan/":   "os",
    "/etc/systemd/":   "os",
    "/var/log/syslog": "os",
    "/var/log/auth":   "users",
    "/etc/passwd":     "users",
    "/etc/group":      "users",
}


# ── Helpers ──────────────────────────────────────────────────────────

def is_path_allowed(path: str) -> bool:
    """Return True only if *path* is on the allowlist and NOT on the denylist."""
    allowed = any(path.startswith(prefix) for prefix in ALLOWED_PATHS)
    denied = any(path.startswith(prefix) for prefix in DENIED_PATHS)
    return allowed and not denied


def domain_for_path(path: str) -> str:
    """Return the domain tag for a given file path, or 'general'."""
    for prefix, domain in DOMAIN_MAP.items():
        if path.startswith(prefix):
            return domain
    return "general"
