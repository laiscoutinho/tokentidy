// Tipos compartilhados entre os módulos de análise.

/**
 * Tipo de token que um valor pode virar. É a decisão de design que o valor representa:
 * `16px` de `font-size` e `16px` de `line-height` são decisões diferentes e não se misturam.
 * - `size`: largura/altura de elemento quadrado (ícone, avatar, botão redondo);
 * - `container`: largura máxima de um bloco centralizado (conteúdo da página, card, modal);
 * - `breakpoint`: medida em condição de `@media`/`@container` (`(min-width: 768px)`).
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
    | 'z-index'
    | 'breakpoint';

/**
 * Linguagem em que o valor está escrito. Diz como um token pode ser usado ali:
 * `$cor` só existe em SCSS/Sass, `@cor` só em Less; `var(--cor)` funciona em todas.
 * - `html`: atributo `style=""` de HTML;
 * - `jsx`: objeto `style={{}}` do React;
 * - `angular-template`: `style=""`, `[style.x]` e `[ngStyle]` em template do Angular.
 */
/**
 * Onde o valor está escrito, o que decide como o `fix` escreve o token.
 * `css-in-js`: CSS em template literal. `js-value`: valor lido por JavaScript (canvas, gráfico, destino desconhecido), onde `var()` pode não funcionar. `svg-attribute`: atributo de apresentação do SVG (`fill="#fff"`), onde o suporte a `var()` varia entre navegadores.
 */
export type Host = 'css' | 'scss' | 'sass' | 'less' | 'html' | 'jsx' | 'angular-template' | 'css-in-js' | 'js-value' | 'svg-attribute';

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
    /** Regra que gerou o achado (`color/hardcoded`): é o id usado nos comentários de ignorar. */
    rule: string;
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
    /**
     * Trecho da unidade no nome do binding do Angular (`.px` em `[style.width.px]="16"`), quando o valor é um literal só.
     * O autofix tira a unidade junto: `var(--x)px` não é um valor válido.
     */
    unitSuffix?: { offset: number; endOffset: number };
    /** O valor é um número de JavaScript ou de expressão do Angular (`padding: 8`, `[style.opacity]="0.5"`): o token entra como string. */
    numeric?: true;
    /** Token que serve para este valor, calculado pelo `check` (nunca escreve nada). */
    suggestion?: TokenSuggestion;
}

/**
 * Token sugerido para um valor solto.
 * `exact`: mesmo valor, é o que o `fix` trocaria (ou os empatados, em `alternatives`).
 * `near`: valor próximo, só informativo: quem decide é a pessoa, e o `fix` não troca.
 */
export interface TokenSuggestion {
    token: string;
    match: 'exact' | 'near';
    /** `near`: em medidas, token − valor em px; em cores, ΔEOK. */
    distance?: number;
    /** Tokens empatados com `token`. */
    alternatives?: string[];
}

/**
 * Valor que pode ser uma decisão de design, mas o contexto não basta para afirmar (`width: 300px` solto).
 * Aparece na saída para revisão; nunca falha o CI e nunca vira token.
 */
export interface ReviewItem extends Omit<Finding, 'type'> {
    /** Tipo provável, quando há um. */
    type?: TokenType;
    /** Por que é revisão e não violação. */
    message: string;
}

/** Aviso sobre o próprio uso da ferramenta (comentário de ignorar sem efeito). Não muda o exit code. */
export interface AnalysisWarning {
    file: string;
    line: number;
    column: number;
    /** `ignore/unused`, `ignore/unknown-rule`, `ignore/too-broad`. */
    rule: string;
    message: string;
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
    /** `$deprecated` do DTCG: `true` ou o motivo. */
    deprecated?: true | string;
}

/** Uso de um token existente (`var(--cor)`, `$cor`, `@cor`) dentro de uma propriedade. */
export interface TokenReference {
    name: string;
    property: string;
    file: string;
    /** Posição do nome do token no arquivo. */
    line: number;
    column: number;
    selector?: string;
    /** Segundo argumento de `var(--x, 12px)`, como está escrito. */
    fallback?: string;
}

/** Arquivo que não pôde ser analisado (ex.: erro de sintaxe). Não interrompe a análise dos outros. */
export interface AnalysisError {
    file: string;
    line: number;
    column: number;
    message: string;
}
