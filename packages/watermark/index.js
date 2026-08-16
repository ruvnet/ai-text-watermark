// @claude-flow/watermark — ergonomic wrapper over the ruflo-watermark WASM core.
//
// SynthID-Text-style LLM text watermarking (generation + detection). The
// watermark rides the tie-break randomness among plausible tokens — it never
// injects an out-of-distribution word, costs no extra tokens, and is detectable
// only with the key. This package deliberately does NOT include a watermark
// remover / laundering tool.
'use strict';

const wasm = require('./wasm/ruflo_watermark.js');

const SCHEMES = new Set(['tournament', 'tournament_nd', 'gumbel']);

function toKeyBytes(key) {
  if (typeof key === 'string') return new TextEncoder().encode(key);
  if (key instanceof Uint8Array) return key;
  throw new TypeError('key must be a string or Uint8Array');
}
function toU32(a) {
  return a instanceof Uint32Array ? a : Uint32Array.from(a);
}
function toF32(a) {
  return a instanceof Float32Array ? a : Float32Array.from(a);
}
function normScheme(scheme) {
  const s = scheme || 'gumbel';
  if (!SCHEMES.has(s)) throw new RangeError(`unknown scheme "${s}" (use tournament | tournament_nd | gumbel)`);
  return s;
}

/** Shape a raw WasmDetection into a plain object with an `isWatermarked` helper. */
function shape(r) {
  const out = {
    zScore: r.z_score,
    pValue: r.p_value,
    log10P: r.log10_p,
    scoredPositions: r.scored_positions,
    /** True if the evidence clears the given false-positive rate (e.g. 1e-6). */
    isWatermarked(alpha = 1e-6) {
      return out.log10P <= Math.log10(alpha);
    },
  };
  r.free();
  return out;
}

/**
 * Streaming watermarked sampler. Hold one per generated sequence; feed it the
 * model's candidate token ids and their probabilities per step.
 */
class Watermarker {
  /**
   * @param {object} opts
   * @param {string|Uint8Array} opts.key   secret key material (carries no user info)
   * @param {'tournament'|'tournament_nd'|'gumbel'} [opts.scheme='gumbel']
   * @param {number} [opts.contextWidth=4]  H — preceding tokens seeding each draw
   * @param {number} [opts.layers=6]        tournament depth (ignored by gumbel)
   */
  constructor({ key, scheme = 'gumbel', contextWidth = 4, layers = 6 } = {}) {
    this._inner = new wasm.WasmWatermarker(toKeyBytes(key), contextWidth, layers, normScheme(scheme));
  }
  /** Emit one token: returns the index of the chosen candidate. */
  step(tokens, probs) {
    return this._inner.step(toU32(tokens), toF32(probs));
  }
  /** Release the WASM instance. */
  free() {
    this._inner.free();
  }
}

/**
 * Ultra-low-latency streaming watermark **proxy**. Drop into a decode loop:
 * feed it a step's raw logits (or a truncated top-k `(ids, logprobs)` set from
 * an OpenAI-compatible API) and it returns the watermarked token id to emit,
 * applying temperature + top-k/top-p to match your sampler. Reuses scratch
 * buffers, so per-step cost is fixed on top of the sampling you already do.
 */
class StreamProxy {
  /**
   * @param {object} opts
   * @param {string|Uint8Array} opts.key
   * @param {'tournament'|'tournament_nd'|'gumbel'} [opts.scheme='gumbel']
   * @param {number} [opts.contextWidth=4]
   * @param {number} [opts.layers=6]
   * @param {number} [opts.temperature=1.0]  softmax temperature (>0)
   * @param {number} [opts.topK=0]           keep top-K logits (0 = all)
   * @param {number} [opts.topP=1.0]         nucleus threshold (>=1 = off)
   */
  constructor({ key, scheme = 'gumbel', contextWidth = 4, layers = 6, temperature = 1.0, topK = 0, topP = 1.0 } = {}) {
    this._inner = new wasm.WasmStreamProxy(toKeyBytes(key), contextWidth, layers, normScheme(scheme), temperature, topK >>> 0, topP);
  }
  /** Full-vocab path: `logits[i]` is the logit for token id `i`. Returns the token id to emit. */
  pushLogits(logits) {
    return this._inner.push_logits(toF32(logits));
  }
  /** Truncated path: watermark an already-small `(tokenIds, logprobs)` set. Returns the token id to emit. */
  pushTopK(tokenIds, logprobs) {
    return this._inner.push_topk(toU32(tokenIds), toF32(logprobs));
  }
  /** Tokens emitted so far. */
  get steps() {
    return this._inner.steps;
  }
  /** Release the WASM instance. */
  free() {
    this._inner.free();
  }
}

/**
 * MidStream — **inflight analysis** of a live watermarked stream. Each
 * `pushLogits`/`pushTopK` watermarks one token AND analyzes it in the same pass,
 * returning `{ token, zScore, scored, log10P, novel, backpressure }` so a serving
 * loop knows the watermark's strength *while* it generates. Same statistic as
 * `detect`, computed online.
 */
class MidStream {
  /**
   * @param {object} opts  ProxyOptions plus:
   * @param {number} [opts.capacity=64]  backpressure window (unacked tokens before the throttle signal)
   */
  constructor({ key, scheme = 'gumbel', contextWidth = 4, layers = 6, temperature = 1.0, topK = 0, topP = 1.0, capacity = 64 } = {}) {
    this._inner = new wasm.WasmMidStream(toKeyBytes(key), contextWidth, layers, normScheme(scheme), temperature, topK >>> 0, topP, capacity >>> 0);
  }
  _event(token) {
    return { token, zScore: this._inner.z_score, scored: this._inner.scored, log10P: this._inner.log10_p, novel: this._inner.last_novel, backpressure: this._inner.backpressure };
  }
  /** Watermark + analyze one full-vocab-logits step. Returns the inflight event. */
  pushLogits(logits) {
    return this._event(this._inner.push_logits(toF32(logits)));
  }
  /** Watermark + analyze one truncated `(tokenIds, logprobs)` step. */
  pushTopK(tokenIds, logprobs) {
    return this._event(this._inner.push_topk(toU32(tokenIds), toF32(logprobs)));
  }
  /** Consumer drained `n` tokens — relieve backpressure. */
  ack(n) {
    this._inner.ack(n >>> 0);
  }
  /** Live watermark evidence (z-score) over the stream so far. */
  get zScore() {
    return this._inner.z_score;
  }
  /** Fraction of tokens judged novel so far (low ⇒ repetitive ⇒ weak mark). */
  get noveltyRatio() {
    return this._inner.novelty_ratio;
  }
  /** Release the WASM instance. */
  free() {
    this._inner.free();
  }
}

/** Detect a watermark over an emitted token-id sequence using the named scheme. */
function detect(tokens, { key, scheme = 'gumbel', contextWidth = 4, layers = 6 } = {}) {
  return shape(wasm.detect(toU32(tokens), toKeyBytes(key), contextWidth, layers, normScheme(scheme)));
}

/** Indel-robust detection (Gumbel self-sync) — stronger on edited/repetitive text. */
function detectSelfSync(tokens, { key, contextWidth = 4 } = {}) {
  return shape(wasm.detect_selfsync(toU32(tokens), toKeyBytes(key), contextWidth));
}

/** Exact-null short-text detection (Gumbel, exact Gamma tail). */
function detectExact(tokens, { key, contextWidth = 4 } = {}) {
  return shape(wasm.detect_exact(toU32(tokens), toKeyBytes(key), contextWidth));
}

module.exports = { Watermarker, StreamProxy, MidStream, detect, detectSelfSync, detectExact, SCHEMES };
