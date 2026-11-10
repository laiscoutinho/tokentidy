import type { ScriptFacts } from './script-facts.ts';
// Os tipos do plano do `fix`, separados da lógica em `plan.ts`.

import type { Finding } from '../types.ts';
import type { CandidateSource, TokenIndex } from '../token-lookup.ts';

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
    /** Por que este token: `alias` (criado para este uso), `most-used`, `only-match` ou `generated`. */
    reason: ReplacementReason;
    /** Onde o token foi escrito à mão; token gerado não tem. */
    definedAt?: { file: string; line: number };
    /** Outros tokens do projeto com o mesmo valor, que perderam a escolha. */
    alternatives?: string[];
    /** Troca aproximada, já autorizada: o valor que o token tem. */
    approximate?: string;
}

export type ReplacementReason = 'alias' | 'most-used' | 'only-match' | 'generated';

/**
 * Por que um valor com token não foi trocado:
 * - `needs-preprocessor-variable`: SCSS/Less precisam do valor no build (função, conta, media query) e não há `$x`/`@x`;
 * - `inline-style-function`: o mesmo caso num `styles:` inline do Angular, onde `$x` não pode ser importado;
 * - `variable-not-loaded`: a variável existe, mas o arquivo não a carrega (ou carrega com namespace);
 * - `unit-in-binding`: `[style.width.px]="a ? 16 : 24"`: a unidade no nome vale para os dois valores;
 * - `needs-token-module`: valor lido por JavaScript (canvas, gráfico), onde `var()` não funciona;
 * - `svg-attribute`: atributo de apresentação do SVG, onde o suporte a `var()` varia entre navegadores;
 * - `ambiguous-token`: dois tokens do projeto com o mesmo valor e o mesmo uso: quem escolhe é a pessoa;
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
    | 'needs-token-module'
    | 'svg-attribute'
    | 'ambiguous-token'
    | 'overlap'
    | 'breaks-syntax'
    | 'changed-on-disk'
    | 'symlink'
    | 'outside-root';

export interface SkippedValue {
    finding: Finding;
    reason: SkipReason;
    message: string;
    /** `ambiguous-token`: os tokens empatados. */
    alternatives?: string[];
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
    generatedFiles: { scss: string; less: string; ts?: string; js?: string };
    /** Só dos arquivos com valor lido pelo JavaScript: é o que decide como importar o módulo de tokens. */
    scripts?: ReadonlyMap<string, ScriptFacts>;
    /** Trocas aproximadas autorizadas: achado → valor do token que ele recebe. */
    approximate?: ReadonlyMap<Finding, string>;
}
