# ADR-390 — Inflight LLM-stream reformatting via midstream (Google · OpenRouter · meta-llm)

- **Status**: Accepted — Implemented (core + 3 provider adapters; live network wiring behind the human fence)
- **Date**: 2026-08-15
- **Component**: `crates/stream-reformat/` (native Rust) — depends on the real `midstreamer-temporal-compare`
- **Related**: ADR-389 (our watermark `MidStream` — a *namesake*, inflight *detection* only; this is inflight *transformation*), ADR-387/388 (gateway tier + gemini-3.7-flash, which cannot be watermarked and so is a natural reformat target).

## Context

Frontier/provider models reached through an API (`gemini-3.7-flash`, OpenRouter
models, meta-llm's own routes) expose **no token-level sampler control**, so they
cannot carry the watermark (the ADR-387 boundary). But their *streams* can still
be **reformatted inflight** — the exact lane of `ruvnet/midstream`
("real-time LLM streaming with inflight analysis: pattern-match it, score it,
**intervene on it** — while tokens are still arriving").

**Grounding (primary source, this build):**
- `@midstream/wasm` on npm — **404, not published.** The README advertises it; it
  does not exist. So the JS/WASM path is not available — this is a **Rust** build.
- Published & real on crates.io: `midstreamer-temporal-compare` 0.2.1 (lib
  `midstreamer_temporal_compare`: `TemporalComparator::{compare, find_similar,
  detect_pattern, detect_recurring_patterns}`, algorithms DTW/LCS/EditDistance/
  Euclidean), `midstreamer-scheduler` 0.2.1, `midstreamer-quic` 0.3.0, etc.
- `gemini-3.7-flash`: GA, **`global` location only** (us-central1 404s),
  `:streamGenerateContent` over `aiplatform.googleapis.com`, and a **thinking
  model** (emits `thought` parts / `thoughtsTokenCount`).

## Decision

Build `stream-reformat` — a native Rust crate that normalizes each provider's SSE
into a common chunk model and runs an inflight reformat pipeline using the real
`midstreamer-temporal-compare`.

### Bounded contexts (DDD)

1. **chunk** — `StreamChunk { text, kind: ChunkKind{ Answer | Thinking | Meta }, done }`;
   `ReformatEvent { channel: Channel{ Answer | Thinking }, text }`. The provider-
   neutral domain the whole pipeline speaks.
2. **providers** — `parse_sse_line(provider, line) -> Vec<StreamChunk>`:
   - **Google** (Vertex `streamGenerateContent`): `candidates[].content.parts[]`,
     a part with `"thought": true` ⇒ `Thinking`, else `Answer`.
   - **OpenRouter** (`/v1/chat/completions` stream): `delta.content` ⇒ `Answer`,
     `delta.reasoning` ⇒ `Thinking`.
   - **meta-llm** (OpenAI-compatible): `delta.content` ⇒ `Answer`.
   - all: `data: [DONE]` ⇒ `done`.
3. **reformat** — the inflight interventions, per chunk, streaming:
   - **Separate thinking from answer** (the headline transform — reasoning models
     interleave both; consumers usually want them on distinct channels).
   - **Collapse near-duplicate repetition** using `TemporalComparator::find_similar`
     (a common LLM stutter/loop artifact) at a similarity threshold.
   - **Normalize whitespace** (collapse runs of blank lines / trailing spaces).

### Why the real crate, not a hand-roll

`midstreamer-temporal-compare` is the RuvNet primitive for exactly this
(sequence similarity / recurring-pattern detection inflight). We depend on it
directly for the repetition-collapse intervention rather than re-implementing DTW/
LCS — no silent substitution. The scheduler/quic crates (pacing, transport) are
**not** pulled in yet: reformatting is O(1)/chunk and transport is the caller's
concern; they're reserved for a later throughput/multi-feed iteration.

### Boundaries / fence

- **Offline-testable core.** The reformat pipeline + SSE parsers are pure and
  tested against canned provider fixtures — **no network, no API keys** (autonomous
  no-key fallback).
- **Live provider calls are behind the human fence.** Streaming from Google
  (gcloud token), OpenRouter (`OPENROUTER_API_KEY`), meta-llm (`COGNITUM_DEV_KEY`)
  is provided as an `example`/binary but not auto-run; nothing is deployed or
  published autonomously.
- Reformatting is **transform-only** — it never fabricates content, and it does
  not mark or strip watermarks.

## Consequences

- **Positive.** One inflight pipeline reformats all three providers; separates
  thinking cleanly; kills repetition loops via the real temporal-compare; pure/
  streaming/testable core. Complements watermarking (reformat what we can't mark).
- **Negative / accepted.** Live adapters need keys + are fenced; scheduler/quic
  pacing deferred; repetition threshold is a heuristic to tune.

## Status

Core + `chunk`/`providers`/`reformat` + offline fixture tests for all three
providers implemented. Live streaming adapters scaffolded behind the fence.
Done-criteria: `cd crates/stream-reformat && cargo test` exits 0.
