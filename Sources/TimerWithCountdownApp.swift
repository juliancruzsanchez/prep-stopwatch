import SwiftUI

@main
struct TimerWithCountdownApp: App {
    @State private var model = TimerModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        SoundPlayer.configureAudioSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, newScenePhase in
            updateIdleTimer(scenePhase: newScenePhase)
        }
        .onChange(of: model.phase) {
            updateIdleTimer(scenePhase: scenePhase)
        }
    }

    /// Keep the screen awake while a session is active and the app is in
    /// the foreground; release the idle timer otherwise (idle or backgrounded).
    private func updateIdleTimer(scenePhase: ScenePhase) {
        let sessionActive = model.phase != .idle
        UIApplication.shared.isIdleTimerDisabled = sessionActive && scenePhase == .active
    }
}
