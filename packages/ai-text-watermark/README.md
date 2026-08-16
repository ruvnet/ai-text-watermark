# ai-text-watermark

Invisible, key-verifiable watermarks for **AI / LLM text** — SynthID-Text style, in Rust + WebAssembly. **Generate**, **detect**, embed a **secret provenance message**, and run an **ultra-low-latency decode-loop proxy** — Node and browser.

This is a thin standalone wrapper that re-exports **[`@claude-flow/watermark`](https://www.npmjs.com/package/@claude-flow/watermark)** verbatim, so you get a memorable install name without any code duplication.

```bash
npm install ai-text-watermark
```

```js
const { Watermarker, StreamProxy, detect } = require('ai-text-watermark');

const wm = new Watermarker({ key: 'my-secret', scheme: 'gumbel' });
const out = candidatesPerStep.map((c, i) => c[wm.step(c, probs[i])]);
detect(out, { key: 'my-secret', scheme: 'gumbel' }).isWatermarked(1e-6); // true
```

Browser / bundlers: `import { init, Watermarker, detect } from 'ai-text-watermark/web'; await init();`

Full docs, live playground, Rust crate (`ruflo-watermark`), and ADRs: **https://github.com/ruvnet/ai-text-watermark** · MIT © rUv
