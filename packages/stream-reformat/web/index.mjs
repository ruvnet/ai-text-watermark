// llm-stream-reformat/web — browser/Deno/bundler ESM. `await init()` once.
import initWasm, { WasmReformatter } from './stream_reformat.js';
let _ready = false;
export async function init(input) {
  if (_ready) return;
  await initWasm(input === undefined ? undefined : { module_or_path: input });
  _ready = true;
}
export function isReady() { return _ready; }
export class Reformatter {
  constructor() {
    if (!_ready) throw new Error('llm-stream-reformat/web: call `await init()` before use');
    this._inner = new WasmReformatter();
  }
  pushSse(provider, line) { return JSON.parse(this._inner.push_sse(String(provider), String(line))); }
  finish() { return JSON.parse(this._inner.finish()); }
  free() { this._inner.free(); }
}
