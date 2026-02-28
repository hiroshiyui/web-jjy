// Pure JJY signal generation — no DOM or Web Audio dependencies

export function toJSTDate(date: Date): Date {
    const JST_OFFSET_MIN = 9 * 60;
    const adjustMs = (JST_OFFSET_MIN + date.getTimezoneOffset()) * 60 * 1000;
    return new Date(date.getTime() + adjustMs);
}

export const MARKER_DURATION = 0.2;
export const BIT_HIGH_DURATION = 0.5;
export const BIT_LOW_DURATION = 0.8;

// うるう秒挿入日一覧(日本時)
const plus_leapsecond_list: Date[] = [
    new Date(2017, 0, 1, 9)
];

// うるう秒 +1:一ヶ月以内に挿入 -1:一ヶ月以内に削除
export function getleapsecond(): number {
    const now = Date.now();
    for (let i = 0; i < plus_leapsecond_list.length; i++) {
        const diff = plus_leapsecond_list[i].getTime() - now;
        if (diff > 0 && diff <= 31*24*60*60*1000) {
            return 1;
        }
    }
    return 0;
}

// Pure function: returns 60-element array of durations (0.2, 0.5, or 0.8)
export function generateSignal(date: Date, summer_time: boolean): number[] {
    let minute = date.getMinutes();
    let hour = date.getHours();
    const fullyear = date.getFullYear();
    let year = fullyear % 100;
    let week_day = date.getDay();
    let year_day = (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (24*60*60*1000) + 1;
    const array: number[] = [];
    const leapsecond = getleapsecond();

    // パリティービット
    let pa = 0;

    function marker(): void {
        array.push(MARKER_DURATION);
    }

    function bit(value: number, weight: number): number {
        const b = value >= weight;
        value -= b ? weight : 0;
        pa += b ? 1 : 0;
        const duration = b ? BIT_HIGH_DURATION : BIT_LOW_DURATION;
        array.push(duration);
        return value;
    }

    function encodeBCD(value: number, weights: number[]): number {
        for (let i = 0; i < weights.length; i++) {
            value = bit(value, weights[i]);
        }
        return value;
    }

    marker(); // マーカー(M)

    // 分
    pa = 0;
    minute = encodeBCD(minute, [40, 20, 10, 16, 8, 4, 2, 1]);
    const pa2 = pa;

    marker(); // P1

    // 時
    pa = 0;
    hour = encodeBCD(hour, [80, 40, 20, 10, 16, 8, 4, 2, 1]);
    const pa1 = pa;

    marker(); // P2

    // 1月1日からの通算日
    year_day = encodeBCD(year_day, [800, 400, 200, 100, 160, 80, 40, 20, 10]);

    marker(); // P3

    year_day = encodeBCD(year_day, [8, 4, 2, 1]);

    bit(0, 1); // 0
    bit(0, 1); // 0
    bit(pa1 % 2, 1);
    bit(pa2 % 2, 1);
    bit(0, 1); // SU1

    marker(); // P4

    // SU2
    if (summer_time) {
        bit(1, 1);
    } else {
        bit(0, 1);
    }

    // 年
    year = encodeBCD(year, [80, 40, 20, 10, 8, 4, 2, 1]);

    marker(); // P5

    // 曜日
    week_day = encodeBCD(week_day, [4, 2, 1]);

    // うるう秒
    if (leapsecond === 0) {
        bit(0, 1); // 0
        bit(0, 1); // 0
    } else if (leapsecond > 0) {
        bit(1, 1); // 1
        bit(1, 1); // 1
    } else {
        bit(1, 1); // 1
        bit(0, 1); // 0
    }

    bit(0, 1); // 0
    bit(0, 1); // 0
    bit(0, 1); // 0
    bit(0, 1); // 0

    marker(); // P0

    return array;
}

export interface DecodedSignal {
    minute: number;
    hour: number;
    dayOfYear: number;
    year: number;
    weekday: number;
}

export function decodeSignal(signal: number[]): DecodedSignal {
    function bitVal(i: number): number {
        return signal[i] < 0.7 ? 1 : 0;
    }
    function bcd(positions: number[], weights: number[]): number {
        let v = 0;
        for (let i = 0; i < positions.length; i++) {
            v += bitVal(positions[i]) * weights[i];
        }
        return v;
    }
    return {
        minute: bcd([1,2,3,4,5,6,7,8], [40,20,10,16,8,4,2,1]),
        hour: bcd([10,11,12,13,14,15,16,17,18], [80,40,20,10,16,8,4,2,1]),
        dayOfYear: bcd([20,21,22,23,24,25,26,27,28,30,31,32,33], [800,400,200,100,160,80,40,20,10,8,4,2,1]),
        year: bcd([41,42,43,44,45,46,47,48], [80,40,20,10,8,4,2,1]),
        weekday: bcd([50,51,52], [4,2,1]),
    };
}
