├── __init__.py
│   ├── config.py
│   ├── watchdog_ingest.py
│   ├── chunker.py
│   ├── embedder.py
│   ├── vector_store.py
│   └── retriever.py

__init__.py — Makes rag/ a Python package and exports the public API (retrieve, start_watchdog) so other modules like app.py can simply from rag import retrieve.
config.py — Holds every tunable constant in one place: watched directories, chunk size/overlap, Qdrant host/port/collection name, embedding model name, and the allow-listed paths.
watchdog_ingest.py — Monitors OS directories (e.g. /var/log, /etc) for file changes in real time using the watchdog library, and when a file is created or modified, passes it through the chunker → embedder → vector_store pipeline to keep Qdrant up to date.
chunker.py — Reads a file's text content and splits it into overlapping passages (e.g. 512 tokens with 64-token overlap), returning a list of {text, metadata} dicts that include the source path, line range, and timestamp.
embedder.py — Takes text passages and converts them into numerical vector embeddings by calling Ollama's /api/embeddings endpoint (or a local sentence-transformers model), returning vectors paired with their chunk metadata.
vector_store.py — Wraps the qdrant-client SDK to manage the Qdrant collection: creating it on first run, upserting new embeddings with metadata payloads, and performing similarity searches given a query vector.
retriever.py — The orchestrator that ties it all together at query time: it embeds the user's question via embedder.py, searches Qdrant via vector_store.py, and returns the top-k most relevant text passages to be injected into the Mistral prompt in app.py.