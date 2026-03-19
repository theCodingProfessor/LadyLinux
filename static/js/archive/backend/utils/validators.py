# ARCHIVED FILE — extracted for UI portability
# Source: api_layer/utils/validators.py
# NOTE: This file may require dependency wiring when re-integrated
import re

SERVICE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_.@-]{1,128}$")
PACKAGE_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9+.-]{0,127}$")


def validate_service_name(name: str) -> str:
    value = (name or "").strip()
    if not SERVICE_NAME_PATTERN.fullmatch(value):
        raise ValueError("Invalid service name")
    return value


def validate_package_name(name: str) -> str:
    value = (name or "").strip().lower()
    if not PACKAGE_NAME_PATTERN.fullmatch(value):
        raise ValueError("Invalid package name")
    return value
