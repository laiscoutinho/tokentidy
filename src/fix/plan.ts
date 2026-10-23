// Planejamento do `fix`, sem tocar no disco: para cada valor solto, qual token entra, como é escrito ali,
// ou por que fica como está. Mesma entrada, mesma saída.

import path from 'node:path';

import { normalizeFinding } from '../suggest/normalize.ts';
import type { Finding } from '../types.ts';
import type { Candidate, CandidateSource, TokenIndex } from './candidates.ts';
import { importInsertion, loadedFiles, styleId } from './imports.ts';
import type { LoadedFile, Preprocessor } from './imports.ts';

/** Troca de um trecho do arquivo: [offset, endOffset) vira `text` (inserção quando os dois são iguais). */
export interface Edit {
    offset: number;
    endOffset: number;
    text: string;
}

export interface Replacement {
    finding: Finding;
    /** Token como foi escrito (`--color-primary`, `$primary`). */
    token: string;
    source: CandidateSource;
    /** Texto que entra no lugar do valor (`var(--color-primary)`, `'var(--spacing-2)'`). */
    text: string;
}

/**
 * Por que um valor com token não foi trocado:
 * - `needs-preprocessor-variable`: SCSS/Less precisam do valor no build (função, conta, media query) e não há `$x`/`@x`;
 * - `inline-style-function`: o mesmo caso num `styles:` inline do Angular, onde `$x` não pode ser importado;
 * - `variable-not-loaded`: a variável existe, mas o arquivo não a carrega (ou carrega com namespace);
 * - `unit-in-binding`: `[style.width.px]="a ? 16 : 24"`: a unidade no nome vale para os dois valores;
 * - `overlap`: duas trocas no mesmo trecho;
 * - `breaks-syntax`: o arquivo corrigido teria erro de sintaxe;
 * - `changed-on-disk`: o arquivo mudou durante a execução;
 * - `symlink`, `outside-root`: o arquivo não é escrito por segurança.
 */
export type SkipReason =
    | 'needs-preprocessor-variable'
    | 'inline-style-function'
    | 'variable-not-loaded'
    | 'unit-in-binding'
    | 'overlap'
    | 'breaks-syntax'
    | 'changed-on-disk'
    | 'symlink'
    | 'outside-root';

export interface SkippedValue {
    finding: Finding;
    reason: SkipReason;
    message: string;
}

export interface FilePlan {
    file: string;
    replacements: Replacement[];
    /** Trocas dos valores, unidades removidas e imports, em ordem de posição, sem sobreposição. */
    edits: Edit[];
}

export interface FixPlan {
    files: FilePlan[];
    skipped: SkippedValue[];
    /** Valores sem token com o mesmo valor: o `generate` cria os tokens. */
    withoutToken: Finding[];
}

export interface PlanContext {
    index: TokenIndex;
    /** Conteúdo dos arquivos com achados. */
    sources: ReadonlyMap<string, string>;
    /** Arquivos de tokens gerados, relativos à raiz (`design-tokens/_tokens.scss`). */
    generatedFiles: { scss: string; less: string };
}

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
    readonly overlaps: SkippedValue[] = [];

    constructor(file: string, source: string, context: PlanContext) {
        this.#file = file;
        this.#source = source;
        this.#context = context;
        this.#language = PREPROCESSOR_EXTENSIONS.get(path.extname(file).toLowerCase());
        this.#loaded = this.#language ? loadedFiles(source, file) : [];
    }

    /** Troca planejada (`undefined`), sem token (`'no-token'`) ou o motivo de não trocar. */
    plan(finding: Finding): SkippedValue | 'no-token' | undefined {
        const candidates = this.#context.index.lookup(finding.type, normalizeFinding(finding))
            .filter((c) => c.source !== 'alias' || c.occurrences?.some((o) => sameOccurrence(o, finding)));
        if (candidates.length === 0) {
            return 'no-token';
        }
        if (finding.host === 'angular-template' && finding.impliedUnit && !finding.unitSuffix) {
            return skip(finding, 'unit-in-binding', 'the unit in the binding name applies to more than one value; edit it by hand');
        }

        const buildTime = this.#needsBuildTimeValue(finding);
        let reason: SkippedValue | undefined;
        for (const candidate of candidates) {
            if (candidate.form === 'custom-property') {
                if (buildTime) {
                    continue;
                }
                return this.#replace(finding, candidate, `var(${candidate.name})`);
            }
            const usable = this.#variableUsable(finding, candidate, buildTime);
            if (usable === true) {
                return this.#replace(finding, candidate, candidate.name);
            }
            reason ??= usable;
        }
        if (reason) {
            return reason;
        }
        if (buildTime && !this.#language) {
            return skip(finding, 'inline-style-function', `${describeContext(finding)} runs at build time; var() does not work there and inline styles can't import Sass variables`);
        }
        if (buildTime) {
            const variable = this.#language === 'less' ? '@variable' : '$variable';
            return skip(finding, 'needs-preprocessor-variable', `${describeContext(finding)} runs at build time, where var() does not work, and no ${variable} with this value is available here`);
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
            const imported = this.#loaded.some((l) => l.global && l.id === styleId(definition.file));
            if (sameFile || imported) {
                return true;
            }
            return buildTime
                ? skip(finding, 'variable-not-loaded', `${candidate.name} has this value but ${definition.file} is not imported here`)
                : undefined;
        }
        // Gerado: só onde `var()` não serve; fora disso o `var()` do mesmo token vem antes
        if (!buildTime) {
            return undefined;
        }
        const tokensFile = candidate.form === 'less' ? this.#context.generatedFiles.less : this.#context.generatedFiles.scss;
        const load = this.#loaded.find((l) => l.id === styleId(tokensFile));
        if (load && !load.global) {
            return skip(finding, 'variable-not-loaded', `${tokensFile} is loaded with a namespace here; write the token by hand`);
        }
        if (!load) {
            this.#needsImport = true;
        }
        return true;
    }

    #replace(finding: Finding, candidate: Candidate, token: string): undefined {
        let text = token;
        if (finding.numeric) {
            // Número de JS/Angular: o token só existe como string (`padding: 'var(--x)'`)
            const quote = finding.host === 'angular-template' ? angularQuote(this.#source, finding) : jsQuote(this.#source);
            text = `${quote}${token}${quote}`;
        }
        const edits: Edit[] = [{ offset: finding.offset, endOffset: finding.endOffset, text }];
        if (finding.unitSuffix && finding.impliedUnit) {
            edits.push({ ...finding.unitSuffix, text: '' });
        }
        // Duas trocas no mesmo trecho: a segunda fica de fora (os parsers atuais não geram isso, mas um futuro pode)
        if (edits.some((e) => this.#edits.some((other) => e.offset < other.endOffset && other.offset < e.endOffset))) {
            this.overlaps.push(skip(finding, 'overlap', 'another replacement already changes this text'));
            return undefined;
        }
        this.#edits.push(...edits);
        this.#replacements.push({ finding, token: candidate.name, source: candidate.source, text });
        return undefined;
    }

    result(): FilePlan {
        const edits = [...this.#edits];
        if (this.#needsImport && this.#language) {
            const tokensFile = this.#language === 'less' ? this.#context.generatedFiles.less : this.#context.generatedFiles.scss;
            const { offset, text } = importInsertion(this.#source, this.#language, tokensFile, this.#file);
            edits.push({ offset, endOffset: offset, text });
        }
        return { file: this.#file, replacements: this.#replacements, edits: edits.sort((a, b) => a.offset - b.offset || a.endOffset - b.endOffset) };
    }
}

function skip(finding: Finding, reason: SkipReason, message: string): SkippedValue {
    return { finding, reason, message };
}

function describeContext(finding: Finding): string {
    if (finding.property.startsWith('@')) {
        return `the ${finding.property} condition`;
    }
    return finding.function ? `${finding.function}()` : 'this expression';
}

/** O alias foi criado para esta ocorrência: mesmo arquivo, propriedade e seletor. */
function sameOccurrence(occurrence: { file: string; property: string; selector?: string }, finding: Finding): boolean {
    return occurrence.file === finding.file && occurrence.property === finding.property && occurrence.selector === finding.selector;
}

/**
 * Valor ao lado de um operador (`16px * 2`, `$a + 8px`, `12px/1.5`): no SCSS/Less é conta feita no build.
 * O `-` só conta com espaço depois (`$a - 8px`); colado é o sinal do número.
 */
export function nextToOperator(source: string, start: number, end: number): boolean {
    let before = start - 1;
    while (before >= 0 && (source[before] === ' ' || source[before] === '\t')) {
        before--;
    }
    let after = end;
    while (after < source.length && (source[after] === ' ' || source[after] === '\t')) {
        after++;
    }
    const isOperator = (index: number, minusIsOperator: boolean) => {
        const char = source[index];
        return char === '*' || char === '/' || char === '+' || char === '%' || (char === '-' && minusIsOperator);
    };
    // Antes do valor: `$a - 16px` é conta, `$a -16px` não chega aqui (o `-` é parte do valor).
    // Depois: `16px - $a` é conta, `16px -$a` é uma lista de dois valores.
    const spaceAfter = (index: number) => source[index + 1] === ' ' || source[index + 1] === '\t';
    return isOperator(before, before < start - 1) || isOperator(after, spaceAfter(after));
}

/** Aspas mais usadas nos valores de objetos do arquivo (`padding: '8px'`); empate fica com a simples. */
function jsQuote(source: string): string {
    const single = source.match(/:\s*'/g)?.length ?? 0;
    const double = source.match(/:\s*"/g)?.length ?? 0;
    return double > single ? '"' : "'";
}

/**
 * Aspas para uma string dentro de uma expressão do Angular. No `[ngStyle]="{'width.px': 16}"`, as mesmas da chave;
 * no `[style.width.px]="16"`, as que não delimitam o atributo.
 */
function angularQuote(source: string, finding: Finding): string {
    const afterName = finding.unitSuffix ? source[finding.unitSuffix.endOffset] : undefined;
    if (afterName === "'" || afterName === '"') {
        return afterName;
    }
    const delimiter = /^\]?\s*=\s*(["'])/.exec(source.slice(finding.unitSuffix?.endOffset ?? finding.offset))?.[1]
        ?? delimiterBefore(source, finding.offset);
    return delimiter === "'" ? '"' : "'";
}

/** Aspas que abrem o atributo em volta de `offset` (sem a unidade no nome, não há outra referência). */
function delimiterBefore(source: string, offset: number): string | undefined {
    const equals = source.lastIndexOf('=', offset);
    return /^=\s*(["'])/.exec(source.slice(equals))?.[1];
}
