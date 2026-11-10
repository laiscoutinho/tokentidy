/**
 * Sugestão por proximidade: nenhum token tem o valor exato, mas um quase tem.
 * É só informativa. Valor parecido não quer dizer a mesma decisão de design, então quem troca é a pessoa.
 */

import type { Candidate, TokenIndex } from '../token-lookup.ts';
import type { Finding, TokenSuggestion, TokenType } from '../types.ts';
import { colorInfo } from '../values/color-info.ts';
import { lengthInPx, normalizeFinding } from '../values/normalize.ts';

/** ΔEOK abaixo disto é uma diferença difícil de ver. */
const COLOR_NEAR = 0.02;
/** Diferença de opacidade que deixa de ser "a mesma cor". */
const ALPHA_NEAR = 0.01;
const MEASURE_TYPES = new Set<TokenType>(['spacing', 'size', 'radius', 'container', 'font-size']);

export interface NearOptions {
    gridBase: number;
    rootFontSize?: number;
}

export function nearSuggestion(finding: Finding, index: TokenIndex, options: NearOptions): TokenSuggestion | undefined {
    const candidates = index.ofType(finding.type).filter((c) => c.source !== 'alias' && fitsHost(c, finding));
    if (finding.type === 'color') {
        return nearColor(finding, candidates);
    }
    return MEASURE_TYPES.has(finding.type) ? nearMeasure(finding, candidates, options) : undefined;
}

function fitsHost(candidate: Candidate, finding: Finding): boolean {
    if (finding.host === 'js-value' || finding.host === 'svg-attribute' || candidate.scope || candidate.form === 'js-theme') {
        return false;
    }
    if (candidate.form === 'custom-property') {
        return true;
    }
    return candidate.form === 'less' ? finding.host === 'less' : finding.host === 'scss' || finding.host === 'sass';
}

function nearColor(finding: Finding, candidates: readonly Candidate[]): TokenSuggestion | undefined {
    const color = colorInfo(finding.value);
    if (!color) {
        return undefined;
    }
    let best: { candidate: Candidate; distance: number } | undefined;
    for (const candidate of candidates) {
        const other = colorInfo(candidate.key);
        if (!other || Math.abs(other.alpha - color.alpha) > ALPHA_NEAR) {
            continue;
        }
        const distance = deltaEOK(color.oklch, other.oklch);
        // Os candidatos vêm do mais usado para o menos: em empate fica o primeiro
        if (distance > 0 && distance <= COLOR_NEAR && (!best || distance < best.distance)) {
            best = { candidate, distance };
        }
    }
    return best && { token: best.candidate.name, match: 'near', distance: Number(best.distance.toFixed(4)) };
}

/** Distância em OKLab: `L` igual e `a`/`b` a partir do croma e do matiz. Cinza não tem matiz (`NaN` vira 0). */
export function deltaEOK(a: readonly [number, number, number], b: readonly [number, number, number]): number {
    const lab = ([l, c, h]: readonly [number, number, number]) => {
        const radians = (Number.isNaN(h) ? 0 : h) * Math.PI / 180;
        return [l, c * Math.cos(radians), c * Math.sin(radians)] as const;
    };
    const [la, aa, ba] = lab(a);
    const [lb, ab, bb] = lab(b);
    return Math.hypot(la - lb, aa - ab, ba - bb);
}

/** Só valor fora do grid: `16px` perto de um token de `12px` é outra decisão, `15px` perto de `16px` é deslize. */
function nearMeasure(finding: Finding, candidates: readonly Candidate[], options: NearOptions): TokenSuggestion | undefined {
    const px = lengthInPx(normalizeFinding(finding), options.rootFontSize);
    const { gridBase } = options;
    if (px === undefined || px % gridBase === 0) {
        return undefined;
    }
    let bestDistance = gridBase / 2;
    let found: Candidate[] = [];
    for (const candidate of candidates) {
        const value = lengthInPx(candidate.key, options.rootFontSize);
        if (value === undefined || value % gridBase !== 0) {
            continue;
        }
        const distance = Math.abs(value - px);
        if (distance < bestDistance) {
            bestDistance = distance;
            found = [candidate];
        } else if (distance === bestDistance && found.length > 0) {
            found.push(candidate);
        }
    }
    // Dois valores de grid à mesma distância: não há "o mais próximo"; o mesmo valor em dois nomes fica com o mais usado
    const nearest = found[0];
    if (!nearest || found.some((c) => c.key !== nearest.key)) {
        return undefined;
    }
    return { token: nearest.name, match: 'near', distance: lengthInPx(nearest.key, options.rootFontSize)! - px };
}
