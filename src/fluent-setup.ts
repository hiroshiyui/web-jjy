import {
    provideFluentDesignSystem,
    fluentButton,
    fluentSelect,
    fluentOption,
    fluentSwitch,
    fluentAccordion,
    fluentAccordionItem,
    fluentCard,
    fluentDivider,
    baseLayerLuminance,
    StandardLuminance,
    accentBaseColor,
    SwatchRGB,
} from '@fluentui/web-components';

provideFluentDesignSystem().register(
    fluentButton(),
    fluentSelect(),
    fluentOption(),
    fluentSwitch(),
    fluentAccordion(),
    fluentAccordionItem(),
    fluentCard(),
    fluentDivider()
);

// ダークテーマ
baseLayerLuminance.withDefault(StandardLuminance.DarkMode);

// オシロスコープに合わせた緑のアクセントカラー
accentBaseColor.withDefault(SwatchRGB.create(0, 0.8, 0.2));
