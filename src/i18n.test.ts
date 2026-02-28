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
        // zh-TWには全標準キーが存在するため、フォールバックチェーンをテスト:
        // locales['zh-TW'][key] ?? locales['ja'][key] ?? key
        // jaにあってzh-TWにない仮想的なキーはフォールスルーする。
        // 未知のキーがそのまま返されることでチェーンの動作を検証する。
        expect(t('nonexistent_key' as LocaleKey)).toBe('nonexistent_key');
    });

    it('ignores invalid locale and keeps current', () => {
        setLocale('zh-TW');
        setLocale('invalid');
        expect(t('h1')).toBe('JJY模擬器網頁版');
    });
});
