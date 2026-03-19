"""
Lady Linux Capstone Project - RAG Layer
File: __init__.py
Description: Makes rag_layer/ a Python package and exports the public API so
             other modules like app.py can simply do:
                 from rag_layer import retrieve, build_context_block
"""

from rag_layer.retriever import build_context_block, retrieve
from rag_layer.seed import seed
from rag_layer.vector_store import ensure_collection

__all__ = [
    "retrieve",
    "build_context_block",
    "ensure_collection",
    "seed",
]
