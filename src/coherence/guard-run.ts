/** Uma rodada das guardas: o que vai mudar, como fica cada valor e o que foi bloqueado. */

import type { Finding } from '../types.ts';
import { DEFAULT_ROOT_FONT_SIZE, lengthInPx, normalizeFinding } from '../values/normalize.ts';
import type { Slot } from './model.ts';

export type GuardId = 'distinct-states' | 'contrast' | 'inset-shape' | 'spacing-hierarchy' | 'nested-radius' | 'type-scale' | 'variants';

export interface Change {
    finding: Finding;
    /** Valor normalizado depois da troca. */
    to: string;
}

export interface Blocked {
    finding: Finding;
    guard: GuardId;
    /** `merges .btn:hover with .btn`. */
    reason: string;
}

export interface GuardResult {
    allowed: Change[];
    blocked: Blocked[];
    /** Relações que a troca alcançou e continuam valendo. */
    kept: string[];
    /** O `kept` das relações que estas trocas alcançaram, na rodada final. */
    keptFor(findings: readonly Finding[]): string[];
}

export interface GuardOptions {
    colorTolerance: number;
    rootFontSize?: number;
}

export class GuardRun {
    readonly #changes: ReadonlyMap<Finding, string>;
    readonly #root: number;
    readonly blocked = new Map<Finding, Blocked>();
    readonly held = new Set<GuardId>();
    /** Relações que continuam valendo, por troca: o `kept` de cada grupo sai daqui, sem rodar as guardas de novo. */
    readonly heldBy = new Map<Finding, Set<GuardId>>();

    constructor(changes: ReadonlyMap<Finding, string>, options: GuardOptions) {
        this.#changes = changes;
        this.#root = options.rootFontSize ?? DEFAULT_ROOT_FONT_SIZE;
    }

    after(slot: Slot): string {
        const changed = slot.findings.find((f) => this.#changes.has(f));
        return changed ? this.#changes.get(changed)! : slot.value;
    }

    changed(...slots: readonly (Slot | undefined)[]): boolean {
        return slots.some((slot) => slot?.findings.some((f) => this.#changes.has(f)));
    }

    px(value: string): number | undefined {
        return lengthInPx(value, this.#root);
    }

    pxBefore(slot: Slot): number | undefined {
        return this.px(slot.value);
    }

    pxAfter(slot: Slot): number | undefined {
        return this.px(this.after(slot));
    }

    /** O bloqueio recai só sobre os valores que iam mudar: os outros estão certos. */
    block(guard: GuardId, slots: readonly Slot[], reason: string): void {
        for (const finding of slots.flatMap((slot) => slot.findings).filter((f) => this.#changes.has(f))) {
            this.blocked.set(finding, { finding, guard, reason });
        }
    }

    blockFindings(guard: GuardId, findings: readonly Finding[], reason: string): void {
        this.block(guard, [{ value: '', findings: [...findings] }], reason);
    }

    hold(guard: GuardId, slots: readonly Slot[]): void {
        this.held.add(guard);
        for (const finding of slots.flatMap((slot) => slot.findings).filter((f) => this.#changes.has(f))) {
            const set = this.heldBy.get(finding) ?? new Set<GuardId>();
            set.add(guard);
            this.heldBy.set(finding, set);
        }
    }

    holdFindings(guard: GuardId, findings: readonly Finding[]): void {
        this.hold(guard, [{ value: '', findings: [...findings] }]);
    }

    changedFinding(finding: Finding): boolean {
        return this.#changes.has(finding);
    }

    keyAfter(finding: Finding): string {
        return this.#changes.get(finding) ?? normalizeFinding(finding);
    }
}

const sign = (n: number) => Math.sign(Number(n.toFixed(4)));

/** Mesmo sentido de antes: quem era menor continua menor, e iguais continuam iguais. */
function sameOrder(run: GuardRun, a: Slot, b: Slot): boolean | undefined {
    const [beforeA, beforeB, afterA, afterB] = [run.pxBefore(a), run.pxBefore(b), run.pxAfter(a), run.pxAfter(b)];
    if (beforeA === undefined || beforeB === undefined || afterA === undefined || afterB === undefined) {
        return undefined;
    }
    return sign(beforeA - beforeB) === sign(afterA - afterB);
}

export function checkOrder(run: GuardRun, guard: GuardId, a: Slot, b: Slot, reason: () => string): void {
    if (!run.changed(a, b)) {
        return;
    }
    const same = sameOrder(run, a, b);
    if (same === false) {
        run.block(guard, [a, b], reason());
    } else if (same) {
        run.hold(guard, [a, b]);
    }
}
