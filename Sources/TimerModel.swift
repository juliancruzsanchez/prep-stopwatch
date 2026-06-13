import Foundation
import Observation

/// The four visual/logical states of the timer.
enum TimerPhase: Equatable {
    case idle
    case countingDown
    case running
    case paused
}

/// All timing logic for the app. Pure Foundation + Observation — no UI imports.
///
/// Drift-free, date-anchored: every derived value is computed from stored `Date`
/// anchors plus the injected `now` closure. Nothing counts ticks.
@Observable
final class TimerModel {

    /// Cue points the model detects; the UI decides how to render them
    /// (haptics + sounds).
    enum Cue: Equatable {
        case tick3, tick2, tick1, go
    }

    /// Injectable clock — defaults to `Date.init` for production.
    @ObservationIgnored private let now: () -> Date

    /// Fired when a cue point is observed. At most once per cue per session.
    @ObservationIgnored var onCue: ((Cue) -> Void)?

    private(set) var phase: TimerPhase = .idle

    // MARK: - Anchors (all timing derives from these + `now()`)

    @ObservationIgnored private var startDate: Date?
    @ObservationIgnored private var countdownDuration: TimeInterval = 0
    @ObservationIgnored private var pauseDate: Date?
    @ObservationIgnored private var accumulatedPauseDuration: TimeInterval = 0

    /// Cue levels already fired (or suppressed): 3, 2, 1 for ticks, 0 for "go".
    @ObservationIgnored private var firedCueLevels: Set<Int> = []

    init(now: @escaping () -> Date = { Date() }) {
        self.now = now
    }

    // MARK: - Commands (invalid-phase calls are no-ops)

    /// `.idle` -> `.countingDown`, or directly `.running` if `countdown == 0`.
    func start(countdown: TimeInterval) {
        guard phase == .idle else { return }
        let duration = max(0, countdown)
        startDate = now()
        countdownDuration = duration
        pauseDate = nil
        accumulatedPauseDuration = 0
        firedCueLevels = []
        if duration == 0 {
            phase = .running
            fireCue(level: 0)
        } else {
            phase = .countingDown
        }
    }

    /// `.running` -> `.paused`. Elapsed freezes against `pauseDate`.
    func pause() {
        guard phase == .running else { return }
        pauseDate = now()
        phase = .paused
    }

    /// `.paused` -> `.running`. The paused wall-clock interval is excluded.
    func resume() {
        guard phase == .paused, let pauseDate else { return }
        accumulatedPauseDuration += now().timeIntervalSince(pauseDate)
        self.pauseDate = nil
        phase = .running
    }

    /// Any phase -> `.idle`. Clears all anchors. (The persisted countdown
    /// preference lives in the UI layer and is untouched.)
    func reset() {
        startDate = nil
        countdownDuration = 0
        pauseDate = nil
        accumulatedPauseDuration = 0
        firedCueLevels = []
        phase = .idle
    }

    /// Call from the view's TimelineView closure. Performs the
    /// countdown -> running transition and fires due cues, each exactly once.
    ///
    /// Idempotent per cue: calling many times per frame never re-fires or
    /// re-transitions. If multiple cue points were skipped (the app was
    /// backgrounded), stale tick cues are suppressed — at most the cue whose
    /// window contains the current remaining time (or `go` on transition) fires.
    func tick() {
        guard phase == .countingDown, let startDate else { return }
        let remaining = countdownDuration - now().timeIntervalSince(startDate)
        if remaining <= 0 {
            // Transition. Elapsed is anchored to the boundary date
            // (startDate + countdownDuration), not to when this tick ran,
            // so a late tick still yields the correct elapsed value.
            firedCueLevels.formUnion([1, 2, 3]) // suppress stale tick cues
            phase = .running
            fireCue(level: 0)
        } else {
            let level = Int(remaining.rounded(.up))
            guard level <= 3 else { return }
            if level < 3 {
                // Suppress tick cues whose windows were skipped entirely.
                for missed in (level + 1)...3 {
                    firedCueLevels.insert(missed)
                }
            }
            fireCue(level: level)
        }
    }

    // MARK: - Read-only derived values

    /// Remaining prep time; 0 when not counting down.
    var remainingCountdown: TimeInterval {
        guard phase == .countingDown, let startDate else { return 0 }
        return max(0, countdownDuration - now().timeIntervalSince(startDate))
    }

    /// Workout time, excludes paused intervals; 0 unless running/paused.
    /// Anchored to the countdown boundary (`startDate + countdownDuration`).
    var elapsed: TimeInterval {
        guard let startDate else { return 0 }
        let reference: Date
        switch phase {
        case .running:
            reference = now()
        case .paused:
            guard let pauseDate else { return 0 }
            reference = pauseDate
        case .idle, .countingDown:
            return 0
        }
        let value = reference.timeIntervalSince(startDate)
            - countdownDuration
            - accumulatedPauseDuration
        return max(0, value)
    }

    /// remaining/total in 1...0 for the draining ring; 1 outside the countdown.
    var countdownFraction: Double {
        guard phase == .countingDown, countdownDuration > 0 else { return 1 }
        return min(1, max(0, remainingCountdown / countdownDuration))
    }

    // MARK: - Private

    private func fireCue(level: Int) {
        guard !firedCueLevels.contains(level) else { return }
        firedCueLevels.insert(level)
        let cue: Cue
        switch level {
        case 3: cue = .tick3
        case 2: cue = .tick2
        case 1: cue = .tick1
        default: cue = .go
        }
        onCue?(cue)
    }
}
