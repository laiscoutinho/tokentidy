/**
 * Guardas de coerência: uma troca pode mudar um valor, nunca uma relação. Cada guarda compara o antes e o depois;
 * o que quebra uma relação que valia é bloqueado com o motivo, e não vai para revisão: a decisão está tomada e explicada.
 */

import type { Finding } from '../types.ts';
import { contrast, distinctStates } from './color-guards.ts';
import { GuardRun } from './guard-run.ts';
import type { Blocked, Change, GuardId, GuardOptions, GuardResult } from './guard-run.ts';
import { insetShape, nestedRadius, spacingHierarchy, typeScale, variants } from './measure-guards.ts';
import type { Model } from './model.ts';

export { contrastRatio } from './color-guards.ts';
export type { Blocked, Change, GuardId, GuardOptions, GuardResult } from './guard-run.ts';

const KEPT: Record<GuardId, string> = {
    'distinct-states': 'distinct states',
    contrast: 'contrast',
    'inset-shape': 'inset shape',
    'spacing-hierarchy': 'spacing order',
    'nested-radius': 'nested radius',
    'type-scale': 'type scale',
    variants: 'variants',
};

/** Na ordem em que as guardas rodam, que é a ordem de `KEPT`. */
const named = (guards: ReadonlySet<GuardId>): string[] => (Object.keys(KEPT) as GuardId[]).filter((guard) => guards.has(guard)).map((guard) => KEPT[guard]);

/** Roda as guardas até estabilizar: tirar uma troca bloqueada pode mudar o que as outras enxergam. */
export function checkChanges(model: Model, changes: readonly Change[], options: GuardOptions): GuardResult {
    const pending = new Map(changes.map((change) => [change.finding, change.to]));
    const blocked: Blocked[] = [];
    let held = new Set<GuardId>();
    let heldBy = new Map<Finding, Set<GuardId>>();
    for (;;) {
        const run = new GuardRun(pending, options);
        distinctStates(run, model, options.colorTolerance);
        contrast(run, model);
        insetShape(run, model);
        spacingHierarchy(run, model);
        nestedRadius(run, model);
        typeScale(run, model);
        variants(run, model);
        held = run.held;
        heldBy = run.heldBy;
        if (run.blocked.size === 0) {
            break;
        }
        for (const [finding, item] of run.blocked) {
            pending.delete(finding);
            blocked.push(item);
        }
    }
    return {
        allowed: changes.filter((change) => pending.has(change.finding)),
        blocked,
        kept: named(held),
        keptFor: (findings) => named(new Set(findings.flatMap((finding) => [...(heldBy.get(finding) ?? [])]))),
    };
}
