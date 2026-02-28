import { describe, it, expect } from 'vitest';
import { generateSignal, toJSTDate, MARKER_DURATION, BIT_HIGH_DURATION, BIT_LOW_DURATION } from './signal';

// 2025-06-15 14:30 — Sunday, day-of-year 166
const testDate = new Date(2025, 5, 15, 14, 30, 0, 0);

describe('generateSignal', () => {
    const sig = generateSignal(testDate, false);

    it('returns 60-element array', () => {
        expect(sig).toHaveLength(60);
    });

    it('all durations are 0.2, 0.5, or 0.8', () => {
        for (const d of sig) {
            expect([MARKER_DURATION, BIT_HIGH_DURATION, BIT_LOW_DURATION]).toContain(d);
        }
    });

    it('markers at positions 0, 9, 19, 29, 39, 49, 59', () => {
        const markerPositions = [0, 9, 19, 29, 39, 49, 59];
        for (const pos of markerPositions) {
            expect(sig[pos]).toBe(MARKER_DURATION);
        }
    });

    it('encodes minute 30 (indices 1-8)', () => {
        // BCD weights [40, 20, 10, 16, 8, 4, 2, 1]
        // 30 → bits: 0,1,1,0,0,0,0,0
        const expected = [0.8, 0.5, 0.5, 0.8, 0.8, 0.8, 0.8, 0.8];
        expect(sig.slice(1, 9)).toEqual(expected);
    });

    it('encodes hour 14 (indices 10-18)', () => {
        // BCD weights [80, 40, 20, 10, 16, 8, 4, 2, 1]
        // 14 → bits: 0,0,0,1,0,0,1,0,0
        const expected = [0.8, 0.8, 0.8, 0.5, 0.8, 0.8, 0.5, 0.8, 0.8];
        expect(sig.slice(10, 19)).toEqual(expected);
    });

    it('encodes day-of-year 166 (indices 20-28, 30-33)', () => {
        // weights [800,400,200,100,160,80,40,20,10]
        // 166 → bits: 0,0,0,1,0,0,1,1,0
        expect(sig.slice(20, 29)).toEqual([0.8, 0.8, 0.8, 0.5, 0.8, 0.8, 0.5, 0.5, 0.8]);
        // weights [8,4,2,1], remaining 6 → bits: 0,1,1,0
        expect(sig.slice(30, 34)).toEqual([0.8, 0.5, 0.5, 0.8]);
    });

    it('encodes parity bits (even parity)', () => {
        // PA1 (hour 14): 2 set bits → even → 0
        expect(sig[36]).toBe(BIT_LOW_DURATION);
        // PA2 (minute 30): 2 set bits → even → 0
        expect(sig[37]).toBe(BIT_LOW_DURATION);
    });

    it('encodes summer time off at index 40', () => {
        expect(sig[40]).toBe(BIT_LOW_DURATION);
    });

    it('encodes summer time on at index 40', () => {
        const sigSummer = generateSignal(testDate, true);
        expect(sigSummer[40]).toBe(BIT_HIGH_DURATION);
    });

    it('encodes year 25 (indices 41-48)', () => {
        // BCD weights [80, 40, 20, 10, 8, 4, 2, 1]
        // 25 → bits: 0,0,1,0,0,1,0,1
        expect(sig.slice(41, 49)).toEqual([0.8, 0.8, 0.5, 0.8, 0.8, 0.5, 0.8, 0.5]);
    });

    it('encodes weekday 0 Sunday (indices 50-52)', () => {
        // weights [4, 2, 1] → 0,0,0
        expect(sig.slice(50, 53)).toEqual([0.8, 0.8, 0.8]);
    });
});

describe('toJSTDate', () => {
    it('adjusts timestamp by correct offset', () => {
        const date = new Date();
        const jst = toJSTDate(date);
        const expectedDiff = (540 + date.getTimezoneOffset()) * 60000;
        expect(jst.getTime() - date.getTime()).toBe(expectedDiff);
    });

    it('preserves minutes (JST offset is whole hours)', () => {
        const date = new Date(2025, 5, 15, 14, 30, 45, 123);
        const jst = toJSTDate(date);
        expect(jst.getMinutes()).toBe(date.getMinutes());
        expect(jst.getSeconds()).toBe(date.getSeconds());
        expect(jst.getMilliseconds()).toBe(date.getMilliseconds());
    });
});

describe('generateSignal with different dates', () => {
    it('encodes minute 59', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 0, 59, 0, 0), false);
        // 59: weights [40,20,10,16,8,4,2,1] → 1,0,1,0,1,0,0,1
        expect(sig.slice(1, 9)).toEqual([0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.8, 0.5]);
    });

    it('encodes hour 23', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 23, 0, 0, 0), false);
        // 23: weights [80,40,20,10,16,8,4,2,1] → 0,0,1,0,0,0,0,1,1
        expect(sig.slice(10, 19)).toEqual([0.8, 0.8, 0.5, 0.8, 0.8, 0.8, 0.8, 0.5, 0.5]);
    });

    it('encodes day-of-year 365 (Dec 31)', () => {
        const sig = generateSignal(new Date(2025, 11, 31, 0, 0, 0, 0), false);
        // 365: weights [800,400,200,100,160,80,40,20,10] → 0,0,1,1,0,0,1,1,0
        expect(sig.slice(20, 29)).toEqual([0.8, 0.8, 0.5, 0.5, 0.8, 0.8, 0.5, 0.5, 0.8]);
        // remaining 5: weights [8,4,2,1] → 0,1,0,1
        expect(sig.slice(30, 34)).toEqual([0.8, 0.5, 0.8, 0.5]);
    });

    it('encodes weekday Saturday (6)', () => {
        // 2025-06-14 is Saturday
        const sig = generateSignal(new Date(2025, 5, 14, 0, 0, 0, 0), false);
        // 6: weights [4,2,1] → 1,1,0
        expect(sig.slice(50, 53)).toEqual([0.5, 0.5, 0.8]);
    });

    it('computes odd parity correctly', () => {
        // 2025-01-01 01:15 — Wednesday, day 1
        const sig = generateSignal(new Date(2025, 0, 1, 1, 15, 0, 0), false);
        // Hour 1: 1 set bit → PA1 = 1 (odd)
        expect(sig[36]).toBe(BIT_HIGH_DURATION);
        // Minute 15: 3 set bits → PA2 = 1 (odd)
        expect(sig[37]).toBe(BIT_HIGH_DURATION);
    });
});
