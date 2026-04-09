#!/usr/bin/env python3
"""
LadyLinux API Launcher
Ensures proper initialization before starting the API service.
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root))

# Run initialization
from init_system import main as init_system
print("\n" + "=" * 60)
print("INITIALIZING LADYLINUX SYSTEM")
print("=" * 60 + "\n")

if not init_system():
    print("\n✗ Initialization failed. Cannot start API.")
    sys.exit(1)

# Now we can import and run the app
print("\nStarting API server...\n")

from api_layer.app import app
import uvicorn

if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
