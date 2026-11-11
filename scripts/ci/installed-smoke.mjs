// Checks the packed tarballs as a user receives them. Copied into the fresh
// install directory and run from there, so every import below resolves to
// node_modules (not to the repo checkout).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

// CommonJS entry points.
const wrapper = require('ai-text-watermark');
const watermark = require('@claude-flow/watermark');
const { Reformatter } = require('llm-stream-reformat');
assert.equal(wrapper.Watermarker, watermark.Watermarker, 'ai-text-watermark must re-export @claude-flow/watermark');
const rf = new Reformatter();
const evs = rf.pushSse('metallm', 'data: {"choices":[{"delta":{"content":"hi\\n"}}]}').concat(rf.finish());
assert.ok(evs.some((e) => e.channel === 'answer' && e.text.includes('hi')), JSON.stringify(evs));

// ESM entry points, including the browser builds.
const esm = await import('ai-text-watermark');
const web = await import('ai-text-watermark/web');
const rweb = await import('llm-stream-reformat/web');
assert.equal(typeof esm.detect, 'function');
assert.equal(typeof web.init, 'function');
assert.equal(typeof rweb.init, 'function');
console.log('installed tarballs OK (CJS + ESM)');
