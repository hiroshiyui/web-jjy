# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web JJY — a browser-based simulator of the Japanese standard time signal JJY. It generates a 13.333kHz square wave via Web Audio API; the 3rd harmonic (~40kHz) synchronizes radio-controlled clocks through speakers/headphones. Deployed via GitHub Pages on the `gh-pages` branch.

## Build & Check Commands

```bash
npm run build      # esbuild: src/jjy.ts → jjy.js (IIFE bundle)
npm run typecheck   # tsc --noEmit (equivalent: npx tsc --noEmit)
```

No test framework is configured. Verify changes with `build` + `typecheck`.

## Key Constraints

- **TypeScript target: ES2015** with `lib: ["ES2015", "DOM"]`. No ES2017+ APIs like `padStart` — use manual alternatives.
- **No runtime dependencies.** The bundle is a self-contained IIFE loaded by `index.html`.
- **`jjy.js` is gitignored.** The built output is not committed.

## Architecture

**Entry point:** `index.html` loads `jjy.js` (bundled from `src/jjy.ts`).

**Signal generation (`src/jjy.ts`):**
- `schedule()` encodes the current time into the JJY 60-second protocol (BCD-encoded minutes, hours, day-of-year, year, weekday, parity bits, leap second, summer time flag)
- `createTone()` creates `OscillatorNode` square waves at 13.333kHz, scheduled precisely via `AudioContext.currentTime`
- Signal is routed through an `AnalyserNode` (for the oscillogram) to `ctx.destination`
- `start()` schedules the first minute and sets a 60-second interval; `stop()` tears down audio

**Oscillogram (`renderOscillogram()` in `src/jjy.ts`):**
- Ring buffer (`oscEnvelope`) stores per-pixel peak amplitude, scrolling right-to-left
- 10-second visible window with second-aligned grid lines and `:SS` labels
- Sub-pixel accumulator for smooth scrolling between frames

**Visualization (upper canvas in `render()`):**
- 60 bars (2 rows × 30) color-coded by signal duration: red = marker (0.2s), yellow = bit-1 (0.5s), green = bit-0 (0.8s)

**i18n (`src/i18n.ts`):**
- Locale JSON files in `src/locales/` (ja, zh-TW), bundled inline by esbuild
- `data-i18n` attributes for text content, `data-i18n-html` for innerHTML
- Persists language preference to `localStorage`

## Commit Style

Write commit messages in Japanese. Follow the existing pattern: concise summary line describing the change.
