"""
api_layer/logging_filters.py
Logging filters that suppress high-frequency, low-signal log lines so the
console and rotating log file stay readable during normal operation.
"""

import logging
import re

# Patterns matched against the formatted log message.
# Any record whose message matches at least one pattern is dropped.
_SUPPRESS_PATTERNS = [
    # Metrics polling — fired every few seconds by system_metrics.js
    re.compile(r'"GET /api/system/metrics'),
    # Process polling — fired every 5 s while the Processes tab is open
    re.compile(r'"GET /api/system/processes'),
    # WebSocket lifecycle noise (rejected upgrade, close frames, etc.)
    re.compile(r"WebSocket", re.IGNORECASE),
    re.compile(r"connection closed", re.IGNORECASE),
    re.compile(r"disconnect", re.IGNORECASE),
]


class IgnoreMetricsFilter(logging.Filter):
    """Drop noisy, high-frequency access and WebSocket log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p.search(msg) for p in _SUPPRESS_PATTERNS)
