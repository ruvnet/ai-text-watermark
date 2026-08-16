# llm-stream-reformat

Reformat a live LLM token stream **while it's still arriving** — separate a reasoning model's *thinking* from its *answer*, collapse repetition loops, and normalize whitespace. Parses **Google Vertex** (`gemini-3.7-flash`), **OpenRouter**, and **meta-llm** SSE.

Rust + WebAssembly, built on the real [`ruvnet/midstream`](https://github.com/ruvnet/midstream) `temporal-compare` primitive. Node + browser.

```bash
npm install llm-stream-reformat
```

```js
const { Reformatter } = require('llm-stream-reformat');
const rf = new Reformatter();
for (const line of sseLines) {
  for (const ev of rf.pushSse('google', line)) {
    if (ev.channel === 'thinking') showReasoning(ev.text);
    else appendAnswer(ev.text);
  }
}
rf.finish().forEach(ev => appendAnswer(ev.text));
```

Browser: `import { init, Reformatter } from 'llm-stream-reformat/web'; await init();`

Design: [ADR-390](https://github.com/ruvnet/ai-text-watermark/blob/main/docs/adr/ADR-390-inflight-stream-reformatting-midstream.md). MIT © rUv.
