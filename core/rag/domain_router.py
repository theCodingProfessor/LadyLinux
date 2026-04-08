"""
Domain router for Lady Linux RAG.

This module determines which knowledge domain a user prompt belongs to.
Using simple keyword routing avoids unnecessary vector searches across
the entire knowledge base.
"""


def classify_domain(prompt: str) -> str:
    """Classify a user prompt into a retrieval domain.

    The router is intentionally lightweight and deterministic so it can run
    on every request without extra model calls.  If no domain is detected,
    return "any" to trigger full-collection fallback behavior.
    """
    p = str(prompt or "").lower()

    # Users and identity
    if any(k in p for k in ["user", "uid", "login", "account", "group"]):
        return "users"

    # Networking
    if any(k in p for k in ["network", "ip", "dns", "host", "interface"]):
        return "network"

    # Services / systemd
    if any(k in p for k in ["service", "systemd", "daemon", "unit"]):
        return "systemd"

    # Firewall
    if any(k in p for k in ["firewall", "iptables", "nftables"]):
        return "firewall"

    # Filesystem
    if any(k in p for k in ["disk", "filesystem", "storage", "mount"]):
        return "filesystem"

    # fallback
    return "any"


def detect_domain_from_path(path: str) -> str:
    """Infer a chunk domain from source path during ingestion.

    Path tagging ensures payload metadata matches query-time routing.  This
    function is used by chunking/ingestion and defaults to "filesystem" for
    uncategorized system files.
    """
    p = str(path or "").lower()

    if "passwd" in p or "/group" in p or "auth.log" in p:
        return "users"

    if (
        "/network" in p
        or "/netplan" in p
        or "/hosts" in p
        or "resolv.conf" in p
        or "dns" in p
    ):
        return "network"

    if "/systemd" in p or ".service" in p or ".socket" in p or ".timer" in p:
        return "systemd"

    if "ufw" in p or "nft" in p or "iptables" in p or "firewall" in p:
        return "firewall"

    return "filesystem"
