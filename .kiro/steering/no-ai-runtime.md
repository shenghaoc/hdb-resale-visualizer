---
inclusion: always
---

# No Hosted AI Runtime

## Non-Negotiable Rule
No hosted AI or model API may be used in the runtime website.

Do not add calls to OpenAI, Anthropic, Gemini, Groq, Mistral, Together, Perplexity, hosted embedding APIs, hosted reranking APIs, hosted vector search APIs, hosted LLM gateways, hosted multimodal APIs, or any other hosted model API from:
- frontend code in `src/`
- Cloudflare Worker code in `worker/`
- API route modules in `functions/api/`
- shared runtime helpers in `functions/_lib/` and repo-level `shared/` modules when imported by frontend, Worker, API, or other runtime code
- service worker or PWA runtime code
- client-side code loaded by the browser

This applies even when the call is hidden behind a proxy, gateway, generic `fetch()`, SDK, edge function, or environment variable.

## Do Not Add
- AI SDKs or provider clients for runtime use.
- Provider API keys, model names, AI gateway URLs, or embedding/reranking endpoint configuration in runtime code.
- Runtime summarization, chat, recommendation, semantic search, embeddings, reranking, valuation, explanation, or classification powered by hosted AI.
- Server-side wrappers that move the hosted AI call from browser code to Worker/API code.
- Telemetry or analytics integrations that ship buyer notes, addresses, filters, sync codes, or shortlist data to hosted AI/model providers.

## Allowed Alternatives
- Deterministic calculations using local code.
- Official public datasets processed at build time.
- D1-backed queries and precomputed artifacts.
- Local browser computation.
- Local fuzzy search, including Fuse.js.
- Local string matching, ranking heuristics, and deterministic scoring when the formula is inspectable.
- Web Workers for expensive local computation.
- Heavy client libraries when justified, lazy-loaded, and covered by bundle checks.
- Build-time static data processing that leaves no runtime hosted AI dependency.

## Review Checklist
For every source, Worker, API, or dependency change, check:
- Does runtime code call a model provider, AI gateway, embedding endpoint, reranking endpoint, or generic hosted inference API?
- Does runtime code introduce an SDK, base URL, env var, or config key for hosted AI?
- Does search or recommendation logic depend on remote embeddings or remote reranking?
- Could user-entered notes, shortlist data, addresses, filters, or sync codes be sent to a hosted AI provider?

If any answer is yes, the change violates this steering file and must be redesigned around deterministic local or build-time logic.
