# ADR-387 — Watermarking as a Cognitum service in meta-llm / meta-proxy

- **Status**: Proposed — pending explicit authorization (no code)
- **Date**: 2026-08-15
- **Component (proposed)**: `cognitum-one/meta-proxy` (private) — meta-llm gateway (Cloud Run `apicompletions`), consuming `ruflo-watermark` / `@claude-flow/watermark`
- **Related**: ADR-385 (`StreamProxy`, the library this service embeds), ADR-383 (schemes/detectors), ADR-386 (optional multi-bit payload for model/tenant ids). Deployment context: the meta-llm dev-bridge and CD notes in the repo `CLAUDE.md`.

## Context

meta-llm is already an OpenAI-compatible completions gateway sitting in front of
multiple model backends, routing cheap-tier-first and escalating to the frontier.
That is precisely the interposition point watermarking needs, and ADR-385's
`push_topk` was built for the gateway shape. The question raised: **should the
watermark proxy be deployed as a Cognitum API service inside meta-proxy / the
meta-llm service on GCP?**

There is real value: if Cognitum serves AI-generated text, marking its *own*
models' output is a legitimate EU AI Act transparency posture and a
differentiator, plus a detection endpoint lets Cognitum verify provenance of its
own content.

## Decision (proposed)

Integrate watermarking into meta-llm **for self-hosted tiers only**, behind a
default-off flag, plus a detection endpoint — and explicitly **not** for frontier
pass-through.

1. **Generation.** Embed `ruflo-watermark` (`StreamProxy`) in the decode path of
   the tiers Cognitum self-hosts (local / ruvllm / gpt-oss / Hailo paths where
   meta-llm owns sampling or receives true per-token `top_logprobs`). Gated by a
   per-tenant config flag; **no traffic behavior change by default**.
2. **Detection.** Add `POST /v1/watermark/detect` (text + key-ref → verdict with
   z/p and scored positions) using the crate's detectors.
3. **Keys.** Per-tenant watermark keys via existing GCP secret infrastructure,
   with rotation. Keys carry no user information (ADR-383) and select
   provider/model, optionally a model-id payload via ADR-386.

### The load-bearing boundary

Watermarking happens **at sampling**; you can only mark tokens whose selection you
control. Therefore:

- **Self-hosted tiers: yes** — meta-llm owns the decode loop / real logprobs.
- **Frontier pass-through (Anthropic/OpenAI): no** — their APIs do not expose
  enough to re-sample, and re-selecting tokens you did not generate is not
  watermarking. **Presenting a proxied frontier response as watermarked would be
  a false compliance claim** and is out of scope. If any "mark-on-egress" story
  for pass-through is ever pursued, it must be labelled best-effort/unsupported
  and never surfaced as an EU-AI-Act guarantee.

Generation-time only; **no removal/laundering surface** is added to the service.

## Alternatives considered

- **Watermark everything meta-llm returns, including frontier.** Rejected —
  technically impossible and a false claim.
- **Standalone watermarking microservice separate from meta-llm.** Deferred:
  detection can live standalone, but *generation* must be in the decode path, so
  it belongs where sampling happens (meta-llm), not beside it.
- **Do nothing.** Viable, but forgoes a real compliance differentiator for
  Cognitum's own models.

## Consequences

- **Positive.** Compliance-grade provenance on Cognitum-hosted output; a
  self-serve detection endpoint; reuses a published, tested library (ADR-385).
- **Negative / accepted.** Only self-hosted tiers are covered (by physics, not
  choice); adds per-tenant key management; touches a production service with
  WIF-authed auto-deploy, so it must go through review/CD, not a direct push.
- **Risk to avoid.** Any UI/marketing that implies frontier pass-through is
  watermarked. The detect endpoint and docs must state the coverage boundary.

## Status

**Proposed. No code written.** Requires explicit authorization plus a decision on
scope (recommended: self-hosted tiers only). On approval: open a PR against
`cognitum-one/meta-proxy` adding the flagged decode-path integration + detect
endpoint, validated on the local-model tier first, and update this ADR to
Accepted/Implemented with the deploy date.
