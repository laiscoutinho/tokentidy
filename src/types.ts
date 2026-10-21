// Tipos compartilhados entre os módulos de análise.

/**
 * Tipo de token que um valor pode virar. É a decisão de design que o valor representa:
 * `16px` de `font-size` e `16px` de `line-height` são decisões diferentes e não se misturam.
 * - `size`: largura/altura de elemento quadrado (ícone, avatar, botão redondo);
 * - `container`: largura máxima de um bloco centralizado (conteúdo da página, card, modal).
 */
export type TokenType =
    | 'color'
    | 'spacing'
    | 'size'
    | 'container'
    | 'radius'
    | 'border-width'
    | 'font-family'
    | 'font-size'
    | 'font-weight'
    | 'line-height'
    | 'letter-spacing'
    | 'shadow'
    | 'opacity'
    | 'duration'
    | 'easing'
    | 'z-index';

/**
 * Linguagem em que o valor está escrito. Diz como um token pode ser usado ali:
 * `$cor` só existe em SCSS/Sass, `@cor` só em Less; `var(--cor)` funciona em todas.
 * - `html`: atributo `style=""` de HTML;
 * - `jsx`: objeto `style={{}}` do React;
 * - `angular-template`: `style=""`, `[style.x]` e `[ngStyle]` em template do Angular.
 */
export type Host = 'css' | 'scss' | 'sass' | 'less' | 'html' | 'jsx' | 'angular-template';

/**
 * Um valor visual solto encontrado no código.
 * O intervalo [offset, endOffset) é o trecho exato do arquivo: o autofix troca só ele,
 * e `source.slice(offset, endOffset) === value` sempre vale.
 */
export interface Finding {
    /** Caminho relativo à raiz analisada, sempre com `/` (igual em qualquer SO). */
    file: string;
    /** Linha e coluna começam em 1, como nos editores. */
    line: number;
    column: number;
    /** Posição absoluta no arquivo, começando em 0. */
    offset: number;
    /** Posição logo depois do fim do valor (exclusiva, como em `slice`). */
    endOffset: number;
    type: TokenType;
    /** Propriedade CSS onde o valor está, em kebab-case (ex.: `margin-top`), mesmo vindo de JSX (`marginTop`). */
    property: string;
    value: string;
    host: Host;
    /**
     * Onde o valor é aplicado: o seletor da regra (com o `&` do SCSS já resolvido)
     * ou, em estilo inline, o elemento (`button.remove`).
     */
    selector?: string;
    /** At-rules em volta, de fora para dentro (ex.: `@media (max-width: 600px)`). */
    atRules?: string[];
    /**
     * Função mais interna em volta do valor (`calc`, `linear-gradient`, `darken`).
     * O autofix precisa saber: funções do SCSS rodam no build e não aceitam `var()`.
     */
    function?: string;
    /** Unidade de um número escrito sem ela, que o host completa (`padding: 8` no React = `px`; `[style.width.rem]="2"` = `rem`). */
    impliedUnit?: string;
}

/** Sintaxe de uma definição de token já existente no projeto (`dtcg`: arquivo `*.tokens.json`). */
export type DefinitionSyntax = 'custom-property' | 'scss-variable' | 'less-variable' | 'dtcg';

/** Token que o projeto já define (`--cor: #fff`, `$cor: #fff`, `@cor: #fff`). */
export interface TokenDefinition {
    /** Nome como está escrito, com o prefixo (`--cor`, `$cor`, `@cor`); no DTCG, o caminho (`color.primary`). */
    name: string;
    syntax: DefinitionSyntax;
    /** Valor como está escrito. Pode ser outra variável (`$a: $b`). */
    value: string;
    file: string;
    line: number;
    column: number;
    selector?: string;
    /** Tipo declarado no DTCG (`$type`), quando houver. */
    dtcgType?: string;
}

/** Uso de um token existente (`var(--cor)`, `$cor`, `@cor`) dentro de uma propriedade. */
export interface TokenReference {
    name: string;
    property: string;
    file: string;
    line: number;
    selector?: string;
}

/** Arquivo que não pôde ser analisado (ex.: erro de sintaxe). Não interrompe a análise dos outros. */
export interface AnalysisError {
    file: string;
    line: number;
    column: number;
    message: string;
}
