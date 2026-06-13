import SwiftUI

/// Digits + progress ring. Dumb view: takes a display string, ring fraction,
/// and tint color as inputs.
struct TimerDisplayView: View {
    let text: String
    let fraction: Double
    let tint: Color

    var body: some View {
        ZStack {
            // Faint full track.
            Circle()
                .stroke(
                    tint.opacity(0.15),
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )

            // Draining progress ring, starting at 12 o'clock.
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(
                    tint,
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            Text(text)
                .font(.system(size: 80, weight: .thin, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.35)
                .padding(28)
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 340)
        .padding(.horizontal, 24)
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        TimerDisplayView(text: "01:23.45", fraction: 1, tint: .green)
    }
}
