# RAG Retrieval Fix - Why "Search Returned 0 Results" Was Happening

## Problem Summary

The system was seeding data correctly (chunks were stored in Qdrant), but queries always returned 0 results. The logs showed:

```
Seed complete - 75/75 files ingested, 267 chunks stored
...
Search returned 0 result(s) (domain=docs)
Search returned 0 result(s) (domain=system-help)
Search returned 0 result(s) (domain=code)
```

Despite the seed successfully storing chunks, they were never found during retrieval.

---

## Root Cause

**Scope Mismatch Between Seeding and Retrieval:**

### During Seeding (`seed.py`)
- Files come from `ALLOWED_SEED_ROOTS` which includes:
  - `/etc/ufw/`, `/etc/ssh/`, `/etc/systemd/`, etc.
  - `/etc/network/`, `/etc/hostname`, etc.
- Each file is tagged with a domain via `domain_for_path()`:
  - `/etc/ufw/sysctl.conf` → domain = "firewall"
  - `/etc/ssh/sshd_config` → domain = "ssh"
  - `/etc/systemd/system/ollama.service` → domain = "os"

### During Retrieval (`retriever.py`)
- The old code only searched in domains: `("docs", "code", "system-help")`
- When a query came in with domain="firewall", it would:
  1. Look for chunks with payload["domain"] == "firewall"
  2. But there were no such chunks in Qdrant (they were there, but search was limited)

### The Connection Issue
The `retriever.py` function `_domain_search_order()` was hardcoded to only return:
```python
["docs", "system-help", "code"]  # Never included "firewall", "ssh", "os", etc.
```

So even though chunks were stored with domain="firewall", the search code never looked for them.

---

## The Fix

### 1. **Updated `RAG_DOMAINS` in `config.py`**

```python
RAG_DOMAINS = (
    "docs",           # Project markdown documentation
    "code",           # Project Python/JS code
    "system-help",    # General system files (fallback)
    "firewall",       # /etc/ufw/, /etc/iptables/, etc.
    "network",        # /etc/network/, /etc/netplan/, etc.
    "ssh",            # /etc/ssh/ config
    "os",             # /etc/systemd/, kernel logs, sysctl
    "users",          # /var/log/auth.log, passwd, group
    "packages",       # /var/log/apt/, yum, pacman
    "applications",   # /var/log/nginx/, apache2, etc.
)
```

This defines all domains that can appear in chunks, matching what `domain_for_path()` and seed produce.

### 2. **Fixed `domain_for_path()` in `config.py`**

The function now prioritizes `DOMAIN_MAP` for system files:

```python
def domain_for_path(path: str) -> str:
    # 1) Check DOMAIN_MAP first (system file paths)
    for prefix, domain in DOMAIN_MAP.items():
        if normalized.startswith(prefix.lower()) or path.startswith(prefix):
            return domain
    
    # 2) Then check project-scoped files
    if allowed_for_rag(path):
        # ... project-specific logic ...
    
    # 3) Fallback to keyword detection
    return detect_domain_from_path(path)
```

This ensures `/etc/ufw/` files are always tagged as "firewall", `/etc/ssh/` as "ssh", etc.

### 3. **Updated `_domain_search_order()` in `retriever.py`**

The search now includes all system domains and has proper fallback:

```python
def _domain_search_order(domain: str) -> list[str]:
    # When searching for "firewall", try: firewall → system-help → docs → code
    if domain == "firewall":
        return ["firewall", "system-help", "docs", "code"]
    
    # Similar mappings for network, ssh, os, users, packages, applications
    
    # Default: search project docs first, then system domains
    return ["docs", "system-help", "code", "firewall", "network", "ssh", "os", "users"]
```

---

## What Changed in Behavior

### Before the Fix
```
User: "What are my firewall settings?"
    ↓
Retrieve from domains: [docs, system-help, code]  ← Missing "firewall"!
    ↓
Qdrant search for payload["domain"] in ["docs", "system-help", "code"]
    ↓
0 results found (firewall chunks were stored but never searched)
    ↓
LLM responds: "No evidence found..."
```

### After the Fix
```
User: "What are my firewall settings?"
    ↓
Retrieve from domains: [firewall, system-help, docs, code]  ← Includes "firewall"!
    ↓
Qdrant search for payload["domain"] == "firewall"
    ↓
6+ results found (from /etc/ufw/, /etc/iptables/, etc.)
    ↓
LLM responds with evidence: "Your firewall is using ufw backend..."
```

---

## Testing the Fix

### Step 1: Clear old data and restart
Since the in-memory Qdrant will be recreated, the seed will re-run:

```bash
# The seed will now correctly tag chunks with new domains
systemctl restart ladylinux-api

# Or manually:
cd /opt/ladylinux
source venv/bin/activate
QDRANT_MODE=memory uvicorn api_layer.app:app --host 0.0.0.0 --port 8000
```

Wait ~60 seconds for seed to complete.

### Step 2: Check logs for seed completion
```bash
journalctl -u ladylinux-api -f | grep "Seed complete"
```

Expected:
```
2026-04-15 20:29:45,177  INFO      Seed complete - 75/75 files ingested, 267 chunks stored, 0 error(s)
```

### Step 3: Test firewall query
```bash
curl -X POST http://localhost:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are my firewall settings?", "domain": "firewall"}'
```

Expected: Should see results with "Search returned 6+ result(s) (domain=firewall)"

---

## Files Modified

1. **`core/rag/config.py`**
   - Updated `RAG_DOMAINS` tuple (lines 71-83)
   - Updated `domain_for_path()` function (lines 124-156)
   - Added detailed docstring explaining domain resolution

2. **`core/rag/retriever.py`**
   - Updated `_domain_search_order()` function (lines 116-148)
   - Added system domain mappings
   - Improved fallback behavior

---

## Key Insights

### Why Two Different Domain Systems?

1. **Seeding uses DOMAIN_MAP** (system file paths like `/etc/ufw/`)
   - Maps file paths to business domains (firewall, network, etc.)
   - Includes `/etc/*`, `/var/log/*` paths

2. **Project Retrieval uses RAG_DOMAINS** (project code and docs)
   - Keeps Lady Linux project code separate and searchable
   - Avoids mixing noisy system files with project logic

3. **The Fix Unified Them**
   - `RAG_DOMAINS` now includes both system AND project domains
   - `domain_for_path()` now prioritizes `DOMAIN_MAP` first
   - `_domain_search_order()` searches all relevant domains

### The Retrieval Strategy

The new `_domain_search_order()` implements a **priority-based fallback**:

- **Specific queries**: If the user asks about firewall, search ["firewall", "system-help", "docs", "code"]
- **Broad queries**: If domain is None, search ["docs", "system-help", "code", "firewall", "network", ...]
- **Always check**: Each domain returns top_k + 2 results, then filters by score (≥0.35 cosine similarity)

This ensures system files are found when relevant, but project code takes priority for general questions.

---

## Recommendations

### For Production

1. **Monitor embedding quality**: If queries still return 0 results for specific domains, the embedding model might not be capturing the semantic meaning well
   - Check: `Search returned 0 result(s) (domain=firewall)` in logs
   - Solution: May need to adjust CHUNK_SIZE or switch to a better embedding model

2. **Track domain distribution**: Periodically check which domains are most useful:
   ```bash
   # In Qdrant admin interface or via script:
   # SELECT domain, COUNT(*) FROM ladylinux GROUP BY domain;
   ```

3. **Consider domain weights**: If certain domains are more important, you could:
   - Adjust `top_k` per domain
   - Add domain-specific re-ranking
   - Implement user feedback to improve retrieval

### For Development

- If you add new system paths to `ALLOWED_SEED_ROOTS`, add a corresponding entry to `DOMAIN_MAP`
- If you add a new domain, add it to `RAG_DOMAINS` and update `_domain_search_order()`
- Test seeding → retrieval flow end-to-end when changing domain logic

---

## Debugging Checklist

If "Search returned 0 results" happens again:

1. ✅ Check seed output for chunk storage:
   ```
   Seed complete - 75/75 files ingested, 267 chunks stored
   ```
   If chunks_stored = 0, the seed isn't running or finding files.

2. ✅ Check retrieval logs for domain mismatch:
   ```
   Search returned 0 result(s) (domain=firewall)
   ```
   If this appears, it means the search function was called but found nothing in Qdrant.

3. ✅ Verify domain_for_path is tagging correctly:
   ```python
   from core.rag.config import domain_for_path
   assert domain_for_path("/etc/ufw/sysctl.conf") == "firewall"
   assert domain_for_path("/opt/ladylinux/README.md") == "docs"
   ```

4. ✅ Check Qdrant directly:
   ```python
   from core.rag.vector_store import _get_client
   client = _get_client()
   # List domains in collection
   response = client.get_points(collection_name="ladylinux", with_vectors=False)
   domains = set(p.payload.get("domain") for p in response.points)
   print(domains)  # Should include: {'firewall', 'docs', 'code', 'os', ...}
   ```


