/**
 * `fix --approximate`: valores sem token exato que podem ir para o token de um valor próximo.
 * Só passa o que as guardas deixam e a pessoa autoriza; o resto continua no código, como estava.
 */

import type { AnalysisResult } from '../analysis/analyze.ts';
import { findConsolidations, guardConsolidations } from '../consolidate/consolidate.ts';
import type { ConsolidationOptions, GuardedGroup } from '../consolidate/consolidate.ts';
import { loadDecisions, saveDecisions } from '../consolidate/decisions.ts';
import type { TokenIndex } from '../token-lookup.ts';
import type { Finding } from '../types.ts';

export type ApproximateAnswer = 'yes' | 'no' | 'quit';

export interface ApproximateOptions extends ConsolidationOptions {
    /** `ask`: pergunta com `decide`; `yes`: aplica o que passa nas guardas; `list`: só mostra. */
    mode: 'ask' | 'yes' | 'list';
    decide?: (group: ApproximateGroup) => Promise<ApproximateAnswer>;
}

export type ApproximateStatus = 'applied' | 'rejected' | 'pending' | 'blocked';

export interface ApproximateGroup extends GuardedGroup {
    /** Como o token é escrito: `var(--spacing-4)`. */
    token: string;
    status: ApproximateStatus;
}

export interface ApproximateResolution {
    groups: ApproximateGroup[];
    /** Achado → valor final, para o plano do `fix`. */
    approved: Map<Finding, string>;
}

interface Input {
    root: string;
    analysis: AnalysisResult;
    findings: readonly Finding[];
    /** Só o que ficou sem token exato: quem tem token próprio não precisa de aproximação. */
    withoutToken: readonly Finding[];
    index: TokenIndex;
    /** Numa simulação nada é escrito, nem as respostas. */
    dryRun: boolean;
}

function restrict(group: GuardedGroup, eligible: ReadonlySet<Finding>): GuardedGroup {
    return {
        ...group,
        from: group.from.map((value) => ({ ...value, findings: value.findings.filter((f) => eligible.has(f)) })).filter((value) => value.findings.length > 0),
        changes: group.changes.filter((change) => eligible.has(change.finding)),
        blocked: group.blocked.filter((item) => eligible.has(item.finding)),
    };
}

export async function resolveApproximate(input: Input, options: ApproximateOptions): Promise<ApproximateResolution> {
    const eligible = new Set(input.withoutToken);
    // O grupo olha todos os valores (o `16px` que já tem token também indica o passo), mas só troca os que não têm token
    // Os mesmos candidatos que o `fix` usa: tema JS e sobreposições com escopo não servem de alvo
    const anchors = input.index.ofType('color').filter((c) => c.form !== 'js-theme' && !c.scope).map((c) => c.key);
    const considered = findConsolidations(input.findings, options, anchors).filter((group) => input.index.lookup(group.type, group.to).length > 0);
    const guarded = guardConsolidations(considered.map((group) => ({ ...group, from: group.from.map((value) => ({ ...value, findings: value.findings.filter((f) => eligible.has(f)) })).filter((value) => value.findings.length > 0) })), input.analysis, options)
        .map((group) => restrict(group, eligible))
        .filter((group) => group.from.length > 0);

    const decisions = await loadDecisions(input.root);
    const size = decisions.size;
    const groups: ApproximateGroup[] = [];
    let quit = false;
    for (const group of guarded) {
        const first = input.index.lookup(group.type, group.to)[0]!;
        const item: ApproximateGroup = { ...group, token: first.form === 'custom-property' ? `var(${first.name})` : first.name, status: 'pending' };
        groups.push(item);
        const saved = decisions.get(group.id);
        if (group.changes.length === 0) {
            item.status = 'blocked';
        } else if (saved === 'rejected') {
            item.status = 'rejected';
        } else if (options.mode === 'yes' || (options.mode === 'ask' && saved === 'accepted')) {
            item.status = 'applied';
        } else if (options.mode === 'ask' && options.decide && !quit) {
            const answer = await options.decide(item);
            quit = answer === 'quit';
            if (answer !== 'quit') {
                item.status = answer === 'yes' ? 'applied' : 'rejected';
                decisions.set(group.id, answer === 'yes' ? 'accepted' : 'rejected');
            }
        }
    }

    if (!input.dryRun && decisions.size !== size) {
        await saveDecisions(input.root, decisions);
    }
    const approved = new Map(groups.filter((g) => g.status === 'applied').flatMap((g) => g.changes.map((c) => [c.finding, c.to] as const)));
    return { groups, approved };
}
