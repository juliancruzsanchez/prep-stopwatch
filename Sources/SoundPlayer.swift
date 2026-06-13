import AVFoundation
import AudioToolbox

/// Thin wrapper over `AudioServicesPlaySystemSound` + `AVAudioSession` setup.
/// The model never touches this — cues arrive through `TimerModel.onCue`.
enum SoundPlayer {

    /// Configure playback that ducks (not stops) other audio, so cues are
    /// audible over workout music. Called once at app launch.
    static func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, options: .duckOthers)
            try session.setActive(true)
        } catch {
            // Audio cues are best-effort; haptics still convey the cues.
        }
    }

    /// Short tick for 3-2-1; distinct start sound at "go".
    static func play(_ cue: TimerModel.Cue) {
        switch cue {
        case .tick3, .tick2, .tick1:
            AudioServicesPlaySystemSound(1057) // tick
        case .go:
            AudioServicesPlaySystemSound(1054) // distinct start beep
        }
    }
}
