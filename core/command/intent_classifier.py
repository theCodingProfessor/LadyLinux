"""
Simple intent classifier for LadyLinux.

Provides live topic detection for enriching prompts with real-time
system state before they are passed to the LLM.

This is the keyword fallback path used by non-streaming callers and
as a safety net when the semantic classifier is unavailable.
"""

LIVE_STATE_SIGNALS = {
    "processes": [
        "task", "tasks", "process", "processes", "running", "pid",
        "cpu", "what's running", "whats running",
        "sluggish", "slow", "hang", "hung", "frozen", "freeze",
        "load", "loaded", "busy", "spike", "high cpu",
        "top", "htop", "kill", "killing", "close", "terminate", "end process",
        "is running", "is active", "is up", "is open",
        "check if", "still running", "app", "application", "exe",
    ],
    "services": [
        "service", "services", "daemon", "daemons", "systemd",
        "unit", "units", "active", "inactive", "failed", "enabled",
        "disabled", "running service", "start", "stop", "restart",
        "is she running", "is it running", "anything down",
        "anything off", "all good", "is running", "is active", "is up",
        "is stopped", "is dead", "check if", "still running", "is it up",
    ],
    "network": [
        "connection", "connections", "port", "ports", "listening",
        "interface", "interfaces", "ip", "network", "internet",
        "ping", "dns", "firewall", "route", "routing", "can't connect",
        "cannot connect", "offline", "online", "bandwidth", "latency",
        "socket", "sockets",
    ],
    "disk": [
        "disk", "storage", "mount", "mounts", "space", "df",
        "out of room", "out of space", "full", "partition", "partitions",
        "filesystem", "inode", "inodes", "du", "usage",
    ],
    "memory": [
        "memory", "ram", "swap", "free", "oom", "out of memory",
        "mem", "heap", "cache", "buffer", "buffers",
        "how loaded", "how much memory", "memory usage",
    ],
}


def detect_live_topics(query: str) -> list[str]:
    text = (query or "").lower()
    return [
        topic
        for topic, keywords in LIVE_STATE_SIGNALS.items()
        if any(keyword in text for keyword in keywords)
    ]
