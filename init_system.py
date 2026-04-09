#!/usr/bin/env python3
"""
LadyLinux System Initializer
Sets up directories, permissions, and validates the environment before starting the API.
"""

import sys
import os
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger('ladylinux_init')

def setup_project_path():
    """Ensure project root is in sys.path"""
    project_root = Path(__file__).parent.absolute()
    sys.path.insert(0, str(project_root))
    logger.info("✓ Project path configured: %s", project_root)
    return project_root

def ensure_directories():
    """Create required directories with proper permissions"""
    dirs_to_create = [
        "/var/log/ladylinux",
        "/var/lib/ladylinux/qdrant",
        Path.home() / ".ladylinux",
    ]

    for dir_path in dirs_to_create:
        try:
            if isinstance(dir_path, str):
                dir_path = Path(dir_path)
            dir_path.mkdir(parents=True, exist_ok=True)
            logger.info("✓ Directory ready: %s", dir_path)
        except PermissionError:
            logger.warning("⚠ Cannot create %s (permission denied, using defaults)", dir_path)
        except Exception as e:
            logger.warning("⚠ Error creating %s: %s", dir_path, e)

def verify_imports():
    """Verify all critical imports work"""
    try:
        from api_layer.app import app
        logger.info("✓ API layer imports successful")
    except ImportError as e:
        logger.error("✗ API layer import failed: %s", e)
        return False

    try:
        from core.rag import retrieve, build_context_block, seed, ensure_collection
        logger.info("✓ RAG layer imports successful")
    except ImportError as e:
        logger.error("✗ RAG layer import failed: %s", e)
        return False

    try:
        from core.rag.vector_store import client, COLLECTION_NAME
        logger.info("✓ Vector store imports successful")
    except ImportError as e:
        logger.error("✗ Vector store import failed: %s", e)
        return False

    try:
        from llm_runtime import ensure_model
        logger.info("✓ LLM runtime imports successful")
    except ImportError as e:
        logger.error("✗ LLM runtime import failed: %s", e)
        return False

    return True

def check_ollama():
    """Check if Ollama is accessible"""
    try:
        import requests
        response = requests.get("http://localhost:11434/api/tags", timeout=2)
        if response.ok:
            models = response.json().get("models", [])
            if models:
                logger.info("✓ Ollama is running with %d model(s)", len(models))
                return True
            else:
                logger.warning("⚠ Ollama is running but has no models")
                return False
    except Exception as e:
        logger.error("✗ Cannot connect to Ollama: %s", e)
        logger.info("  Start Ollama with: ollama serve")
        return False

def initialize_rag():
    """Initialize RAG layer (create collection if needed)"""
    try:
        from core.rag.vector_store import ensure_collection, client, COLLECTION_NAME
        logger.info("Initializing RAG layer...")
        ensure_collection()
        c = client()
        info = c.get_collection(COLLECTION_NAME)
        logger.info("✓ RAG collection ready (%d points)", info.points_count)
        return True
    except Exception as e:
        logger.error("✗ RAG initialization failed: %s", e)
        return False

def main():
    """Run all initialization steps"""
    logger.info("=" * 60)
    logger.info("LadyLinux System Initialization")
    logger.info("=" * 60)

    # Step 1: Setup paths
    project_root = setup_project_path()

    # Step 2: Create directories
    ensure_directories()

    # Step 3: Verify imports
    if not verify_imports():
        logger.error("\n✗ Import verification failed!")
        return False

    # Step 4: Check Ollama
    ollama_ok = check_ollama()
    if not ollama_ok:
        logger.warning("\n⚠ Ollama not ready (will retry on first query)")

    # Step 5: Initialize RAG
    if not initialize_rag():
        logger.warning("\n⚠ RAG initialization failed (will retry on startup)")

    logger.info("=" * 60)
    logger.info("✓ Initialization complete!")
    logger.info("=" * 60)
    logger.info("\nYou can now start the API:")
    logger.info("  python run_api.py")
    logger.info("")

    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
