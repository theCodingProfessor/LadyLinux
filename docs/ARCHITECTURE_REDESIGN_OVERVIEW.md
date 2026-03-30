# Lady Linux RAG Architecture Redesign - Complete Overview

## Summary

You've requested a two-phase architectural redesign to improve data management and embedding efficiency. This document provides a high-level overview of both phases and how they work together.

---

## The Two-Phase Architecture Upgrade

### Phase 1: Physical Database Layer
**File**: `docs/workflow_physical_database_setup.md`

**Goal**: Establish a persistent, queryable database for all system data

Creates a **single source of truth** separate from the vector database:
- Stores raw system files with metadata and versioning
- Maintains conversation history (human-readable ledger)
- Captures periodic system snapshots
- Caches parsed configuration values

**Key insight**: Instead of embedding files directly, we store them in a queryable database first.

---

### Phase 2: Embedder Redesign
**File**: `docs/workflow_embedder_redesign.md`

**Goal**: Make embedding smart, selective, and query-aware

Transforms embedder from "embed everything" to "embed only what's relevant":
- Query classifier determines which domains/columns are relevant
- Physical DB query builder fetches only matching content
- Embedder caches results to avoid redundant computation
- Retriever gets context-aware results with source column info

**Key insight**: Embed based on query intent, not all files at startup.

---

## How They Work Together

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER QUERY                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ Query Classifier     │ ← NEW (Phase 2)
                  │ (which domains?)     │
                  └──────────┬───────────┘
                             ↓
        ┌────────────────────────────────────────────┐
        │ Physical Database Query Builder            │ ← NEW (Phase 2)
        │ (select relevant columns from DB)          │
        │                                             │
        │ Queries: Phase 1 Physical DB               │
        │ ├─ SELECT file_content FROM system_files   │
        │ │  WHERE domain = 'firewall'               │
        │ └─ Returns metadata + column info          │
        └────────────────────┬───────────────────────┘
                             ↓
        ┌────────────────────────────────────────────┐
        │ Physical Database (Phase 1)                │
        │                                             │
        │ Tables:                                     │
        │ ├─ system_files (content, metadata)        │
        │ ├─ conversation_ledger (history)           │
        │ ├─ system_snapshots (OS state)             │
        │ └─ config_cache (parsed configs)           │
        │                                             │
        │ Storage: data_output/lady_linux.db         │
        └────────────────────┬───────────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ Embedding Cache      │ ← NEW (Phase 2)
                  │ (already embedded?)  │
                  └──────────┬───────────┘
                             ↓
        ┌────────────────────────────────────────────┐
        │ Embedder (Redesigned - Phase 2)            │
        │                                             │
        │ ├─ Check cache                             │
        │ ├─ If miss: call Ollama                    │
        │ ├─ Track source_column for each vector     │
        │ └─ Return vectors + metadata               │
        └────────────────────┬───────────────────────┘
                             ↓
        ┌────────────────────────────────────────────┐
        │ Vector Database (Qdrant)                   │
        │                                             │
        │ Stores vectors with enhanced payloads:     │
        │ ├─ text (chunk content)                    │
        │ ├─ source_path (file path)                 │
        │ ├─ source_column (DB column!) ← NEW        │
        │ ├─ domain (firewall/network/etc)           │
        │ └─ embedding_request_id (traceability)     │
        └────────────────────┬───────────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ Retriever            │
                  │ (top-k search)       │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │ Mistral LLM          │
                  │ (generate response)  │
                  └──────────┬───────────┘
                             ↓
        ┌────────────────────────────────────────────┐
        │ Response Logging (Phase 1)                 │
        │                                             │
        │ Call: physical_db.log_conversation(...)    │
        │ Stores:                                     │
        │ ├─ user_query                              │
        │ ├─ llm_response                            │
        │ ├─ retrieved_chunks_count                  │
        │ └─ timestamp                               │
        └────────────────────┬───────────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ Response to User     │
                  └──────────────────────┘
```

---

## Key Differences from Current Architecture

### Current (Sprint 1)
```
Files → Chunker → Embedder → Qdrant → Retriever → Mistral
(No persistent database)
(All files embedded at startup)
(No conversation history)
```

### New (After Redesign)
```
Files → Physical DB (persistent, queryable)
         ↓
         ├─ Query Classifier
         ├─ DB Query Builder
         ├─ Selective Embedder (cache-aware)
         ↓
         Qdrant (smaller, more focused)
         ↓
         Retriever (context-aware)
         ↓
         Mistral → Log to Physical DB
```

---

## Benefits of This Architecture

### Phase 1 (Physical Database) Benefits
- **Persistence**: System data survives application restarts
- **Auditability**: Full conversation history preserved
- **Version tracking**: See when files changed
- **Snapshots**: Understand system evolution over time
- **Offline capability**: Query even if vector DB is down

### Phase 2 (Smart Embedder) Benefits
- **Efficiency**: Only embed what's needed
- **Caching**: Avoid redundant Ollama calls
- **Scalability**: Handle larger datasets without vector DB bloat
- **Flexibility**: Add new data without re-seeding
- **Context awareness**: Different queries get different embeddings
- **Cost reduction**: Fewer API calls to embedding service

### Combined Benefits
- **Traceability**: Know exactly which query triggered which embedding
- **Debugging**: Easy to inspect physical DB when retrieval fails
- **Evolution**: Can transition from naive → smart embedder gradually
- **Fallback**: Physical DB search works even if embedder fails

---

## Implementation Timeline

### Week 1: Phase 1 Foundation
- Set up SQLite database schema
- Implement physical_db.py connection management
- Modify seed.py to populate physical DB
- Create db_inspector.py for debugging

### Week 2: Phase 1 Integration
- Modify watchdog_ingest.py to update physical DB
- Modify app.py /ask_rag endpoint to log conversations
- Implement snapshot.py for periodic system captures
- Test Phase 1 end-to-end

### Week 3: Phase 2 Foundation
- Implement query_classifier.py
- Implement db_query_builder.py
- Implement embedding_cache.py
- Modify embedder.py to add caching

### Week 4: Phase 2 Integration
- Implement embedding_manager.py
- Modify retriever.py to use new embedder
- Update vector_store.py schema
- Implement embedding_stats.py
- End-to-end testing

### Week 5+: Optimization & Monitoring
- Fine-tune query classifier
- Optimize cache hit rates
- Monitor embedding performance
- Iterate based on usage patterns

---

## Files to Create (Summary)

### Phase 1 (Physical Database)
1. `rag_layer/db_schema.py` - Table definitions
2. `rag_layer/physical_db.py` - Connection & CRUD ops
3. `rag_layer/snapshot.py` - System state captures
4. `rag_layer/db_inspector.py` - CLI debugging tools

### Phase 2 (Smart Embedder)
1. `rag_layer/query_classifier.py` - Intent detection
2. `rag_layer/db_query_builder.py` - Column-specific queries
3. `rag_layer/embedding_cache.py` - Embedding caching
4. `rag_layer/embedding_manager.py` - Orchestration
5. `rag_layer/embedding_stats.py` - Monitoring

### Files to Modify
- `rag_layer/config.py` - Add new constants for both phases
- `rag_layer/seed.py` - Populate physical DB instead of direct embedding
- `rag_layer/watchdog_ingest.py` - Sync changes to physical DB
- `rag_layer/embedder.py` - Add caching and column tracking
- `rag_layer/vector_store.py` - Update payload schema
- `rag_layer/retriever.py` - Use query-driven embedding
- `api_layer/app.py` - Log conversations to physical DB
- `requirements.txt` - Add SQLAlchemy, possibly others

---

## Detailed Implementation Guides

### For Phase 1: See
📄 `docs/workflow_physical_database_setup.md`

Covers:
- Database schema design
- Connection management
- File versioning
- Conversation logging
- System snapshots
- Configuration caching

### For Phase 2: See
📄 `docs/workflow_embedder_redesign.md`

Covers:
- Query classification
- Column-specific embedding
- Caching strategies
- Selective retrieval
- Performance monitoring
- Phased rollout

---

## Quick Reference: Key Concepts

| Concept | Phase | File | Purpose |
|---------|-------|------|---------|
| **Physical DB** | 1 | physical_db.py | Single source of truth for all data |
| **Query Classifier** | 2 | query_classifier.py | Determine which data is relevant |
| **DB Query Builder** | 2 | db_query_builder.py | Fetch only relevant columns |
| **Embedding Cache** | 2 | embedding_cache.py | Avoid redundant embeddings |
| **Embedding Manager** | 2 | embedding_manager.py | Orchestrate full workflow |
| **System Snapshots** | 1 | snapshot.py | Periodic OS state captures |
| **Conversation Ledger** | 1 | physical_db.py | Human-readable chat history |
| **Vector DB** | - | vector_store.py | Store embeddings (unchanged) |

---

## Success Criteria

### Phase 1 Complete When
- ✅ SQLite DB stores all system files with metadata
- ✅ Conversation history persists across restarts
- ✅ File versioning tracks changes
- ✅ System snapshots captured periodically
- ✅ Data survives application crashes

### Phase 2 Complete When
- ✅ Query classifier correctly identifies intent
- ✅ Only relevant columns are fetched from DB
- ✅ Embeddings are cached and reused
- ✅ Cache hit rate > 70% for repeated queries
- ✅ Embedding time improved vs original
- ✅ Vector DB is smaller than full-seed approach

---

## Next Steps

1. **Read** `docs/workflow_physical_database_setup.md` for Phase 1 details
2. **Read** `docs/workflow_embedder_redesign.md` for Phase 2 details
3. **Start** with Phase 1 (foundation required for Phase 2)
4. **Implement** in order: db_schema.py → physical_db.py → seed.py modifications
5. **Test** each step thoroughly before moving to next
6. **Monitor** performance and adjust caching strategy as needed

---

## Notes & Considerations

### Backwards Compatibility
- Current Qdrant collection can coexist with new architecture
- Phase 1 can be implemented first, Phase 2 follows
- Gradual migration: keep old flow working while building new

### Performance Tradeoffs
- **Pro**: Less vector DB storage, faster ingestion of new data
- **Con**: Query-time embedding adds latency (mitigated by caching)
- **Net**: Better overall system performance after cache warmup

### Failure Modes
- Physical DB unavailable → fall back to keyword search
- Embedder unavailable → use cached vectors or skip
- Cache corruption → graceful re-compute

---

## Questions?

Refer to the detailed workflow documents:
- Phase 1: `docs/workflow_physical_database_setup.md`
- Phase 2: `docs/workflow_embedder_redesign.md`
