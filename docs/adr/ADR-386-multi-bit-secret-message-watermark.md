# ADR-386 — Multi-bit secret-message watermarking (per-block key derivation)

- **Status**: Accepted (design) — reference implementation shipped; core-crate promotion Proposed
- **Date**: 2026-08-15
- **Component (reference impl)**: `docs/index.html` playground (`embedMessage()` — layered on the crate's existing key-specific `detect`, no core change)
- **Proposed component (promotion)**: `crates/ruflo-watermark/src/multibit.rs` (+ WASM/npm mirror) — *not yet built*
- **Related**: ADR-383 (the single-bit watermark + key-specific detector this composes — Proposed). ADR-385 (`StreamProxy`, the natural place a promoted encoder would live).

## Context

The watermark of ADR-383 answers exactly **one bit**: *was a keyed model likely
involved?* Detection is a hypothesis test, not a payload read. Several real needs
want more than one bit *inside the same invisible mark*:

- a **model/version id** (which of our models produced this),
- a **provenance/run tag** for content-credential workflows,
- a coarse **tenant/key selector** so a platform can attribute at scale.

The classic move (SynthID's multi-bit variant, and the broader distortion-free
literature) is to make the tie-break stream *depend on the payload bits*, so the
same text, read with the key, spells the message back. We want this capability
demonstrable in the live playground and specified for the crate — **without a new
scheme and without weakening the single-bit guarantees or the project's
no-laundering boundary.**

## Decision

Encode a short message by **per-block key derivation over the existing
single-bit primitive**. No new scheme, no new detector — a *composition*.

- Split the message into bits `b_0 … b_{m-1}` (UTF-8 → bits).
- Choose a block size `B` tokens per bit (reference impl: `B ≈ 90`).
- For block `i`, derive two keys `k(i,0) = H(base ‖ i ‖ 0)` and
  `k(i,1) = H(base ‖ i ‖ 1)`. **Generate block `i` under `k(i, b_i)`** — i.e. the
  bit is carried by *which of two key-derived streams* watermarked that block.
- **Extract** without knowing the message: for each block, run the standard
  key-specific detector under both `k(i,0)` and `k(i,1)`; the higher z-score wins
  the bit. Reassemble bits → bytes → message.

Because each block is an independent instance of the ADR-383 detector keyed on
token id, extraction needs only the base key and the block size — never the
candidate sets or the original text alignment. The reference implementation in
the playground demonstrates it end-to-end (message "AI" → 16 bits over 1,440
tokens → 16/16 recovered, 100%).

### Properties, stated honestly

- **Capacity ↔ robustness ↔ length is a hard triangle.** Each bit needs enough
  low-entropy-safe tie positions to detect reliably; `~90 tokens/bit` at high
  entropy gives a clean read, but a factual/short/heavily-edited block loses
  bits exactly as ADR-383's single-bit detector loses signal. More payload ⇒ more
  tokens, or lower per-bit confidence. The reference impl surfaces the recovered
  %/bit rather than pretending it is always perfect.
- **No error correction yet.** The reference impl is raw bits. A promoted crate
  encoder should add an ECC layer (e.g. a repetition or BCH code) so a few
  flipped blocks don't corrupt the message — deferred to promotion.
- **It carries provenance, not identity.** The payload is whatever the *operator*
  puts there (a model id, a run tag). It is **not** derived from and **must not**
  encode end-user PII. Same posture as ADR-383: provenance, not surveillance.
- **Still not a laundering tool.** This only *writes* and *reads* payloads inside
  a mark. There is no stripping surface, and this ADR does not create one.

## Alternatives considered

- **Position-encoded payload (bit = presence/absence of mark at position `j`).**
  Rejected: far less robust to edits and offset drift than block-keyed streams,
  and it fights the repeated-context masking already in the detector.
- **A dedicated multi-bit scheme in the core (new sampler).** Rejected for now:
  the per-block-key composition reuses the audited single-bit path exactly, so
  there is nothing new to prove about distortion or detection — only the
  block/ECC bookkeeping, which is cheap and testable.
- **Ship the encoder only in JS.** Rejected as the *end state*: the composition
  belongs in the crate so Rust/WASM/npm all get it and it can be tested against
  the robustness harness. The playground JS is the reference, not the home.

## Consequences

- **Positive.** A genuine multi-bit/steganographic capability with zero new
  scheme to audit; extraction needs only the key + block size; demonstrable live.
- **Negative / accepted.** No ECC in the reference impl (bits can flip under
  editing); capacity is modest and length-hungry; the playground and a future
  crate encoder must be kept in step once promoted.
- **Follow-up (promotion plan).** Build `multibit.rs`: a `MultiBitEncoder`
  wrapping `Watermarker`/`StreamProxy` for embed and a `multibit_extract(tokens,
  base_key, block, m)` for read, plus an ECC option and a robustness-harness case
  measuring bit-error-rate vs. edit rate. Mirror to WASM + npm. Update this ADR's
  Status to *Implemented* and stamp the promotion date when done.

## Status of implementation

Design **Accepted**; reference implementation **shipped** in the playground and
verified live (100% recovery on the demo payload). Core-crate promotion
(`multibit.rs` + ECC + WASM/npm + harness case) is **Proposed** and not yet
built.
