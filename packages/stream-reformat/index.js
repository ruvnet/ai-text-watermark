// llm-stream-reformat — inflight reformatting of an LLM SSE stream (Node).
// Separate thinking from answer, collapse repetition, normalize — built on the
// ruvnet/midstream temporal-compare WASM core.
'use strict';
const wasm = require('./wasm/stream_reformat.js');

/** @typedef {{channel:'answer'|'thinking', text:string}} ReformatEvent */

class Reformatter {
  constructor() { this._inner = new wasm.WasmReformatter(); }
  /** Parse+reformat one SSE line. provider: 'google'|'openrouter'|'metallm'. Returns ReformatEvent[]. */
  pushSse(provider, line) { return JSON.parse(this._inner.push_sse(String(provider), String(line))); }
  /** Flush any buffered answer at end-of-stream. Returns ReformatEvent[]. */
  finish() { return JSON.parse(this._inner.finish()); }
  /** Release the WASM instance. */
  free() { this._inner.free(); }
}
module.exports = { Reformatter };
