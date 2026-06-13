# Workout-Prep Timer PWA — Specification

## 1. Overview & User Flow

A single-screen Progressive Web App for athletes who want a brief prep
countdown ("3, 2, 1, go") that automatically flips into a count-up
stopwatch when the prep finishes. The app is installable to the home
screen on iOS and Android, runs fully offline after first load, and
keeps the screen awake during an active session.

**Idle screen.** The user is greeted by huge tabular digits showing the
currently selected prep duration (e.g. `0:10`). Below the digits are
five preset chips — `0`, `5`, `10`, `15`, `30` (seconds) — and a pair
of fine-tune buttons (`−` / `＋`) that nudge by 1 second. A large
green-rimmed **Start** button anchors the bottom of the screen.

**Counting-down phase.** Tapping Start moves the model to
`countingDown`. The digit color switches to orange (`#ff9f0a`), an SVG
drain ring sweeps anti-clockwise from full to empty over the prep
duration, and the app plays a tick cue (audio square wave + short
vibration) at each of the 3-, 2-, and 1-second boundaries. At zero, a
"go" cue fires (higher-pitched sine wave + longer vibration pattern).
The only available action during countdown is **Cancel**, which
returns the model to idle.

**Running phase.** When the countdown hits zero the model auto-flips
to `running` with no further user action. The digits turn green
(`#30d158`) and count up at centisecond precision (`MM:SS.cc`). The
ring is hidden. Available actions are **Pause** and **Reset**.

**Paused phase.** Pause freezes the displayed elapsed time and dims
the digit color. Available actions are **Resume** and **Reset**
(immediate, no confirmation).

**Reset semantics.** During running, Reset shows a confirm dialog
("Reset the running timer?") before returning to idle. During paused,
Reset is immediate. During countingDown, only Cancel is shown and it
resets immediately.

---

## 2. Files & Directory Layout

All files live at the project root unless noted. No build step; the
browser loads the source as-is via ES modules.

```
/
├── index.html               # App shell, links manifest + sw registration
├── styles.css               # Single global stylesheet
├── app.js                   # View layer: DOM, audio, vibration, wake lock, SW reg
├── timerModel.js            # Pure ES module export: class TimerModel
├── manifest.webmanifest     # PWA manifest
├── sw.js                    # Service worker (cache-first shell)
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-512-maskable.png
│   └── apple-touch-180.png
├── tests/
│   └── timerModel.test.js   # node:test + node:assert/strict
└── SPEC.md                  # This document
```

Tests are run with `node --test tests/`. The model is deliberately
extracted into `timerModel.js` so it can be imported by node without
touching any browser globals.

---

## 3. UI States

The view derives entirely from `TimerModel.phase` and the model's
computed getters. Every redraw is scheduled via `requestAnimationFrame`
while the phase is active.

### 3.1 Idle

- **Digits.** `MM:SS` formatted from `prepMs`. Color `#f5f5f7`.
  Font weight 800+, `font-variant-numeric: tabular-nums`, size
  `clamp(5rem, 22vw, 10rem)`.
- **Preset chips.** Five buttons (`0s`, `5s`, `10s`, `15s`, `30s`).
  The chip whose value matches `prepMs / 1000` is highlighted with
  the Liquid Glass active style.
- **Fine-tune.** A `−` and a `＋` button decrement / increment
  `prepMs` by 1000 ms, clamped to `[0, 300_000]`.
- **Start button.** Large pill, full width minus margins, green
  border, white label. A 0-second prep is allowed and goes straight
  to running on tap.
- **Ring.** Hidden.

### 3.2 countingDown

- **Digits.** `MM:SS` formatted from `remainingMs` (ceiling to whole
  seconds so `9.5s remaining` shows `0:10` for the first half of that
  second). Color `#ff9f0a`.
- **Ring.** SVG `<circle>` visible, `stroke-dasharray` equal to its
  circumference. `stroke-dashoffset` is animated from `0` to
  circumference as `remainingMs / prepMs` decreases. Rotated
  `-90deg` so the sweep starts at top, `stroke-linecap: round`.
  If `prefers-reduced-motion: reduce` is set, the ring updates only
  at second boundaries (no per-frame sweep).
- **Cues.** Tick at the moment `remainingMs` crosses 3000, 2000, 1000;
  go at 0.
- **Controls.** A single **Cancel** button replaces the Start button.
  Preset chips and fine-tune are hidden.

### 3.3 running

- **Digits.** `MM:SS.cc` formatted from `elapsedMs`. Color `#30d158`.
  Centiseconds shown in a slightly smaller weight so the seconds
  remain dominant.
- **Ring.** Hidden.
- **Controls.** **Pause** (primary) and **Reset** (secondary).

### 3.4 paused

- **Digits.** Same format as running, color dimmed to
  `rgba(245,245,247,0.55)`.
- **Ring.** Hidden.
- **Controls.** **Resume** (primary) and **Reset** (secondary).

### 3.5 Common visual language

Background `#0a0a0c`. All panels (chip row, control bar, dialog) use
Liquid Glass:

```css
.glass {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border-radius: 1.25rem;
}
```

A small `aria-live="polite"` span announces the current phase label
("Ready", "Counting down", "Running", "Paused") for screen readers.

---

## 4. Behavior Rules

### 4.1 Timing (drift-free)

- All time math is anchored to `performance.now()`.
- On `start()` the model stores `anchorMs = now()`.
- `remainingMs = max(0, prepMs - (now - anchorMs))` while in
  `countingDown`.
- On auto-transition to `running`, the model stores
  `runAnchorMs = anchorMs + prepMs` (the *exact* zero crossing, not
  the frame time), so `elapsedMs = now - runAnchorMs` even if the
  transition was detected late (e.g. after a backgrounded tab woke
  up). This guarantees a stopwatch that resumes at the correct value
  rather than zero.
- The view calls `model.tick(performance.now())` once per animation
  frame; the model itself does not own a timer.

### 4.2 Pause / Resume

- `pause()` only valid while `running`. It stamps `pausedAt = now`
  and stores the accumulated paused interval on resume so
  `elapsedMs` excludes paused time.
- `resume()` only valid while `paused`. It adjusts `runAnchorMs` by
  the paused duration so `elapsedMs` continues exactly where it
  left off.
- `pause()` while not running and `resume()` while not paused are
  silently ignored (no state change).
- **Pause is not available during countingDown.** Only Cancel is.

### 4.3 Reset

- `reset()` returns the model to `idle` and preserves `prepMs`.
- View layer responsibility: while `running`, show a confirm dialog
  before calling `reset()`. While `paused`, call `reset()` immediately.
- `cancel()` is a separate API used by the Cancel button during
  countingDown; it also returns to `idle` and preserves `prepMs`, no
  confirm.

### 4.4 Backgrounding

- On `document.visibilitychange` to hidden, the view stops requesting
  animation frames (the browser will throttle them anyway).
- On `visibilitychange` to visible, the view immediately calls
  `model.tick(performance.now())`. The model is responsible for
  catching up: a late tick may cross both the countdown-end boundary
  and several tick boundaries in one call. See cue rules below.
- On visibility → visible, if phase is `countingDown`, `running`, or
  `paused`, the view re-acquires the wake lock.

### 4.5 Screen-awake

- On `start()`, the view calls `navigator.wakeLock.request('screen')`
  and holds the sentinel.
- On `reset()` or `cancel()` (or a model-driven phase change back to
  idle), the view releases the sentinel.
- Feature-detect: if `navigator.wakeLock` is undefined, skip silently.
- The sentinel's `release` event triggers a re-request attempt if the
  phase is still active.

### 4.6 Audio + vibration cues

- A single `AudioContext` is created lazily inside the first Start
  click handler (user gesture requirement). `await ctx.resume()` is
  awaited synchronously inside that handler, before any other async
  work, to satisfy iOS Safari.
- Cue types:
  - **tick** — `OscillatorNode` square wave, 880 Hz, ~80 ms total,
    with a `GainNode` envelope: 10 ms linear attack to 0.3, 70 ms
    exponential decay to ~0.001. Paired with `navigator.vibrate([60])`.
  - **go** — `OscillatorNode` sine wave, 1320 Hz, ~250 ms, same
    envelope shape but longer decay. Paired with
    `navigator.vibrate([40, 40, 40, 40, 200])`.
- Oscillators are one-shot: created, started, and stopped per cue.
- The view calls `model.consumeCues()` once per animation frame after
  `tick()` and fires audio + vibration for each cue returned. The
  model guarantees a cue is returned at most once.
- Vibration is feature-detected (`'vibrate' in navigator`); iOS
  Safari's lack of support is acceptable.

### 4.7 Persistence

- `localStorage` key `prep-timer.duration` stores an integer number of
  seconds. Default is `10` when absent or unparseable.
- Written whenever the user changes the prep value (chip or fine-tune).
- Read once on app boot, passed to `model.setPrep(...)`.
- No other state is persisted: in-flight sessions are lost on reload.

### 4.8 Accessibility

- All buttons have visible text labels (not icon-only).
- Phase label uses `aria-live="polite"`.
- Color is never the sole signal: phase label text and button labels
  also communicate state.
- `prefers-reduced-motion: reduce` disables the ring's continuous
  sweep — it snaps at second boundaries instead.
- Tap targets are at least 44×44 CSS px.
- Focus rings are visible (no `outline: none` without replacement).

---

## 5. State Machine API (`TimerModel`)

`timerModel.js` exports a single class `TimerModel`. It has no
dependencies on the DOM, `window`, or `localStorage` so it can be
imported by `node --test`.

### 5.1 Construction

```js
new TimerModel({ now } = {})
```

- `now` — optional `() => number` injection for tests. Defaults to
  `performance.now.bind(performance)` when available, else
  `() => Date.now()`.

Initial state: `phase = 'idle'`, `prepMs = 10000`, no anchors set,
empty cue queue.

### 5.2 Phase enum

`'idle' | 'countingDown' | 'running' | 'paused'`

### 5.3 Methods

- `setPrep(seconds)` — only valid in `idle`. Clamps to integer in
  `[0, 300]`, stores as `prepMs`. Ignored in any other phase.
- `start()` — only valid in `idle`. If `prepMs === 0`, transitions
  directly to `running` with `runAnchorMs = now()` and enqueues a
  single `go` cue. Otherwise transitions to `countingDown` with
  `anchorMs = now()`.
- `pause()` — only valid in `running`. Stamps `pausedAt = now()`,
  transitions to `paused`. No-op otherwise.
- `resume()` — only valid in `paused`. Adds `now() - pausedAt` to a
  running `pausedTotalMs` accumulator, clears `pausedAt`, transitions
  to `running`. No-op otherwise.
- `reset()` — valid in any phase. Returns to `idle`, preserves
  `prepMs`, clears anchors, clears cue queue.
- `cancel()` — alias for `reset()` semantically; provided as a
  separate name so the view can express intent clearly. Returns to
  `idle`.
- `tick(at)` — called once per animation frame with a `performance.now()`
  timestamp. Drives:
  - In `countingDown`: enqueues `tick3` / `tick2` / `tick1` cues at
    the first tick where `remainingMs <= 3000 / 2000 / 1000`
    respectively. Enqueues `go` and transitions to `running` at the
    first tick where `at >= anchorMs + prepMs`. If a late tick
    crosses multiple boundaries, missed `tickN` cues are *not*
    backfilled (the go cue is the only "must fire" boundary), but the
    `go` cue still fires exactly once.
  - In `running` / `paused` / `idle`: no-op.
- `consumeCues()` — returns an array of pending cue strings (in the
  order they were enqueued) and clears the internal queue. Each cue
  is delivered at most once; subsequent calls return `[]` until new
  cues are enqueued.

### 5.4 Getters

- `phase` — current phase string.
- `prepMs` — configured prep duration in milliseconds.
- `remainingMs` — `max(0, prepMs - (now - anchorMs))` while
  `countingDown`; equals `prepMs` while `idle`; `0` otherwise.
- `elapsedMs` — `0` while `idle` or `countingDown`. While `running`:
  `now - runAnchorMs - pausedTotalMs`. While `paused`:
  `pausedAt - runAnchorMs - pausedTotalMs` (frozen snapshot).

### 5.5 Cue strings

`'tick3' | 'tick2' | 'tick1' | 'go'`. The view maps `tick3..tick1`
to the tick audio + short vibration, and `go` to the go audio +
long vibration pattern.

---

## 6. PWA Install

### 6.1 `manifest.webmanifest`

Required fields:

- `name`: `"Workout Prep Timer"`
- `short_name`: `"Prep Timer"`
- `start_url`: `"/"`
- `display`: `"standalone"`
- `orientation`: `"portrait"`
- `background_color`: `"#0a0a0c"`
- `theme_color`: `"#0a0a0c"`
- `icons`: array with three entries —
  - `icons/icon-192.png` (192×192, `purpose: "any"`)
  - `icons/icon-512.png` (512×512, `purpose: "any"`)
  - `icons/icon-512-maskable.png` (512×512, `purpose: "maskable"`)

### 6.2 `index.html` meta + link tags

- `<link rel="manifest" href="manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="icons/apple-touch-180.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<meta name="theme-color" content="#0a0a0c">`
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`

### 6.3 Hosting

HTTPS is required for install on Chromium and for service worker
registration in production. `localhost` is exempt for development.

---

## 7. Service Worker Strategy

`sw.js` lives at the project root so its scope covers the whole app.

### 7.1 Cache name

`prep-timer-v1` — bumped manually on any shell change.

### 7.2 `install` event

- Opens `prep-timer-v1`.
- Precaches: `/`, `index.html`, `styles.css`, `app.js`,
  `timerModel.js`, `manifest.webmanifest`, and all icon paths.
- Calls `self.skipWaiting()` so a new SW activates on next load
  without requiring all tabs to close.

### 7.3 `activate` event

- Iterates `caches.keys()`, deletes any cache whose name is not
  `prep-timer-v1`.
- Calls `self.clients.claim()` so the new SW immediately controls
  already-open pages.

### 7.4 `fetch` event

Strategy:

- For navigation requests (`request.mode === 'navigate'`) or requests
  for `index.html`: **network-first** — try the network, fall back to
  the cached `index.html` on failure. Successful network responses
  update the cache.
- For all other same-origin requests: **cache-first** — return cache
  hit if present, otherwise fetch and cache.
- Cross-origin requests: pass through to the network unchanged.

The `fetch` handler is registered even when its behavior is trivial,
because Chromium's installability heuristics require it.

---

## 8. Testing Strategy

Tests live in `tests/timerModel.test.js` and use the Node built-ins:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerModel } from '../timerModel.js';
```

A test helper constructs a fake clock:

```js
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}
```

The following ten cases are the acceptance criteria. Each is a
separate `test(...)` block.

1. **Idle setPrep clamps and persists.** `setPrep(15)` sets
   `prepMs === 15000`; `setPrep(-3)` clamps to `0`; `setPrep(500)`
   clamps to `300000`; `setPrep(7.4)` stores `7000` (integer seconds).
2. **start() with prep=10 enters countingDown.** After `setPrep(10)`
   and `start()`, `phase === 'countingDown'`. Advance clock 9.5 s and
   `tick(now())`; `remainingMs` is within ±5 ms of `500`.
3. **Auto-transition at zero.** From case 2's setup, advance clock to
   exactly 10.0 s and `tick(now())`: `phase === 'running'`,
   `elapsedMs` is within ±5 ms of `0`.
4. **Late tick after backgrounding.** `setPrep(10)`, `start()`,
   advance clock 15 s, single `tick(now())`: `phase === 'running'`,
   `elapsedMs` is within ±5 ms of `5000`.
5. **Cue ordering and no replay.** `setPrep(10)`, `start()`. Tick at
   6.5 s → `consumeCues()` returns `[]`. Tick at 7.0 s →
   `['tick3']`. Tick at 8.0 s → `['tick2']`. Tick at 9.0 s →
   `['tick1']`. Tick at 10.0 s → `['go']`. Tick at 10.5 s → `[]`
   (no replay). Separately, in a fresh model, `setPrep(10)`,
   `start()`, single tick at 15.0 s: cues contain `'go'` exactly
   once and no `tickN`.
6. **Pause freezes; resume continues exactly.** `setPrep(0)`,
   `start()` (now running). Advance 2 s, `tick`, `pause()`. Snapshot
   `elapsedMs`. Advance 5 s, `tick`. `elapsedMs` unchanged.
   `resume()`. Advance 1 s, `tick`. `elapsedMs` is within ±5 ms of
   `3000` (paused 5 s excluded).
7. **Invalid transitions are no-ops.** `pause()` while idle leaves
   phase `idle`. `resume()` while idle leaves phase `idle`. `pause()`
   while countingDown leaves phase `countingDown`. `resume()` while
   running leaves phase `running`.
8. **reset() retains prep.** `setPrep(25)`, `start()`, advance any
   time, `reset()`. `phase === 'idle'`, `prepMs === 25000`,
   `consumeCues()` returns `[]`.
9. **cancel() from countingDown.** `setPrep(10)`, `start()`, advance
   2 s, `cancel()`. `phase === 'idle'`, `prepMs === 10000`.
10. **start() with prep=0.** `setPrep(0)`, `start()`. Immediately
    `phase === 'running'`, `elapsedMs` is within ±5 ms of `0`,
    `consumeCues()` returns `['go']` exactly once; a subsequent
    `consumeCues()` returns `[]`.

Run command: `node --test tests/`.

---

## 9. Out of Scope

The following are explicitly **not** part of this version. They may
be revisited later but must not be implemented as part of meeting
this spec.

- **Background audio while the tab is hidden.** When the tab is
  hidden the audio context may suspend; we do not attempt to keep
  playing cues. The visible-side resume handler catches the model up
  but does not retroactively fire missed tick cues.
- **Exercise sets, rounds, intervals, or supersets.** This is a
  single-shot prep + stopwatch app, not an interval trainer.
- **Session history, statistics, or saved workouts.**
- **Multiple presets beyond the five chips** (0, 5, 10, 15, 30 s) and
  the ±1 s fine-tune.
- **Theming or light mode.** The app is dark-only.
- **Localization.** UI strings are English only.
- **Account, sync, or cloud persistence.**
- **Push notifications.**
- **Landscape layout.** The manifest pins orientation to portrait.
- **Web Share, file system, or any non-essential PWA capability**
  beyond install, offline, and wake lock.
