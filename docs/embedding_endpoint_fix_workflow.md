# Embedding Endpoint Fix Workflow (Ollama + RAG + Qdrant)

## 1) Problem Signature

From `data_output`, the key recurring error is:

- `404 Client Error: Not Found for url: http://localhost:11434/api/embeddings`

And the downstream behavior is:

- RAG answers like: "no relevant evidence was found in the vector store."
- Files fail to embed during seed process
- Vector store remains empty or incomplete

This indicates embedding generation is failing, so chunks are not being indexed properly into Qdrant.

---

## 2) Root Cause (Most Likely)

Your app is calling an Ollama embedding route that is not available in your installed Ollama version.

- Some versions support `/api/embeddings` (older)
- Others support `/api/embed` (newer)

A route mismatch produces 404 and prevents vector creation. The seed process then skips those files and the vector database remains empty.

---

## 3) Prerequisites

On the Linux Mint machine, ensure:

- Ollama is installed
- Python virtual environment is active for this project
- `qdrant-client` is installed in that same environment
- RAG app dependencies are installed from `requirements.txt`

---

## 4) Step-by-Step Fix

### Step 4.1 - Verify Ollama is running

```bash
ollama serve
```

In a second terminal, verify API responds:

```bash
curl http://localhost:11434/api/tags
```

Expected: JSON output (not 404).

If Ollama is not installed, install it first from https://ollama.ai

---

### Step 4.2 - Ensure an embedding model is installed

```bash
ollama pull nomic-embed-text
ollama list
```

Expected: `nomic-embed-text` appears in model list.

Alternative embedding models:
- `all-minilm` (lightweight)
- `mistral-embed` (if available)

---

### Step 4.3 - Test both embedding endpoints directly

Test newer endpoint:

```bash
curl -X POST http://localhost:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":"test embedding"}'
```

Test older endpoint:

```bash
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","prompt":"test embedding"}'
```

Interpretation:

- If `/api/embed` works and `/api/embeddings` fails: use `/api/embed`.
- If `/api/embeddings` works and `/api/embed` fails: use `/api/embeddings`.
- If both fail: fix Ollama service/model first before proceeding.

---

### Step 4.4 - Update RAG config to match working endpoint

In `rag_layer/config.py`, set:

- `OLLAMA_EMBED_URL` to the endpoint that worked in Step 4.3
- `EMBEDDING_MODEL` to `nomic-embed-text` (or your installed model)

Example target values:

```python
OLLAMA_EMBED_URL = "http://localhost:11434/api/embed"
EMBEDDING_MODEL = "nomic-embed-text"
```

Verify these are set in `rag_layer/config.py`:

```bash
grep -i "OLLAMA_EMBED_URL\|EMBEDDING_MODEL" rag_layer/config.py
```

---

### Step 4.5 - (Recommended) Add endpoint fallback in embedder

In `rag_layer/embedder.py`, implement resilient behavior:

1. Try configured URL first.
2. If HTTP 404, try the alternate route.
3. Normalize both response shapes:
   - `embedding` (single vector)
   - `embeddings[0]` (list output format)

This avoids version-specific breakage.

Example code pattern:

```python
def embed_text(text: str) -> List[float]:
    """Embed text with fallback between /api/embed and /api/embeddings."""
    
    base_url = OLLAMA_EMBED_URL.rsplit("/api", 1)[0]
    
    for endpoint in ["/api/embed", "/api/embeddings"]:
        url = f"{base_url}{endpoint}"
        try:
            payload = {"model": EMBEDDING_MODEL, "input": text}
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 404:
                continue
            
            response.raise_for_status()
            data = response.json()
            
            # Handle both response formats
            if "embeddings" in data and isinstance(data["embeddings"], list):
                return data["embeddings"][0]
            if "embedding" in data:
                return data["embedding"]
            
            raise ValueError(f"Unexpected Ollama response: {data}")
        
        except requests.exceptions.RequestException as e:
            continue
    
    raise RuntimeError("No valid Ollama embedding endpoint found")
```

---

### Step 4.6 - Validate Qdrant setup path

For Sprint 1 in-memory mode, confirm `rag_layer/vector_store.py`:

- Creates/ensures the collection exists
- Uses `VECTOR_DIM` from config
- Uses a consistent distance metric (typically cosine)

Quick check:

```bash
grep -i "VECTOR_DIM\|distance\|collection" rag_layer/vector_store.py
```

If external Qdrant is used later, verify service connectivity first:

```bash
curl http://localhost:6333/health
```

---

### Step 4.7 - Re-seed after embedding fix

Once embedding endpoint works, run:

```bash
cd C:\Users\bints\PycharmProjects\LadyBranch
python -m rag_layer.seed
```

Expected output:

- No repeated 404 embedding errors
- Successful chunk -> embed -> upsert flow
- Log messages showing files processed

Example success pattern:

```
Ingesting allowed files...
Processing: /etc/os-release
Chunked into 5 segments
✓ Successfully embedded and upserted
```

---

### Step 4.8 - Verify retrieval independently

Run a retrieval test via Python CLI:

```bash
python -c "from rag_layer.retriever import retrieve; print(retrieve('OS version'))"
```

Expected:

- Top-k chunks are returned
- Chunks include source text from allowed files
- Queries do not fall back to "no relevant evidence" for basic OS questions

---

### Step 4.9 - Verify `/ask_rag` in UI

From the `os.html` prompt window:

1. Ask a question tied to seeded files (example: "What is the OS version?")
2. Confirm response includes retrieved context
3. Check browser/network and backend logs for no internal errors

Browser DevTools check:

```javascript
// In browser console, after asking a question:
fetch('/ask_rag', {method: 'POST', body: JSON.stringify({query: "OS version"})})
  .then(r => r.json())
  .then(console.log)
```

---

## 5) Linux Mint Allowed Paths Check

Your allowlist only works for paths that actually exist and are readable on the target machine.

Check common paths on Linux Mint:

```bash
ls -ld /etc /var/log 2>/dev/null && echo "✓ /etc and /var/log exist"
ls -l /etc/os-release 2>/dev/null && echo "✓ /etc/os-release exists"
ls -l /var/log/syslog 2>/dev/null && echo "✓ /var/log/syslog exists"
ls -l /etc/systemd/system 2>/dev/null && echo "✓ /etc/systemd/system exists"
```

Notes:

- If `/var/log/syslog` does not exist on your distro/config, check for `/var/log/kern.log` or `/var/log/dmesg` instead.
- Keep sensitive files in `DENIED_PATHS` (for example `/etc/shadow`, `/etc/gshadow`).
- Add readable public system files to `ALLOWED_PATHS` for seeding.

Example safe allowed paths for Linux Mint:

```python
ALLOWED_PATHS = [
    "/etc/os-release",
    "/etc/lsb-release",
    "/etc/systemd/system",
    "/var/log/syslog",
    "/var/log/kern.log",
]

DENIED_PATHS = [
    "/etc/shadow",
    "/etc/gshadow",
    "/root/.ssh",
    "/home/*/.ssh",
]
```

---

## 6) Definition of Done

All items below should be true:

- ✓ No Ollama embedding 404 errors in logs
- ✓ Embedding model is installed and returns vectors
- ✓ Seed job completes with successful upserts
- ✓ Vector search returns relevant chunks
- ✓ `/ask_rag` returns evidence-grounded answers in UI
- ✓ Logs show file chunks being processed without errors

---

## 7) Common Failure Cases

### `No module named 'qdrant_client'`

Install in active venv:

```bash
pip install qdrant-client
```

Verify installation:

```bash
python -c "import qdrant_client; print(qdrant_client.__version__)"
```

---

### Endpoint still returns 404

Re-check:

- Ollama is running: `ollama serve` in terminal
- Correct route (`/api/embed` vs `/api/embeddings`)
- Correct payload field (`input` vs `prompt` depending on endpoint)
- Model is pulled: `ollama list | grep nomic`

---

### Seed runs but retrieval is empty

Verify:

- `ALLOWED_PATHS` entries exist and are readable
- Chunker is producing chunks (check logs during seed)
- Upsert writes to expected collection
- Query embedding model/dimension matches indexed vectors
- Qdrant collection was actually created

---

### `Connection refused` to Qdrant

If using external Qdrant:

```bash
# Check if service is running
curl http://localhost:6333/health

# Start Qdrant (if needed)
docker run -p 6333:6333 qdrant/qdrant
```

For in-memory mode, this should not occur.

---

### Seed completes but answers still say "no relevant evidence"

This usually means vectors were indexed but the retriever query is not matching well. Verify:

1. Same embedding model is used for both indexing and querying
2. Same `VECTOR_DIM` in config
3. Query relevance: ask a question that directly matches seeded text

Test the full pipeline:

```bash
python -c "
from rag_layer.seed import ingest_files
from rag_layer.retriever import retrieve
from rag_layer.embedder import embed_text

# Seed
ingest_files()

# Query
results = retrieve('OS details')
print(f'Retrieved {len(results)} chunks')
for i, chunk in enumerate(results):
    print(f'{i+1}. {chunk}')
"
```

---

## 8) Quick Troubleshooting Checklist

Run this before escalating:

```bash
# 1. Ollama running?
curl http://localhost:11434/api/tags > /dev/null && echo "✓ Ollama responding" || echo "✗ Ollama down"

# 2. Model installed?
ollama list | grep nomic-embed-text && echo "✓ Model available" || echo "✗ Model missing"

# 3. Endpoint working?
curl -X POST http://localhost:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":"test"}' \
  | head -c 100 && echo "✓ Endpoint works" || echo "✗ Endpoint fails"

# 4. Config set?
grep "OLLAMA_EMBED_URL\|EMBEDDING_MODEL" rag_layer/config.py

# 5. Dependencies?
python -c "import qdrant_client, requests; print('✓ Deps OK')" 2>&1 || echo "✗ Deps missing"
```

---

## 9) Next Steps After Fix

Once embedding works and seed succeeds:

1. Run full RAG integration test
2. Test `/ask_rag` endpoint with various queries
3. Validate retrieved context matches user expectations
4. Move to Sprint 2: Extended retrieval + multi-turn context

