// Smoke test for the ai-text-watermark wrapper: it must re-export
// @claude-flow/watermark and the re-exported API must generate + detect.
'use strict';

const assert = require('node:assert/strict');
const lib = require('..');
const upstream = require('@claude-flow/watermark');

for (const name of ['Watermarker', 'StreamProxy', 'MidStream', 'detect', 'detectSelfSync', 'detectExact']) {
  assert.equal(typeof lib[name], 'function', `missing export ${name}`);
  assert.equal(lib[name], upstream[name], `${name} is not the upstream export`);
}

const KEY = 'ci-key';
const VOCAB = 64;
const tokens = Uint32Array.from({ length: VOCAB }, (_, i) => i);
const probs = new Float32Array(VOCAB).fill(1 / VOCAB);
const wm = new lib.Watermarker({ key: KEY, scheme: 'gumbel' });
const out = new Uint32Array(400);
for (let i = 0; i < out.length; i++) out[i] = tokens[wm.step(tokens, probs)];
wm.free();

assert.ok(lib.detect(out, { key: KEY, scheme: 'gumbel' }).isWatermarked(1e-6), 'right key not detected');
assert.ok(!lib.detect(out, { key: 'other-key', scheme: 'gumbel' }).isWatermarked(1e-6), 'wrong key detected');
console.log('ai-text-watermark smoke OK');
