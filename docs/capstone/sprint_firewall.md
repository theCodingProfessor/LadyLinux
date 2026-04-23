# Sprint Plan: Firewall Endpoint Unification (`ask_firewall` -> `ask_rag`)

## Sprint Metadata
- **Sprint Name:** Firewall RAG Unification Sprint
- **Proposed Duration:** 2 weeks
- **Primary Branch:** `Capstone_Dev_01`
- **Document Owner:** LadyLinux Capstone Team
- **Status:** Proposed

## Executive Summary
This sprint standardizes firewall assistant behavior by migrating all firewall question-and-answer flows from the dedicated `ask_firewall` endpoint to the unified `ask_rag` endpoint. The objective is to reduce one-off endpoint logic, centralize retrieval behavior, and create a single extensible RAG contract used by `firewall`, `os`, and `users` experiences.

## Problem Statement
Current behavior is split between:
- `POST /ask_firewall` (specialized logic, runtime snapshot + retrieval + model call)
- `POST /ask_rag` (generalized retrieval and model flow)

This split introduces:
- Duplicate orchestration logic
- Inconsistent response handling across pages
- Higher maintenance cost for future features
- Greater risk of regressions when updating retrieval behavior

## Sprint Goals
1. Route firewall conversational requests through `POST /ask_rag` as the primary path.
2. Preserve firewall domain grounding (`domain="firewall"`) and operator-focused guidance.
3. Keep or improve firewall response quality while reducing endpoint duplication.
4. Introduce a controlled deprecation path for `ask_firewall`.
5. Deliver measurable acceptance criteria and rollback safety.

## Scope
### In Scope
- Backend contract updates in `api_layer/app.py`.
- Frontend updates in `static/js/chat.js`, `static/js/ladyWidget.js`, and `templates/firewall.html`.
- Unified request payload and response contract for firewall prompts.
- Optional compatibility shim for `ask_firewall` during transition.
- Logging and troubleshooting improvements for zero-result retrieval cases.

### Out of Scope
- Full conversation history redesign.
- Full permission model redesign for privileged firewall reads.
- Large UI redesign beyond endpoint and data-flow alignment.
- Production multi-node scaling work.

## Current vs Target Architecture
### Current
- Firewall page assistant uses `POST /ask_firewall`.
- Lady panel uses `POST /ask_rag` with page-based domain hint.
- Firewall-specific retrieval/vectorization behavior is embedded in the specialized endpoint.

### Target
- Firewall page and Lady panel both call `POST /ask_rag`.
- `ask_rag` accepts normalized metadata (`domain`, optional `action`, optional context hints).
- Firewall runtime snapshot vectorization is invoked by shared RAG preparation logic (not one-off endpoint orchestration).
- `ask_firewall` becomes deprecated compatibility layer (temporary) or removed post-stabilization.

## Technical Workstreams

### Workstream A: API Contract Unification
**Files:** `api_layer/app.py`, `rag_layer/retriever.py`

Tasks:
- Extend `RagRequest` to support optional firewall action metadata.
- Add optional action guidance injection in unified prompt builder.
- Keep `domain="firewall"` filtering as default for firewall page flows.
- Add optional fallback retrieval strategy if strict domain returns zero results:
  - First query with `domain="firewall"`
  - Optional second query with no domain filter
  - Annotate response with fallback indicator
- Normalize response fields expected by the firewall UI.

Deliverables:
- Unified endpoint behavior for firewall prompts via `POST /ask_rag`.
- Clear response shape contract documented in code comments.

### Workstream B: Firewall UI Call-Path Migration
**Files:** `static/js/chat.js`, `templates/firewall.html`, `static/js/ladyWidget.js`

Tasks:
- Replace firewall form fetch target from `/ask_firewall` to `/ask_rag`.
- Ensure request body includes:
  - `prompt`
  - `domain: "firewall"`
  - optional `action` mapped from quick actions
- Update UI rendering to consume unified response fields.
- Preserve status, source visibility, and JSON debug panel behavior.

Deliverables:
- Firewall page runs entirely on unified endpoint.
- Lady panel and page-level assistant share the same backend contract.

### Workstream C: Compatibility and Deprecation
**Files:** `api_layer/app.py`, docs updates

Tasks:
- Optionally keep `POST /ask_firewall` as a compatibility shim that forwards to `ask_rag` logic.
- Emit deprecation warnings in logs for shim calls.
- Define removal criteria and date target.

Deliverables:
- Safe migration path for older UI clients.
- Documented deprecation timeline.

### Workstream D: Retrieval Reliability and Diagnostics
**Files:** `rag_layer/vector_store.py`, `rag_layer/config.py`, `api_layer/app.py`

Tasks:
- Improve observability for "0 results" retrieval events:
  - domain used
  - top_k used
  - collection status
  - fallback behavior used
- Add response diagnostics block for UI troubleshooting in non-production mode.
- Confirm behavior under current Qdrant mode and define server-mode migration prep.

Deliverables:
- Faster diagnosis of "not enough data" responses.
- Reduced false negatives during firewall retrieval.

## Sprint Backlog (Execution Checklist)
- [ ] Finalize unified request/response schema for firewall through `ask_rag`.
- [ ] Implement backend `ask_rag` updates for firewall actions and fallback retrieval.
- [ ] Switch firewall page fetch calls to `POST /ask_rag`.
- [ ] Map quick-action values to unified request metadata.
- [ ] Keep temporary `ask_firewall` compatibility shim (or remove if approved).
- [ ] Add deprecation log messaging for `ask_firewall`.
- [ ] Add retrieval diagnostics for zero-hit scenarios.
- [ ] Verify source attribution rendering remains accurate.
- [ ] Run endpoint and UI regression checks.
- [ ] Publish migration note and operator troubleshooting guide.

## Acceptance Criteria
1. Firewall page requests are served through `POST /ask_rag` only (or via documented compatibility shim forwarding).
2. Firewall prompts include domain scoping and return grounded answers with source attribution when evidence exists.
3. If zero domain results are found, behavior is deterministic and reported (strict mode or fallback mode).
4. No navigation regressions for `/firewall`, `/os`, `/users`.
5. Lady panel and firewall page produce consistent RAG behavior for firewall prompts.
6. Logs provide actionable diagnostics for retrieval failures and empty result sets.

## Test Plan
### Backend Validation
- `POST /ask_rag` with `domain="firewall"` returns HTTP 200 and text output.
- Response contains deterministic metadata needed by UI rendering.
- Retrieval fallback path (if enabled) is exercised and logged.
- Deprecated `POST /ask_firewall` behavior (if retained) forwards correctly.

### Frontend Validation
- Firewall form submits and receives answer through unified endpoint.
- Quick action buttons send expected action metadata.
- Source and status panels update without JS errors.
- Lady panel on firewall page uses same grounding behavior and domain filter.

### Regression Validation
- `POST /ask_rag` for `os` and `users` remains functional.
- Existing templates load and navigation links remain valid.
- No 500 errors introduced in normal page loads.

## Risks and Mitigations
- **Risk:** Response schema mismatch breaks firewall UI rendering.
  - **Mitigation:** Introduce response adapter in UI and contract tests.

- **Risk:** Strict `domain="firewall"` filter returns zero hits too often.
  - **Mitigation:** Controlled fallback retrieval and explicit diagnostics.

- **Risk:** Legacy clients still calling `ask_firewall` fail after cutover.
  - **Mitigation:** Temporary shim + deprecation window.

- **Risk:** Runtime firewall data blocked by host permissions.
  - **Mitigation:** Detect permission errors and return explicit operator guidance.

## Dependencies
- Local model service (Ollama + Mistral) running and reachable.
- Embedding model endpoint availability.
- Qdrant availability per configured mode.
- Firewall runtime command access on target host (permission-dependent).

## Rollout Plan
1. Merge backend unification with compatibility shim enabled.
2. Merge frontend updates to call `ask_rag`.
3. Deploy to dev VM and run smoke + retrieval diagnostics.
4. Monitor logs for deprecated `ask_firewall` usage.
5. Remove shim in subsequent sprint once usage reaches zero.

## Backout Plan
- Revert frontend call-path change to prior endpoint.
- Keep prior `ask_firewall` path active.
- Disable fallback retrieval behavior if it causes noisy responses.
- Restore previous known-good commit via branch rollback procedure.

## Definition of Done
- All acceptance criteria met.
- Migration checklist complete.
- No critical/sev-1 regressions in firewall page flow.
- Sprint document and code comments updated.
- Team sign-off captured in sprint review.

## Post-Sprint Follow-Up
- Plan next sprint for persistent Qdrant server mode and data durability.
- Add conversation logging and retrieval analytics to physical database layer.
- Evaluate removal date for `ask_firewall` compatibility shim.

