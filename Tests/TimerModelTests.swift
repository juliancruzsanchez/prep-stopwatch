import Foundation
import Testing
@testable import TimerWithCountdown

/// A mutable clock harness for driving TimerModel deterministically.
private final class TestClock {
    var current = Date(timeIntervalSinceReferenceDate: 0)

    func advance(_ seconds: TimeInterval) {
        current = current.addingTimeInterval(seconds)
    }

    func makeModel() -> TimerModel {
        TimerModel(now: { self.current })
    }
}

struct TimerModelTests {

    // 1.
    @Test func startEntersCountdownWithFullRemaining() {
        let clock = TestClock()
        let model = clock.makeModel()

        model.start(countdown: 10)

        #expect(model.phase == .countingDown)
        #expect(abs(model.remainingCountdown - 10) < 0.001)
    }

    // 2.
    @Test func remainingCountdownDecreasesWithTime() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)

        clock.advance(4)
        model.tick()

        #expect(model.phase == .countingDown)
        #expect(abs(model.remainingCountdown - 6) < 0.001)
    }

    // 3.
    @Test func transitionsToRunningAtExactBoundary() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)

        clock.advance(10)
        model.tick()

        #expect(model.phase == .running)
        #expect(abs(model.elapsed) < 0.001)
    }

    // 4. Elapsed is anchored to the boundary date, not the tick time.
    @Test func countdownOvershootAnchorsElapsedToBoundary() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)

        clock.advance(12.5)
        model.tick() // no intermediate ticks — simulates backgrounding

        #expect(model.phase == .running)
        #expect(abs(model.elapsed - 2.5) < 0.001)
    }

    // 5.
    @Test func zeroCountdownStartsRunningImmediately() {
        let clock = TestClock()
        let model = clock.makeModel()
        var cues: [TimerModel.Cue] = []
        model.onCue = { cues.append($0) }

        model.start(countdown: 0)

        #expect(model.phase == .running)
        #expect(cues == [.go])

        clock.advance(2)
        #expect(abs(model.elapsed - 2) < 0.001)
    }

    // 6.
    @Test func pauseFreezesElapsed() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)
        clock.advance(10)
        model.tick()

        clock.advance(5)
        model.pause()
        clock.advance(60)

        #expect(model.phase == .paused)
        #expect(abs(model.elapsed - 5) < 0.001)
    }

    // 7.
    @Test func resumeExcludesPausedInterval() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)
        clock.advance(10)
        model.tick()

        clock.advance(5)
        model.pause()
        clock.advance(60)
        model.resume()
        clock.advance(3)

        #expect(model.phase == .running)
        #expect(abs(model.elapsed - 8) < 0.001)
    }

    // 8.
    @Test func multiplePauseResumeCyclesAccumulate() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 0)

        clock.advance(2)
        model.pause()
        clock.advance(10)
        model.resume()
        clock.advance(3)
        model.pause()
        clock.advance(20)
        model.resume()
        clock.advance(1)

        #expect(model.phase == .running)
        #expect(abs(model.elapsed - 6) < 0.001)
    }

    // 9.
    @Test func resetFromCountingDownReturnsToCleanIdle() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)
        clock.advance(4)
        model.tick()

        model.reset()

        #expect(model.phase == .idle)
        #expect(model.elapsed == 0)
        #expect(model.remainingCountdown == 0)

        model.start(countdown: 5)
        #expect(model.phase == .countingDown)
        #expect(abs(model.remainingCountdown - 5) < 0.001)
    }

    @Test func resetFromRunningReturnsToCleanIdle() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)
        clock.advance(15)
        model.tick()
        #expect(model.phase == .running)

        model.reset()

        #expect(model.phase == .idle)
        #expect(model.elapsed == 0)
        #expect(model.remainingCountdown == 0)

        model.start(countdown: 3)
        #expect(model.phase == .countingDown)
    }

    @Test func resetFromPausedReturnsToCleanIdle() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 0)
        clock.advance(5)
        model.pause()

        model.reset()

        #expect(model.phase == .idle)
        #expect(model.elapsed == 0)
        #expect(model.remainingCountdown == 0)

        model.start(countdown: 0)
        #expect(model.phase == .running)
        clock.advance(1)
        #expect(abs(model.elapsed - 1) < 0.001)
    }

    // 10.
    @Test func invalidTransitionsAreNoOps() {
        let clock = TestClock()
        let model = clock.makeModel()

        // pause() in .idle
        model.pause()
        #expect(model.phase == .idle)

        // resume() in .idle
        model.resume()
        #expect(model.phase == .idle)

        // pause() in .countingDown
        model.start(countdown: 10)
        model.pause()
        #expect(model.phase == .countingDown)
        clock.advance(4)
        model.tick()
        #expect(abs(model.remainingCountdown - 6) < 0.001)

        // resume() in .running
        clock.advance(6)
        model.tick()
        #expect(model.phase == .running)
        clock.advance(2)
        model.resume()
        #expect(model.phase == .running)
        #expect(abs(model.elapsed - 2) < 0.001)

        // pause() in .paused
        model.pause()
        #expect(model.phase == .paused)
        let frozen = model.elapsed
        clock.advance(30)
        model.pause()
        #expect(model.phase == .paused)
        #expect(abs(model.elapsed - frozen) < 0.001)
    }

    // 11.
    @Test func cuesFireInOrderExactlyOnce() {
        let clock = TestClock()
        let model = clock.makeModel()
        var cues: [TimerModel.Cue] = []
        model.onCue = { cues.append($0) }

        model.start(countdown: 5)
        // Tick through the whole countdown (and a little past it) in 0.05 s
        // steps, mimicking the TimelineView cadence.
        for _ in 0..<105 {
            clock.advance(0.05)
            model.tick()
        }

        #expect(model.phase == .running)
        #expect(cues == [.tick3, .tick2, .tick1, .go])
    }

    // tick() idempotence: many calls per frame never re-fire or re-transition.
    @Test func repeatedTicksDoNotRefireCues() {
        let clock = TestClock()
        let model = clock.makeModel()
        var cues: [TimerModel.Cue] = []
        model.onCue = { cues.append($0) }

        model.start(countdown: 5)
        clock.advance(2.5) // inside the "3" window
        for _ in 0..<10 { model.tick() }
        #expect(cues == [.tick3])

        clock.advance(3) // past the boundary
        for _ in 0..<10 { model.tick() }
        #expect(model.phase == .running)
        #expect(cues == [.tick3, .go])
    }

    // 12.
    @Test func staleCuesSuppressedAfterBackgrounding() {
        let clock = TestClock()
        let model = clock.makeModel()
        var cues: [TimerModel.Cue] = []
        model.onCue = { cues.append($0) }

        model.start(countdown: 10)
        clock.advance(11)
        model.tick() // single late tick, as after backgrounding

        #expect(model.phase == .running)
        #expect(cues == [.go])
        #expect(abs(model.elapsed - 1) < 0.001)
    }

    // Short countdowns only fire the applicable cues.
    @Test func shortCountdownFiresOnlyApplicableCues() {
        let clock = TestClock()
        let model = clock.makeModel()
        var cues: [TimerModel.Cue] = []
        model.onCue = { cues.append($0) }

        model.start(countdown: 2)
        for _ in 0..<45 {
            clock.advance(0.05)
            model.tick()
        }

        #expect(model.phase == .running)
        #expect(cues == [.tick2, .tick1, .go])
    }

    // start() is a no-op outside .idle.
    @Test func startOutsideIdleIsNoOp() {
        let clock = TestClock()
        let model = clock.makeModel()
        model.start(countdown: 10)
        clock.advance(4)
        model.tick()

        model.start(countdown: 30) // ignored
        #expect(model.phase == .countingDown)
        #expect(abs(model.remainingCountdown - 6) < 0.001)
    }
}
