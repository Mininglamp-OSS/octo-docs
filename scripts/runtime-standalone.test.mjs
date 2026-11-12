import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Exercise the published loop, not a copy of its cancellation predicate.
// All events and client methods are synthetic; no Runtime package or service is used.
const paths = [
  '../guides/integrators/runtime-v1111-standalone.mdx',
  '../zh/guides/integrators/runtime-v1111-standalone.mdx',
];
const examples = paths.map((path) => {
  const page = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const blocks = [...page.matchAll(/```typescript\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, `${path}: one complete TypeScript example expected`);
  return blocks[0][1];
});

test('English and Chinese standalone examples remain identical', () => {
  assert.equal(examples[0], examples[1]);
});

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function eventLoop(source) {
  const start = source.indexOf('    for await (const event of client.invoke(input)) {');
  const endMarker = '    if (terminal !== "run.completed") process.exitCode = 1;';
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'complete observation loop must remain extractable');
  return new AsyncFunction('client', 'input', 'process', 'console', 'KernelError',
    `let cancellationRequested = false; let terminal;\n${source.slice(start, end + endMarker.length)}\nreturn terminal;`);
}

function requested(payload = {}) {
  return { type: 'interaction.requested', payload: { kind: 'approval', ...payload } };
}
const completed = { type: 'run.completed', payload: {} };

async function observe(loop, events, failCancellation = false) {
  const cancellations = [];
  const cancellationEvents = [];
  const seen = [];
  const output = [];
  const errors = [];
  const fakeProcess = { exitCode: 0, stdout: { write: (text) => output.push(text) } };
  let currentEvent;
  const client = {
    async *invoke() {
      for (const event of events) { currentEvent = event; seen.push(event); yield event; }
    },
    async cancelInvocation(...args) {
      cancellations.push(args);
      cancellationEvents.push(currentEvent);
      if (failCancellation) throw new Error('synthetic cancellation failure');
    },
  };
  const terminal = await loop(client, { invocationId: 'test-invocation' }, fakeProcess,
    { error: (...args) => errors.push(args) }, class KernelError extends Error {});
  return { cancellations, cancellationEvents, seen, output, errors, terminal, exitCode: fakeProcess.exitCode };
}

for (const [index, source] of examples.entries()) {
  const language = index === 0 ? 'English' : 'Chinese';
  const loop = eventLoop(source);
  const cases = [
    ['Adapter-owned automatic approval', { responseRequired: false }, 0],
    ['async question', { kind: 'question', delivery: 'async' }, 0],
    ['async question with responseRequired true', { kind: 'question', delivery: 'async', responseRequired: true }, 0],
    ['synchronous approval with omitted responseRequired', {}, 1],
    ['synchronous approval requiring a response', { responseRequired: true }, 1],
    ['synchronous question', { kind: 'question' }, 1],
    ['synchronous elicitation', { kind: 'elicitation', responseRequired: true }, 1],
  ];
  for (const [name, payload, count] of cases) {
    test(`${language}: ${name}`, async () => {
      const result = await observe(loop, [requested(payload), completed]);
      assert.equal(result.cancellations.length, count);
      if (count) assert.deepEqual(result.cancellations[0], ['test-invocation', 'example has no interaction UI']);
      assert.equal(result.seen.length, 2);
      assert.equal(result.terminal, 'run.completed');
      assert.equal(result.exitCode, 0);
    });
  }
  test(`${language}: ignored interactions do not suppress later cancellation or observation`, async () => {
    const events = [requested({ responseRequired: false }),
      requested({ kind: 'question', delivery: 'async' }), requested(), requested(),
      { type: 'message.delta', payload: { text: 'still observing' } }, completed];
    const result = await observe(loop, events);
    assert.equal(result.cancellations.length, 1);
    assert.deepEqual(result.cancellationEvents, [events[2]]);
    assert.deepEqual(result.seen, events);
    assert.deepEqual(result.output, ['still observing']);
    assert.equal(result.terminal, 'run.completed');
  });
  test(`${language}: failed cancellation is not retried and does not stop observation`, async () => {
    const result = await observe(loop, [requested(), requested(), completed], true);
    assert.equal(result.cancellations.length, 1);
    assert.equal(result.seen.length, 3);
    assert.equal(result.terminal, 'run.completed');
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.errors[0], ['CANCEL_FAILED']);
  });
  test(`${language}: automatic approval does not imply a successful terminal`, async () => {
    for (const terminal of [undefined, 'run.failed', 'run.cancelled']) {
      const events = [requested({ responseRequired: false })];
      if (terminal) events.push({ type: terminal, payload: {} });
      const result = await observe(loop, events);
      assert.equal(result.cancellations.length, 0);
      assert.equal(result.terminal, terminal);
      assert.equal(result.exitCode, 1);
    }
  });
}
