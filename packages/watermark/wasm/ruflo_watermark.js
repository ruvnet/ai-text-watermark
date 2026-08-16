/* @ts-self-types="./ruflo_watermark.d.ts" */

/**
 * Detection result, JS-facing (fields via getters).
 */
class WasmDetection {
    static __wrap(ptr) {
        const obj = Object.create(WasmDetection.prototype);
        obj.__wbg_ptr = ptr;
        WasmDetectionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDetectionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdetection_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get log10_p() {
        const ret = wasm.wasmdetection_log10_p(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p_value() {
        const ret = wasm.wasmdetection_p_value(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get scored_positions() {
        const ret = wasm.wasmdetection_scored_positions(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get z_score() {
        const ret = wasm.wasmdetection_z_score(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmDetection.prototype[Symbol.dispose] = WasmDetection.prototype.free;
exports.WasmDetection = WasmDetection;

/**
 * MidStream — inflight analysis of a live watermarked stream, JS-facing.
 *
 * Wraps [`MidStream`]: `push_logits` (or `push_topk`) watermarks one token and
 * analyzes it in the same pass. After each call the getters report the live
 * watermark confidence (`z_score`), scored positions, novelty, and backpressure —
 * so a serving loop knows the mark's strength *while* it generates.
 */
class WasmMidStream {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMidStreamFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmidstream_free(ptr, 0);
    }
    /**
     * Consumer drained `n` tokens — relieve backpressure.
     * @param {number} n
     */
    ack(n) {
        wasm.wasmmidstream_ack(this.__wbg_ptr, n);
    }
    /**
     * Is the consumer behind (throttle signal)?
     * @returns {boolean}
     */
    get backpressure() {
        const ret = wasm.wasmmidstream_backpressure(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Was the most recent token novel?
     * @returns {boolean}
     */
    get last_novel() {
        const ret = wasm.wasmmidstream_last_novel(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * `log10(p_value)` of the current evidence.
     * @returns {number}
     */
    get log10_p() {
        const ret = wasm.wasmmidstream_log10_p(this.__wbg_ptr);
        return ret;
    }
    /**
     * Same shaping args as `WasmStreamProxy`, plus `capacity` = the backpressure
     * window (unacked tokens before the throttle signal fires).
     * @param {Uint8Array} key_material
     * @param {number} context_width
     * @param {number} layers
     * @param {string} scheme
     * @param {number} temperature
     * @param {number} top_k
     * @param {number} top_p
     * @param {number} capacity
     */
    constructor(key_material, context_width, layers, scheme, temperature, top_k, top_p, capacity) {
        const ptr0 = passArray8ToWasm0(key_material, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(scheme, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmidstream_new(ptr0, len0, context_width, layers, ptr1, len1, temperature, top_k, top_p, capacity);
        this.__wbg_ptr = ret;
        WasmMidStreamFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Fraction of tokens judged novel (low ⇒ repetitive ⇒ weak mark).
     * @returns {number}
     */
    get novelty_ratio() {
        const ret = wasm.wasmmidstream_novelty_ratio(this.__wbg_ptr);
        return ret;
    }
    /**
     * Watermark + analyze one full-vocab-logits step. Returns the token id;
     * read `z_score` / `scored` / `novel` / `backpressure` for the live analysis.
     * @param {Float32Array} logits
     * @returns {number}
     */
    push_logits(logits) {
        const ptr0 = passArrayF32ToWasm0(logits, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmidstream_push_logits(this.__wbg_ptr, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * Watermark + analyze one truncated `(ids, logprobs)` step.
     * @param {Uint32Array} token_ids
     * @param {Float32Array} logprobs
     * @returns {number}
     */
    push_topk(token_ids, logprobs) {
        const ptr0 = passArray32ToWasm0(token_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(logprobs, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmidstream_push_topk(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret >>> 0;
    }
    /**
     * Watermarked positions scored so far.
     * @returns {number}
     */
    get scored() {
        const ret = wasm.wasmmidstream_scored(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Live watermark evidence over the stream so far.
     * @returns {number}
     */
    get z_score() {
        const ret = wasm.wasmmidstream_z_score(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmMidStream.prototype[Symbol.dispose] = WasmMidStream.prototype.free;
exports.WasmMidStream = WasmMidStream;

/**
 * Ultra-low-latency streaming watermark **proxy**, JS-facing.
 *
 * Wraps [`StreamProxy`]: feed it a decode step's **logits** (or a truncated
 * top-k `(ids, logprobs)` set from an OpenAI-compatible API) and it returns
 * the watermarked **token id** to emit, applying temperature + top-k/top-p to
 * match the host sampler. Scratch buffers are reused, so per-step cost is a
 * fixed amount on top of the sampler you already run.
 */
class WasmStreamProxy {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmStreamProxyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmstreamproxy_free(ptr, 0);
    }
    /**
     * `key_material`: secret bytes. `scheme`: `"tournament"` | `"tournament_nd"`
     * | `"gumbel"`. `temperature` (>0), `top_k` (0 = all), `top_p` (>=1 = off)
     * shape the candidate set exactly as the host decoder would.
     * @param {Uint8Array} key_material
     * @param {number} context_width
     * @param {number} layers
     * @param {string} scheme
     * @param {number} temperature
     * @param {number} top_k
     * @param {number} top_p
     */
    constructor(key_material, context_width, layers, scheme, temperature, top_k, top_p) {
        const ptr0 = passArray8ToWasm0(key_material, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(scheme, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmstreamproxy_new(ptr0, len0, context_width, layers, ptr1, len1, temperature, top_k, top_p);
        this.__wbg_ptr = ret;
        WasmStreamProxyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Full-vocab path: `logits[i]` is the logit for token id `i`. Returns the
     * watermarked token id to emit and advances the rolling context.
     * @param {Float32Array} logits
     * @returns {number}
     */
    push_logits(logits) {
        const ptr0 = passArrayF32ToWasm0(logits, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmstreamproxy_push_logits(this.__wbg_ptr, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * Truncated path: watermark an already-small candidate set of
     * `(token_ids, logprobs)` (e.g. OpenAI `top_logprobs`). Returns the token
     * id to emit. `top_k` is ignored; the set is already truncated.
     * @param {Uint32Array} token_ids
     * @param {Float32Array} logprobs
     * @returns {number}
     */
    push_topk(token_ids, logprobs) {
        const ptr0 = passArray32ToWasm0(token_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(logprobs, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmstreamproxy_push_topk(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret >>> 0;
    }
    /**
     * Tokens emitted so far.
     * @returns {number}
     */
    get steps() {
        const ret = wasm.wasmstreamproxy_steps(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmStreamProxy.prototype[Symbol.dispose] = WasmStreamProxy.prototype.free;
exports.WasmStreamProxy = WasmStreamProxy;

/**
 * Streaming watermarked sampler, JS-facing.
 */
class WasmWatermarker {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmWatermarkerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmwatermarker_free(ptr, 0);
    }
    /**
     * `key_material`: arbitrary secret bytes (e.g. a hex string's bytes).
     * `scheme`: `"tournament"` | `"tournament_nd"` | `"gumbel"` (default gumbel).
     * @param {Uint8Array} key_material
     * @param {number} context_width
     * @param {number} layers
     * @param {string} scheme
     */
    constructor(key_material, context_width, layers, scheme) {
        const ptr0 = passArray8ToWasm0(key_material, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(scheme, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmwatermarker_new(ptr0, len0, context_width, layers, ptr1, len1);
        this.__wbg_ptr = ret;
        WasmWatermarkerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Emit one token: returns the index into `tokens`/`probs` of the chosen
     * candidate. Advances the rolling context.
     * @param {Uint32Array} tokens
     * @param {Float32Array} probs
     * @returns {number}
     */
    step(tokens, probs) {
        const ptr0 = passArray32ToWasm0(tokens, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(probs, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmwatermarker_step(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmWatermarker.prototype[Symbol.dispose] = WasmWatermarker.prototype.free;
exports.WasmWatermarker = WasmWatermarker;

/**
 * Detect a watermark over an emitted token id sequence, using the named scheme.
 * @param {Uint32Array} tokens
 * @param {Uint8Array} key_material
 * @param {number} context_width
 * @param {number} layers
 * @param {string} scheme
 * @returns {WasmDetection}
 */
function detect(tokens, key_material, context_width, layers, scheme) {
    const ptr0 = passArray32ToWasm0(tokens, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(key_material, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(scheme, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.detect(ptr0, len0, ptr1, len1, context_width, layers, ptr2, len2);
    return WasmDetection.__wrap(ret);
}
exports.detect = detect;

/**
 * Exact-null short-text detection (Gumbel, exact Gamma tail): correct p-values
 * at small token counts where the normal approximation misleads. See `bayes.rs`.
 * @param {Uint32Array} tokens
 * @param {Uint8Array} key_material
 * @param {number} context_width
 * @returns {WasmDetection}
 */
function detect_exact(tokens, key_material, context_width) {
    const ptr0 = passArray32ToWasm0(tokens, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(key_material, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_exact(ptr0, len0, ptr1, len1, context_width);
    return WasmDetection.__wrap(ret);
}
exports.detect_exact = detect_exact;

/**
 * Indel-robust detection (Gumbel self-sync): far stronger than the standard
 * detector on edited / repetitive text. See `align.rs`.
 * @param {Uint32Array} tokens
 * @param {Uint8Array} key_material
 * @param {number} context_width
 * @returns {WasmDetection}
 */
function detect_selfsync(tokens, key_material, context_width) {
    const ptr0 = passArray32ToWasm0(tokens, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(key_material, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.detect_selfsync(ptr0, len0, ptr1, len1, context_width);
    return WasmDetection.__wrap(ret);
}
exports.detect_selfsync = detect_selfsync;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ruflo_watermark_bg.js": import0,
    };
}

const WasmDetectionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdetection_free(ptr, 1));
const WasmMidStreamFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmidstream_free(ptr, 1));
const WasmStreamProxyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmstreamproxy_free(ptr, 1));
const WasmWatermarkerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmwatermarker_free(ptr, 1));

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/ruflo_watermark_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());
let wasm = wasmInstance.exports;
wasm.__wbindgen_start();
