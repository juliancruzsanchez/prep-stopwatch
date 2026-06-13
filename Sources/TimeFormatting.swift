import Foundation

/// Pure formatting helpers. No UI imports.
enum TimeFormatting {

    /// Elapsed workout time: `MM:SS.cc`, switching to `H:MM:SS.cc` past one hour.
    static func format(elapsed: TimeInterval) -> String {
        let clamped = max(0, elapsed)
        let totalCentiseconds = Int((clamped * 100).rounded(.down))
        let centiseconds = totalCentiseconds % 100
        let totalSeconds = totalCentiseconds / 100
        let seconds = totalSeconds % 60
        let minutes = (totalSeconds / 60) % 60
        let hours = totalSeconds / 3600
        if hours > 0 {
            return String(format: "%d:%02d:%02d.%02d", hours, minutes, seconds, centiseconds)
        }
        return String(format: "%02d:%02d.%02d", minutes, seconds, centiseconds)
    }

    /// Countdown digits: whole seconds, rounded **up**, so the user never sees
    /// a misleading early 0. (9.2 → "10", 9.0 → "9", 0.3 → "1", 0.0 → "0")
    static func format(countdownRemaining: TimeInterval) -> String {
        String(Int(max(0, countdownRemaining).rounded(.up)))
    }

    /// Idle display of the selected countdown duration, e.g. 10 → "0:10".
    static func format(duration seconds: Int) -> String {
        let clamped = max(0, seconds)
        return String(format: "%d:%02d", clamped / 60, clamped % 60)
    }
}
