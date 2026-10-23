/** Conversão de um valor CSS normalizado para o formato DTCG 2025.10 (`$type` + `$value`). */

import { cubicBezierOf, parseLength, parseShadow, splitFontFamilies } from '../../values/normalize.ts';
import { colorInfo } from '../../values/color-info.ts';
import type { ShadowLayer } from '../../values/normalize.ts';
import type { TokenType } from '../../types.ts';

/** Valor e `$type` de um token no formato DTCG. Unidade que o DTCG não aceita (`em`, `%`) vira `number` + unidade na extensão. */
export function dtcgValueOf(type: TokenType, key: string): { $type?: string; $value: unknown; unit?: string } {
    switch (type) {
        case 'color':
            return { $type: 'color', $value: dtcgColor(key) ?? key };
        case 'font-family': {
            const families = splitFontFamilies(key);
            return { $type: 'fontFamily', $value: families.length === 1 ? families[0] : families };
        }
        case 'font-weight':
            return { $type: 'fontWeight', $value: Number.isFinite(Number(key)) ? Number(key) : key };
        case 'opacity':
        case 'z-index':
            return { $type: 'number', $value: Number(key) };
        case 'duration':
            return { $type: 'duration', $value: { value: Number(key.replace(/ms$/, '')), unit: 'ms' } };
        case 'easing': {
            const bezier = cubicBezierOf(key);
            return bezier ? { $type: 'cubicBezier', $value: bezier } : { $value: key };
        }
        case 'shadow': {
            const layers = parseShadow(key)?.map(dtcgShadowLayer);
            if (!layers || layers.some((layer) => layer === undefined)) {
                return { $value: key };
            }
            return { $type: 'shadow', $value: layers.length === 1 ? layers[0] : layers };
        }
        case 'line-height':
            if (parseLength(key)?.unit === '') {
                return { $type: 'number', $value: Number(key) };
            }
            return dtcgDimension(key);
        default:
            return dtcgDimension(key);
    }
}

function dtcgDimension(key: string): { $type?: string; $value: unknown; unit?: string } {
    const length = parseLength(key);
    if (!length) {
        return { $value: key };
    }
    if (length.unit === 'px' || length.unit === 'rem' || (length.unit === '' && length.value === 0)) {
        return { $type: 'dimension', $value: { value: length.value, unit: length.unit || 'px' } };
    }
    return { $type: 'number', $value: length.value, unit: length.unit };
}

/** Cor no formato 2025.10: `{ colorSpace, components, alpha?, hex }`. Fora do sRGB, fica em OKLCH. */
function dtcgColor(key: string): Record<string, unknown> | undefined {
    const info = colorInfo(key);
    if (!info) {
        return undefined;
    }
    const alpha = info.alpha < 1 ? { alpha: info.alpha } : {};
    if (info.wideGamut) {
        const [l, c, h] = info.oklch;
        return { colorSpace: 'oklch', components: [roundToFourDecimals(l), roundToFourDecimals(c), Number.isNaN(h) ? 'none' : roundToFourDecimals(h)], ...alpha };
    }
    return { colorSpace: 'srgb', components: info.srgb.map(roundToFourDecimals), ...alpha, hex: info.hex!.slice(0, 7) };
}

function dtcgShadowLayer(layer: ShadowLayer): Record<string, unknown> | undefined {
    const parts = [layer.offsetX, layer.offsetY, layer.blur, layer.spread].map((p) => dtcgDimension(p === '0' ? '0px' : p));
    const color = dtcgColor(layer.color);
    if (parts.some((p) => p.$type !== 'dimension') || !color) {
        return undefined;
    }
    const [offsetX, offsetY, blur, spread] = parts.map((p) => p.$value);
    return { color, offsetX, offsetY, blur, spread, ...(layer.inset ? { inset: true } : {}) };
}

function roundToFourDecimals(n: number): number {
    return Math.round(n * 10000) / 10000;
}
