import ja from './locales/ja.json';
import zhTW from './locales/zh-TW.json';

type Translations = Record<string, string>;

const locales: Record<string, Translations> = {
    ja,
    'zh-TW': zhTW,
};

let currentLocale = 'ja';

export function t(key: string): string {
    return locales[currentLocale]?.[key] ?? locales['ja'][key] ?? key;
}

function applyTranslations(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n')!;
        const value = t(key);
        if (el.tagName === 'TITLE') {
            document.title = value;
        } else {
            el.textContent = value;
        }
    });

    document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
        const key = el.getAttribute('data-i18n-html')!;
        el.innerHTML = t(key);
    });

    document.documentElement.lang = currentLocale;
}

export function setLocale(locale: string): void {
    if (!locales[locale]) return;
    currentLocale = locale;
    localStorage.setItem('locale', locale);
    applyTranslations();
}

export function initI18n(): void {
    const saved = localStorage.getItem('locale');
    if (saved && locales[saved]) {
        currentLocale = saved;
    } else {
        const browserLang = navigator.language;
        if (browserLang.startsWith('zh')) {
            currentLocale = 'zh-TW';
        } else {
            currentLocale = 'ja';
        }
    }

    applyTranslations();

    const select = document.getElementById('lang-select') as HTMLSelectElement | null;
    if (select) {
        select.value = currentLocale;
        select.addEventListener('change', () => {
            setLocale(select.value);
        });
    }
}
