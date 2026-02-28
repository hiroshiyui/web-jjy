import { describe, it, expect } from 'vitest';
import { generateSignal, decodeSignal, toJSTDate, getleapsecond, MARKER_DURATION, BIT_HIGH_DURATION, BIT_LOW_DURATION } from './signal';

// 2025-06-15 14:30 — 日曜日、年通日166
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
        // BCD重み [40, 20, 10, 16, 8, 4, 2, 1]
        // 30 → ビット: 0,1,1,0,0,0,0,0
        const expected = [0.8, 0.5, 0.5, 0.8, 0.8, 0.8, 0.8, 0.8];
        expect(sig.slice(1, 9)).toEqual(expected);
    });

    it('encodes hour 14 (indices 10-18)', () => {
        // BCD重み [80, 40, 20, 10, 16, 8, 4, 2, 1]
        // 14 → ビット: 0,0,0,1,0,0,1,0,0
        const expected = [0.8, 0.8, 0.8, 0.5, 0.8, 0.8, 0.5, 0.8, 0.8];
        expect(sig.slice(10, 19)).toEqual(expected);
    });

    it('encodes day-of-year 166 (indices 20-28, 30-33)', () => {
        // 重み [800,400,200,100,160,80,40,20,10]
        // 166 → ビット: 0,0,0,1,0,0,1,1,0
        expect(sig.slice(20, 29)).toEqual([0.8, 0.8, 0.8, 0.5, 0.8, 0.8, 0.5, 0.5, 0.8]);
        // 重み [8,4,2,1], 残り6 → ビット: 0,1,1,0
        expect(sig.slice(30, 34)).toEqual([0.8, 0.5, 0.5, 0.8]);
    });

    it('encodes parity bits (even parity)', () => {
        // PA1 (時14): セットビット2個 → 偶数 → 0
        expect(sig[36]).toBe(BIT_LOW_DURATION);
        // PA2 (分30): セットビット2個 → 偶数 → 0
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
        // BCD重み [80, 40, 20, 10, 8, 4, 2, 1]
        // 25 → ビット: 0,0,1,0,0,1,0,1
        expect(sig.slice(41, 49)).toEqual([0.8, 0.8, 0.5, 0.8, 0.8, 0.5, 0.8, 0.5]);
    });

    it('encodes weekday 0 Sunday (indices 50-52)', () => {
        // 重み [4, 2, 1] → 0,0,0
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
        expect(decoded.weekday).toBe(0); // 日曜日
    });

    it('decodes different date correctly', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 23, 59, 0, 0), false);
        const decoded = decodeSignal(sig);
        expect(decoded.minute).toBe(59);
        expect(decoded.hour).toBe(23);
        expect(decoded.dayOfYear).toBe(1);
        expect(decoded.year).toBe(25);
        expect(decoded.weekday).toBe(3); // 水曜日
    });
});

describe('decodeSignal roundtrip', () => {
    const cases: { label: string; date: Date; minute: number; hour: number; day: number; year: number; weekday: number }[] = [
        { label: '0時0分 1月1日 00年', date: new Date(2000, 0, 1, 0, 0), minute: 0, hour: 0, day: 1, year: 0, weekday: 6 },
        { label: '23時59分 12月31日 99年', date: new Date(2099, 11, 31, 23, 59), minute: 59, hour: 23, day: 365, year: 99, weekday: 4 },
        { label: 'うるう年 通日366', date: new Date(2024, 11, 31, 12, 0), minute: 0, hour: 12, day: 366, year: 24, weekday: 2 },
        { label: '月曜日テスト', date: new Date(2025, 5, 16, 1, 1), minute: 1, hour: 1, day: 167, year: 25, weekday: 1 },
        { label: '0分0時', date: new Date(2025, 0, 5, 0, 0), minute: 0, hour: 0, day: 5, year: 25, weekday: 0 },
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

describe('getleapsecond', () => {
    it('returns 0 when no leap second is pending', () => {
        // うるう秒リストの全エントリは過去のもの
        expect(getleapsecond()).toBe(0);
    });
});

describe('generateSignal determinism', () => {
    it('produces identical output for same inputs', () => {
        const a = generateSignal(testDate, false);
        const b = generateSignal(testDate, false);
        expect(a).toEqual(b);
    });
});

describe('generateSignal structural invariants', () => {
    it('only marker positions have MARKER_DURATION', () => {
        const markerPositions = new Set([0, 9, 19, 29, 39, 49, 59]);
        const dates = [testDate, new Date(2024, 11, 31, 23, 59), new Date(2000, 0, 1, 0, 0)];
        for (const date of dates) {
            const sig = generateSignal(date, false);
            for (let i = 0; i < 60; i++) {
                if (markerPositions.has(i)) {
                    expect(sig[i]).toBe(MARKER_DURATION);
                } else {
                    expect(sig[i]).not.toBe(MARKER_DURATION);
                }
            }
        }
    });

    it('encodes minute 0 as all-zero BCD', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 0, 0, 0, 0), false);
        expect(sig.slice(1, 9)).toEqual(Array(8).fill(BIT_LOW_DURATION));
    });

    it('encodes hour 0 as all-zero BCD', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 0, 0, 0, 0), false);
        expect(sig.slice(10, 19)).toEqual(Array(9).fill(BIT_LOW_DURATION));
    });
});

describe('parity bits systematic', () => {
    function countSetBits(sig: number[], start: number, end: number): number {
        let count = 0;
        for (let i = start; i <= end; i++) {
            if (sig[i] === BIT_HIGH_DURATION) count++;
        }
        return count;
    }

    const parityDates = [
        new Date(2025, 5, 15, 14, 30),  // 偶数/偶数
        new Date(2025, 0, 1, 1, 15),    // 奇数/奇数
        new Date(2025, 0, 1, 0, 0),     // ビット0個
        new Date(2025, 0, 1, 23, 59),   // ビット多数
        new Date(2025, 2, 15, 7, 42),   // 混合
    ];

    for (const date of parityDates) {
        it(`PA1/PA2 match parity for ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`, () => {
            const sig = generateSignal(date, false);
            const hourBits = countSetBits(sig, 10, 18);
            const minuteBits = countSetBits(sig, 1, 8);
            // PA1 (位置36) = 時パリティ, PA2 (位置37) = 分パリティ
            expect(sig[36]).toBe(hourBits % 2 === 1 ? BIT_HIGH_DURATION : BIT_LOW_DURATION);
            expect(sig[37]).toBe(minuteBits % 2 === 1 ? BIT_HIGH_DURATION : BIT_LOW_DURATION);
        });
    }
});

describe('toJSTDate concrete conversions', () => {
    it('converts UTC epoch to JST 09:00', () => {
        const utcMidnight = new Date(0); // 1970-01-01T00:00:00Z
        const jst = toJSTDate(utcMidnight);
        expect(jst.getHours() - utcMidnight.getHours()).toBe(9 + utcMidnight.getTimezoneOffset() / 60);
    });

    it('is idempotent in JST timezone (offset = 0 when already JST)', () => {
        const date = new Date(2025, 5, 15, 14, 30);
        const jst = toJSTDate(date);
        // オフセットは(540 + ローカルオフセット)分に等しいはず
        const expectedOffsetMs = (540 + date.getTimezoneOffset()) * 60000;
        expect(jst.getTime() - date.getTime()).toBe(expectedOffsetMs);
    });
});

describe('generateSignal with different dates', () => {
    it('encodes minute 59', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 0, 59, 0, 0), false);
        // 59: 重み [40,20,10,16,8,4,2,1] → 1,0,1,0,1,0,0,1
        expect(sig.slice(1, 9)).toEqual([0.5, 0.8, 0.5, 0.8, 0.5, 0.8, 0.8, 0.5]);
    });

    it('encodes hour 23', () => {
        const sig = generateSignal(new Date(2025, 0, 1, 23, 0, 0, 0), false);
        // 23: 重み [80,40,20,10,16,8,4,2,1] → 0,0,1,0,0,0,0,1,1
        expect(sig.slice(10, 19)).toEqual([0.8, 0.8, 0.5, 0.8, 0.8, 0.8, 0.8, 0.5, 0.5]);
    });

    it('encodes day-of-year 365 (Dec 31)', () => {
        const sig = generateSignal(new Date(2025, 11, 31, 0, 0, 0, 0), false);
        // 365: 重み [800,400,200,100,160,80,40,20,10] → 0,0,1,1,0,0,1,1,0
        expect(sig.slice(20, 29)).toEqual([0.8, 0.8, 0.5, 0.5, 0.8, 0.8, 0.5, 0.5, 0.8]);
        // 残り5: 重み [8,4,2,1] → 0,1,0,1
        expect(sig.slice(30, 34)).toEqual([0.8, 0.5, 0.8, 0.5]);
    });

    it('encodes weekday Saturday (6)', () => {
        // 2025-06-14は土曜日
        const sig = generateSignal(new Date(2025, 5, 14, 0, 0, 0, 0), false);
        // 6: 重み [4,2,1] → 1,1,0
        expect(sig.slice(50, 53)).toEqual([0.5, 0.5, 0.8]);
    });

    it('computes odd parity correctly', () => {
        // 2025-01-01 01:15 — 水曜日、通日1
        const sig = generateSignal(new Date(2025, 0, 1, 1, 15, 0, 0), false);
        // 時1: セットビット1個 → PA1 = 1 (奇数)
        expect(sig[36]).toBe(BIT_HIGH_DURATION);
        // 分15: セットビット3個 → PA2 = 1 (奇数)
        expect(sig[37]).toBe(BIT_HIGH_DURATION);
    });
});
