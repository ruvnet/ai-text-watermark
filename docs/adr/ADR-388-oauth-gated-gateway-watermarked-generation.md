# ADR-388 — Cognitum-OAuth-gated, gateway-backed watermarked generation

- **Status**: Proposed
- **Date**: 2026-08-15
- **Component (CLI, buildable now)**: `ruflo` CLI (`v3/@claude-flow/cli` in the ruflo monorepo) — reuses the existing `ruflo auth` session (ADR-306) to gate a new watermark-generation surface
- **Component (proxy, blocked)**: `cognitum-one/meta-proxy` / meta-llm — the gateway endpoint that actually performs watermarked generation (ADR-387)
- **Related**: ADR-306 (ruflo Cognitum OAuth — PKCE/device/token, keychain refresh, profiles; the auth this reuses), ADR-385 (`StreamProxy`, the local generation path + the client the gateway wraps), ADR-387 (meta-llm watermarking service — the gateway feature this unlocks). Watermark core: `ruflo-watermark` / `@claude-flow/watermark`.

## Context

The request: "integrate the Cognitum OAuth into the CLI and proxy for enhanced
features." Discovery showed the OAuth mechanism **already exists** — `ruflo auth`
(ADR-306): PKCE / device-code / token-stdin login, refresh tokens in the OS
keychain, access token in-memory, multi-profile. So this is **not** building an
auth flow; it is **wiring an existing session into a gated capability**.

Decision inputs (from the requester): the surface is **both** the CLI and the
proxy (CLI first, proxy once ADR-387 is authorized), and the single capability
to gate is **gateway-backed watermarked generation** — i.e. generate watermarked
text through meta-llm's self-hosted tiers, rather than only locally.

**The honest dependency:** gateway-backed *watermarked* generation requires the
meta-llm watermark tier, which is **ADR-387 (Proposed, not built, private repo,
needs deploy authorization)**. Therefore the end-to-end feature cannot be fully
exercised until ADR-387 lands. What *can* be built now is the CLI surface, the
auth gate, and the local fallback — structured so the gateway path activates the
moment ADR-387 exists.

## Decision (proposed)

Add a watermark-generation surface to the `ruflo` CLI that selects its execution
path from the **existing `ruflo auth` session**, gating one enhanced capability.

1. **Local path (works today, no auth).** Generate watermarked output locally via
   `ruflo-watermark` / `StreamProxy` (ADR-385). Available to everyone,
   unauthenticated, offline. This is the default and the fallback.
2. **Gateway path (enhanced, requires OAuth).** When a valid `ruflo auth` session
   is present (access token from ADR-306's in-memory session; refresh via
   keychain), route generation to meta-llm's self-hosted watermarking tier
   (ADR-387), passing the Cognitum access token as the gateway bearer. Returns
   watermarked text plus the gateway's provenance metadata.
3. **Gate semantics.** No session, or a session lacking the required scope ⇒ the
   CLI prints a clear message ("gateway-backed generation needs `ruflo auth login`
   and the meta-llm watermark tier") and falls back to the local path — never a
   hard failure, never a silent downgrade without saying so.
4. **Scope, not just login.** The gateway path checks a specific OAuth **scope**
   (e.g. `watermark:generate`), so authentication alone doesn't imply
   entitlement — the gateway remains the policy decision point.

### Boundaries (inherited, restated)

- **Self-hosted tiers only** (ADR-387): the gateway watermarks models Cognitum
  controls sampling for; frontier pass-through is **not** watermarked and must
  not be presented as such.
- **No token material on disk beyond ADR-306's contract.** The CLI reuses the
  ADR-306 session/keychain design verbatim — access token in memory, refresh in
  keychain (or session-only), `auth.json` holds identity metadata only. This ADR
  adds **no** new token storage.
- **Generation-time only.** Still no removal/laundering surface anywhere.

## Alternatives considered

- **New OAuth flow for the watermark tool.** Rejected — `ruflo auth` (ADR-306)
  already implements the Cognitum flow correctly; a second flow would duplicate
  security-sensitive code and fragment sessions.
- **Gate on login alone (no scope check).** Rejected — entitlement must be a
  gateway-enforced scope, not "has any session"; keeps the gateway as the PDP.
- **Build the CLI gateway path before ADR-387.** Partially unavoidable (the CLI
  can be built now), but the ADR records that the gateway endpoint is a hard
  dependency and the path stays behind the auth+scope gate + local fallback until
  ADR-387 is authorized and deployed.

## Consequences

- **Positive.** Reuses audited auth (ADR-306); a clean local↔gateway split with an
  honest, non-silent fallback; the enhanced capability is a real, scoped gateway
  entitlement; nothing new to store or secure on disk.
- **Negative / accepted.** The headline feature is **blocked on ADR-387** (private
  repo, deploy authorization) for true end-to-end function; until then the gateway
  path is scaffolding behind the gate. Spans two repos/release trains (ruflo CLI +
  meta-proxy).
- **Risk to avoid.** Presenting frontier pass-through as watermarked; a silent
  downgrade when the gateway is unreachable (must be announced).

## Status & plan

**Proposed.** Buildable now (ruflo monorepo, no new authorization): the CLI
generation surface + `ruflo auth` gate + `StreamProxy` local path + scope-checked
gateway client behind the gate. **Blocked** for end-to-end until ADR-387 is
authorized and the meta-llm watermark tier + `watermark:generate` scope exist.
On CLI implementation, update this ADR to *Accepted*; on gateway availability,
to *Implemented*.
