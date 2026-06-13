// timerModel.js
// Pure state machine for the Workout Prep Timer PWA.
// Importable from Node tests (no DOM, no window).
//
// Phase: 'idle' | 'countingDown' | 'running' | 'paused'
//
// Construction:
//   new TimerModel({ now, storage } = {})
//     now     - () => number, defaults to performance.now()-like
//     storage - optional { getItem, setItem } stub for tests
//
// Cue strings: 'tick3' | 'tick2' | 'tick1' | 'go'

const PHASE_IDLE = 'idle';
const PHASE_COUNTING_DOWN = 'countingDown';
const PHASE_RUNNING = 'running';
const PHASE_PAUSED = 'paused';

const STORAGE_KEY = 'prep-timer.duration';
const DEFAULT_PREP_SECONDS = 10;
const MIN_PREP_SECONDS = 0;
const MAX_PREP_SECONDS = 300;

function defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function defaultStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

export class TimerModel {
  constructor({ now = defaultNow, storage } = {}) {
    this._now = now;
    this._storage = storage === undefined ? defaultStorage() : storage;

    // Load persisted prep value (integer seconds).
    let prepSeconds = DEFAULT_PREP_SECONDS;
    if (this._storage) {
      try {
        const raw = this._storage.getItem(STORAGE_KEY);
        if (raw != null) {
          const parsed = parseInt(raw, 10);
          if (Number.isFinite(parsed)) {
            prepSeconds = this._clampSeconds(parsed);
          }
        }
      } catch (_e) {
        // ignore storage failures
      }
    }

    this._prepSeconds = prepSeconds;
    this._phase = PHASE_IDLE;

    // Timing anchors (all in the same domain as this._now()).
    this._anchorMs = 0;           // start of countdown (or, if prep=0, start of running)
    this._runAnchorMs = 0;        // exact zero-crossing moment when running begins
    this._pausedAt = 0;           // timestamp when pause() was called
    this._pausedTotalMs = 0;      // accumulated paused milliseconds

    // Cue tracking. _lastTickSecondReported is the smallest "tickN second"
    // we have already enqueued (lower = more recently fired). It starts at
    // prepSeconds + 1 so the boundary check is monotone.
    this._cues = [];
    this._lastTickSecondReported = this._prepSeconds + 1;
    this._goEnqueued = false;
  }

  _clampSeconds(value) {
    // Truncate to integer seconds, clamp to [0, 300].
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return 0;
    if (n < MIN_PREP_SECONDS) return MIN_PREP_SECONDS;
    if (n > MAX_PREP_SECONDS) return MAX_PREP_SECONDS;
    return n;
  }

  _persistPrep() {
    if (!this._storage) return;
    try {
      this._storage.setItem(STORAGE_KEY, String(this._prepSeconds));
    } catch (_e) {
      // ignore
    }
  }

  // ---- Getters ----------------------------------------------------------

  get phase() {
    return this._phase;
  }

  get prepSeconds() {
    return this._prepSeconds;
  }

  get prepMs() {
    return this._prepSeconds * 1000;
  }

  get remainingMs() {
    if (this._phase === PHASE_COUNTING_DOWN) {
      const elapsed = this._now() - this._anchorMs;
      const remaining = this.prepMs - elapsed;
      return remaining > 0 ? remaining : 0;
    }
    if (this._phase === PHASE_IDLE) {
      return this.prepMs;
    }
    return 0;
  }

  get elapsedMs() {
    if (this._phase === PHASE_RUNNING) {
      const e = this._now() - this._runAnchorMs - this._pausedTotalMs;
      return e > 0 ? e : 0;
    }
    if (this._phase === PHASE_PAUSED) {
      const e = this._pausedAt - this._runAnchorMs - this._pausedTotalMs;
      return e > 0 ? e : 0;
    }
    return 0;
  }

  // ---- Methods ----------------------------------------------------------

  setPrep(seconds) {
    if (this._phase !== PHASE_IDLE) return;
    this._prepSeconds = this._clampSeconds(seconds);
    this._lastTickSecondReported = this._prepSeconds + 1;
    this._persistPrep();
  }

  start() {
    if (this._phase !== PHASE_IDLE) return;
    const t = this._now();
    this._anchorMs = t;
    this._pausedTotalMs = 0;
    this._pausedAt = 0;
    this._lastTickSecondReported = this._prepSeconds + 1;
    this._goEnqueued = false;

    if (this._prepSeconds === 0) {
      // Skip straight to running.
      this._runAnchorMs = t;
      this._phase = PHASE_RUNNING;
      this._cues.push('go');
      this._goEnqueued = true;
      return;
    }

    this._phase = PHASE_COUNTING_DOWN;
  }

  tick(at) {
    if (this._phase !== PHASE_COUNTING_DOWN) return;

    const remaining = this.prepMs - (at - this._anchorMs);

    if (remaining <= 0) {
      // Crossed zero. Only enqueue 'go' — stale tickN cues are dropped.
      this._runAnchorMs = this._anchorMs + this.prepMs;
      this._phase = PHASE_RUNNING;
      if (!this._goEnqueued) {
        this._cues.push('go');
        this._goEnqueued = true;
      }
      return;
    }

    // Per-second boundary check for tick3, tick2, tick1.
    // We fire the boundary equal to the current secondsRemainingCeil if
    // it's in {3,2,1} and not yet reported. _lastTickSecondReported tracks
    // the smallest boundary already fired (initialized to prepSeconds + 1).
    // Late-tick (large jump) is handled by the early `remaining <= 0` exit
    // above — those paths only emit 'go'. For non-crossing-zero late ticks
    // (e.g. one frame jumps remaining from 4s to 1.5s) we fire only the
    // most recent boundary (tick2), not stale tick3 — matching spec §5.3.
    const secondsRemainingCeil = Math.ceil(remaining / 1000);
    if (
      secondsRemainingCeil >= 1 &&
      secondsRemainingCeil <= 3 &&
      this._lastTickSecondReported > secondsRemainingCeil
    ) {
      this._cues.push('tick' + secondsRemainingCeil);
      this._lastTickSecondReported = secondsRemainingCeil;
    }
  }

  pause() {
    if (this._phase !== PHASE_RUNNING) return;
    this._pausedAt = this._now();
    this._phase = PHASE_PAUSED;
  }

  resume() {
    if (this._phase !== PHASE_PAUSED) return;
    const delta = this._now() - this._pausedAt;
    this._pausedTotalMs += delta > 0 ? delta : 0;
    this._pausedAt = 0;
    this._phase = PHASE_RUNNING;
  }

  reset() {
    this._phase = PHASE_IDLE;
    this._anchorMs = 0;
    this._runAnchorMs = 0;
    this._pausedAt = 0;
    this._pausedTotalMs = 0;
    this._cues.length = 0;
    this._lastTickSecondReported = this._prepSeconds + 1;
    this._goEnqueued = false;
  }

  cancel() {
    if (this._phase !== PHASE_COUNTING_DOWN) return;
    this.reset();
  }

  consumeCues() {
    if (this._cues.length === 0) return [];
    const out = this._cues.slice();
    this._cues.length = 0;
    return out;
  }
}

export default TimerModel;
