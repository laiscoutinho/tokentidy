/** A consolidação que o `generate` faz sozinho: não muda o código, então só as guardas e as recusas já dadas contam. */

import type { AnalysisResult } from '../analysis/analyze.ts';
import type { Config } from '../project/config.ts';
import type { Finding } from '../types.ts';
import { findConsolidations, guardConsolidations } from './consolidate.ts';
import type { GuardedGroup } from './consolidate.ts';
import { loadDecisions } from './decisions.ts';

export async function automaticConsolidations(root: string, result: AnalysisResult, config: Config): Promise<{ groups: GuardedGroup[]; consolidations: Map<Finding, string> }> {
    const rootFontSize = config.rootFontSize ?? result.rootFontSize?.px;
    const options = { gridBase: config.gridBase, colorTolerance: config.colorTolerance, ...(rootFontSize ? { rootFontSize } : {}) };
    const decisions = await loadDecisions(root);
    const groups = guardConsolidations(findConsolidations(result.findings, options).filter((group) => decisions.get(group.id) !== 'rejected'), result, options);
    return { groups, consolidations: new Map(groups.flatMap((group) => group.changes.map((change) => [change.finding, change.to] as const))) };
}
