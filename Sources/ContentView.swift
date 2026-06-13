import SwiftUI

struct ContentView: View {
    var model: TimerModel

    @AppStorage("countdownDuration") private var countdownDuration: Int = 10

    @State private var lastCue: TimerModel.Cue?
    @State private var cueCount = 0

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.05)) { context in
            VStack(spacing: 0) {
                statusLabel
                    .padding(.top, 24)

                Spacer()

                TimerDisplayView(
                    text: displayText,
                    fraction: ringFraction,
                    tint: displayTint
                )

                CountdownPickerView(duration: $countdownDuration)
                    .padding(.top, 32)
                    .opacity(model.phase == .idle ? 1 : 0)
                    .disabled(model.phase != .idle)

                Spacer()

                ControlsView(model: model, countdownDuration: countdownDuration)
                    .padding(.bottom, 32)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onChange(of: context.date) {
                model.tick()
            }
        }
        .background(Color.black.ignoresSafeArea())
        .sensoryFeedback(trigger: cueCount) { _, _ in
            switch lastCue {
            case .go:
                return .success
            case .tick3, .tick2, .tick1:
                return .impact(weight: .medium)
            case nil:
                return nil
            }
        }
        .onAppear {
            model.onCue = { cue in
                lastCue = cue
                cueCount += 1
                SoundPlayer.play(cue)
            }
        }
    }

    // MARK: - Derived display values

    private var statusLabel: some View {
        Text(statusText)
            .font(.title3.weight(.medium))
            .foregroundStyle(statusColor)
            .frame(height: 28)
            .animation(.default, value: statusText)
    }

    private var statusText: String {
        switch model.phase {
        case .idle: ""
        case .countingDown: "Get Ready"
        case .running: ""
        case .paused: "Paused"
        }
    }

    private var statusColor: Color {
        switch model.phase {
        case .countingDown: .orange
        case .paused: .white.opacity(0.6)
        default: .secondary
        }
    }

    private var displayText: String {
        switch model.phase {
        case .idle:
            TimeFormatting.format(duration: countdownDuration)
        case .countingDown:
            TimeFormatting.format(countdownRemaining: model.remainingCountdown)
        case .running, .paused:
            TimeFormatting.format(elapsed: model.elapsed)
        }
    }

    private var ringFraction: Double {
        model.countdownFraction
    }

    private var displayTint: Color {
        switch model.phase {
        case .idle: .white.opacity(0.75)
        case .countingDown: .orange
        case .running: .green
        case .paused: .white.opacity(0.45)
        }
    }
}

#Preview {
    ContentView(model: TimerModel())
        .preferredColorScheme(.dark)
}
