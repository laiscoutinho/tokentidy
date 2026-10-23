/** Cores: interpreta qualquer grafia CSS de cor (canais sRGB, opacidade, OKLCH) e escreve a forma única. */

import { tokenize } from '@csstools/css-tokenizer';
import { parseComponentValue } from '@csstools/css-parser-algorithms';
import { color, colorDataFitsRGB_Gamut, serializeOKLCH, serializeRGB } from '@csstools/css-color-parser';
import type { ColorData } from '@csstools/css-color-parser';

/** Cor como o projeto a interpretaria: canais sRGB (0–255), opacidade e coordenadas OKLCH. */
export interface ColorInfo {
    /** `#rrggbb` ou `#rrggbbaa`; ausente quando a cor está fora do sRGB. */
    hex?: string;
    /** sRGB de 0 a 1, para o DTCG. */
    srgb: [number, number, number];
    alpha: number;
    /** OKLCH: luminosidade (0–1), croma e matiz em graus (`NaN` em cinzas). Base para dar nome à cor. */
    oklch: [number, number, number];
    /** Fora do sRGB (ex.: `oklch()` muito saturado): o valor fica em `oklch()` para não perder precisão. */
    wideGamut: boolean;
}

function parseColorData(value: string): ColorData | undefined {
    const node = parseComponentValue(tokenize({ css: value.trim() }));
    return (node && color(node)) || undefined;
}

/** Interpreta uma cor CSS. `undefined` se não for uma cor fixa (`currentColor`, `var()`). */
export function colorInfo(value: string): ColorInfo | undefined {
    const data = parseColorData(value);
    if (!data) {
        return undefined;
    }
    const rgb = numbersIn(serializeRGB(data).toString());
    const oklch = numbersIn(serializeOKLCH(data).toString());
    const alpha = Math.round(Math.min(1, Math.max(0, Number.isFinite(data.alpha) ? (data.alpha as number) : 1)) * 1000) / 1000;
    const wideGamut = !colorDataFitsRGB_Gamut(data);
    const channels = [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0] as const;
    const info: ColorInfo = {
        srgb: [channels[0] / 255, channels[1] / 255, channels[2] / 255],
        alpha,
        oklch: [oklch[0] ?? 0, oklch[1] ?? 0, oklch[2] ?? Number.NaN],
        wideGamut,
    };
    if (!wideGamut) {
        const hex = channels.map((c) => c.toString(16).padStart(2, '0')).join('');
        // Opacidade em hex tem 256 níveis: arredonda para o mais próximo, como o navegador
        info.hex = alpha < 1 ? `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : `#${hex}`;
    }
    return info;
}

/** Números de uma cor serializada (`rgb(255, 0, 0)`, `oklch(0.6 0.2 30 / 0.5)`); `NaN` vira NaN. */
function numbersIn(serialized: string): number[] {
    return (serialized.match(/-?[\d.]+(?:e-?\d+)?|NaN/gi) ?? []).map(Number);
}

/**
 * Cor no sRGB vira hex completo em minúsculas (`#FFF`, `white` e `rgb(255 255 255)` → `#ffffff`):
 * é a grafia mais comum em projetos e a que o DTCG usa no campo `hex`.
 * Cor fora do sRGB vira `oklch()`, para não perder precisão.
 */
export function normalizeColor(value: string): string {
    const data = parseColorData(value);
    if (!data) {
        return value.trim().toLowerCase();
    }
    const info = colorInfo(value)!;
    return info.hex ?? serializeOKLCH(data).toString();
}
