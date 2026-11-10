/**
 * Micro-frontends: cada app passa no `check` sozinho e, juntos na mesma página, se contradizem.
 * Colisão em `:root` quebra a tela de verdade (ganha quem carregar por último), por isso é violação;
 * drift e versões diferentes podem ser decisão, por isso são revisão.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { componentOf, propertyFamily } from '../consolidate/consolidate.ts';
import { rulesForProperty } from '../analysis/rules.ts';
import type { Finding, TokenDefinition, TokenReference, TokenType } from '../types.ts';
import { colorInfo } from '../values/color-info.ts';
import { lengthInPx, normalizeFinding } from '../values/normalize.ts';

export interface MfeProject {
    name: string;
    /** Relativa à raiz, com `/`. */
    dir: string;
}

export type MfeRule = 'mfe/root-collision' | 'mfe/drift' | 'mfe/version-mismatch';

export interface MfeIssue {
    rule: MfeRule;
    severity: 'violation' | 'review';
    file: string;
    line: number;
    column: number;
    property: string;
    value: string;
    detail: string;
}

const relativeTo = (root: string, dir: string) => path.relative(root, dir).split(path.sep).join('/');

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
    try {
        const value: unknown = JSON.parse(await readFile(file, 'utf8'));
        return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

async function projectAt(root: string, dir: string): Promise<MfeProject | undefined> {
    if (dir === root || !existsSync(path.join(dir, 'package.json'))) {
        return undefined;
    }
    const manifest = await readJson(path.join(dir, 'package.json'));
    return { name: typeof manifest?.name === 'string' ? manifest.name : path.basename(dir), dir: relativeTo(root, dir) };
}

/** `apps/*`: o `*` vale um nível. `**` é raro em workspaces de front-end e ficaria caro; quem usa passa as pastas à mão. */
async function expandPattern(root: string, pattern: string): Promise<string[]> {
    let dirs = [root];
    for (const segment of pattern.replace(/\/$/, '').split('/')) {
        if (segment === '**') {
            return [];
        }
        const next: string[] = [];
        for (const dir of dirs) {
            if (segment !== '*') {
                next.push(path.join(dir, segment));
                continue;
            }
            const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
            next.push(...entries.filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')).map((e) => path.join(dir, e.name)));
        }
        dirs = next;
    }
    return dirs;
}

async function fromWorkspaces(root: string): Promise<MfeProject[]> {
    const manifest = await readJson(path.join(root, 'package.json'));
    const raw = Array.isArray(manifest?.workspaces) ? manifest.workspaces : (manifest?.workspaces as { packages?: unknown } | undefined)?.packages;
    if (!Array.isArray(raw)) {
        return [];
    }
    const patterns = raw.filter((p): p is string => typeof p === 'string');
    const excluded = new Set((await Promise.all(patterns.filter((p) => p.startsWith('!')).map((p) => expandPattern(root, p.slice(1))))).flat());
    const dirs = (await Promise.all(patterns.filter((p) => !p.startsWith('!')).map((p) => expandPattern(root, p)))).flat().filter((d) => !excluded.has(d));
    return (await Promise.all(dirs.map((d) => projectAt(root, d)))).filter((p) => p !== undefined);
}

async function fromAngular(root: string): Promise<MfeProject[]> {
    const projects = (await readJson(path.join(root, 'angular.json')))?.projects;
    if (typeof projects !== 'object' || projects === null) {
        return [];
    }
    return Object.entries(projects as Record<string, { root?: unknown }>)
        .filter(([, project]) => typeof project?.root === 'string' && project.root !== '')
        .map(([name, project]) => ({ name, dir: (project.root as string).replace(/\/$/, '') }));
}

/** Os micro-frontends da execução; menos de dois quer dizer que este é um projeto comum. */
export async function detectProjects(paths: readonly string[], root: string): Promise<MfeProject[]> {
    const absolute = paths.map((given) => path.resolve(given));
    let projects: MfeProject[] = [];
    if (absolute.length > 1) {
        projects = (await Promise.all(absolute.map((dir) => projectAt(root, dir)))).filter((p) => p !== undefined);
    } else if (absolute[0] === root) {
        projects = await fromWorkspaces(root);
        if (projects.length < 2) {
            projects = await fromAngular(root);
        }
    }
    return projects.length >= 2 ? [...new Map(projects.map((p) => [p.dir, p])).values()].sort((a, b) => (a.dir < b.dir ? -1 : 1)) : [];
}

/** O projeto de um arquivo: a pasta mais longa que o contém. */
export function projectOf(file: string, projects: readonly MfeProject[]): MfeProject | undefined {
    return projects.filter((p) => file === p.dir || file.startsWith(`${p.dir}/`)).sort((a, b) => b.dir.length - a.dir.length)[0];
}

/** `16px` e `1rem`, `#FFF` e `#ffffff`: o mesmo valor escrito de outro jeito não é colisão. */
function canonical(value: string): string {
    const text = value.trim().toLowerCase().replace(/\s+/g, ' ');
    const color = colorInfo(text);
    if (color) {
        return `color:${color.hex ?? text}:${color.alpha}`;
    }
    const px = lengthInPx(text);
    return px === undefined ? text : `${px}px`;
}

const isRoot = (selector: string | undefined) => selector === undefined || selector.split(',').some((s) => [':root', 'html'].includes(s.trim()));

function rootCollisions(definitions: readonly TokenDefinition[], projects: readonly MfeProject[]): MfeIssue[] {
    const global = definitions.filter((d) => d.syntax === 'custom-property' && !d.package && isRoot(d.selector));
    const issues: MfeIssue[] = [];
    for (const [name, ofName] of Map.groupBy(global, (d) => d.name)) {
        const located = ofName.flatMap((definition) => {
            const project = projectOf(definition.file, projects);
            return project ? [{ definition, project }] : [];
        });
        if (new Set(located.map(({ definition }) => canonical(definition.value))).size < 2) {
            continue;
        }
        const values = [...new Map(located.map(({ definition, project }) => [project.name, `${project.name} ${definition.value}`])).values()].join(', ');
        for (const { definition } of located) {
            issues.push({
                rule: 'mfe/root-collision', severity: 'violation', file: definition.file, line: definition.line, column: definition.column,
                property: name, value: definition.value, detail: `same global token, different values: ${values}`,
            });
        }
    }
    return issues;
}

interface Use {
    project: MfeProject;
    role: string;
    label: string;
    property: string;
    value: string;
    canonical: string;
    file: string;
    line: number;
    column: number;
}

function useOf(type: TokenType, item: Pick<Finding, 'property' | 'selector' | 'file' | 'line' | 'column'>, value: string, projects: readonly MfeProject[]): Use[] {
    const project = projectOf(item.file, projects);
    const component = componentOf(item);
    if (!project || !component) {
        return [];
    }
    const family = propertyFamily(item.property);
    return [{ project, role: `${type}\u0000${family}\u0000${component}`, label: `.${component} ${family}`, property: item.property, value, canonical: canonical(value), file: item.file, line: item.line, column: item.column }];
}

/** Um valor por token e projeto: token redefinido em tema não diz qual é "o" valor. */
function referenceUses(references: readonly TokenReference[], definitions: readonly TokenDefinition[], projects: readonly MfeProject[]): Use[] {
    return references.flatMap((reference) => {
        const type = rulesForProperty(reference.property)[0]?.type;
        const project = projectOf(reference.file, projects);
        const definition = definitions.find((d) => d.name === reference.name && isRoot(d.selector) && projectOf(d.file, projects) === project);
        return type && project && definition && !/var\(/.test(definition.value) ? useOf(type, reference, definition.value, projects) : [];
    });
}

function drift(uses: readonly Use[]): MfeIssue[] {
    const issues: MfeIssue[] = [];
    for (const ofRole of Map.groupBy(uses, (u) => u.role).values()) {
        const usual = [...Map.groupBy(ofRole, (u) => u.project.dir).values()].map((ofProject) => {
            const [, top] = [...Map.groupBy(ofProject, (u) => u.canonical)].sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1))[0]!;
            return top[0]!;
        });
        if (usual.length < 2 || new Set(usual.map((u) => u.canonical)).size < 2) {
            continue;
        }
        const detail = `same role, different values: ${usual.map((u) => `${u.project.name} ${u.value}`).join(', ')}`;
        issues.push(...usual.map((u) => ({ rule: 'mfe/drift' as const, severity: 'review' as const, file: u.file, line: u.line, column: u.column, property: u.label, value: u.value, detail })));
    }
    return issues;
}

const DESIGN_SYSTEM = /(?:^|[-/@_.])(?:tokens?|design-?system|ui-kit|theme)(?:$|[-/_.])/i;

async function versionMismatches(root: string, definitions: readonly TokenDefinition[], projects: readonly MfeProject[]): Promise<MfeIssue[]> {
    const fromSource = new Set(definitions.flatMap((d) => d.package ?? []));
    const versions = new Map<string, { project: MfeProject; version: string; file: string; line: number; column: number }[]>();
    for (const project of projects) {
        const file = path.posix.join(project.dir, 'package.json');
        const text = await readFile(path.join(root, file), 'utf8').catch(() => '');
        const manifest = await readJson(path.join(root, file));
        const dependencies = { ...(manifest?.devDependencies as object | undefined), ...(manifest?.dependencies as object | undefined) } as Record<string, unknown>;
        for (const [name, version] of Object.entries(dependencies)) {
            if (typeof version !== 'string' || (!DESIGN_SYSTEM.test(name) && !fromSource.has(name))) {
                continue;
            }
            const offset = Math.max(text.indexOf(`"${name}"`), 0);
            const before = text.slice(0, offset).split('\n');
            versions.set(name, [...(versions.get(name) ?? []), { project, version, file, line: before.length, column: before.at(-1)!.length + 1 }]);
        }
    }
    const issues: MfeIssue[] = [];
    for (const [name, ofName] of versions) {
        if (new Set(ofName.map((v) => v.version)).size > 1) {
            const detail = `different versions of the design system: ${ofName.map((v) => `${v.project.name} ${v.version}`).join(', ')}`;
            issues.push(...ofName.map(({ file, line, column, version }) => ({ rule: 'mfe/version-mismatch' as const, severity: 'review' as const, file, line, column, property: name, value: version, detail })));
        }
    }
    return issues;
}

export interface MfeInput {
    root: string;
    findings: readonly Finding[];
    definitions: readonly TokenDefinition[];
    references: readonly TokenReference[];
}

export async function analyzeMicroFrontends(input: MfeInput, projects: readonly MfeProject[]): Promise<MfeIssue[]> {
    const uses = [
        ...input.findings.flatMap((f) => useOf(f.type, f, normalizeFinding(f), projects)),
        ...referenceUses(input.references, input.definitions, projects),
    ];
    return [...rootCollisions(input.definitions, projects), ...drift(uses), ...await versionMismatches(input.root, input.definitions, projects)];
}
