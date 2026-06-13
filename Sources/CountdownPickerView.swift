import SwiftUI

/// Preset chips + −/＋ fine adjusters for the prep countdown duration.
/// Only shown (and interactive) in `.idle`.
struct CountdownPickerView: View {
    @Binding var duration: Int

    private static let presets = [0, 5, 10, 15, 30]
    private static let range = 0...300

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                ForEach(Self.presets, id: \.self) { preset in
                    presetChip(preset)
                }
            }

            HStack(spacing: 24) {
                adjustButton(systemName: "minus", delta: -1)
                Text("\(duration) s")
                    .font(.headline)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 56)
                adjustButton(systemName: "plus", delta: +1)
            }
        }
    }

    @ViewBuilder
    private func presetChip(_ preset: Int) -> some View {
        if preset == duration {
            Button("\(preset)s") { duration = preset }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.capsule)
                .tint(.green)
        } else {
            Button("\(preset)s") { duration = preset }
                .buttonStyle(.glass)
                .buttonBorderShape(.capsule)
        }
    }

    private func adjustButton(systemName: String, delta: Int) -> some View {
        Button {
            duration = min(Self.range.upperBound, max(Self.range.lowerBound, duration + delta))
        } label: {
            Image(systemName: systemName)
                .font(.body.weight(.semibold))
                .frame(width: 24, height: 24)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        CountdownPickerView(duration: .constant(10))
    }
    .preferredColorScheme(.dark)
}
