"""
Lady Linux Capstone Project - RAG Layer
File: watchdog_ingest.py
Description: Monitors OS directories (e.g. /var/log, /etc) for file changes in real time using the watchdog library, and when a file is created or modified, passes it through the chunker → embedder → vector_store pipeline to keep Qdrant up to date.

"""