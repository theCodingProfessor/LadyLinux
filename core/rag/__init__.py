"""
Lady Linux Capstone Project - RAG Layer
File: __init__.py
Description: Makes core.rag/ a Python package and exports the public API so
             other modules like app.py can simply do:
                 from core.rag import retrieve, build_context_block
"""

from core.rag.retriever import build_context_block, retrieve
from core.rag.seed import seed
from core.rag.vector_store import ensure_collection

__all__ = [
    "retrieve",
    "build_context_block",
    "ensure_collection",
    "seed",
]