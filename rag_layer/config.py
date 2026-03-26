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
OLLAMA_EMBED_URL = f"{OLLAMA_BASE_URL}/api/embed"
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
    # ── Firewall & Network ──
    "/etc/ufw/",
    "/etc/iptables/",
    "/etc/nftables/",
    "/var/log/ufw.log",

    # ── Network Configuration ──
    "/etc/network/",
    "/etc/netplan/",
    "/etc/hostname",
    "/etc/hosts",
    "/etc/resolv.conf",

    # ── SSH Configuration ──
    "/etc/ssh/sshd_config",

    # ── System Configuration ──
    "/etc/systemd/",
    "/etc/modprobe.d/",
    "/etc/sysctl.conf",
    "/etc/sysctl.d/",

    # ── User & Group Management ──
    "/etc/passwd",
    "/etc/group",

    # ── System Logs ──
    "/var/log/syslog",
    "/var/log/auth.log",
    "/var/log/messages",
    "/var/log/secure",
    "/var/log/kern.log",
    "/var/log/dmesg",
    "/var/log/fail2ban.log",

    # ── Package Management ──
    "/var/log/apt/",
    "/var/log/yum.log",
    "/var/log/pacman.log",

    # ── Application Logs ──
    "/var/log/nginx/",
    "/var/log/apache2/",
    "/var/log/supervisor/",

    # ── Firewall Statistics ──
    "/proc/net/iptables_names",
    "/proc/net/nf_conntrack",
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
    # Firewall domain
    "/etc/ufw/":            "firewall",
    "/etc/iptables/":       "firewall",
    "/etc/nftables/":       "firewall",
    "/var/log/ufw.log":     "firewall",
    "/proc/net/iptables":   "firewall",
    "/proc/net/nf_conntrack": "firewall",

    # Network domain
    "/etc/network/":        "network",
    "/etc/netplan/":        "network",
    "/etc/hostname":        "network",
    "/etc/hosts":           "network",
    "/etc/resolv.conf":     "network",

    # SSH domain
    "/etc/ssh/sshd_config": "ssh",

    # OS domain
    "/etc/systemd/":        "os",
    "/etc/modprobe.d/":     "os",
    "/etc/sysctl":          "os",
    "/var/log/syslog":      "os",
    "/var/log/kern.log":    "os",
    "/var/log/messages":    "os",
    "/var/log/dmesg":       "os",
    "/var/log/secure":      "os",

    # Users domain
    "/var/log/auth.log":    "users",
    "/var/log/fail2ban":    "users",
    "/etc/passwd":          "users",
    "/etc/group":           "users",

    # Package management domain
    "/var/log/apt/":        "packages",
    "/var/log/yum.log":     "packages",
    "/var/log/pacman.log":  "packages",

    # Application domain
    "/var/log/nginx/":      "applications",
    "/var/log/apache2/":    "applications",
    "/var/log/supervisor/": "applications",
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
