# ADR-389 — MidStream: inflight analysis of a live watermarked stream

- **Status**: Accepted — Implemented
- **Date**: 2026-08-15
- **Component**: `crates/ruflo-watermark/src/midstream.rs` (Rust core), `src/wasm.rs` (`WasmMidStream`), `packages/watermark` (`MidStream` in Node + browser)
- **Ships in**: `ruflo-watermark` 0.3.0 (crates.io), `@claude-flow/watermark` 0.4.0 (npm), `ai-text-watermark` 0.4.0 (npm wrapper)
- **Related**: ADR-385 (`StreamProxy`, the generation path MidStream wraps), ADR-383 (the batch detectors MidStream computes online), ADR-387 (the gateway tier where real transport belongs).

## Context

The request: "implement midstream capabilities." Grounding first (my priors on
RuvNet are stale and midstream isn't in the knowledge base) — verified against
**crates.io** (primary source):

| crate | crates.io | note |
|---|---|---|
| `midstream` | **0.2.0** | `github.com/ruvnet/midstream` — *"Real-time LLM streaming with inflight analysis"* |
| `temporal-compare` | 0.5.0 | temporal sequence analysis (from sublinear-time-solver) |
| `nanosecond-scheduler` | 0.1.1 | ultra-low-latency scheduler; **keyword `wasm`** |
| `quic-multistream` | **not published** | named speculatively in rupixel ADR-266 (Proposed) |

So midstream's real essence is **inflight analysis** — analyzing an LLM token
stream *while it is being generated*, for real-time decisions. That maps directly
onto the watermark: as `StreamProxy` (ADR-385) emits tokens, we want to know the
**watermark's strength as it grows**, not only after the fact.

## Decision

Implement midstream-style capabilities **natively and WASM-safe** in a new
`midstream` module, rather than depend on the upstream crates. The headline is an
**online watermark detector**; two lighter primitives ride along.

1. **`InflightDetector` (the headline).** Scores an emitted stream **one token at
   a time**, maintaining the running detection statistic (Gumbel score-sum /
   Tournament g-bit ones / TournamentNd centered-sum) so the z-score / p-value is
   available after every token. It is the ADR-383 batch detector loop, exposed
   incrementally — and it produces **exactly** the same statistic (verified:
   online final z == batch z to < 1e-9 in Rust, < 1e-6 through the npm binding).
2. **`TemporalWindow`** — rolling n-gram redundancy ("temporal-compare"-style):
   flags low-novelty spans where repeated context masks the mark, and reports a
   novelty ratio.
3. **`Backpressure`** — bounded in-flight window ("nanosecond-scheduler"-style
   pacing): a produced/acked counter that raises a throttle signal when the
   consumer falls behind.
4. **`MidStream`** — fuses generation + inflight analysis: `push_logits` /
   `push_topk` watermark one token via `StreamProxy` and analyze it in the same
   pass, returning `{ token, z_score, scored, novel, backpressure }`.

### Why native, not the upstream crates

- **The core must stay WASM-safe and dependency-light** (ADR-385). The capabilities
  that matter here — online detection, redundancy, pacing logic — are pure
  computation and reimplement cleanly with zero dependencies. Pulling in the real
  crates risks breaking the wasm32 build (`nanosecond-scheduler` targets OS timers
  despite its wasm keyword; `temporal-compare` is a heavier benchmarking framework).
- **The transport piece isn't even published** — `quic-multistream` (the one that
  would justify a native dependency for multi-feed fan-in) 404s on crates.io.
  QUIC needs sockets and cannot run in the browser core regardless.
- **So the split mirrors ADR-387:** WASM-safe inflight *analysis* lives in the
  crate; real *transport* (QUIC multistream, cross-process fan-in) belongs in the
  native gateway tier, where depending on the real midstream crates is appropriate.

## Alternatives considered

- **Depend on `midstream` / `temporal-compare` / `nanosecond-scheduler`.** Rejected
  for the WASM core (build risk + weight); reserved for the gateway tier.
- **Re-scan the whole sequence each token for live confidence.** Rejected — O(n²)
  over a stream; the incremental accumulator is O(1) per token.
- **A separate detector that approximates the batch statistic.** Rejected — exactness
  matters; the online path is the batch loop, so verdicts never disagree.

## Consequences

- **Positive.** Real-time watermark confidence in one pass (no second detection
  scan); redundancy + backpressure signals for a serving loop; zero new
  dependencies; WASM core stays small (63.8 KB). Online statistic is provably the
  batch statistic (tested).
- **Negative / accepted.** The native primitives are *inspired by* the upstream
  crates, not the crates themselves — a future native gateway may adopt the real
  `temporal-compare` / `quic-multistream` for cross-process work; this module is
  the in-core, WASM-safe subset. `TemporalWindow` redundancy search is O(window·k)
  per token (fine for typical windows; not a full DTW).

## Status

Implemented and shipping. 4 dedicated Rust tests (online==batch, confidence grows,
redundancy flags repeats, backpressure signals+relieves) + npm round-trip verified
(inflight final z == batch z). Published in `ruflo-watermark` 0.3.0 and
`@claude-flow/watermark` 0.4.0.
