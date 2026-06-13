import SwiftUI

/// Bottom control cluster. One `GlassEffectContainer` with stable
/// `glassEffectID`s so Start / Cancel / Pause / Resume / Reset morph fluidly
/// between phases.
struct ControlsView: View {
    var model: TimerModel
    let countdownDuration: Int

    @State private var showResetConfirmation = false
    @Namespace private var glassNamespace

    var body: some View {
        GlassEffectContainer(spacing: 40) {
            HStack(spacing: 40) {
                switch model.phase {
                case .idle:
                    startButton
                case .countingDown:
                    cancelButton
                case .running:
                    pauseButton
                    resetButton
                case .paused:
                    resumeButton
                    resetButton
                }
            }
        }
        .animation(.smooth, value: model.phase)
        .confirmationDialog(
            "Reset workout?",
            isPresented: $showResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Reset", role: .destructive) {
                model.reset()
            }
        }
    }

    // MARK: - Buttons

    private var startButton: some View {
        Button {
            model.start(countdown: TimeInterval(countdownDuration))
        } label: {
            Text("Start")
                .font(.title2.weight(.semibold))
                .frame(width: 104, height: 104)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.extraLarge)
        .buttonBorderShape(.circle)
        .tint(.green)
        .glassEffectID("primary", in: glassNamespace)
        .accessibilityLabel("Start")
    }

    private var cancelButton: some View {
        Button {
            model.reset()
        } label: {
            Text("Cancel")
                .font(.title3.weight(.medium))
                .frame(width: 104, height: 104)
        }
        .buttonStyle(.glass)
        .controlSize(.extraLarge)
        .buttonBorderShape(.circle)
        .glassEffectID("secondary", in: glassNamespace)
        .accessibilityLabel("Cancel")
    }

    private var pauseButton: some View {
        Button {
            model.pause()
        } label: {
            Image(systemName: "pause.fill")
                .font(.title.weight(.semibold))
                .frame(width: 88, height: 88)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.extraLarge)
        .buttonBorderShape(.circle)
        .tint(.orange)
        .glassEffectID("primary", in: glassNamespace)
        .accessibilityLabel("Pause")
    }

    private var resumeButton: some View {
        Button {
            model.resume()
        } label: {
            Image(systemName: "play.fill")
                .font(.title.weight(.semibold))
                .frame(width: 88, height: 88)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.extraLarge)
        .buttonBorderShape(.circle)
        .tint(.green)
        .glassEffectID("primary", in: glassNamespace)
        .accessibilityLabel("Resume")
    }

    private var resetButton: some View {
        Button {
            if model.phase == .running {
                // Guard against accidental taps while the workout is live.
                showResetConfirmation = true
            } else {
                // Pausing first was the deliberate gesture; reset immediately.
                model.reset()
            }
        } label: {
            Image(systemName: "arrow.counterclockwise")
                .font(.title.weight(.semibold))
                .frame(width: 88, height: 88)
        }
        .buttonStyle(.glass)
        .controlSize(.extraLarge)
        .buttonBorderShape(.circle)
        .glassEffectID("secondary", in: glassNamespace)
        .accessibilityLabel("Reset")
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        ControlsView(model: TimerModel(), countdownDuration: 10)
    }
    .preferredColorScheme(.dark)
}
