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

// Dark theme
baseLayerLuminance.withDefault(StandardLuminance.DarkMode);

// Green accent to match oscillogram
accentBaseColor.withDefault(SwatchRGB.create(0, 0.8, 0.2));
