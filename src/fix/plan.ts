/**
 * Planejamento do `fix`, sem tocar no disco: para cada valor solto, qual token entra, como é escrito ali,
 * ou por que fica como está. Mesma entrada, mesma saída.
 */

import path from 'node:path';

import { normalizeFinding } from '../values/normalize.ts';
import type { Finding } from '../types.ts';
import type { Candidate } from '../token-lookup.ts';
import { resolvesUnder } from '../token-index.ts';
import { importInsertion, loadedFiles, styleId } from './imports.ts';
import type { LoadedFile, Preprocessor } from './imports.ts';
import { ModuleImport } from './module-import.ts';
import { angularQuote, jsQuote, nextToOperator } from './surrounding-syntax.ts';
import type { Edit, FilePlan, FixPlan, PlanContext, Replacement, SkipReason, SkippedValue } from './plan-types.ts';

export type { Edit, FilePlan, FixPlan, PlanContext, Replacement, ReplacementReason, SkipReason, SkippedValue } from './plan-types.ts';

/**
 * Funções que o próprio navegador calcula: `var()` dentro delas chega intacto ao CSS final.
 * Qualquer outra (`darken`, `rgba`, `math.div`, função do projeto) roda no build do SCSS/Less e quebra com `var()`.
 */
const CSS_FUNCTIONS = new Set([
    'calc', 'clamp', 'min', 'max', 'color-mix', 'light-dark',
    'linear-gradient', 'radial-gradient', 'conic-gradient',
    'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient',
]);

const PREPROCESSOR_EXTENSIONS = new Map<string, Preprocessor>([['.scss', 'scss'], ['.sass', 'sass'], ['.less', 'less']]);

export function planFixes(findings: readonly Finding[], context: PlanContext): FixPlan {
    const files: FilePlan[] = [];
    const skipped: SkippedValue[] = [];
    const withoutToken: Finding[] = [];

    const byFile = Map.groupBy(findings.toSorted((a, b) => a.offset - b.offset), (f) => f.file);
    for (const [file, ofFile] of [...byFile].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const source = context.sources.get(file);
        if (source === undefined) {
            continue;
        }
        const planner = new FilePlanner(file, source, context);
        for (const finding of ofFile) {
            const outcome = planner.plan(finding);
            if (outcome === 'no-token') {
                withoutToken.push(finding);
            } else if (outcome) {
                skipped.push(outcome);
            }
        }
        skipped.push(...planner.overlaps);
        const plan = planner.result();
        if (plan.replacements.length > 0) {
            files.push(plan);
        }
    }
    return { files, skipped, withoutToken };
}

class FilePlanner {
    readonly #file: string;
    readonly #source: string;
    readonly #context: PlanContext;
    /** Linguagem do arquivo, se for SCSS/Sass/Less (um `styles:` inline em `.ts` não é). */
    readonly #language: Preprocessor | undefined;
    readonly #loaded: LoadedFile[];
    readonly #replacements: Replacement[] = [];
    readonly #edits: Edit[] = [];
    /** Precisa importar os tokens gerados (`$x`/`@x` do `_tokens.scss`/`_tokens.less`). */
    #needsImport = false;
    #module: ModuleImport | undefined;
    readonly overlaps: SkippedValue[] = [];
    /** Calculada uma vez: olha o arquivo inteiro, e um arquivo pode ter milhares de números. */
    #quote: string | undefined;
    /** Maior fim das edições planejadas: edição que começa depois dele não precisa ser comparada. */
    #furthestEnd = 0;

    constructor(file: string, source: string, context: PlanContext) {
        this.#file = file;
        this.#source = source;
        this.#context = context;
        this.#language = PREPROCESSOR_EXTENSIONS.get(path.extname(file).toLowerCase());
        this.#loaded = this.#language ? loadedFiles(source, file) : [];
    }

    /** Troca planejada (`undefined`), sem token (`'no-token'`) ou o motivo de não trocar. */
    plan(finding: Finding): SkippedValue | 'no-token' | undefined {
        const candidates = this.#context.index.lookup(finding.type, this.#context.approximate?.get(finding) ?? normalizeFinding(finding))
            .filter((c) => c.form !== 'js-theme'
                && (c.source !== 'alias' || c.occurrences?.some((o) => sameOccurrence(o, finding)))
                && (!c.scope || resolvesUnder(finding.selector, c.scope.selector, c.scope.rivals)));
        if (candidates.length === 0) {
            return 'no-token';
        }
        if (finding.host === 'angular-template' && finding.impliedUnit && !finding.unitSuffix) {
            return skippedValue(finding, 'unit-in-binding', 'the unit in the binding name applies to more than one value; edit it by hand');
        }

        if (finding.host === 'js-value') {
            return this.#moduleValue(finding);
        }

        if (finding.host === 'svg-attribute') {
            return skippedValue(finding, 'svg-attribute', 'var() in an SVG attribute does not work the same in every browser; move it to style or edit it by hand');
        }

        const buildTime = this.#needsBuildTimeValue(finding);
        let reason: SkippedValue | undefined;
        for (const candidate of candidates) {
            if (candidate.form === 'custom-property') {
                if (buildTime) {
                    continue;
                }
                return this.#tied(finding, candidate, candidates, buildTime) ?? this.#replace(finding, candidate, `var(${candidate.name})`, candidates);
            }
            const usable = this.#variableUsable(finding, candidate, buildTime);
            if (usable === true) {
                return this.#tied(finding, candidate, candidates, buildTime) ?? this.#replace(finding, candidate, candidate.name, candidates);
            }
            reason ??= usable;
        }
        if (reason) {
            return reason;
        }
        if (buildTime && !this.#language) {
            return skippedValue(finding, 'inline-style-function', `${describeContext(finding)} runs at build time; var() does not work there and inline styles can't import Sass variables`);
        }
        if (buildTime) {
            const variable = this.#language === 'less' ? '@variable' : '$variable';
            return skippedValue(finding, 'needs-preprocessor-variable', `${describeContext(finding)} runs at build time, where var() does not work, and no ${variable} with this value is available here`);
        }
        return 'no-token';
    }

    /**
     * Em SCSS/Sass/Less, o valor é calculado no build quando está numa função do pré-processador,
     * numa conta (`16px * 2`) ou numa media query: ali só `$x`/`@x` funcionam.
     */
    #needsBuildTimeValue(finding: Finding): boolean {
        if (finding.host !== 'scss' && finding.host !== 'sass' && finding.host !== 'less') {
            return false;
        }
        if (finding.property.startsWith('@')) {
            return true;
        }
        if (finding.function !== undefined && !CSS_FUNCTIONS.has(finding.function.toLowerCase())) {
            return true;
        }
        return nextToOperator(this.#source, finding.offset, finding.endOffset);
    }

    /** `true` se a variável funciona neste ponto do arquivo; senão o motivo (ou `undefined` se a forma não se aplica). */
    #variableUsable(finding: Finding, candidate: Candidate, buildTime: boolean): true | SkippedValue | undefined {
        const language = this.#language;
        const fits = candidate.form === 'less' ? language === 'less' : language === 'scss' || language === 'sass';
        if (!fits) {
            return undefined;
        }
        if (candidate.source === 'project') {
            const definition = candidate.definition!;
            const sameFile = definition.file === this.#file && (language === 'less' || definition.line < finding.line);
            const imported = definition.loadedBy?.includes(this.#file) || this.#loaded.some((l) => l.global && l.id === styleId(definition.file));
            if (sameFile || imported) {
                return true;
            }
            return buildTime
                ? skippedValue(finding, 'variable-not-loaded', `${candidate.name} has this value but ${definition.file} is not imported here`)
                : undefined;
        }
        // Gerado: só onde `var()` não serve; fora disso o `var()` do mesmo token vem antes
        if (!buildTime) {
            return undefined;
        }
        const tokensFile = candidate.form === 'less' ? this.#context.generatedFiles.less : this.#context.generatedFiles.scss;
        const load = this.#loaded.find((l) => l.id === styleId(tokensFile));
        if (load && !load.global) {
            return skippedValue(finding, 'variable-not-loaded', `${tokensFile} is loaded with a namespace here; write the token by hand`);
        }
        if (!load) {
            this.#needsImport = true;
        }
        return true;
    }

    /** Outro token do projeto serviria igualmente bem, com outro nome: escolher um seria palpite. */
    #tied(finding: Finding, chosen: Candidate, candidates: readonly Candidate[], buildTime: boolean): SkippedValue | undefined {
        if (chosen.source !== 'project') {
            return undefined;
        }
        const others = candidates.filter((c) => c.source === 'project' && c.form === chosen.form && c.uses === chosen.uses && c.name !== chosen.name
            && (c.form === 'custom-property' || this.#variableUsable(finding, c, buildTime) === true));
        if (others.length === 0) {
            return undefined;
        }
        const names = [chosen.name, ...new Set(others.map((c) => c.name))];
        return { ...skippedValue(finding, 'ambiguous-token', `${names.join(', ')} have this value and are used equally; pick one by hand`), alternatives: names };
    }

    /** Onde o JavaScript lê o valor, entra o caminho no módulo gerado: `color.indigo[600]`, trocando também as aspas. */
    #moduleValue(finding: Finding): SkippedValue | undefined {
        const unavailable = (detail: string) => skippedValue(finding, 'needs-token-module', `var() does not work where JavaScript reads this value (canvas, chart or unknown function); ${detail}`);
        const key = this.#context.approximate?.get(finding) ?? normalizeFinding(finding);
        const access = this.#context.index.module(finding.type, key);
        const moduleFile = /\.[mc]?tsx?$/.test(this.#file) ? this.#context.generatedFiles.ts : this.#context.generatedFiles.js;
        const facts = this.#context.scripts?.get(this.#file);
        if (!access || !moduleFile || this.#file.endsWith('.cjs') || !facts) {
            return unavailable('run tokentidy generate to create the token module, or edit it by hand');
        }
        if (!facts.isModule) {
            return unavailable('this file has no import or export, so the token module can\'t be imported; edit it by hand');
        }
        const quote = this.#source[finding.offset - 1];
        if (!quote || !'\'"`'.includes(quote) || this.#source[finding.endOffset] !== quote) {
            return unavailable('the value is part of a longer string; edit it by hand');
        }
        this.#module ??= new ModuleImport(this.#file, this.#source, moduleFile, facts);
        const text = `${this.#module.local(access.root)}${access.rest}`;
        const edit = { offset: finding.offset - 1, endOffset: finding.endOffset + 1, text };
        this.#edits.push(edit);
        this.#furthestEnd = Math.max(this.#furthestEnd, edit.endOffset);
        this.#replacements.push({ finding, token: text, source: 'generated', text, reason: 'generated', ...(key === normalizeFinding(finding) ? {} : { approximate: key }) });
        return undefined;
    }

    #replace(finding: Finding, candidate: Candidate, token: string, candidates: readonly Candidate[]): undefined {
        let text = token;
        if (finding.numeric) {
            // Número de JS/Angular: o token só existe como string (`padding: 'var(--x)'`)
            const quote = finding.host === 'angular-template' ? angularQuote(this.#source, finding) : (this.#quote ??= jsQuote(this.#source));
            text = `${quote}${token}${quote}`;
        }
        const edits: Edit[] = [{ offset: finding.offset, endOffset: finding.endOffset, text }];
        if (finding.unitSuffix && finding.impliedUnit) {
            edits.push({ ...finding.unitSuffix, text: '' });
        }
        // Duas trocas no mesmo trecho: a segunda fica de fora (os parsers atuais não geram isso, mas um futuro pode)
        if (edits.some((e) => e.offset < this.#furthestEnd && this.#edits.some((other) => e.offset < other.endOffset && other.offset < e.endOffset))) {
            this.overlaps.push(skippedValue(finding, 'overlap', 'another replacement already changes this text'));
            return undefined;
        }
        this.#edits.push(...edits);
        this.#furthestEnd = Math.max(this.#furthestEnd, ...edits.map((e) => e.endOffset));
        const alternatives = [...new Set(candidates.filter((c) => c.source === 'project' && c.name !== candidate.name).map((c) => c.name))];
        const approximate = this.#context.approximate?.get(finding);
        this.#replacements.push({
            finding, token: candidate.name, source: candidate.source, text,
            reason: candidate.source === 'alias' ? 'alias' : candidate.source === 'generated' ? 'generated' : alternatives.length > 0 ? 'most-used' : 'only-match',
            ...(candidate.definition ? { definedAt: candidate.definition } : {}),
            ...(alternatives.length > 0 ? { alternatives } : {}),
            ...(approximate === undefined ? {} : { approximate }),
        });
        return undefined;
    }

    result(): FilePlan {
        const edits = [...this.#edits];
        const moduleImport = this.#module?.edit();
        if (moduleImport) {
            edits.push(moduleImport);
        }
        if (this.#needsImport && this.#language) {
            const tokensFile = this.#language === 'less' ? this.#context.generatedFiles.less : this.#context.generatedFiles.scss;
            const { offset, text } = importInsertion(this.#source, this.#language, tokensFile, this.#file);
            edits.push({ offset, endOffset: offset, text });
        }
        return { file: this.#file, replacements: this.#replacements, edits: edits.sort((a, b) => a.offset - b.offset || a.endOffset - b.endOffset) };
    }
}

function skippedValue(finding: Finding, reason: SkipReason, message: string): SkippedValue {
    return { finding, reason, message };
}

function describeContext(finding: Finding): string {
    if (finding.property.startsWith('@')) {
        return `the ${finding.property} condition`;
    }
    if (finding.function?.startsWith('@')) {
        return `this ${finding.function} argument`;
    }
    return finding.function ? `${finding.function}()` : 'this expression';
}

/** O alias foi criado para esta ocorrência: mesmo arquivo, propriedade e seletor. */
function sameOccurrence(occurrence: { file: string; property: string; selector?: string }, finding: Finding): boolean {
    return occurrence.file === finding.file && occurrence.property === finding.property && occurrence.selector === finding.selector;
}
