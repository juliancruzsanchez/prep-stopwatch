// app.js — view/controller layer for the Workout Prep Timer PWA.
// Wires DOM, audio cues, vibration, wake lock, requestAnimationFrame loop.

import TimerModel from './timerModel.js';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const model = new TimerModel();

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const digitsEl    = $('digits');
const statusEl    = $('status');
const ringWrapEl  = $('ringWrap');
const ringEl      = $('ring');
const presetsEl   = $('presets');
const stepperMinus = $('stepperMinus');
const stepperPlus  = $('stepperPlus');
const startBtn    = $('startBtn');
const cancelBtn   = $('cancelBtn');
const pauseBtn    = $('pauseBtn');
const resumeBtn   = $('resumeBtn');
const resetBtn    = $('resetBtn');
const configSection = $('configSection');

const PHASE_LABELS = {
  idle: 'Ready',
  countingDown: 'Counting down',
  running: 'Running',
  paused: 'Paused',
};

const PRESET_VALUES = [0, 5, 10, 15, 30];

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

let audioCtx = null;

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function playTone({ freq, type, durMs }) {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    // Envelope: 10 ms linear attack to 0.3, exp decay to ~0.001 over remaining.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.3, t0 + 0.010);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.02);
  } catch (_e) {
    // ignore
  }
}

function playTickSound() {
  playTone({ freq: 880, type: 'square', durMs: 80 });
}

function playGoSound() {
  playTone({ freq: 1320, type: 'sine', durMs: 250 });
}

function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch (_e) {}
  }
}

function dispatchCue(cue) {
  switch (cue) {
    case 'tick3':
    case 'tick2':
    case 'tick1':
      playTickSound();
      vibrate([60]);
      break;
    case 'go':
      playGoSound();
      vibrate([40, 40, 40, 40, 200]);
      break;
  }
}

// ---------------------------------------------------------------------------
// Wake Lock
// ---------------------------------------------------------------------------

let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      // If still active, attempt re-acquire.
      if (model.phase !== 'idle') acquireWakeLock();
    });
  } catch (_e) {
    // Ignore; wake lock may be unavailable.
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch (_e) {}
  wakeLock = null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMMSS(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMMSScc(ms) {
  const totalCs = Math.floor(ms / 10);
  const totalSeconds = Math.floor(totalCs / 100);
  const cs = totalCs % 100;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return {
    main: `${m}:${String(s).padStart(2, '0')}`,
    cs: `.${String(cs).padStart(2, '0')}`,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function setDigits(text, csText) {
  if (csText != null) {
    digitsEl.innerHTML = '';
    digitsEl.append(document.createTextNode(text));
    const span = document.createElement('span');
    span.className = 'cs';
    span.textContent = csText;
    digitsEl.appendChild(span);
  } else {
    digitsEl.textContent = text;
  }
}

function setPhaseColorClass(phase) {
  digitsEl.classList.remove('color-idle', 'color-prep', 'color-running', 'color-paused');
  switch (phase) {
    case 'idle':         digitsEl.classList.add('color-idle'); break;
    case 'countingDown': digitsEl.classList.add('color-prep'); break;
    case 'running':      digitsEl.classList.add('color-running'); break;
    case 'paused':       digitsEl.classList.add('color-paused'); break;
  }
}

function renderControls(phase) {
  const showStart  = phase === 'idle';
  const showCancel = phase === 'countingDown';
  const showPause  = phase === 'running';
  const showResume = phase === 'paused';
  const showReset  = phase === 'running' || phase === 'paused';

  startBtn.hidden  = !showStart;
  cancelBtn.hidden = !showCancel;
  pauseBtn.hidden  = !showPause;
  resumeBtn.hidden = !showResume;
  resetBtn.hidden  = !showReset;

  // Config is only adjustable while idle.
  configSection.hidden = phase !== 'idle';
}

function renderPresets() {
  const current = model.prepSeconds;
  for (const btn of presetsEl.querySelectorAll('.preset')) {
    const v = Number(btn.dataset.seconds);
    btn.classList.toggle('active', v === current);
  }
}

function renderRing(phase) {
  if (phase === 'countingDown') {
    ringWrapEl.classList.add('visible');
    const rem = model.remainingMs;
    const prep = model.prepMs;
    // progress 0 = full ring, 1 = empty
    const progress = prep > 0 ? Math.max(0, Math.min(1, 1 - rem / prep)) : 1;
    ringEl.style.setProperty('--ring-progress', String(progress));
  } else {
    ringWrapEl.classList.remove('visible');
    ringEl.style.setProperty('--ring-progress', '0');
  }
}

function render() {
  const phase = model.phase;

  statusEl.textContent = PHASE_LABELS[phase] ?? '';

  setPhaseColorClass(phase);
  renderControls(phase);
  renderRing(phase);

  switch (phase) {
    case 'idle':
      setDigits(fmtMMSS(model.prepMs));
      renderPresets();
      break;
    case 'countingDown': {
      // Ceiling to whole seconds for digit display.
      setDigits(fmtMMSS(model.remainingMs));
      break;
    }
    case 'running':
    case 'paused': {
      const f = fmtMMSScc(model.elapsedMs);
      setDigits(f.main, f.cs);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// rAF loop
// ---------------------------------------------------------------------------

let rafId = 0;

function loop() {
  rafId = 0;
  model.tick(performance.now());
  const cues = model.consumeCues();
  for (const c of cues) dispatchCue(c);
  render();
  if (model.phase !== 'idle' && document.visibilityState === 'visible') {
    rafId = requestAnimationFrame(loop);
  }
}

function startLoop() {
  if (rafId === 0) rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

presetsEl.addEventListener('click', (e) => {
  const t = e.target.closest('.preset');
  if (!t) return;
  if (model.phase !== 'idle') return;
  const sec = Number(t.dataset.seconds);
  if (!Number.isFinite(sec)) return;
  model.setPrep(sec);
  render();
});

stepperMinus.addEventListener('click', () => {
  if (model.phase !== 'idle') return;
  model.setPrep(model.prepSeconds - 1);
  render();
});

stepperPlus.addEventListener('click', () => {
  if (model.phase !== 'idle') return;
  model.setPrep(model.prepSeconds + 1);
  render();
});

startBtn.addEventListener('click', async () => {
  // First user gesture — create + resume the AudioContext synchronously.
  const ctx = ensureAudio();
  if (ctx && ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_e) {}
  }

  model.start();
  // If start enqueued a 'go' (prep=0), drain immediately so audio fires
  // within the same user-gesture window.
  const cues = model.consumeCues();
  for (const c of cues) dispatchCue(c);

  acquireWakeLock();
  render();
  startLoop();
});

cancelBtn.addEventListener('click', () => {
  model.cancel();
  releaseWakeLock();
  stopLoop();
  render();
});

pauseBtn.addEventListener('click', () => {
  model.pause();
  render();
  // Loop continues to render the paused state but no model.tick mutation;
  // tick is a no-op in paused. We can let the loop keep running to keep
  // wake lock semantics simple. It will idle on the next phase change.
});

resumeBtn.addEventListener('click', () => {
  model.resume();
  render();
  startLoop();
});

resetBtn.addEventListener('click', () => {
  if (model.phase === 'running') {
    if (!window.confirm('Reset the running timer?')) return;
  }
  model.reset();
  releaseWakeLock();
  stopLoop();
  render();
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Catch the model up immediately.
    model.tick(performance.now());
    const cues = model.consumeCues();
    for (const c of cues) dispatchCue(c);
    render();
    if (model.phase !== 'idle') {
      acquireWakeLock();
      startLoop();
    }
  } else {
    stopLoop();
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

render();
