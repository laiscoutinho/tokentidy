/**
 * Leitura de arquivos de tokens no formato DTCG (Design Tokens Community Group, W3C):
 * `{ "color": { "primary": { "$type": "color", "$value": "#4f46e5" } } }`.
 * Cada token vira uma definição, com o valor em texto CSS, para ser comparada com os valores do código.
 */

import { createPositionLookup } from './position.ts';
import type { AnalysisError, TokenDefinition } from '../types.ts';
import { offsetAt } from './collector.ts';

export function parseDtcg(source: string, file: string): { definitions: TokenDefinition[]; errors: AnalysisError[] } {
    const positionOf = createPositionLookup(source);
    let json: unknown;
    try {
        json = JSON.parse(source);
    } catch (error) {
        // O Node informa a posição no fim da mensagem: `... (line 3 column 5)`
        const match = /line (\d+) column (\d+)/.exec((error as Error).message);
        const offset = match ? offsetAt(source, Number(match[1]), Number(match[2])) : 0;
        return { definitions: [], errors: [{ file, ...positionOf(offset), message: (error as Error).message }] };
    }

    const definitions: TokenDefinition[] = [];
    // Posição aproximada de cada token: procura a chave depois da posição do grupo pai
    const walk = (node: unknown, trail: string[], inheritedType: string | undefined, from: number): void => {
        if (typeof node !== 'object' || node === null || Array.isArray(node)) {
            return;
        }
        const group = node as Record<string, unknown>;
        const type = typeof group['$type'] === 'string' ? group['$type'] : inheritedType;
        if ('$value' in group) {
            const value = cssValueOf(group['$value'], type);
            if (value !== undefined) {
                definitions.push({
                    name: trail.join('.'), syntax: 'dtcg', value, file, ...positionOf(from),
                    ...(type ? { dtcgType: type } : {}),
                });
            }
            return;
        }
        for (const [key, child] of Object.entries(group)) {
            if (key.startsWith('$')) {
                continue;
            }
            const at = source.indexOf(JSON.stringify(key), from);
            walk(child, [...trail, key], type, at === -1 ? from : at);
        }
    };
    walk(json, [], undefined, 0);
    return { definitions, errors: [] };
}

/** Valor DTCG em texto CSS. Referências (`{color.blue.500}`) ficam como estão: são aliases. */
export function cssValueOf(value: unknown, type: string | undefined): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (Array.isArray(value)) {
        if (type === 'cubicBezier' && value.length === 4) {
            return `cubic-bezier(${value.join(', ')})`;
        }
        if (type === 'shadow') {
            const layers = value.map((layer) => cssValueOf(layer, type));
            return layers.every((layer) => layer !== undefined) ? layers.join(', ') : undefined;
        }
        return value.map((item) => (typeof item === 'string' && /\s/.test(item) ? `"${item}"` : String(item))).join(', ');
    }
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const object = value as Record<string, unknown>;
    // Cor (formato 2025.10): `{ colorSpace, components, alpha?, hex? }`
    if ('colorSpace' in object && Array.isArray(object['components'])) {
        return colorToCss(object);
    }
    // Medida e duração: `{ value: 16, unit: 'px' }`
    if (typeof object['value'] === 'number' && typeof object['unit'] === 'string') {
        return `${object['value']}${object['unit']}`;
    }
    if (type === 'shadow') {
        const part = (key: string) => cssValueOf(object[key], 'dimension');
        const parts = [object['inset'] === true ? 'inset' : undefined, part('offsetX'), part('offsetY'), part('blur'), part('spread'), cssValueOf(object['color'], 'color')];
        return parts.filter((p) => p !== undefined).join(' ');
    }
    return undefined;
}

function colorToCss(color: Record<string, unknown>): string | undefined {
    if (typeof color['hex'] === 'string' && (color['alpha'] === undefined || color['alpha'] === 1)) {
        return color['hex'];
    }
    const components = (color['components'] as unknown[]).map((c) => (c === 'none' ? 'none' : Number(c)));
    const alpha = typeof color['alpha'] === 'number' && color['alpha'] < 1 ? ` / ${color['alpha']}` : '';
    switch (color['colorSpace']) {
        case 'srgb':
            return `rgb(${components.map((c) => (typeof c === 'number' ? Math.round(c * 255) : c)).join(' ')}${alpha})`;
        case 'oklch':
        case 'oklab':
        case 'lab':
        case 'lch':
        case 'hsl':
        case 'hwb':
            return `${color['colorSpace']}(${components.join(' ')}${alpha})`;
        default:
            return typeof color['colorSpace'] === 'string' ? `color(${color['colorSpace']} ${components.join(' ')}${alpha})` : undefined;
    }
}
