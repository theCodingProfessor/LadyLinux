# Workflow: Setting Up Physical Database for System Files & Conversation Ledger

## Overview

This document describes the workflow for implementing a **physical database** (separate from the vector database) to store:
1. System files and their structured metadata
2. Conversation history and ledger data (human-readable format)
3. System settings and configuration snapshots

This database will be the **single source of truth** for system state, while the vector database (Qdrant) will contain only embeddings derived from this physical database.

---

## Architecture

```
System Files (Raw)
    ↓
Physical Database
├─ sys_files_table (file paths, content, metadata, versions)
├─ conversation_ledger (user queries, responses, timestamps)
├─ system_snapshots (periodic OS state snapshots)
└─ config_cache (cached configurations with tracking)
    ↓
Physical DB Queries (via specific columns)
    ↓
Vector Database (Qdrant)
    ↓
Retrieval Layer
```

---

## Implementation Steps

### Step 1: Choose Database Technology

**Recommendation**: SQLite (for single-machine embedded use) or PostgreSQL (for multi-machine scenarios)

For Lady Linux MVP (in-memory/single machine):
- **SQLite** with `.db` file in `data_output/lady_linux.db`
- Advantages: no server, ACID compliance, full SQL support, easy deployment
- File-based persistence: survives restarts

For future scale:
- **PostgreSQL** with connection pooling
- Better concurrent access
- Network capability

**Decision**: Proceed with **SQLite** for Sprint 1/2, migrate to PostgreSQL in later sprints.

---

### Step 2: Create Physical Database Schema

Create a new file: `rag_layer/db_schema.py`

This file should define:

```
tables:
├─ system_files
│  ├─ id (PRIMARY KEY)
│  ├─ file_path (UNIQUE, indexed)
│  ├─ file_content (TEXT, full file)
│  ├─ file_size (INTEGER)
│  ├─ file_hash (TEXT, MD5/SHA256 for change detection)
│  ├─ last_modified (TIMESTAMP)
│  ├─ first_ingested (TIMESTAMP)
│  ├─ domain (TEXT, e.g. 'firewall', 'network', 'user')
│  ├─ version (INTEGER, auto-increment for tracking file versions)
│  └─ metadata (JSON, arbitrary key-value pairs)
│
├─ conversation_ledger
│  ├─ id (PRIMARY KEY)
│  ├─ session_id (TEXT, groups related queries)
│  ├─ user_query (TEXT, the human's question)
│  ├─ timestamp (TIMESTAMP)
│  ├─ retrieved_chunks_count (INTEGER)
│  ├─ llm_response (TEXT, Mistral's answer)
│  ├─ domain_filter (TEXT, domain used for retrieval)
│  └─ human_readable_summary (TEXT, contextual notes)
│
├─ system_snapshots
│  ├─ id (PRIMARY KEY)
│  ├─ snapshot_time (TIMESTAMP)
│  ├─ hostname (TEXT)
│  ├─ kernel_version (TEXT)
│  ├─ uptime_seconds (INTEGER)
│  ├─ system_load (TEXT)
│  ├─ memory_info (JSON)
│  ├─ active_connections (JSON)
│  └─ snapshot_data (JSON, full system state)
│
└─ config_cache
   ├─ id (PRIMARY KEY)
   ├─ config_key (UNIQUE, e.g. 'firewall.rules', 'ssh.enabled')
   ├─ config_value (TEXT, the actual value)
   ├─ last_read (TIMESTAMP)
   ├─ source_file (TEXT, where it came from)
   └─ human_explanation (TEXT, what this config does)
```

---

### Step 3: Create Database Connection & Management Layer

Create a new file: `rag_layer/physical_db.py`

This file should:
- Initialize SQLite connection (lazy initialization pattern)
- Provide connection pooling / context managers
- Implement CRUD operations for each table
- Handle transactions and rollback on errors
- Log all database operations
- Support both read-only queries and write operations

Key functions:
```python
def get_db_connection():
    """Lazy-initialize and return SQLite connection."""

def init_db():
    """Create all tables on first run."""

def insert_system_file(path, content, domain, metadata):
    """Store a system file with metadata."""

def get_system_file(path):
    """Retrieve a file from physical DB."""

def update_file_version(path, new_content):
    """Track file changes with versioning."""

def log_conversation(session_id, query, response, domain, retrieved_count):
    """Record a user query and LLM response."""

def get_conversation_history(session_id=None, limit=50):
    """Retrieve conversation history (human-readable)."""

def take_system_snapshot():
    """Capture full system state at this moment."""

def cache_config(key, value, source_file, explanation):
    """Store a parsed configuration value."""

def get_config(key):
    """Retrieve a cached config value."""
```

---

### Step 4: Populate Physical Database on Startup

Modify `rag_layer/seed.py`:

**Current flow**:
```
Files on disk → Chunker → Embedder → Qdrant
```

**New flow**:
```
Files on disk → Physical DB (insert/update) → Chunker → Embedder → Qdrant
```

Changes needed:
1. Before chunking, call `physical_db.insert_system_file(path, content, domain, metadata)`
2. Store file hash to detect future changes
3. Record timestamp when file was ingested
4. Log any version increments

---

### Step 5: Set Up File Change Detection & Sync

Modify `rag_layer/watchdog_ingest.py`:

**Current flow**:
```
File change detected → Chunker → Embedder → Qdrant
```

**New flow**:
```
File change detected → Physical DB (detect version change) → Chunker → Embedder → Qdrant
```

Changes needed:
1. When watchdog detects a file change, compute file hash
2. Compare hash against stored version in physical DB
3. If different, increment version and update record
4. Only then send to chunker/embedder/vector store
5. Log change history with timestamps

---

### Step 6: Implement Conversation Logging

Modify `api_layer/app.py` (the `/ask_rag` endpoint):

**Current flow**:
```
User query → Retriever → Mistral → Response
```

**New flow**:
```
User query → Retriever → Mistral → Response → Log to conversation_ledger
```

Changes needed:
1. After Mistral generates response, call `physical_db.log_conversation(...)`
2. Record:
   - User's original query
   - Number of chunks retrieved
   - Which domain was filtered (if any)
   - Full LLM response
   - Human-readable summary (optional)
   - Session ID for grouping
3. Return response as normal

---

### Step 7: Add Periodic System Snapshots

Create a new file: `rag_layer/snapshot.py`

This should:
1. Capture OS state periodically (e.g., every 6 hours)
2. Call `/proc` files for system info
3. Use system commands like `uname`, `uptime`, `free`, `netstat`
4. Store full snapshot in physical DB
5. Can be run via cron job or background thread

---

### Step 8: Create Database Inspection Tools

Create a new file: `rag_layer/db_inspector.py`

Provide CLI utilities:
```
python -m rag_layer.db_inspector --list-files                    # Show all indexed files
python -m rag_layer.db_inspector --show-file /etc/ufw/user.rules # Show file & versions
python -m rag_layer.db_inspector --conversation-history          # Print chat log
python -m rag_layer.db_inspector --stats                         # DB stats
python -m rag_layer.db_inspector --export <format>               # Export for backup
```

---

### Step 9: Update Configuration

Modify `rag_layer/config.py`:

Add new constants:
```python
# ── Physical Database ────────────────────────────────────────
PHYSICAL_DB_PATH = os.getenv("PHYSICAL_DB_PATH", "data_output/lady_linux.db")
PHYSICAL_DB_TYPE = os.getenv("PHYSICAL_DB_TYPE", "sqlite")  # "sqlite" or "postgresql"
ENABLE_SNAPSHOTS = os.getenv("ENABLE_SNAPSHOTS", "true").lower() == "true"
SNAPSHOT_INTERVAL = int(os.getenv("SNAPSHOT_INTERVAL", "21600"))  # 6 hours in seconds
```

---

### Step 10: Update Requirements

Modify `requirements.txt`:

Add:
```
qdrant-client>=2.7.0
nomic-embed-text>=1.0.43
requests>=2.31.0
ollama>=0.1.0
watchdog>=3.0.0
sqlalchemy>=2.0.0          # ORM for database abstraction
python-dateutil>=2.8.2     # Better datetime handling
```

SQLAlchemy is optional but recommended for cleaner DB code.

---

## Summary: Physical Database Layer

| Aspect | Details |
|--------|---------|
| **Technology** | SQLite (file-based), later PostgreSQL |
| **Location** | `data_output/lady_linux.db` |
| **Tables** | system_files, conversation_ledger, system_snapshots, config_cache |
| **Key Feature** | Single source of truth for all system data |
| **Integration** | Seed.py, watchdog_ingest.py, app.py all write to this DB |
| **Fallback** | Vector DB remains functional even if physical DB is unavailable (read-only degradation) |

---

## Next Steps

- ✅ Decide on SQLite vs PostgreSQL (SQLite for MVP)
- ⏳ Implement `db_schema.py`
- ⏳ Implement `physical_db.py` with connection management
- ⏳ Modify `seed.py` to populate physical DB
- ⏳ Modify `watchdog_ingest.py` to sync changes
- ⏳ Modify `app.py` to log conversations
- ⏳ Implement `snapshot.py` for periodic captures
- ⏳ Implement `db_inspector.py` for debugging
- ⏳ Update `config.py` with DB paths/settings
- ⏳ Update `requirements.txt` with new dependencies
