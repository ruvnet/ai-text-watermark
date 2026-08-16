# ADR-385 — Ultra-low-latency streaming watermark proxy (`StreamProxy`)

- **Status**: Accepted — Implemented
- **Date**: 2026-08-15
- **Component**: `crates/ruflo-watermark/src/proxy.rs` (Rust core), `src/wasm.rs` (`WasmStreamProxy`), `packages/watermark` (`StreamProxy` in Node `index.js` + browser `web/index.mjs`)
- **Ships in**: `ruflo-watermark` 0.2.0 (crates.io), `@claude-flow/watermark` 0.3.0 (npm)
- **Related**: ADR-383 (the watermarking component this extends — Proposed; this ADR implements a new surface *on top of* it, changing none of its schemes/detectors). ADR-387 (the meta-llm service deployment that consumes this proxy — Proposed).

## Context

ADR-383 shipped `Watermarker::step(tokens: &[u32], probs: &[f32]) -> usize`:
the caller supplies an already-normalized probability slice over a candidate
set it chose, and the watermarker returns which candidate to emit. That is the
correct *primitive*, but it is the wrong *integration shape* for a live serving
stack:

1. **Serving stacks emit logits, not normalized probabilities.** vLLM,
   llama.cpp, Candle, and a hand-rolled sampler all hand you raw logits over the
   full vocabulary. Forcing every integrator to re-implement temperature +
   softmax before calling `step` is friction and a place to get the shaping
   subtly wrong (so the mark rides a *different* distribution than the sampler
   actually draws from).
2. **The candidate set must match the host sampler.** If the host samples with
   top-k=40 / top-p=0.95 / temperature=0.8, the watermark must play inside
   *that* truncated set, or detection statistics and the "no quality loss"
   property both drift.
3. **OpenAI-compatible gateways expose a *truncated* set** (`top_logprobs`), not
   full-vocab logits. That is a second, distinct entry shape.
4. **Latency is load-bearing.** A watermark front-end runs once per generated
   token, in the hot path, at the tokens/sec of the whole service. Per-token
   heap churn is unacceptable.

The user asked for an "ultra-low-latency proxy to integrate watermarking in LLM
outputs, as both Rust crate and WASM."

**Terminology note (important, to avoid a false expectation):** "proxy" here is
a *sampler interposition* — a library object you place in the decode loop — not
a network daemon. A network sidecar cannot watermark anyway: to change which
token is emitted you must sit at the sampling step, which is inside the serving
process, not on the wire. And WASM cannot be a network proxy. So the deliverable
is a library shim in both Rust and WASM; the network-service framing is ADR-387.

## Decision

Add `StreamProxy` — a streaming decode-loop front-end over `Watermarker` — to the
crate, and mirror it to WASM (`WasmStreamProxy`) and npm (`StreamProxy`, Node +
browser). It is a **front-end, not a new scheme**: g-values key on the emitted
*token id*, so a stream produced through the proxy detects identically to one
produced through `Watermarker`.

```rust
pub struct ProxyConfig { pub temperature: f32, pub top_k: usize, pub top_p: f32 }

impl StreamProxy {
    pub fn new(cfg: WatermarkConfig, scheme: Scheme, pcfg: ProxyConfig) -> Self;
    pub fn push_logits(&mut self, logits: &[f32]) -> u32;          // full-vocab path
    pub fn push_topk(&mut self, ids: &[u32], logprobs: &[f32]) -> u32; // truncated path
    pub fn steps(&self) -> u64;
}
```

Two entry points for the two real deployment shapes:

- **`push_logits`** — full-vocab logits (local serving where you own the decode
  loop). The proxy applies temperature, then O(V) top-k selection via
  `select_nth_unstable`, then softmax, then in-place top-p (nucleus) truncation,
  then watermark-selects and returns the token id.
- **`push_topk`** — an already-truncated `(token_ids, logprobs)` set (an
  OpenAI-compatible API returning `top_logprobs`). The proxy softmaxes the
  logprobs, optionally top-p filters, watermarks, and returns the token id.

### Latency contract — "ultra-low-latency" is a stated invariant, not a slogan

- **Allocation-free after warmup.** All scratch — candidate `ids`, `logits`,
  `probs`, plus `pairs` (top-k) and `order` (top-p) — lives in reusable buffers
  on the struct. Each step `clear()`s them (retaining capacity); after the first
  step no heap traffic occurs. This is enforced by a test that asserts every
  buffer's *capacity* is unchanged across 200 steps on the heaviest path
  (temperature + top-k + top-p all active).
- **Linear candidate selection.** Top-k is `select_nth_unstable` (O(V)), not a
  full sort. Top-p zeroes the tail and renormalizes in place rather than
  rebuilding vectors.
- **Fixed marginal cost.** The per-token cost is a bounded amount on top of the
  softmax the host already runs — no allocation, no growth with sequence length.

### Boundary (inherited from ADR-383, restated because deployment makes it sharp)

The proxy watermarks **only where you control sampling** — the model tiers you
self-host. It **cannot** post-hoc watermark **frontier pass-through**
(Anthropic/OpenAI): their APIs do not expose enough to re-sample, and re-selecting
a token you did not generate is not watermarking. Marketing a proxied frontier
response as watermarked would be a false compliance claim. This is the exact
line ADR-387 deploys against.

Still, and unchanged: this is generation-time marking only. There is **no
removal/laundering surface** — the proxy writes marks, it never strips them.

## Alternatives considered

- **Network sidecar / HTTP proxy.** Rejected as the *core*: cannot alter token
  selection from outside the serving process, and un-buildable in WASM. Revisited
  as a deployment concern in ADR-387, where the "proxy" is the meta-llm process
  itself embedding this library.
- **Make integrators pre-shape logits and keep only `step`.** Rejected: pushes
  temperature/top-k/top-p correctness onto every caller — the most error-prone
  part — and guarantees candidate-set/detector drift.
- **A new distortion-free-at-truncation scheme.** Unnecessary: keying on token
  id means the existing schemes already detect a truncated-set stream. The proxy
  changes the *interface*, not the math.

## Consequences

- **Positive.** One-line drop-in for local serving and for OpenAI-style
  gateways; candidate set provably matches the host sampler; measured,
  allocation-free hot path; zero new scheme surface to audit; detection is
  unchanged. Verified end-to-end from clean registry installs (proxy stream
  z ≈ 66–79; wrong-key z ≈ 0.8; top-k path emits only valid candidate ids).
- **Negative / accepted.** The `push_logits` top-k branch still fills a
  vocab-sized `pairs` buffer each step (reused, not reallocated) — O(V) work is
  intrinsic to top-k and matches what the host sampler already does. Zeroing the
  top-p tail hands `Watermarker::step` zero-probability candidates; both Gumbel
  (∞ key/p) and Tournament (never drawn) handle these correctly, but it is a
  coupling worth remembering if a future scheme is added.
- **Follow-up.** Mirror `proxy.rs`/`wasm.rs` into the canonical
  `ruflo/v3/crates/ruflo-watermark` copy. A criterion bench of proxy overhead
  vs. bare softmax would let us publish a concrete per-token number instead of
  the qualitative "fixed marginal cost."

## Status of implementation

Implemented and published. 4 dedicated Rust tests (`proxy_stream_is_detected`,
`topk_shaping_still_detects`, `push_topk_matches_candidate_ids`,
`allocation_free_after_warmup`) + a doc-test, all green; Node and browser smoke
green; verified from clean `cargo`/`npm` installs.
