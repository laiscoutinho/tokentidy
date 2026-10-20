// Tipos compartilhados entre os módulos de análise.

export type FindingKind = 'color' | 'spacing' | 'typography';

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
    kind: FindingKind;
    /** Propriedade CSS onde o valor está, em kebab-case (ex.: `margin-top`). */
    property: string;
    value: string;
}

/** Arquivo que não pôde ser analisado (ex.: erro de sintaxe). Não interrompe a análise dos outros. */
export interface AnalysisError {
    file: string;
    line: number;
    column: number;
    message: string;
}
