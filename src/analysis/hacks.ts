/**
 * Truques de CSS que parecem valor de design mas não são: o número existe para enganar o navegador
 * (`animation-duration: 1ms` no reduced-motion, `padding-top: 0.1px` contra o colapso de margem,
 * `text-indent: -9999em`, a linha de 1px de um `::after`, a caixa de 1px do visually-hidden).
 * Virar token daria nome a um truque (`duration-1`), e trocar por um token próximo quebraria o truque.
 * Vão para revisão (`value/hack`), com o motivo de cada caso; o `check` não sugere token para eles.
 */

import type { TokenType } from '../types.ts';
import type { Siblings } from './rules.ts';

interface HackContext {
    property: string;
    selector?: string;
    siblings: Siblings;
}

const NUMBER = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|ms|s)?$/i;
/** Tipos de medida em que esses truques aparecem. Borda, fonte e raio têm outros sentidos. */
const LAYOUT_TYPES = new Set<TokenType>(['spacing', 'size', 'container']);
const BOX_PROPERTIES = new Set(['width', 'height', 'inline-size', 'block-size', 'min-width', 'min-height']);
const PSEUDO_ELEMENT = /::?(after|before)\b/i;
/** Até aqui uma duração só serve para a animação acabar de uma vez. */
const INSTANT_MS = 10;
const EXTREME = 9999;

export const HACK_MESSAGES = {
    instant: 'near-zero duration: a reduced-motion trick that ends the animation at once, not a motion token',
    subPixel: 'sub-pixel value: a layout trick (such as stopping margin collapse), not a step of the scale',
    extreme: 'extreme value (9999): pushes the element off-screen or makes it unbounded, not a step of the scale',
    hairline: 'a 1px line drawn with ::before/::after: a hairline divider, not a size token',
    visuallyHidden: 'visually-hidden pattern: the 1px box hides the text but keeps it for screen readers, not a design value',
} as const;

/** O motivo, quando o valor é um truque; `undefined` quando é um valor comum. */
export function hackOf(context: HackContext, type: TokenType, value: string): string | undefined {
    const match = NUMBER.exec(value.trim());
    if (!match) {
        return undefined;
    }
    const amount = Number(match[1]);
    const unit = (match[2] ?? '').toLowerCase();
    if (type === 'duration') {
        const ms = unit === 's' ? amount * 1000 : amount;
        return ms > 0 && ms <= INSTANT_MS ? HACK_MESSAGES.instant : undefined;
    }
    if (!LAYOUT_TYPES.has(type)) {
        return undefined;
    }
    if (Math.abs(amount) >= EXTREME) {
        return HACK_MESSAGES.extreme;
    }
    if (unit === 'px' && amount !== 0 && Math.abs(amount) < 1) {
        return HACK_MESSAGES.subPixel;
    }
    if (unit === 'px' && Math.abs(amount) === 1) {
        if (visuallyHidden(context.siblings) && (BOX_PROPERTIES.has(context.property) || context.property.startsWith('margin'))) {
            return HACK_MESSAGES.visuallyHidden;
        }
        if (amount === 1 && BOX_PROPERTIES.has(context.property) && PSEUDO_ELEMENT.test(context.selector ?? '')) {
            return HACK_MESSAGES.hairline;
        }
    }
    return undefined;
}

/** `position: absolute` + `overflow: hidden` + `clip`/`clip-path` que recorta tudo: o padrão de texto só para leitor de tela. */
function visuallyHidden(siblings: Siblings): boolean {
    const clip = siblings.get('clip') ?? '';
    const clipPath = siblings.get('clip-path') ?? '';
    return /^\s*absolute\b/i.test(siblings.get('position') ?? '')
        && /^\s*hidden\b/i.test(siblings.get('overflow') ?? '')
        && (/rect\(/i.test(clip) || /inset\(\s*50%/i.test(clipPath));
}
