"""
Lady Linux Capstone Project - RAG Layer
File: retriever.py
Description: Query-time orchestrator that embeds the user question, routes it
             to a relevant domain when possible, and searches Qdrant for the
             most relevant context chunks.
"""

import logging

from core.rag.config import RAG_DOMAINS, TOP_K, allowed_for_rag, domain_for_path
from core.rag.embedder import embed_query
from core.rag.vector_store import search

log = logging.getLogger("rag_layer.retriever")


def retrieve(
    query: str,
    top_k: int | None = None,
    domain: str | None = None,
) -> list[dict]:
    """Retrieve the most relevant chunks for a natural-language *query*.

    Domain-aware behavior:
    - Allowed domains are: docs, code, system-help.
    - If no domain is provided, retrieval defaults to docs.
    - For system-help, search order is system-help -> docs -> code.
      This prevents system-live questions from pulling code chunks first.
    """
    if not query or not query.strip():
        log.warning("Empty query - returning no results")
        return []

    k = top_k if top_k is not None else TOP_K
    routed_domain = domain if domain in RAG_DOMAINS else "docs"

    # 1) Embed the question once.
    log.info("RAG query: %s", query)
    log.info("Embedding query (%d chars, routed_domain=%s)", len(query), routed_domain)
    query_vector = embed_query(query)

    # 2) Domain-ordered retrieval with strict project-scope filtering.
    final_results: list[dict] = []
    for target_domain in _domain_search_order(routed_domain):
        if len(final_results) >= k:
            break
        # k + 2 gives enough headroom for dedup without flooding the prompt.
        # On a CPU-only VM this directly reduces LLM prompt size and response time.
        results = search(query_vector, top_k=k + 2, domain=target_domain)
        # Score threshold: discard weak matches that add noise without signal.
        # Cosine similarity <0.35 is typically off-topic for a focused query.
        filtered = [
            r for r in results
            if _matches_domain(r, target_domain) and r.get("score", 0) >= 0.35
        ]
        final_results.extend(filtered)
    # Preserve order and de-duplicate by file/span.
    seen: set[tuple[str, int, int]] = set()
    deduped: list[dict] = []
    for item in final_results:
        key = (
            item.get("source_path", ""),
            int(item.get("line_start", 0)),
            int(item.get("line_end", 0)),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    final_results = deduped[:k]

    for item in final_results:
        log.info("Retrieved context from: %s", item.get("filepath") or item.get("source_path", "unknown"))
        # Log a short preview for debugging while avoiding oversized logs.
        chunk_preview = str(item.get("text", "")).replace("\n", " ")[:180]
        log.info("Retrieved chunk preview: %s", chunk_preview)

    log.info("Retrieved %d filtered result(s) for query '%.60s...'", len(final_results), query)
    return final_results


def build_context_block(results: list[dict]) -> str:
    """Format retrieval results into a prompt-safe evidence block."""
    if not results:
        return ""

    sections: list[str] = []
    for r in results:
        header = (
            f"[Source: {r['source_path']}  "
            f"lines {r['line_start']}-{r['line_end']}  "
            f"({r['domain']})  score={r['score']:.3f}]"
        )
        sections.append(
            f"{header}\n"
            f"### BEGIN EVIDENCE ###\n"
            f"{r['text']}\n"
            f"### END EVIDENCE ###"
        )

    return "\n\n".join(sections)


def retrieve_context(query: str, domain: str = "docs", top_k: int | None = None) -> str:
    """
    Compatibility helper for the command gateway knowledge path.

    Returns a formatted context string so callers can pass RAG evidence
    directly into downstream response generation.
    """
    results = retrieve(query=query, top_k=top_k, domain=domain)
    return build_context_block(results)


def _domain_search_order(domain: str) -> list[str]:
    if domain == "system-help":
        return ["system-help", "docs", "code"]
    if domain == "code":
        return ["code", "docs", "system-help"]
    return ["docs", "system-help", "code"]


def _matches_domain(item: dict, expected_domain: str) -> bool:
    path = item.get("filepath") or item.get("source_path") or ""
    if not allowed_for_rag(path):
        return False

    item_domain = item.get("domain", "")
    if item_domain == expected_domain:
        return True
    # Backward compatibility for older indexed payloads with legacy domain tags.
    return domain_for_path(path) == expected_domain
