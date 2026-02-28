import './fluent-setup';
import { t, initI18n } from './i18n';
import { generateSignal, decodeSignal, DecodedSignal, toJSTDate } from './signal';

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

const FREQ = 13333;
const MINUTE_MS = 60 * 1000;
const BARS_PER_ROW = 30;
const BAR_PX = 30;
const BAR_H = 80;
const BAR_ROW_STRIDE = 110;
const BAR_TOP_PAD = 16;

const AudioCtx = window.AudioContext || window.webkitAudioContext;

// --- AudioEngine ---

interface AudioEngine {
    readonly isPlaying: boolean;
    readonly signal: number[] | undefined;
    readonly analyser: AnalyserNode | null;
    start(): void;
    stop(): void;
}

function createAudioEngine(
    getJstMode: () => boolean,
    getSummerTime: () => boolean,
    onSignalChange: (sig: number[] | undefined) => void
): AudioEngine {
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: ReturnType<typeof setTimeout> | null = null;
    let signal: number[] | undefined;
    let playing = false;

    function getDate(dateMs: number): Date {
        const date = new Date(dateMs);
        return getJstMode() ? toJSTDate(date) : date;
    }

    function scheduleMinute(startMs: number): void {
        const now = Date.now();
        const offset = (startMs - now) / 1000 + ctx!.currentTime;
        const sig = generateSignal(getDate(startMs), getSummerTime());

        for (let i = 0; i < sig.length; i++) {
            const startTime = i + offset;
            if (startTime < 0) continue;
            const osc = ctx!.createOscillator();
            osc.type = "square";
            osc.frequency.value = FREQ;
            osc.start(startTime);
            osc.stop(startTime + sig[i]);
            osc.connect(analyser!);
        }

        signal = sig;
        onSignalChange(sig);
    }

    function start(): void {
        ctx = new AudioCtx();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.connect(ctx.destination);

        const now = Date.now();
        let minuteStart = Math.floor(now / MINUTE_MS) * MINUTE_MS;
        const next = minuteStart + MINUTE_MS;
        let delay = next - now - 1000; // 毎分0秒ピッタリの少し前にタイマーをセットする
        if (delay < 0) {
            minuteStart = next;
            delay += MINUTE_MS;
        }
        playing = true;
        scheduleMinute(minuteStart);

        // HACK: timeout発火前にキャンセルする
        intervalId = setTimeout(function() {
            interval();
            intervalId = setInterval(interval, MINUTE_MS);
        }, delay);

        function interval(): void {
            minuteStart += MINUTE_MS;
            scheduleMinute(minuteStart);
        }
    }

    function stop(): void {
        playing = false;
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
        onSignalChange(undefined);
    }

    return {
        get isPlaying() { return playing; },
        get signal() { return signal; },
        get analyser() { return analyser; },
        start,
        stop,
    };
}

// --- OscillogramRenderer ---

const OSC_SECONDS = 10;
const OSC_PAD = 10;

interface OscillogramRenderer {
    reset(): void;
    render(analyser: AnalyserNode | null): void;
}

function createOscillogramRenderer(canvas: HTMLCanvasElement): OscillogramRenderer {
    const oscCtx = canvas.getContext('2d')!;
    const oscW = canvas.width;
    const oscH = canvas.height;
    const pixelsPerSec = oscW / OSC_SECONDS;
    const envelope = new Float32Array(oscW);
    const timeDomain = new Uint8Array(2048);
    let head = 0;
    let lastTime = 0;
    let subPixel = 0;

    function reset(): void {
        head = 0;
        lastTime = 0;
        subPixel = 0;
        envelope.fill(0);
    }

    function render(analyser: AnalyserNode | null): void {
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
            lastTime = 0;
            return;
        }

        // Time delta
        const now = performance.now();
        if (lastTime === 0) {
            lastTime = now;
            return;
        }
        const dt = now - lastTime;
        lastTime = now;

        // Pixel advance with sub-pixel accumulation
        const advance = (dt / 1000) * pixelsPerSec + subPixel;
        const steps = Math.floor(advance);
        subPixel = advance - steps;

        // Peak amplitude from time-domain data
        analyser.getByteTimeDomainData(timeDomain);
        let peak = 0;
        for (let i = 0; i < timeDomain.length; i++) {
            const v = Math.abs(timeDomain[i] - 128) / 128;
            if (v > peak) peak = v;
        }

        // Write into ring buffer
        for (let s = 0; s < steps; s++) {
            envelope[head] = peak;
            head = (head + 1) % oscW;
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
            const x = oscW - fractionalPixels - i * pixelsPerSec - subPixel;
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
        const startIdx = head; // oldest sample
        for (let i = 0; i < oscW; i++) {
            const idx = (startIdx + i) % oscW;
            const amp = envelope[idx];
            const x = i - subPixel;
            const y = OSC_PAD + (1 - amp) * (oscH - 2 * OSC_PAD);
            if (i === 0) {
                oscCtx.moveTo(x, y);
            } else {
                oscCtx.lineTo(x, y);
            }
        }
        oscCtx.stroke();

        // Filled area under curve
        oscCtx.lineTo(oscW, oscH - OSC_PAD);
        oscCtx.lineTo(-subPixel, oscH - OSC_PAD);
        oscCtx.closePath();
        oscCtx.fillStyle = 'rgba(0, 255, 0, 0.15)';
        oscCtx.fill();
    }

    return { reset, render };
}

// --- Frame labels ---

function getWeekdayNames(): string[] {
    return [
        t('weekday_sun'), t('weekday_mon'), t('weekday_tue'),
        t('weekday_wed'), t('weekday_thu'), t('weekday_fri'), t('weekday_sat'),
    ];
}

function getFrameGroups(): { start: number; end: number; label: string }[] {
    return [
        { start: 0, end: 0, label: 'M' },
        { start: 1, end: 8, label: t('frame_minute') },
        { start: 9, end: 9, label: 'P1' },
        { start: 10, end: 18, label: t('frame_hour') },
        { start: 19, end: 19, label: 'P2' },
        { start: 20, end: 28, label: t('frame_yearday') },
        { start: 29, end: 29, label: 'P3' },
        { start: 30, end: 33, label: t('frame_yearday') },
        { start: 34, end: 35, label: '0' },
        { start: 36, end: 36, label: 'PA1' },
        { start: 37, end: 37, label: 'PA2' },
        { start: 38, end: 38, label: 'SU1' },
        { start: 39, end: 39, label: 'P4' },
        { start: 40, end: 40, label: 'SU2' },
        { start: 41, end: 48, label: t('frame_year') },
        { start: 49, end: 49, label: 'P5' },
        { start: 50, end: 52, label: t('frame_weekday') },
        { start: 53, end: 54, label: 'LS' },
        { start: 55, end: 58, label: '0' },
        { start: 59, end: 59, label: 'P0' },
    ];
}

// --- Main wiring ---

const summer_time_input = document.getElementById("summer-time") as HTMLElement & { checked: boolean };
const jst_mode_input = document.getElementById("jst-mode") as HTMLElement & { checked: boolean };
const control_button = document.getElementById("control-button")!;
const nowtime = document.getElementById('time')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx2d = canvas.getContext('2d')!;
const w = canvas.width;
const h = canvas.height;

const oscCanvas = document.getElementById('oscillogram') as HTMLCanvasElement;
const oscRenderer = createOscillogramRenderer(oscCanvas);

// Cache decoded signal (signal changes once per minute, render runs at 60fps)
let lastSignalRef: number[] | undefined;
let decodedSignal: DecodedSignal | undefined;

const engine = createAudioEngine(
    () => jst_mode_input.checked,
    () => summer_time_input.checked,
    () => {
        lastSignalRef = undefined;
        decodedSignal = undefined;
    }
);

control_button.addEventListener('click', function() {
    if (engine.isPlaying) {
        control_button.textContent = t("btn_start");
        control_button.setAttribute('data-i18n', 'btn_start');
        engine.stop();
    } else {
        control_button.textContent = t("btn_stop");
        control_button.setAttribute('data-i18n', 'btn_stop');
        engine.start();
        oscRenderer.reset();
    }
});

function restart(): void {
    if (engine.isPlaying) {
        engine.stop();
        engine.start();
        oscRenderer.reset();
    }
}
jst_mode_input.addEventListener('change', restart);
summer_time_input.addEventListener('change', restart);

// --- Render loop ---

render();
function render(): void {
    if (jst_mode_input.checked) {
        const jst = toJSTDate(new Date());
        const Y = jst.getFullYear();
        const M = String(jst.getMonth() + 1).padStart(2, '0');
        const D = String(jst.getDate()).padStart(2, '0');
        const hh = String(jst.getHours()).padStart(2, '0');
        const mm = String(jst.getMinutes()).padStart(2, '0');
        const ss = String(jst.getSeconds()).padStart(2, '0');
        nowtime.innerText = `${Y}-${M}-${D} ${hh}:${mm}:${ss} JST`;
    } else {
        nowtime.innerText = new Date().toString();
    }

    const signal = engine.signal;
    ctx2d.clearRect(0, 0, w, h);
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
            const barY = BAR_TOP_PAD + Math.floor(i / BARS_PER_ROW) * BAR_ROW_STRIDE;
            ctx2d.fillRect((i % BARS_PER_ROW) * BAR_PX, barY, BAR_PX * signal[i], BAR_H);
        }

        // Group labels
        ctx2d.font = '10px sans-serif';
        ctx2d.fillStyle = '#aaa';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'top';
        for (const g of getFrameGroups()) {
            const row = Math.floor(g.start / BARS_PER_ROW);
            const labelY = row === 0 ? 2 : BAR_ROW_STRIDE + 2;
            const s = g.start % BARS_PER_ROW;
            const e = g.end % BARS_PER_ROW;
            const centerX = ((s + e) / 2) * BAR_PX + BAR_PX / 2;
            ctx2d.fillText(g.label, centerX, labelY);
        }

        // Position indices
        ctx2d.font = '8px monospace';
        ctx2d.fillStyle = '#666';
        for (let i = 0; i < 60; i++) {
            const row = Math.floor(i / BARS_PER_ROW);
            const indexY = BAR_TOP_PAD + BAR_H + 2 + row * BAR_ROW_STRIDE;
            const x = (i % BARS_PER_ROW) * BAR_PX + BAR_PX / 2;
            ctx2d.fillText(String(i), x, indexY);
        }

        // Decoded summary (cached)
        if (signal !== lastSignalRef) {
            lastSignalRef = signal;
            decodedSignal = decodeSignal(signal);
        }
        const decoded = decodedSignal!;
        const weekdayNames = getWeekdayNames();
        const summary = t('decoded_summary')
            .replace('{hour}', String(decoded.hour).padStart(2, '0'))
            .replace('{minute}', String(decoded.minute).padStart(2, '0'))
            .replace('{dayOfYear}', String(decoded.dayOfYear))
            .replace('{weekday}', weekdayNames[decoded.weekday])
            .replace('{fullYear}', String(2000 + decoded.year));
        ctx2d.font = '14px sans-serif';
        ctx2d.fillStyle = '#ccc';
        ctx2d.textAlign = 'left';
        ctx2d.textBaseline = 'top';
        ctx2d.fillText(summary, 4, 230);

        ctx2d.textAlign = 'start';
    }

    oscRenderer.render(engine.analyser);

    requestAnimationFrame(render);
}

initI18n();
