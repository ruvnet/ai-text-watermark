/* tslint:disable */
/* eslint-disable */

/**
 * Detection result, JS-facing (fields via getters).
 */
export class WasmDetection {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly log10_p: number;
    readonly p_value: number;
    readonly scored_positions: number;
    readonly z_score: number;
}

/**
 * Ultra-low-latency streaming watermark **proxy**, JS-facing.
 *
 * Wraps [`StreamProxy`]: feed it a decode step's **logits** (or a truncated
 * top-k `(ids, logprobs)` set from an OpenAI-compatible API) and it returns
 * the watermarked **token id** to emit, applying temperature + top-k/top-p to
 * match the host sampler. Scratch buffers are reused, so per-step cost is a
 * fixed amount on top of the sampler you already run.
 */
export class WasmStreamProxy {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * `key_material`: secret bytes. `scheme`: `"tournament"` | `"tournament_nd"`
     * | `"gumbel"`. `temperature` (>0), `top_k` (0 = all), `top_p` (>=1 = off)
     * shape the candidate set exactly as the host decoder would.
     */
    constructor(key_material: Uint8Array, context_width: number, layers: number, scheme: string, temperature: number, top_k: number, top_p: number);
    /**
     * Full-vocab path: `logits[i]` is the logit for token id `i`. Returns the
     * watermarked token id to emit and advances the rolling context.
     */
    push_logits(logits: Float32Array): number;
    /**
     * Truncated path: watermark an already-small candidate set of
     * `(token_ids, logprobs)` (e.g. OpenAI `top_logprobs`). Returns the token
     * id to emit. `top_k` is ignored; the set is already truncated.
     */
    push_topk(token_ids: Uint32Array, logprobs: Float32Array): number;
    /**
     * Tokens emitted so far.
     */
    readonly steps: number;
}

/**
 * Streaming watermarked sampler, JS-facing.
 */
export class WasmWatermarker {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * `key_material`: arbitrary secret bytes (e.g. a hex string's bytes).
     * `scheme`: `"tournament"` | `"tournament_nd"` | `"gumbel"` (default gumbel).
     */
    constructor(key_material: Uint8Array, context_width: number, layers: number, scheme: string);
    /**
     * Emit one token: returns the index into `tokens`/`probs` of the chosen
     * candidate. Advances the rolling context.
     */
    step(tokens: Uint32Array, probs: Float32Array): number;
}

/**
 * Detect a watermark over an emitted token id sequence, using the named scheme.
 */
export function detect(tokens: Uint32Array, key_material: Uint8Array, context_width: number, layers: number, scheme: string): WasmDetection;

/**
 * Exact-null short-text detection (Gumbel, exact Gamma tail): correct p-values
 * at small token counts where the normal approximation misleads. See `bayes.rs`.
 */
export function detect_exact(tokens: Uint32Array, key_material: Uint8Array, context_width: number): WasmDetection;

/**
 * Indel-robust detection (Gumbel self-sync): far stronger than the standard
 * detector on edited / repetitive text. See `align.rs`.
 */
export function detect_selfsync(tokens: Uint32Array, key_material: Uint8Array, context_width: number): WasmDetection;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmdetection_free: (a: number, b: number) => void;
    readonly __wbg_wasmstreamproxy_free: (a: number, b: number) => void;
    readonly __wbg_wasmwatermarker_free: (a: number, b: number) => void;
    readonly detect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly detect_exact: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly detect_selfsync: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly wasmdetection_log10_p: (a: number) => number;
    readonly wasmdetection_p_value: (a: number) => number;
    readonly wasmdetection_scored_positions: (a: number) => number;
    readonly wasmdetection_z_score: (a: number) => number;
    readonly wasmstreamproxy_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly wasmstreamproxy_push_logits: (a: number, b: number, c: number) => number;
    readonly wasmstreamproxy_push_topk: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly wasmstreamproxy_steps: (a: number) => number;
    readonly wasmwatermarker_new: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly wasmwatermarker_step: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
