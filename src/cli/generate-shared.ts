// `generate --shared`: uma pasta de tokens para o que é comum e uma em cada micro-frontend para o que é só dele.
import path from 'node:path';

import { assertInsideRoot } from '../safe-write.ts';
import type { Finding } from '../types.ts';
import type { AnalysisResult } from '../analysis/analyze.ts';
import type { Config } from '../project/config.ts';
import { EXIT, JSON_SCHEMA_VERSION, UsageError } from './errors.ts';
import { displayPath, printDiagnostics } from './print.ts';

interface SharedOptions {
    shared: string;
    new?: boolean;
    dryRun?: boolean;
    json?: boolean;
}

export async function runGenerateShared(root: string, given: readonly string[], result: AnalysisResult, config: Config, options: SharedOptions): Promise<void> {
    const sharedDir = path.resolve(options.shared);
    await assertInsideRoot(sharedDir, root);
    const { detectProjects } = await import('../check/microfrontends.ts');
    const sharedRelative = path.relative(root, sharedDir).split(path.sep).join('/');
    const projects = (await detectProjects(given, root)).filter((p) => p.dir !== sharedRelative);
    if (projects.length < 2) {
        throw new UsageError('--shared needs two or more micro-frontends: pass their folders or run it at a root with workspaces or angular.json projects');
    }
    const { automaticConsolidations } = await import('../consolidate/automatic.ts');
    const { generateTokens } = await import('../generate/generate.ts');
    const { splitByUse } = await import('../generate/shared.ts');
    const dtcgTree = await import('../generate/output/dtcg-tree.ts');
    const { renderOutput } = await import('../generate/output/render-files.ts');
    const { moduleLanguages, writeOutput } = await import('../generate/output/write-files.ts');
    const { consolidations } = await automaticConsolidations(root, result, config);
    const split = splitByUse(result.findings, projects, consolidations);

    const mode = options.new ? 'new' as const : 'extend' as const;
    const targets: { name: string; outDir: string; findings: Finding[]; minOccurrences: number }[] = [
        // Estar em dois micro-frontends já é motivo suficiente para ser token, qualquer que seja o limite local
        { name: 'shared', outDir: sharedDir, findings: split.shared, minOccurrences: Math.min(config.minOccurrences, 2) },
        ...projects.map((project) => ({ name: project.name, outDir: path.resolve(root, project.dir, config.output), findings: split.local.get(project)!, minOccurrences: config.minOccurrences })),
    ];
    const rootFontSize = config.rootFontSize ?? result.rootFontSize?.px;
    const insideOut = (file: string) => targets.some((t) => (`${path.join(root, file)}`).startsWith(`${t.outDir}${path.sep}`));
    const report = [];
    for (const target of targets) {
        const existing = mode === 'extend' ? await dtcgTree.readDtcgTree(target.outDir) : undefined;
        const generation = generateTokens(target.findings, {
            consolidations, minOccurrences: target.minOccurrences, gridBase: config.gridBase, semanticTokens: config.semanticTokens, mode,
            ...(rootFontSize ? { rootFontSize } : {}),
            definitions: result.definitions.filter((d) => !insideOut(d.file)),
            references: result.references,
            ownTokens: existing ? dtcgTree.ownTokensOf(existing) : [],
        });
        const writeOptions = { outDir: target.outDir, mode, styleLanguages: result.styleLanguages, splitThreshold: config.splitThreshold, modules: await moduleLanguages(target.findings, target.outDir) };
        const files = generation.tokens.length > 0 || existing ? renderOutput(dtcgTree.buildDtcgTree(generation, existing), writeOptions) : [];
        if (!options.dryRun && files.length > 0) {
            await assertInsideRoot(target.outDir, root);
            await writeOutput(files, writeOptions);
        }
        report.push({ name: target.name, dir: target.outDir, tokens: generation.tokens.map(({ path: trail, type, key, count }) => ({ path: trail, type, key, count })), files: files.map((f) => f.file) });
    }
    process.exitCode = result.errors.length > 0 ? EXIT.findings : EXIT.ok;
    if (options.json) {
        const { errors, warnings, skipped } = result;
        console.log(JSON.stringify({ schemaVersion: JSON_SCHEMA_VERSION, root, mode, dryRun: options.dryRun === true, targets: report, errors, warnings, skipped }, null, 2));
        return;
    }
    for (const target of report) {
        console.log(`${target.name}\t${displayPath(target.dir)}\t${target.tokens.length}`);
    }
    printDiagnostics(result);
}
