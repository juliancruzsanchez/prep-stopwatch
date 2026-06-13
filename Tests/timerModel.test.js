// tests/timerModel.test.js
//
// Test suite for TimerModel. Run with `node --test tests/`.
//
// Setup contract: tests share a `makeModel()` helper. It returns
//   { model, clock, storage }
// where `clock.ms` is mutable; advance with `clock.advance(ms)`.
// The model's `_now` is wired to read clock.ms on each call, so
// after advancing the clock the model getters reflect the new time.
// Each test calls `model.tick(clock.ms)` to drive boundary detection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import TimerModel from '../timerModel.js';

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    _raw: map,
  };
}

function makeClock(start = 1000) {
  const c = { ms: start, advance(d) { this.ms += d; } };
  return c;
}

function makeModel(opts = {}) {
  const storage = opts.storage || makeStorage();
  const clock = opts.clock || makeClock();
  const model = new TimerModel({ now: () => clock.ms, storage });
  return { model, clock, storage };
}

// ---------------------------------------------------------------------------
// 1. Idle setPrep clamps and persists.
// ---------------------------------------------------------------------------
test('1. setPrep clamps and persists', () => {
  const { model, storage } = makeModel();
  model.setPrep(15);
  assert.equal(model.prepMs, 15000);
  assert.equal(storage.getItem('prep-timer.duration'), '15');

  model.setPrep(-3);
  assert.equal(model.prepMs, 0);

  model.setPrep(500);
  assert.equal(model.prepMs, 300000);

  model.setPrep(7.4);
  assert.equal(model.prepMs, 7000);
});

// ---------------------------------------------------------------------------
// 2. start() with prep=10 enters countingDown.
// ---------------------------------------------------------------------------
test('2. start() with prep=10 enters countingDown', () => {
  const { model, clock } = makeModel();
  model.setPrep(10);
  model.start();
  assert.equal(model.phase, 'countingDown');

  clock.advance(9500);
  model.tick(clock.ms);

  const r = model.remainingMs;
  assert.ok(Math.abs(r - 500) <= 5, `remainingMs=${r}, expected ~500`);
});

// ---------------------------------------------------------------------------
// 3. Auto-transition at zero.
// ---------------------------------------------------------------------------
test('3. auto-transition at zero', () => {
  const { model, clock } = makeModel();
  model.setPrep(10);
  model.start();

  clock.advance(10000);
  model.tick(clock.ms);

  assert.equal(model.phase, 'running');
  const e = model.elapsedMs;
  assert.ok(Math.abs(e - 0) <= 5, `elapsedMs=${e}, expected ~0`);
});

// ---------------------------------------------------------------------------
// 4. Late tick after backgrounding.
// ---------------------------------------------------------------------------
test('4. late tick catches up to running with correct elapsed', () => {
  const { model, clock } = makeModel();
  model.setPrep(10);
  model.start();

  clock.advance(15000);
  model.tick(clock.ms);

  assert.equal(model.phase, 'running');
  const e = model.elapsedMs;
  assert.ok(Math.abs(e - 5000) <= 5, `elapsedMs=${e}, expected ~5000`);
});

// ---------------------------------------------------------------------------
// 5. Cue ordering and no replay (plus late-tick: only 'go').
// ---------------------------------------------------------------------------
test('5a. cue ordering and no replay', () => {
  const { model, clock } = makeModel();
  model.setPrep(10);
  model.start();

  clock.advance(6500);
  model.tick(clock.ms);
  assert.deepEqual(model.consumeCues(), []);

  clock.advance(500); // total 7.0s -> remaining 3.0s
  model.tick(clock.ms);
  assert.deepEqual(model.consumeCues(), ['tick3']);

  clock.advance(1000); // total 8.0s -> remaining 2.0s
  model.tick(clock.ms);
  assert.deepEqual(model.consumeCues(), ['tick2']);

  clock.advance(1000); // total 9.0s -> remaining 1.0s
  model.tick(clock.ms);
  assert.deepEqual(model.consumeCues(), ['tick1']);

  clock.advance(1000); // total 10.0s -> go
  model.tick(clock.ms);
  assert.deepEqual(model.consumeCues(), ['go']);

  clock.advance(500); // post-go
  model.tick(clock.ms);
  assert.deepEqual(model.consumeCues(), []);
});

test('5b. late single tick at 15s: only go, no tickN backfill', () => {
  const { model, clock } = makeModel();
  model.setPrep(10);
  model.start();

  clock.advance(15000);
  model.tick(clock.ms);
  const cues = model.consumeCues();
  assert.deepEqual(cues, ['go']);
  assert.equal(cues.filter((c) => c.startsWith('tick')).length, 0);
});

// ---------------------------------------------------------------------------
// 6. Pause freezes; resume continues exactly.
// ---------------------------------------------------------------------------
test('6. pause freezes; resume continues exactly', () => {
  const { model, clock } = makeModel();
  model.setPrep(0);
  model.start();
  assert.equal(model.phase, 'running');
  model.consumeCues(); // drain the 'go'

  clock.advance(2000);
  model.tick(clock.ms);
  model.pause();
  const snapshot = model.elapsedMs;
  assert.ok(Math.abs(snapshot - 2000) <= 5, `snapshot=${snapshot}`);

  clock.advance(5000);
  model.tick(clock.ms);
  assert.equal(model.elapsedMs, snapshot);

  model.resume();
  clock.advance(1000);
  model.tick(clock.ms);
  const e = model.elapsedMs;
  assert.ok(Math.abs(e - 3000) <= 5, `elapsedMs=${e}, expected ~3000`);
});

// ---------------------------------------------------------------------------
// 7. Invalid transitions are no-ops.
// ---------------------------------------------------------------------------
test('7. invalid transitions are no-ops', () => {
  // pause while idle
  {
    const { model } = makeModel();
    model.pause();
    assert.equal(model.phase, 'idle');
  }
  // resume while idle
  {
    const { model } = makeModel();
    model.resume();
    assert.equal(model.phase, 'idle');
  }
  // pause while countingDown
  {
    const { model } = makeModel();
    model.setPrep(10);
    model.start();
    model.pause();
    assert.equal(model.phase, 'countingDown');
  }
  // resume while running
  {
    const { model } = makeModel();
    model.setPrep(0);
    model.start(); // running immediately
    model.resume();
    assert.equal(model.phase, 'running');
  }
});

// ---------------------------------------------------------------------------
// 8. reset() retains prep.
// ---------------------------------------------------------------------------
test('8. reset() retains prep', () => {
  const { model, clock } = makeModel();
  model.setPrep(25);
  model.start();
  clock.advance(3000);
  model.tick(clock.ms);
  model.reset();

  assert.equal(model.phase, 'idle');
  assert.equal(model.prepMs, 25000);
  assert.deepEqual(model.consumeCues(), []);
});

// ---------------------------------------------------------------------------
// 9. cancel() from countingDown.
// ---------------------------------------------------------------------------
test('9. cancel() from countingDown returns to idle', () => {
  const { model, clock } = makeModel();
  model.setPrep(10);
  model.start();
  clock.advance(2000);
  model.cancel();

  assert.equal(model.phase, 'idle');
  assert.equal(model.prepMs, 10000);
});

// ---------------------------------------------------------------------------
// 10. start() with prep=0.
// ---------------------------------------------------------------------------
test('10. start() with prep=0 goes straight to running with one go cue', () => {
  const { model } = makeModel();
  model.setPrep(0);
  model.start();

  assert.equal(model.phase, 'running');
  const e = model.elapsedMs;
  assert.ok(Math.abs(e - 0) <= 5, `elapsedMs=${e}, expected ~0`);

  assert.deepEqual(model.consumeCues(), ['go']);
  assert.deepEqual(model.consumeCues(), []);
});
