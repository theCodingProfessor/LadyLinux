# Workflow: Re-architecting Embedder for Column-Specific Embedding & Query-Driven Selection

## Overview

This document describes the workflow for modifying the **embedder** to work with the physical database rather than raw system files, enabling **selective embedding** based on request context.

**Current approach**: Embed all system files upfront (indiscriminate embedding)
**New approach**: Embed only relevant database columns on-demand based on query context

---

## Problem Statement

### Current Issues
1. **Indiscriminate embedding**: All files embedded at seed time, regardless of actual need
2. **No context awareness**: Embedder doesn't know what questions users will ask
3. **Vector space bloat**: Many irrelevant chunks in Qdrant
4. **Inflexible**: Adding new data sources requires re-seeding everything
5. **No targeted retrieval**: Can't say "I only want firewall rules, not user data"

### Solution
Implement a **query-driven embedding architecture** where:
- Physical DB is the source of truth
- Embedder queries specific columns based on request type
- Only relevant chunks are vectorized for each query
- Different queries may pull from different columns
- Caching reduces redundant embeddings

---

## Architecture

```
User Query
    ↓
Query Classifier (identifies intent: firewall? network? users?)
    ↓
Physical DB Query Builder
    ├─ Select relevant columns: (text, domain, source_file)
    ├─ Filter by domain: e.g., only "firewall" records
    └─ Filter by path: e.g., only /etc/ufw/*
    ↓
Physical DB Fetch
    ├─ Retrieve only matching rows
    ├─ Extract text from specific columns
    └─ Return with metadata
    ↓
Embedder (NEW: column-aware)
    ├─ Cache check: already embedded this content?
    ├─ If cached: return cached vectors
    ├─ If not: embed with Ollama
    └─ Store embeddings in vector DB with column reference
    ↓
Vector Store Upsert
    ├─ Store vectors with enhanced metadata:
    │  ├─ text (the chunk)
    │  ├─ source_path (file)
    │  ├─ source_column (which DB column?)
    │  ├─ domain (firewall/network/user)
    │  └─ embedding_request_id (trace which query triggered this)
    └─
    ↓
Retriever
    └─ Return top-k results with column source info
```

---

## Implementation Steps

### Step 1: Create Query Classifier

Create a new file: `rag_layer/query_classifier.py`

This should analyze the user's query and determine which parts of the system are relevant:

```python
def classify_query(query: str) -> dict:
    """Analyze query and return classification."""
    return {
        "domains": ["firewall", "network", ...],  # relevant domains
        "columns": ["file_content", "config_value", ...],  # which columns
        "paths": ["/etc/ufw/", ...],  # which files
        "intent": "explain" | "compare" | "diagnose",
        "urgency": "low" | "normal" | "high"
    }
```

**Keyword matching examples**:
- Query contains "firewall" → domain="firewall", columns=["file_content"]
- Query contains "ssh" → domain="ssh", columns=["config_value", "file_content"]
- Query contains "performance" → domain="system", columns=["system_load", "memory_info"]
- Query contains "history" → domain="any", columns=["conversation_ledger"]

Can use simple regex/keyword matching initially, upgrade to ML-based classifier later.

---

### Step 2: Create Database Query Builder

Create a new file: `rag_layer/db_query_builder.py`

This should construct database queries based on classification:

```python
def build_fetch_query(classification: dict) -> list[dict]:
    """Fetch from physical DB based on classification.
    
    Returns list of dicts:
    [
        {
            "text": "... content from specific column ...",
            "source_path": "/etc/ufw/user.rules",
            "source_column": "file_content",  # NEW: track which column
            "domain": "firewall",
            "metadata": {...}
        },
        ...
    ]
    """
```

Example implementation:
```python
def build_fetch_query(classification):
    domains = classification["domains"]
    paths = classification["paths"]
    
    # Build SQL WHERE clause
    where_clause = []
    if domains:
        where_clause.append(f"domain IN ({','.join(repr(d) for d in domains)})")
    if paths:
        where_clause.append(f"file_path IN ({','.join(repr(p) for p in paths)})")
    
    # Execute query
    query = "SELECT file_content, file_path, domain, ... FROM system_files"
    if where_clause:
        query += " WHERE " + " AND ".join(where_clause)
    
    return execute_query(query)
```

---

### Step 3: Modify Embedder to Accept Column Metadata

Modify `rag_layer/embedder.py`:

**Current signature**:
```python
def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed raw text."""
```

**New signature**:
```python
def embed_with_context(
    texts: list[str],
    source_columns: list[str] | None = None,
    cache_key: str | None = None,
) -> tuple[list[list[float]], dict]:
    """
    Embed texts with optional caching and column tracking.
    
    Args:
        texts: Raw text content to embed
        source_columns: Which DB columns these came from (for tracking)
        cache_key: For embeddings cache lookup
        
    Returns:
        (vectors, metadata_dict) where metadata includes:
        - embedding_source: which columns were embedded
        - cache_hit: was this retrieved from cache?
        - timestamp: when embedded
    """
```

**Key changes**:
1. Add embedding cache (Redis or local SQLite)
2. Check cache before hitting Ollama
3. Track which column each text came from
4. Store embedding provenance

Example implementation:
```python
def embed_with_context(texts, source_columns=None, cache_key=None):
    metadata = {
        "embedding_source": source_columns or ["unknown"],
        "cache_hit": False,
        "vectors": []
    }
    
    # Check cache first
    if cache_key and _check_embedding_cache(cache_key):
        metadata["cache_hit"] = True
        return _get_from_cache(cache_key), metadata
    
    # Embed via Ollama
    vectors = []
    for text in texts:
        vector = _embed_single(text)
        vectors.append(vector)
    
    # Store in cache
    if cache_key:
        _store_in_cache(cache_key, vectors, metadata)
    
    return vectors, metadata
```

---

### Step 4: Create Embedding Cache Layer

Create a new file: `rag_layer/embedding_cache.py`

This provides fast lookups for previously computed embeddings:

```python
def cache_embedding(
    content_hash: str,
    vector: list[float],
    source_column: str,
    ttl: int = 86400  # 24 hours
) -> None:
    """Store embedding with content hash as key."""

def get_cached_embedding(content_hash: str) -> list[float] | None:
    """Retrieve embedding if exists and not expired."""

def invalidate_column(column_name: str) -> None:
    """Clear cache for a specific column (when data changes)."""
```

**Implementation options**:
1. **Simple**: SQLite table with (content_hash, vector, column, timestamp)
2. **Fast**: Redis with expiration
3. **Hybrid**: Redis with SQLite fallback

For MVP: Use simple SQLite approach (stored in physical DB).

---

### Step 5: Create Request-Driven Embedding Manager

Create a new file: `rag_layer/embedding_manager.py`

This orchestrates the full embedding workflow:

```python
def embed_for_query(
    user_query: str,
    force_refresh: bool = False,
) -> list[list[float]]:
    """
    End-to-end embedding workflow for a user query.
    
    1. Classify the query
    2. Fetch relevant columns from physical DB
    3. Cache-check embeddings
    4. Embed any uncached content
    5. Return vectors
    """
    # Step 1: Classify
    classification = classify_query(user_query)
    
    # Step 2: Fetch from DB
    chunks = build_fetch_query(classification)
    
    # Step 3: Separate cached vs non-cached
    cached_vectors = []
    uncached_chunks = []
    for chunk in chunks:
        hash_val = compute_content_hash(chunk["text"])
        cached = get_cached_embedding(hash_val)
        if cached and not force_refresh:
            cached_vectors.append(cached)
        else:
            uncached_chunks.append((chunk, hash_val))
    
    # Step 4: Embed uncached
    if uncached_chunks:
        texts = [c["text"] for c, _ in uncached_chunks]
        new_vectors, metadata = embed_with_context(
            texts,
            source_columns=[c.get("source_column") for c, _ in uncached_chunks],
            cache_key=f"query_{user_query[:32]}"
        )
        
        # Store in cache
        for (chunk, hash_val), vector in zip(uncached_chunks, new_vectors):
            cache_embedding(
                hash_val,
                vector,
                chunk.get("source_column", "unknown")
            )
    else:
        new_vectors = []
    
    # Step 5: Combine and return
    all_vectors = cached_vectors + new_vectors
    return all_vectors
```

---

### Step 6: Modify Retriever to Use New Embedder

Modify `rag_layer/retriever.py`:

**Current flow**:
```python
def retrieve(query):
    vector = embed_query(query)  # Embed everything
    results = search(vector)
    return results
```

**New flow**:
```python
def retrieve(query, top_k=None, domain=None):
    # NEW: Use smart embedding
    vectors = embed_for_query(query)  # Only embed relevant columns
    
    # Search with additional filters
    results = search(
        vectors,
        top_k=top_k,
        domain=domain,
        include_source_column=True  # Return which DB column
    )
    
    return results
```

The retriever now returns results with additional info:
```python
{
    "text": "...",
    "source_path": "/etc/ufw/user.rules",
    "source_column": "file_content",  # NEW
    "domain": "firewall",
    "score": 0.95,
    "embedding_request_id": "req_xyz"  # For tracing
}
```

---

### Step 7: Update Vector Store Schema

Modify `rag_layer/vector_store.py` payload structure:

**Current payload**:
```python
{
    "text": "...",
    "source_path": "/etc/ufw/...",
    "line_start": 10,
    "line_end": 20,
    "domain": "firewall"
}
```

**New payload**:
```python
{
    "text": "...",
    "source_path": "/etc/ufw/...",
    "source_column": "file_content",  # NEW: which DB column
    "line_start": 10,
    "line_end": 20,
    "domain": "firewall",
    "embedding_request_id": "req_xyz",  # NEW: which query triggered
    "content_hash": "abc123...",  # NEW: for cache validation
    "embedding_timestamp": "2026-03-30T14:22:00Z"  # NEW
}
```

---

### Step 8: Create Domain Classifier

Enhance `query_classifier.py` with domain mapping:

```python
DOMAIN_KEYWORDS = {
    "firewall": ["firewall", "ufw", "iptables", "rules", "block", "allow"],
    "network": ["network", "ip", "ethernet", "dns", "routing", "gateway"],
    "ssh": ["ssh", "remote", "login", "key", "port 22"],
    "users": ["user", "group", "permission", "sudo", "passwd"],
    "logs": ["log", "error", "warning", "syslog", "dmesg"],
    "services": ["service", "systemd", "daemon", "running", "enabled"],
    "system": ["performance", "memory", "cpu", "uptime", "load"],
}

def classify_query(query: str) -> dict:
    query_lower = query.lower()
    domains = []
    
    for domain, keywords in DOMAIN_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            domains.append(domain)
    
    # If no match, include all domains
    if not domains:
        domains = list(DOMAIN_KEYWORDS.keys())
    
    return {
        "domains": domains,
        "columns": ["file_content", "config_value"],  # Default
        "paths": _get_paths_for_domains(domains),
        "intent": _detect_intent(query),
        "urgency": _detect_urgency(query)
    }
```

---

### Step 9: Create Embedding Statistics & Monitoring

Create a new file: `rag_layer/embedding_stats.py`

Track embedding usage:

```python
def log_embedding_event(
    query: str,
    classification: dict,
    vectors_generated: int,
    cache_hits: int,
    cache_misses: int,
    embedding_time_ms: float,
) -> None:
    """Log embedding performance metrics."""

def get_embedding_stats() -> dict:
    """Return stats: total embeddings, cache hit rate, slow queries, etc."""

def report_embedding_performance():
    """Print human-readable summary."""
```

Example output:
```
Embedding Performance Report
============================
Total embeddings generated: 1,543
Cache hit rate: 73.2%
Average embedding time: 145ms
Most common domains: firewall (412), network (367), users (298)
Slowest query: "What firewall rules apply to port 443?" (523ms)
```

---

### Step 10: Update Seed.py for New Architecture

Modify `rag_layer/seed.py`:

**Old approach**: Embed all files immediately

**New approach**: Populate physical DB, but don't pre-embed

```python
def seed(force: bool = False):
    """
    NEW: Populate physical DB with system files.
    Do NOT embed immediately.
    Embeddings happen on-demand during queries.
    """
    init_physical_db()
    
    for path in _expand_paths():
        with open(path, 'r') as f:
            content = f.read()
        
        # Store in physical DB
        physical_db.insert_system_file(
            path=path,
            content=content,
            domain=get_domain_for_path(path),
            metadata={"size": len(content), "hash": hash(content)}
        )
    
    # Don't embed anything here!
    # Embeddings happen when users query
    log.info("Seeded physical DB. Embeddings will happen on-demand.")
```

---

### Step 11: Update Configuration

Modify `rag_layer/config.py`:

Add new constants:
```python
# ── Embedding Strategy ──────────────────────────────────
EMBEDDING_STRATEGY = os.getenv("EMBEDDING_STRATEGY", "on_demand")
# "on_demand" = embed when queried
# "pre_seed" = embed all at startup (old approach)
# "hybrid" = pre-seed some, on-demand for others

ENABLE_EMBEDDING_CACHE = os.getenv("ENABLE_EMBEDDING_CACHE", "true").lower() == "true"
EMBEDDING_CACHE_TTL = int(os.getenv("EMBEDDING_CACHE_TTL", "86400"))  # 24 hours

# ── Query Classification ────────────────────────────────
ENABLE_QUERY_CLASSIFIER = os.getenv("ENABLE_QUERY_CLASSIFIER", "true").lower() == "true"
CLASSIFIER_CONFIDENCE_THRESHOLD = float(os.getenv("CLASSIFIER_CONFIDENCE", "0.5"))

# ── Selective Embedding ─────────────────────────────────
ENABLE_SELECTIVE_EMBEDDING = os.getenv("ENABLE_SELECTIVE_EMBEDDING", "true").lower() == "true"
MAX_EMBEDDINGS_PER_QUERY = int(os.getenv("MAX_EMBEDDINGS_PER_QUERY", "100"))
```

---

## Phased Rollout

### Phase 1: Foundation (Week 1-2)
- ✅ Implement query_classifier.py (keyword-based)
- ✅ Implement db_query_builder.py
- ✅ Implement embedding_cache.py (SQLite-based)
- ✅ Modify embedder.py to add caching layer
- ✅ Update config.py

### Phase 2: Integration (Week 2-3)
- ✅ Implement embedding_manager.py
- ✅ Modify retriever.py to use new flow
- ✅ Update vector_store.py schema
- ✅ Modify seed.py for on-demand approach
- ✅ Testing with various query types

### Phase 3: Monitoring (Week 3-4)
- ✅ Implement embedding_stats.py
- ✅ Create dashboard for embedding performance
- ✅ Optimize slow queries
- ✅ Fine-tune classifier

### Phase 4: Advanced (Week 4+)
- ⏳ ML-based query classifier (instead of keyword matching)
- ⏳ Smart column selection (learn which columns matter for each domain)
- ⏳ Distributed caching (Redis instead of SQLite)
- ⏳ Embedding optimization (batch queries, priority queues)

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Embedding overhead** | All files embedded upfront | Only relevant columns |
| **Query latency** | Fast retrieval (pre-computed) | Slightly slower (compute on-demand) + cache hits |
| **Memory usage** | Large vector DB | Smaller, focused vector DB |
| **Flexibility** | Rigid (add new data = re-seed) | Flexible (new data in physical DB, embed as needed) |
| **Accuracy** | Generic embeddings | Context-aware embeddings |
| **Scalability** | Struggles with large data | Scales better (selective embedding) |

---

## Fallback Strategy

If embedder fails:
1. System returns cached results (if available)
2. Falls back to keyword search in physical DB
3. Returns physical DB records with NO embeddings
4. User gets accurate info (just less ranked)

---

## Next Steps

- ⏳ Start with Phase 1 implementation
- ⏳ Build query_classifier.py with keyword matching
- ⏳ Test caching with sample queries
- ⏳ Measure performance improvements
- ⏳ Iterate based on real usage patterns
