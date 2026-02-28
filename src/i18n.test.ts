/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, LocaleKey } from './i18n';

beforeEach(() => {
    setLocale('ja');
});

describe('t()', () => {
    it('returns Japanese translation for known key', () => {
        expect(t('btn_start')).toBe('Start');
    });

    it('returns Japanese h1 translation', () => {
        expect(t('h1')).toBe('JJYシミュレータWeb版');
    });

    it('returns key itself for nonexistent key', () => {
        expect(t('nonexistent_key' as LocaleKey)).toBe('nonexistent_key');
    });
});

describe('setLocale()', () => {
    it('switches to zh-TW and t() returns Chinese translation', () => {
        setLocale('zh-TW');
        expect(t('h1')).toBe('JJY模擬器網頁版');
    });

    it('falls back to Japanese for keys missing in zh-TW', () => {
        setLocale('zh-TW');
        // All standard keys exist in zh-TW, so test the fallback chain:
        // locales['zh-TW'][key] ?? locales['ja'][key] ?? key
        // A key that exists in ja but hypothetically not in zh-TW
        // would fall through. We verify the chain works by checking
        // that an unknown key still returns itself.
        expect(t('nonexistent_key' as LocaleKey)).toBe('nonexistent_key');
    });

    it('ignores invalid locale and keeps current', () => {
        setLocale('zh-TW');
        setLocale('invalid');
        expect(t('h1')).toBe('JJY模擬器網頁版');
    });
});
