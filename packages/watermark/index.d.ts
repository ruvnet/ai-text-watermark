// Type definitions for @claude-flow/watermark.

export type Scheme = 'tournament' | 'tournament_nd' | 'gumbel';

export interface Detection {
  /** Standardized deviation from the null. Larger => stronger evidence. */
  zScore: number;
  /** Upper-tail p-value under the null (floors at 0 for extreme z). */
  pValue: number;
  /** log10(pValue), stable even when pValue underflows to 0. */
  log10P: number;
  /** Number of watermarked positions that were scored. */
  scoredPositions: number;
  /** True if the evidence clears the given false-positive rate (default 1e-6). */
  isWatermarked(alpha?: number): boolean;
}

export interface WatermarkerOptions {
  /** Secret key material. Carries no user-identifying information. */
  key: string | Uint8Array;
  /** Scheme (default `gumbel`, the distortion-free option). */
  scheme?: Scheme;
  /** Context window H — preceding tokens seeding each draw (default 4). */
  contextWidth?: number;
  /** Tournament depth (default 6; ignored by `gumbel`). */
  layers?: number;
}

export interface DetectOptions extends WatermarkerOptions {}
export interface SelfSyncOptions {
  key: string | Uint8Array;
  contextWidth?: number;
}

export interface ProxyOptions extends WatermarkerOptions {
  /** Softmax temperature applied to logits (default 1.0, >0). */
  temperature?: number;
  /** Keep only the top-K highest logits (default 0 = keep all). */
  topK?: number;
  /** Nucleus threshold: keep the smallest top set reaching this mass (default 1.0 = off). */
  topP?: number;
}

export interface MidStreamOptions extends ProxyOptions {
  /** Backpressure window: unacked tokens before the throttle signal fires (default 64). */
  capacity?: number;
}

/** One inflight step: the watermarked token plus the live analysis after it. */
export interface StreamEvent {
  /** The watermarked token id to emit. */
  token: number;
  /** Watermark evidence accumulated through this token (z-score). */
  zScore: number;
  /** Watermarked positions scored so far. */
  scored: number;
  /** log10(p_value) of the current evidence. */
  log10P: number;
  /** Was this token novel (vs. a repeated k-gram)? */
  novel: boolean;
  /** Is the consumer behind (throttle signal)? */
  backpressure: boolean;
}

/** Streaming watermarked sampler. */
export class Watermarker {
  constructor(opts: WatermarkerOptions);
  /** Emit one token; returns the index of the chosen candidate. */
  step(tokens: Uint32Array | number[], probs: Float32Array | number[]): number;
  /** Release the WASM instance. */
  free(): void;
}

/**
 * Ultra-low-latency streaming watermark proxy. Feed a decode step's logits (or
 * a truncated top-k `(ids, logprobs)` set) and get the watermarked token id to
 * emit — temperature + top-k/top-p applied to match your sampler.
 */
export class StreamProxy {
  constructor(opts: ProxyOptions);
  /** Full-vocab path: `logits[i]` is the logit for token id `i`. Returns the token id to emit. */
  pushLogits(logits: Float32Array | number[]): number;
  /** Truncated path: watermark an already-small `(tokenIds, logprobs)` set. Returns the token id to emit. */
  pushTopK(tokenIds: Uint32Array | number[], logprobs: Float32Array | number[]): number;
  /** Tokens emitted so far. */
  readonly steps: number;
  /** Release the WASM instance. */
  free(): void;
}

/**
 * MidStream — inflight analysis of a live watermarked stream. Each push
 * watermarks one token and returns the live watermark confidence in the same pass.
 */
export class MidStream {
  constructor(opts: MidStreamOptions);
  /** Watermark + analyze one full-vocab-logits step. */
  pushLogits(logits: Float32Array | number[]): StreamEvent;
  /** Watermark + analyze one truncated `(tokenIds, logprobs)` step. */
  pushTopK(tokenIds: Uint32Array | number[], logprobs: Float32Array | number[]): StreamEvent;
  /** Consumer drained `n` tokens — relieve backpressure. */
  ack(n: number): void;
  /** Live watermark evidence (z-score) so far. */
  readonly zScore: number;
  /** Fraction of tokens judged novel so far. */
  readonly noveltyRatio: number;
  /** Release the WASM instance. */
  free(): void;
}

/** Detect a watermark over an emitted token-id sequence. */
export function detect(tokens: Uint32Array | number[], opts: DetectOptions): Detection;

/** Indel-robust detection (Gumbel self-sync) — stronger on edited/repetitive text. */
export function detectSelfSync(tokens: Uint32Array | number[], opts: SelfSyncOptions): Detection;

/** Exact-null short-text detection (Gumbel, exact Gamma tail). */
export function detectExact(tokens: Uint32Array | number[], opts: SelfSyncOptions): Detection;

export const SCHEMES: ReadonlySet<Scheme>;
