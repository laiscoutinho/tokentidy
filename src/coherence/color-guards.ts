/** Guardas de cor: estados que continuam distinguíveis e contraste que continua valendo. */

import { deltaEOK } from '../check/near.ts';
import { colorInfo } from '../values/color-info.ts';
import type { ColorInfo } from '../values/color-info.ts';
import { normalizeFinding } from '../values/normalize.ts';
import type { GuardRun } from './guard-run.ts';
import type { Model, ModelRule, Slot } from './model.ts';

/** Limiares da WCAG 2.2: 1.4.3 (texto) e 1.4.11 (componentes). Texto grande: 24px, ou 18,66px em negrito. */
const TEXT_CONTRAST = 4.5;
const LARGE_CONTRAST = 3;
const LARGE_TEXT_PX = 24;
const CONTROL_WORDS = /(^|[^a-z])(btn|button|botao|input|select|textarea|campo|checkbox|radio)([^a-z]|$)/i;

function luminance({ srgb }: ColorInfo): number {
    const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channel(srgb[0]) + 0.7152 * channel(srgb[1]) + 0.0722 * channel(srgb[2]);
}

/** Sem arredondar: 4,499 não passa de 4,5. */
export function contrastRatio(a: ColorInfo, b: ColorInfo): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (light + 0.05) / (dark + 0.05);
}

function colorsCollapse(before: readonly [string, string], after: readonly [string, string], tolerance: number): boolean {
    const [a0, b0] = [colorInfo(before[0]), colorInfo(before[1])];
    const [a1, b1] = [colorInfo(after[0]), colorInfo(after[1])];
    if (!a0 || !b0 || !a1 || !b1 || before[0] === before[1]) {
        return false;
    }
    const distance = deltaEOK(a1.oklch, b1.oklch);
    return distance <= tolerance && distance < deltaEOK(a0.oklch, b0.oklch);
}

export function distinctStates(run: GuardRun, model: Model, tolerance: number): void {
    for (const [state, base] of model.statePairs) {
        for (const name of ['text', 'bg', 'border']) {
            const [a, b] = [state.slots.get(name), base.slots.get(name)];
            if (!a || !b || a.value === b.value || !run.changed(a, b)) {
                continue;
            }
            if (colorsCollapse([a.value, b.value], [run.after(a), run.after(b)], tolerance)) {
                run.block('distinct-states', [a, b], `merges ${state.selector} with ${base.selector}`);
            } else {
                run.hold('distinct-states', [a, b]);
            }
        }
    }
    for (const [a, b] of model.branches) {
        if (a.type !== 'color' || (!run.changedFinding(a) && !run.changedFinding(b))) {
            continue;
        }
        const before = [normalizeFinding(a), normalizeFinding(b)] as const;
        if (colorsCollapse(before, [run.keyAfter(a), run.keyAfter(b)], tolerance)) {
            run.blockFindings('distinct-states', [a, b], `merges both branches of the conditional at ${a.file}:${a.line}`);
        } else {
            run.holdFindings('distinct-states', [a, b]);
        }
    }
}

/** Fundo atrás da regra: o dela, o da base (estado), o dos pais; por fim, o da página (R3). */
function backgroundOf(model: Model, rule: ModelRule): Slot | undefined {
    const own = rule.slots.get('bg') ?? model.baseOf.get(rule)?.slots.get('bg');
    return own ?? (model.parents.get(rule) ?? []).map((parent) => parent.slots.get('bg')).find(Boolean) ?? model.page.map((r) => r.slots.get('bg')).find(Boolean);
}

export function contrast(run: GuardRun, model: Model): void {
    const pair = (rule: ModelRule, fg: Slot, bg: Slot, needed: number, what: string) => {
        if (!run.changed(fg, bg)) {
            return;
        }
        const [f0, b0, f1, b1] = [colorInfo(fg.value), colorInfo(bg.value), colorInfo(run.after(fg)), colorInfo(run.after(bg))];
        // Com transparência, a cor final depende do que está atrás: não dá para afirmar
        if (!f0 || !b0 || !f1 || !b1 || [f0, b0, f1, b1].some((c) => c.alpha < 1)) {
            return;
        }
        if (contrastRatio(f0, b0) >= needed && contrastRatio(f1, b1) < needed) {
            run.block('contrast', [fg, bg], `${what} of ${rule.selector} falls below ${needed}:1`);
        } else {
            run.hold('contrast', [fg, bg]);
        }
    };
    for (const rule of model.rules) {
        const bg = backgroundOf(model, rule);
        if (!bg) {
            continue;
        }
        const text = rule.slots.get('text') ?? model.baseOf.get(rule)?.slots.get('text');
        const size = rule.slots.get('font-size');
        const large = size !== undefined && (run.pxBefore(size) ?? 0) >= LARGE_TEXT_PX;
        if (text) {
            pair(rule, text, bg, large ? LARGE_CONTRAST : TEXT_CONTRAST, 'text contrast');
        }
        const border = rule.slots.get('border');
        if (border && CONTROL_WORDS.test(rule.selector)) {
            pair(rule, border, bg, LARGE_CONTRAST, 'border contrast');
        }
    }
}
