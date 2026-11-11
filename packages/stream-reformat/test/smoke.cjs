// Smoke test for llm-stream-reformat (Node CommonJS build): each provider's
// SSE shape is split into thinking/answer channels.
'use strict';

const assert = require('node:assert/strict');
const { Reformatter } = require('..');

function run(provider, lines) {
  const rf = new Reformatter();
  const evs = [];
  for (const l of lines) evs.push(...rf.pushSse(provider, l));
  evs.push(...rf.finish());
  rf.free();
  const join = (ch) => evs.filter((e) => e.channel === ch).map((e) => e.text).join('');
  return { thinking: join('thinking'), answer: join('answer') };
}

const g = run('google', [
  'data: {"candidates":[{"content":{"parts":[{"text":"thinking about it","thought":true}]}}]}',
  'data: {"candidates":[{"content":{"parts":[{"text":"The sky is blue.\\n"}]}}]}',
  'data: [DONE]',
]);
assert.match(g.thinking, /thinking about it/);
assert.match(g.answer, /The sky is blue\./);

const o = run('openrouter', [
  'data: {"choices":[{"delta":{"reasoning":"let me consider"}}]}',
  'data: {"choices":[{"delta":{"content":"Answer: 42\\n"}}]}',
  'data: [DONE]',
]);
assert.match(o.thinking, /let me consider/);
assert.match(o.answer, /Answer: 42/);

const m = run('metallm', [
  'data: {"choices":[{"delta":{"content":"Hello "}}]}',
  'data: {"choices":[{"delta":{"content":"there\\n"}}]}',
  'data: [DONE]',
]);
assert.equal(m.thinking, '');
assert.match(m.answer, /Hello there/);
console.log('llm-stream-reformat smoke OK');
