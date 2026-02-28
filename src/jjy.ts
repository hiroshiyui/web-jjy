import './fluent-setup';
import { t, initI18n } from './i18n';
import { generateSignal } from './signal';

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

const freq = 13333;
let ctx: AudioContext | null;
let signal: number[] | undefined;
let analyser: AnalyserNode | null = null;

const AudioCtx = window.AudioContext || window.webkitAudioContext;

function schedule(date: Date, summer_time: boolean): number[] {
    const now = Date.now();
    const start = date.getTime();
    const offset = (start - now) / 1000 + ctx!.currentTime;
    const sig = generateSignal(date, summer_time);

    for (let i = 0; i < sig.length; i++) {
        const t = i + offset;
        if (t < 0) continue;
        const osc = ctx!.createOscillator();
        osc.type = "square";
        osc.frequency.value = freq;
        osc.start(t);
        osc.stop(t + sig[i]);
        osc.connect(analyser!);
    }

    return sig;
}

let intervalId: ReturnType<typeof setTimeout> | null;
const summer_time_input = document.getElementById("summer-time") as HTMLElement & { checked: boolean };

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
