/** Guardas de medida: forma do padding, ordem dos espaçamentos, raios aninhados, escala tipográfica e variantes. */

import { checkOrder } from './guard-run.ts';
import type { GuardRun } from './guard-run.ts';
import type { Model, ModelRule } from './model.ts';

const LINE_HEIGHT_DRIFT = 0.05;

export function insetShape(run: GuardRun, model: Model): void {
    for (const rule of model.rules) {
        const vertical = rule.slots.get('padding-top');
        const horizontal = rule.slots.get('padding-right');
        // `padding: 25px` é um valor só: os dois lados mudam juntos e não há forma a perder
        if (vertical && horizontal && vertical.findings[0] !== horizontal.findings[0]) {
            checkOrder(run, 'inset-shape', vertical, horizontal, () => `changes the shape of the padding of ${rule.selector} (${vertical.value} ${horizontal.value})`);
        }
    }
}

export function spacingHierarchy(run: GuardRun, model: Model): void {
    const families: [string, string[]][] = [
        ['padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']],
        ['gap', ['row-gap', 'column-gap']],
        ['margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']],
    ];
    for (const rule of model.rules) {
        families.forEach(([innerName, inner], i) => {
            for (const [outerName, outer] of families.slice(i + 1)) {
                for (const a of inner) {
                    for (const b of outer) {
                        const [slotA, slotB] = [rule.slots.get(a), rule.slots.get(b)];
                        if (slotA && slotB) {
                            checkOrder(run, 'spacing-hierarchy', slotA, slotB, () => `changes the order of ${innerName} and ${outerName} in ${rule.selector}`);
                        }
                    }
                }
            }
        });
    }
}

export function nestedRadius(run: GuardRun, model: Model): void {
    for (const [child, parents] of model.parents) {
        const inner = child.slots.get('radius');
        const parent = parents.find((p) => p.slots.has('radius'));
        const outer = parent?.slots.get('radius');
        if (!inner || !outer || !parent || !run.changed(inner, outer, parent.slots.get('padding-top'))) {
            continue;
        }
        const [i0, o0, i1, o1] = [run.pxBefore(inner), run.pxBefore(outer), run.pxAfter(inner), run.pxAfter(outer)];
        if (i0 === undefined || o0 === undefined || i1 === undefined || o1 === undefined) {
            continue;
        }
        const padding = parent.slots.get('padding-top');
        const [p0, p1] = padding ? [run.pxBefore(padding), run.pxAfter(padding)] : [undefined, undefined];
        const slots = [inner, outer, ...(padding ? [padding] : [])];
        if (p0 !== undefined && p1 !== undefined && i0 === o0 - p0 && i0 > 0 && i1 !== o1 - p1) {
            run.block('nested-radius', slots, `breaks inner radius = outer - padding between ${parent.selector} and ${child.selector}`);
        } else if (i0 <= o0 && i1 > o1) {
            run.block('nested-radius', slots, `makes the radius of ${child.selector} larger than ${parent.selector}`);
        } else {
            run.hold('nested-radius', slots);
        }
    }
}

const HEADING = /^\.?h([1-6])$/;

function ratio(run: GuardRun, lineHeight: string, fontSize: number | undefined): number | undefined {
    const unitless = Number(lineHeight);
    if (!Number.isNaN(unitless)) {
        return unitless;
    }
    const px = run.px(lineHeight);
    return px !== undefined && fontSize ? px / fontSize : undefined;
}

export function typeScale(run: GuardRun, model: Model): void {
    const headings = model.rules.flatMap((rule) => {
        const level = HEADING.exec(rule.selector)?.[1];
        const slot = rule.slots.get('font-size');
        return level && slot ? [{ rule, level: Number(level), slot }] : [];
    });
    for (const a of headings) {
        for (const b of headings.filter((other) => other.level > a.level)) {
            const [before, after] = [run.pxBefore(a.slot)! - run.pxBefore(b.slot)!, run.pxAfter(a.slot)! - run.pxAfter(b.slot)!];
            if (!run.changed(a.slot, b.slot) || Number.isNaN(before) || Number.isNaN(after)) {
                continue;
            }
            if (before > 0 && after <= 0) {
                run.block('type-scale', [a.slot, b.slot], `${a.rule.selector} would stop being larger than ${b.rule.selector}`);
            } else {
                run.hold('type-scale', [a.slot, b.slot]);
            }
        }
    }
    for (const rule of model.rules) {
        const [size, line] = [rule.slots.get('font-size'), rule.slots.get('line-height')];
        if (!size || !line || !run.changed(size, line)) {
            continue;
        }
        const before = ratio(run, line.value, run.pxBefore(size));
        const after = ratio(run, run.after(line), run.pxAfter(size));
        if (before === undefined || after === undefined) {
            continue;
        }
        if (Math.abs(after / before - 1) > LINE_HEIGHT_DRIFT) {
            run.block('type-scale', [size, line], `changes the line-height/font-size ratio of ${rule.selector} by more than 5%`);
        } else {
            run.hold('type-scale', [size, line]);
        }
    }
}

export function variants(run: GuardRun, model: Model): void {
    const blocks = new Map<string, ModelRule[]>();
    for (const rule of model.rules.filter((r) => !r.state)) {
        const block = rule.variant?.block ?? rule.base.replace(/^\./, '');
        blocks.set(`${rule.atRules}\u0000${block}`, [...(blocks.get(`${rule.atRules}\u0000${block}`) ?? []), rule]);
    }
    for (const rules of blocks.values()) {
        rules.forEach((a, i) => {
            for (const b of rules.slice(i + 1).filter((other) => other.variant?.name !== a.variant?.name)) {
                for (const [name, slotA] of a.slots) {
                    const slotB = b.slots.get(name);
                    if (!slotB || slotA.value === slotB.value || !run.changed(slotA, slotB)) {
                        continue;
                    }
                    if (run.after(slotA) === run.after(slotB)) {
                        run.block('variants', [slotA, slotB], `collapses ${a.selector} and ${b.selector}`);
                    } else {
                        run.hold('variants', [slotA, slotB]);
                    }
                }
            }
        });
    }
}
