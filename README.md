# Workout Prep Timer

A single-screen Progressive Web App: tap Start, get a short countdown ("3, 2,
1, go") with audio and haptic cues, and the timer automatically flips into a
centisecond-precision stopwatch. Installable to the home screen on iOS and
Android, runs fully offline after first load, keeps the screen awake.

## What it is

- Pure front-end (no build step). Source loads as ES modules directly.
- `timerModel.js` is the pure state machine — has no DOM/browser deps and is
  the unit under test in `tests/`.
- `app.js` is the view: wires DOM, audio, vibration, wake lock, and the
  `requestAnimationFrame` loop.

## Develop

The app must be served over HTTP (or HTTPS), not `file://`, because:

- ES modules require a real origin.
- The service worker only registers on `http(s)://` (with `localhost` being
  an exempt insecure host for dev).
- The PWA manifest icons are fetched via HTTP.

From the project root:

```
npm run serve
```

(This just invokes `python3 -m http.server 8080`.) Then open
<http://localhost:8080> in a browser.

## Test

The model has full unit-test coverage with the Node built-in test runner.

```
npm test
```

This runs `node --test tests/**/*.test.js`. There are no dependencies; all
tests use `node:test` and `node:assert/strict`.

## PWA install

- **iOS Safari.** Open in Safari, tap the Share button, then "Add to Home
  Screen". The installed app runs in standalone mode (no Safari chrome).
- **Android Chrome / Chromium desktop.** The browser surfaces an Install
  prompt automatically once the service worker has activated. On desktop a
  small install icon also appears in the address bar.

## Known limitations

- **iOS Safari has no Vibration API.** The `navigator.vibrate` calls are
  feature-detected and silently skipped on iOS. The audio cue is still played.
- **AudioContext requires a user gesture.** The context is created and
  resumed inside the first Start click. If you start the app, then background
  it for a long time on iOS, the context may suspend; tapping Reset and Start
  again resumes it.
- **No background audio.** When the tab is hidden the browser will throttle
  `requestAnimationFrame` and may suspend the audio context. On visibility
  return the app catches the model state up immediately, but missed tickN
  cues during the hidden period are not retroactively played. The `go`
  boundary is still honored exactly once.
- **iOS Simulator does not emit audio reliably.** Test on a physical device
  for cue verification.
- **Wake Lock API is unsupported in some browsers (notably older Safari).**
  Feature-detected; the app still works, the screen just sleeps normally.
- **Landscape is locked off.** The manifest pins `orientation: portrait`.
# prep-stopwatch
