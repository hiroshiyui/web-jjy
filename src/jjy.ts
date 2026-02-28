import { t, initI18n } from './i18n';

export {};

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

const freq = 13333;
const MARKER_DURATION = 0.2;
const BIT_HIGH_DURATION = 0.5;
const BIT_LOW_DURATION = 0.8;
let ctx: AudioContext | null;
let signal: number[] | undefined;
let analyser: AnalyserNode | null = null;

const AudioCtx = window.AudioContext || window.webkitAudioContext;

// うるう秒挿入日一覧(日本時)
const plus_leapsecond_list: Date[] = [
    new Date(2017, 0, 1, 9)
];

// うるう秒 +1:一ヶ月以内に挿入 -1:一ヶ月以内に削除
function getleapsecond(): number {
    const now = Date.now();
    for (let i = 0; i < plus_leapsecond_list.length; i++) {
        const diff = plus_leapsecond_list[i].getTime() - now;
        if (diff > 0 && diff <= 31*24*60*60*1000) {
            return 1;
        }
    }
    return 0;
}

function schedule(date: Date, summer_time: boolean): number[] {
    const now = Date.now();
    const start = date.getTime();
    const offset = (start - now) / 1000 + ctx!.currentTime;
    let minute = date.getMinutes();
    let hour = date.getHours();
    const fullyear = date.getFullYear();
    let year = fullyear % 100;
    let week_day = date.getDay();
    let year_day = (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (24*60*60*1000) + 1;
    const array: number[] = [];
    const leapsecond = getleapsecond();

    function createTone(startTime: number, duration: number): void {
        const osc = ctx!.createOscillator();
        osc.type = "square";
        osc.frequency.value = freq;
        osc.start(startTime);
        osc.stop(startTime + duration);
        osc.connect(analyser!);
    }

    // 毎分s秒の位置のマーカーを出力する
    function marker(s: number): void {
        array.push(MARKER_DURATION);
        const t = s + offset;
        if (t < 0) return;
        createTone(t, MARKER_DURATION);
    }

    // パリティービット
    let pa = 0;

    // bitを出力し、パリティビットを更新する
    function bit(s: number, value: number, weight: number): number {
        const b = value >= weight;
        value -= b ? weight : 0;
        pa += b ? 1 : 0;
        const duration = b ? BIT_HIGH_DURATION : BIT_LOW_DURATION;
        array.push(duration);
        const t = s + offset;
        if (t < 0) return value;
        createTone(t, duration);
        return value;
    }

    // BCD encode a value starting at startSecond with given weights
    function encodeBCD(startSecond: number, value: number, weights: number[]): number {
        for (let i = 0; i < weights.length; i++) {
            value = bit(startSecond + i, value, weights[i]);
        }
        return value;
    }

    marker(0); // マーカー(M)

    // 分
    pa = 0;
    minute = encodeBCD(1, minute, [40, 20, 10, 16, 8, 4, 2, 1]);
    const pa2 = pa;

    marker(9); // P1

    // 時
    pa = 0;
    hour = encodeBCD(10, hour, [80, 40, 20, 10, 16, 8, 4, 2, 1]);
    const pa1 = pa;

    marker(19); // P2

    // 1月1日からの通算日
    year_day = encodeBCD(20, year_day, [800, 400, 200, 100, 160, 80, 40, 20, 10]);

    marker(29); // P3

    year_day = encodeBCD(30, year_day, [8, 4, 2, 1]);

    bit(34, 0, 1); // 0
    bit(35, 0, 1); // 0
    bit(36, pa1 % 2, 1);
    bit(37, pa2 % 2, 1);
    bit(38, 0, 1); // SU1

    marker(39); // P4

    // SU2
    if (summer_time) {
        bit(40, 1, 1);
    } else {
        // 夏時間実施中（６日以内に夏時間から通常時間への変更なし）
        bit(40, 0, 1);
    }

    // 年
    year = encodeBCD(41, year, [80, 40, 20, 10, 8, 4, 2, 1]);

    marker(49); // P5

    // 曜日
    week_day = encodeBCD(50, week_day, [4, 2, 1]);

    // うるう秒
    if (leapsecond === 0) {
        // うるう秒なし
        bit(53, 0, 1); // 0
        bit(54, 0, 1); // 0
    } else if (leapsecond > 0) {
        // 正のうるう秒
        bit(53, 1, 1); // 1
        bit(54, 1, 1); // 1
    } else {
        // 負のうるう秒
        bit(53, 1, 1); // 1
        bit(54, 0, 1); // 0
    }

    bit(55, 0, 1); // 0
    bit(56, 0, 1); // 0
    bit(57, 0, 1); // 0
    bit(58, 0, 1); // 0

    marker(59); // P0

    return array;
}

let intervalId: ReturnType<typeof setTimeout> | null;
const summer_time_input = document.getElementById("summer-time") as HTMLInputElement;

function start(): void {
    ctx = new AudioCtx();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.connect(ctx.destination);

    // Reset oscillogram state
    oscHead = 0;
    oscLastTime = 0;
    oscSubPixel = 0;
    oscEnvelope.fill(0);
    const now = Date.now();
    let t = Math.floor(now / (60 * 1000)) * 60 * 1000;
    const next = t + 60 * 1000;
    let delay = next - now - 1000; // 毎分0秒ピッタリの少し前にタイマーをセットする
    if (delay < 0) {
        t = next;
        delay += 60 * 1000;
    }
    signal = schedule(new Date(t), summer_time_input.checked);

    // HACK: timeout発火前にキャンセルする
    intervalId = setTimeout(function() {
        interval();
        intervalId = setInterval(interval, 60 * 1000);
    }, delay);

    function interval(): void {
        t += 60 * 1000;
        signal = schedule(new Date(t), summer_time_input.checked);
    }
}

function stop(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    if (ctx) {
        ctx.close();
        ctx = null;
    }
    analyser = null;
    signal = undefined;
}

const control_button = document.getElementById("control-button")!;
let play_flag = false;

control_button.addEventListener('click', function() {
    if (play_flag) {
        control_button.textContent = t("btn_start");
        control_button.setAttribute('data-i18n', 'btn_start');
        play_flag = false;
        stop();
    } else {
        control_button.textContent = t("btn_stop");
        control_button.setAttribute('data-i18n', 'btn_stop');
        play_flag = true;
        start();
    }
});

const nowtime = document.getElementById('time')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx2d = canvas.getContext('2d')!;
const w = canvas.width;

const oscCanvas = document.getElementById('oscillogram') as HTMLCanvasElement;
const oscCtx = oscCanvas.getContext('2d')!;
const oscW = oscCanvas.width;
const oscH = oscCanvas.height;
const OSC_SECONDS = 10;
const oscEnvelope = new Float32Array(oscW);
let oscHead = 0;
let oscLastTime = 0;
let oscSubPixel = 0;
const oscTimeDomain = new Uint8Array(2048);

function renderOscillogram(): void {
    const pad = 10;
    const pixelsPerSec = oscW / OSC_SECONDS;

    // Background
    oscCtx.fillStyle = '#111';
    oscCtx.fillRect(0, 0, oscW, oscH);

    if (!analyser) {
        // Stopped: flat green center line
        oscCtx.strokeStyle = '#00FF00';
        oscCtx.lineWidth = 2;
        oscCtx.beginPath();
        oscCtx.moveTo(0, oscH / 2);
        oscCtx.lineTo(oscW, oscH / 2);
        oscCtx.stroke();
        oscLastTime = 0;
        return;
    }

    // Time delta
    const now = performance.now();
    if (oscLastTime === 0) {
        oscLastTime = now;
        return;
    }
    const dt = now - oscLastTime;
    oscLastTime = now;

    // Pixel advance with sub-pixel accumulation
    const advance = (dt / 1000) * pixelsPerSec + oscSubPixel;
    const steps = Math.floor(advance);
    oscSubPixel = advance - steps;

    // Peak amplitude from time-domain data
    analyser.getByteTimeDomainData(oscTimeDomain);
    let peak = 0;
    for (let i = 0; i < oscTimeDomain.length; i++) {
        const v = Math.abs(oscTimeDomain[i] - 128) / 128;
        if (v > peak) peak = v;
    }

    // Write into ring buffer
    for (let s = 0; s < steps; s++) {
        oscEnvelope[oscHead] = peak;
        oscHead = (oscHead + 1) % oscW;
    }

    // Compute time offset for grid alignment
    // The rightmost pixel represents "now"
    const nowSec = Date.now() / 1000;
    const fractionalSec = nowSec % 1;
    const fractionalPixels = fractionalSec * pixelsPerSec;

    // Draw vertical grid lines every second
    oscCtx.strokeStyle = '#333';
    oscCtx.lineWidth = 1;
    oscCtx.font = '10px monospace';
    oscCtx.fillStyle = '#555';
    const nowSecOfMinute = Math.floor(nowSec) % 60;
    for (let i = 0; i <= OSC_SECONDS; i++) {
        const x = oscW - fractionalPixels - i * pixelsPerSec - oscSubPixel;
        if (x < 0 || x > oscW) continue;
        oscCtx.beginPath();
        oscCtx.moveTo(x, 0);
        oscCtx.lineTo(x, oscH);
        oscCtx.stroke();
        // Second label
        const secLabel = ((nowSecOfMinute - i) % 60 + 60) % 60;
        oscCtx.fillText(':' + (secLabel < 10 ? '0' : '') + secLabel, x + 3, oscH - 3);
    }

    // Horizontal center reference line
    oscCtx.strokeStyle = '#333';
    oscCtx.beginPath();
    oscCtx.moveTo(0, oscH / 2);
    oscCtx.lineTo(oscW, oscH / 2);
    oscCtx.stroke();

    // Draw envelope line (oldest to newest, right edge is newest)
    oscCtx.strokeStyle = '#00FF00';
    oscCtx.lineWidth = 2;
    oscCtx.beginPath();
    const startIdx = oscHead; // oldest sample
    for (let i = 0; i < oscW; i++) {
        const idx = (startIdx + i) % oscW;
        const amp = oscEnvelope[idx];
        const x = i - oscSubPixel;
        const y = pad + (1 - amp) * (oscH - 2 * pad);
        if (i === 0) {
            oscCtx.moveTo(x, y);
        } else {
            oscCtx.lineTo(x, y);
        }
    }
    oscCtx.stroke();

    // Filled area under curve
    oscCtx.lineTo(oscW, oscH - pad);
    oscCtx.lineTo(-oscSubPixel, oscH - pad);
    oscCtx.closePath();
    oscCtx.fillStyle = 'rgba(0, 255, 0, 0.15)';
    oscCtx.fill();
}

render();
function render(): void {
    nowtime.innerText = new Date().toString();

    ctx2d.clearRect(0, 0, w, canvas.height);
    if (signal) {
        const now = Math.floor(Date.now() / 1000) % 60;
        for (let i = 0; i < signal.length; i++) {
            if (i === now) {
                if (signal[i] < 0.3) ctx2d.fillStyle = "#FF0000";
                else if (signal[i] < 0.7) ctx2d.fillStyle = "#FFFF00";
                else ctx2d.fillStyle = "#00FF00";
            } else {
                if (signal[i] < 0.3) ctx2d.fillStyle = "#7F0000";
                else if (signal[i] < 0.7) ctx2d.fillStyle = "#7F7F00";
                else ctx2d.fillStyle = "#007F00";
            }
            ctx2d.fillRect((i%30)*30, Math.floor(i/30)*100, 30 * signal[i], 80);
        }
    }

    renderOscillogram();

    requestAnimationFrame(render);
}

initI18n();
