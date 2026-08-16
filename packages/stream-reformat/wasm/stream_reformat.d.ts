/* tslint:disable */
/* eslint-disable */

/**
 * JS-facing inflight stream reformatter.
 */
export class WasmReformatter {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Flush any buffered answer text at end-of-stream. Same JSON shape.
     */
    finish(): string;
    constructor();
    /**
     * Parse + reformat one SSE line. `provider`: `"google"` | `"openrouter"` |
     * `"metallm"`. Returns a JSON array of `{ "channel": "answer"|"thinking",
     * "text": "..." }`.
     */
    push_sse(provider: string, line: string): string;
}
