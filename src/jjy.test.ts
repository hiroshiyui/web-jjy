import { describe, it, expect } from 'vitest';
import { generateSignal, decodeSignal, toJSTDate, MARKER_DURATION, BIT_HIGH_DURATION, BIT_LOW_DURATION } from './signal';

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

describe('decodeSignal', () => {
    it('decodes minute, hour, day, year, weekday from signal', () => {
        const sig = generateSignal(testDate, false);
        const decoded = decodeSignal(sig);
        expect(decoded.minute).toBe(30);
        expect(decoded.hour).toBe(14);
        expect(decoded.dayOfYear).toBe(166);
        expect(decoded.year).toBe(25);
        expect(decoded.weekday).toBe(0); // Sunday
    });

    it('decodes different date correctly', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 23, 59, 0, 0), false);
        const decoded = decodeSignal(sig);
        expect(decoded.minute).toBe(59);
        expect(decoded.hour).toBe(23);
        expect(decoded.dayOfYear).toBe(1);
        expect(decoded.year).toBe(25);
        expect(decoded.weekday).toBe(3); // Wednesday
    });
});

describe('decodeSignal roundtrip', () => {
    const cases: { label: string; date: Date; minute: number; hour: number; day: number; year: number; weekday: number }[] = [
        { label: 'midnight Jan 1 year 00', date: new Date(2000, 0, 1, 0, 0), minute: 0, hour: 0, day: 1, year: 0, weekday: 6 },
        { label: 'max time Dec 31 year 99', date: new Date(2099, 11, 31, 23, 59), minute: 59, hour: 23, day: 365, year: 99, weekday: 4 },
        { label: 'leap year day 366', date: new Date(2024, 11, 31, 12, 0), minute: 0, hour: 12, day: 366, year: 24, weekday: 2 },
        { label: 'all weekdays Mon', date: new Date(2025, 5, 16, 1, 1), minute: 1, hour: 1, day: 167, year: 25, weekday: 1 },
        { label: 'minute 0 hour 0', date: new Date(2025, 0, 5, 0, 0), minute: 0, hour: 0, day: 5, year: 25, weekday: 0 },
    ];

    for (const c of cases) {
        it(`roundtrips ${c.label}`, () => {
            const sig = generateSignal(c.date, false);
            const d = decodeSignal(sig);
            expect(d.minute).toBe(c.minute);
            expect(d.hour).toBe(c.hour);
            expect(d.dayOfYear).toBe(c.day);
            expect(d.year).toBe(c.year);
            expect(d.weekday).toBe(c.weekday);
        });
    }
});

describe('reserved bits are always 0', () => {
    it('positions 34-35 and 55-58 are BIT_LOW_DURATION', () => {
        const dates = [testDate, new Date(2024, 11, 31, 23, 59), new Date(2000, 0, 1, 0, 0)];
        for (const date of dates) {
            const sig = generateSignal(date, false);
            for (const pos of [34, 35, 55, 56, 57, 58]) {
                expect(sig[pos]).toBe(BIT_LOW_DURATION);
            }
        }
    });
});

describe('summer time does not affect other decoded fields', () => {
    it('decoded values match except SU2', () => {
        const sigOff = generateSignal(testDate, false);
        const sigOn = generateSignal(testDate, true);
        expect(decodeSignal(sigOff)).toEqual(decodeSignal(sigOn));
        expect(sigOff[40]).toBe(BIT_LOW_DURATION);
        expect(sigOn[40]).toBe(BIT_HIGH_DURATION);
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
