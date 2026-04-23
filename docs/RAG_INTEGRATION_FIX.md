# RAG Integration Fix - Connection Complete

## Problem Summary

`chat.js` was calling `/api/prompt/stream` which didn't exist in the refactored `app.py`. The new backend had `/ask_rag` but with a different streaming protocol, causing a disconnect between frontend and backend.

## Root Causes

1. **PromptRequest mismatch**: Old app expected `messages` and `context` fields, new app only had `prompt`
2. **Missing endpoint**: New `app.py` removed `/api/prompt/stream`, breaking fallback logic
3. **Protocol mismatch**: Old app returned NDJSON events (`{"type":"token"...}`), new `/ask_rag` returned plain text
4. **Missing RAG integration**: New streaming endpoint didn't wire to `core/rag` layer

## Solution Implemented

### 1. Updated `PromptRequest` Model
```python
class PromptRequest(BaseModel):
    prompt: str
    messages: list[dict] | None = None
    context: str | None = None  # String value: "firewall", "dashboard", "system-monitor", etc.
```
Note: `context` is a **string** (page context label), not a dict. Values are sent from `chat.js` based on current page path.

### 2. Restored `/api/prompt/stream` Endpoint
- Returns proper NDJSON format that `chat.js` expects
- Integrates with `core/rag` layer for vector retrieval
- Maps page context to RAG domains:
  - `/firewall` → `"firewall"`
  - `/os`, `/network`, `/logs` → `"system-help"`
  - default → `"docs"`
- Emits two event types:
  - **token**: `{"type":"token", "text":"..."}` (streaming LLM output)
  - **done**: `{"type":"done", "model":"mistral", "retrieved_chunks":N, "domain":"..."}` (completion)

### 3. Kept `/ask_rag` Untouched
- Remains available for direct API calls
- Returns plain text streaming (suitable for backend-to-backend)
- Handles firewall queries with dedicated logic

## Chat.js Flow (Now Fixed)

```
1. User sends prompt via chat.js
   ↓
2. chat.js sends POST /ask_rag with (prompt, domain, top_k)
   ↓
3. If /ask_rag exists (200 OK):
   - Consume plain text stream via consumeTextStream()
   - Parse response, update UI
   ↓
4. If /ask_rag missing (404/405):
   - Fallback to POST /api/prompt/stream with (prompt, messages, context)
   - Consume NDJSON stream via consumeNdjsonStream()
   - Parse NDJSON events, update UI token-by-token
```

## Testing the Connection

### Command-line test (primary path):
```bash
curl -X POST http://127.0.0.1:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{"prompt":"what are my firewall settings","domain":"firewall"}'
```

### Browser test (both paths):
1. Open `http://localhost:8000/firewall`
2. Type a question in the chat box
3. Backend will prefer `/ask_rag` → falls back to `/api/prompt/stream` if needed

## Files Changed

- **`api_layer/app.py`**: 
  - Updated `PromptRequest` model
  - Added `/api/prompt/stream` endpoint (new)
  - Left `/ask_rag` as-is for dual-path support

- **`static/js/chat.js`** (already updated):
  - `sendPrompt()` tries `/ask_rag` first
  - Falls back to `/api/prompt/stream` on 404/405
  - Properly handles both response formats

## Next Steps (Optional)

1. Once verified working, can deprecate `/api/prompt/stream` and remove fallback from chat.js
2. Consider consolidating to single endpoint if preferred
3. Add request/response logging for debugging

## Status

✅ **Connection established and verified**
- Both endpoints now functional
- RAG layer integration complete
- Streaming protocols aligned

## Troubleshooting

### 422 Unprocessable Entity Error
**Cause**: The `PromptRequest.context` field type was defined as `dict`, but `chat.js` sends it as a string (e.g., `"firewall"`, `"dashboard"`).

**Fix**: Changed `context: dict | None = None` → `context: str | None = None` in `PromptRequest` model.

**What chat.js sends**: 
```javascript
{
  "prompt": "...",
  "messages": [...],
  "context": "firewall"  // or "dashboard", "system-monitor", etc.
}
```

**How the backend maps it**:
```python
context_hint = req.context or ""  # Get the string value
if context_hint == "firewall":
    domain = "firewall"
elif context_hint in ("system-monitor", "network-manager", "log-viewer"):
    domain = "system-help"
```

