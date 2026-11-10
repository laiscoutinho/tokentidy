/** `generate --shared`: o que dois ou mais micro-frontends usam vai para o pacote compartilhado; o resto fica em cada um. */

import { projectOf } from '../check/microfrontends.ts';
import type { MfeProject } from '../check/microfrontends.ts';
import type { Finding } from '../types.ts';
import { normalizeFinding } from '../values/normalize.ts';

export interface SharedSplit {
    shared: Finding[];
    local: Map<MfeProject, Finding[]>;
}

export function splitByUse(findings: readonly Finding[], projects: readonly MfeProject[], consolidations: ReadonlyMap<Finding, string>): SharedSplit {
    const idOf = (finding: Finding) => `${finding.type}\u0000${consolidations.get(finding) ?? normalizeFinding(finding)}`;
    const usedBy = new Map<string, Set<MfeProject>>();
    for (const finding of findings) {
        const project = projectOf(finding.file, projects);
        if (project) {
            usedBy.set(idOf(finding), (usedBy.get(idOf(finding)) ?? new Set()).add(project));
        }
    }
    const split: SharedSplit = { shared: [], local: new Map(projects.map((project) => [project, []])) };
    for (const finding of findings) {
        const project = projectOf(finding.file, projects);
        // Fora de qualquer micro-frontend só existe um lugar possível: o pacote compartilhado
        if (project && usedBy.get(idOf(finding))!.size < 2) {
            split.local.get(project)!.push(finding);
        } else {
            split.shared.push(finding);
        }
    }
    return split;
}
