import Foundation
import Testing
@testable import TimerWithCountdown

struct TimeFormattingTests {

    // MARK: - Elapsed formatting

    @Test func elapsedZero() {
        #expect(TimeFormatting.format(elapsed: 0) == "00:00.00")
    }

    @Test func elapsedMinutesSecondsCentiseconds() {
        #expect(TimeFormatting.format(elapsed: 83.456) == "01:23.45")
    }

    @Test func elapsedPastOneHour() {
        #expect(TimeFormatting.format(elapsed: 3661.0) == "1:01:01.00")
    }

    @Test func elapsedJustUnderOneHour() {
        #expect(TimeFormatting.format(elapsed: 3599.99) == "59:59.99")
    }

    @Test func elapsedNegativeClampsToZero() {
        #expect(TimeFormatting.format(elapsed: -5) == "00:00.00")
    }

    // MARK: - Countdown digit rule: Int(remaining.rounded(.up))

    @Test func countdownRoundsUp() {
        #expect(TimeFormatting.format(countdownRemaining: 9.2) == "10")
    }

    @Test func countdownWholeSecondShowsItself() {
        #expect(TimeFormatting.format(countdownRemaining: 9.0) == "9")
    }

    @Test func countdownFractionShowsOne() {
        #expect(TimeFormatting.format(countdownRemaining: 0.3) == "1")
    }

    @Test func countdownZeroShowsZero() {
        #expect(TimeFormatting.format(countdownRemaining: 0.0) == "0")
    }

    // MARK: - Idle duration display

    @Test func durationFormatsAsMinutesSeconds() {
        #expect(TimeFormatting.format(duration: 10) == "0:10")
        #expect(TimeFormatting.format(duration: 0) == "0:00")
        #expect(TimeFormatting.format(duration: 90) == "1:30")
        #expect(TimeFormatting.format(duration: 300) == "5:00")
    }
}
