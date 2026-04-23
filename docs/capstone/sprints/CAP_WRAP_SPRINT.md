## Plan: Unify Dual RAG Layers into Single Coherent Module

### Context Summary
Your repository contains **two parallel RAG implementations**:

1. **`/core/rag/`** — Newer, production-focused version with:
   - Advanced domain routing (`domain_router.py`, `system_provider.py`)
   - Persistent local storage (`QDRANT_MODE="local"` → `/var/lib/ladylinux/qdrant`)
   - Project-scoped + system path filtering (`allowed_for_rag()`)
   - Fine-grained domain taxonomy (docs, code, system-help, firewall, network, etc.)
   - Permission-aware system file tools (`system_file_tools.py`)

2. **`/rag_layer/`** — Original, in-memory MVP version with:
   - Simpler domain mapping (`DOMAIN_MAP` dict)
   - In-memory-only persistence (`QDRANT_MODE="memory"` by default)
   - Broader system path allowlisting
   - Simpler chunking/embedding without hardware auto-scaling

**The Problem**: `app.py` imports from **`/core/rag/`** (lines 42–45), but the permission error occurs because:
- `/var/lib/ladylinux/qdrant/.lock` cannot be created (permission denied)
- The service runs as user `ladylinux` but `/var/lib/` ownership may be incorrect
- Dual RAG creates maintenance burden and confusion

---

### Sprint Strategy: Consolidate to Single Source

#### Phase 1: Preparation & Validation
1. **Audit `/core/rag/` production readiness**  
   Compare embedder URLs: `/api/embed` (rag_layer) vs. `/api/embeddings` (core/rag)?  
   Verify Ollama endpoint compatibility  
   
2. **Document key differences in a comparison table** (config, retrieval logic, domain handling)

3. **Decide: Adopt `/core/rag/` as canonical** (recommended—more mature)  
   Reason: Local persistence, system-aware, domain router, already in app.py

#### Phase 2: Remove `/rag_layer/` Module
1. Verify no other imports reference `rag_layer` package  
2. Archive `/rag_layer/` directory  
3. Update git history with clean commit

#### Phase 3: Fix Permissions & Initialization
1. **Update service unit file** (`ladylinux-api.service`):  
   Ensure `[Service]` section creates `/var/lib/ladylinux/` with proper ownership  
   OR: Change `QDRANT_PATH` to `/var/lib/ladylinux/data/qdrant` (already under app data dir)

2. **Update installation scripts** (`install_ladylinux.sh`, `refresh_vm.sh`):  
   Add explicit directory creation + `chown ladylinux:ladylinux` for:
     - `/var/lib/ladylinux/` (Qdrant store)
     - `/var/log/ladylinux/` (logs, already noted)

3. **Set `QDRANT_MODE` consistently**:  
   Default to `"local"` for persistence (not `"memory"`)  
   Allow env var override for testing

#### Phase 4: Unify Configuration
1. Merge best practices from `/rag_layer/config.py` into `/core/rag/config.py`:
   - Keep `/core/rag/` **project-scoped allowlist** (more secure)
   - Add `/rag_layer/`'s **domain map** (richer taxonomy)
   - Keep hardware auto-scaling logic from `/core/rag/`

2. Standardize constants:  
   `OLLAMA_EMBED_URL` — verify endpoint (embeddings vs. embed)

#### Phase 5: Wire Up Remaining Imports
1. Ensure `seed.py` uses correct paths and file permissions  
   Fix: `"Failed to save tracker: [Errno 13] Permission denied"` warnings  
   
2. Update any `watchdog_ingest.py` references to use canonical `/core/rag/`

#### Phase 6: Test & Deploy
1. Run startup sequence (`refresh_vm.sh` or `start_lady.sh`)  
2. Verify Qdrant collection initializes without permission errors  
3. Test `/ask_rag` endpoint retrieves from vector store  
4. Verify logs appear in `/var/log/ladylinux/ladylinux.log`

---

### Key Files to Update

| File | Change                                                    | Reason |
|------|-----------------------------------------------------------|--------|
| [api_layer/app.py](./api_layer/app.py) | No change (already uses `core.rag`)                       | ✓ Already correct |
| [ladylinux-api.service](./ladylinux-api.service) | Add WorkingDirectory=/var/lib/ladylinux, verify ownership | Fix permission denied |
| [install_ladylinux.sh](./scripts/install_ladylinux.sh) | Add `mkdir -p /var/lib/ladylinux && chown`                | Ensure directory exists |
| [refresh_vm.sh](./scripts/refresh_vm.sh) | Same permission setup                                     | Consistency |
| [core/rag/config.py](./core/rag/config.py) | Merge domain map + ALLOWED_PATHS logic                    | Unified config |
| `/rag_layer/` | **Archive entire directory**                              | Remove duplicate code |

---

### Further Considerations

1. **Embedder Endpoint Mismatch**  
   Check if Ollama changed `/api/embeddings` → `/api/embed`. Verify which is correct for `nomic-embed-text`.

2. **Backward Compatibility**  
   After archive, ensure no external code (scripts, notebooks) imports `from rag_layer`. Quick grep to verify.

3. **Testing Strategy**  
   Consider a **test mode** environment variable:  
   - `QDRANT_MODE=memory` for fast unit tests (no I/O)  
   - `QDRANT_MODE=local` for integration tests (uses disk)

4. **Documentation Update**  
   After consolidation, create a single RAG architecture document at:  
   `docs/RAG_LAYER_UNIFIED.md` describing the canonical `/core/rag/` module.
