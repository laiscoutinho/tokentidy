/** Família de matiz de uma cor (`red`, `indigo`, `gray`), pela cor mais próxima da paleta do Tailwind. */

import { PALETTE } from './palette.ts';

/** Famílias neutras do Tailwind (cinzas levemente tingidos): no nome do token, todas são `gray`. */
const NEUTRAL_FAMILIES = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);
/** Paleta em OKLab (a, b cartesianos), onde a distância euclidiana é a diferença de cor percebida (ΔE OK). */
const PALETTE_OKLAB = [...PALETTE].flatMap(([family, steps]) => steps.map((oklch) => ({ family, lab: oklabOf(oklch) })));
/** Abaixo deste croma, nos extremos de luminosidade, a cor é branco ou preto. */
const GRAY_CHROMA = 0.02;

/**
 * Família de uma cor pelas coordenadas OKLCH (luminosidade, croma, matiz): a da cor mais próxima da paleta
 * do Tailwind v4. `#111827` (croma 0.034, matiz azulada) é o `gray-900` do Tailwind, e vira `gray`, não `blue`.
 */
export function familyOf(oklch: readonly [number, number, number]): string {
    const [lightness, chroma, hue] = oklch;
    if (chroma < GRAY_CHROMA || Number.isNaN(hue)) {
        if (lightness >= 0.999) {
            return 'white';
        }
        if (lightness <= 0.001) {
            return 'black';
        }
    }
    const lab = oklabOf(oklch);
    let best = PALETTE_OKLAB[0]!;
    let bestDistance = Infinity;
    for (const entry of PALETTE_OKLAB) {
        const distance = Math.hypot(lab[0] - entry.lab[0], lab[1] - entry.lab[1], lab[2] - entry.lab[2]);
        if (distance < bestDistance) {
            best = entry;
            bestDistance = distance;
        }
    }
    return NEUTRAL_FAMILIES.has(best.family) ? 'gray' : best.family;
}

function oklabOf([lightness, chroma, hue]: readonly [number, number, number]): [number, number, number] {
    // Sem matiz (cinza puro), a e b são zero
    const radians = Number.isNaN(hue) ? 0 : (hue * Math.PI) / 180;
    return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}
