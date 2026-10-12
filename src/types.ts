// Tipos compartilhados entre os módulos de análise.

export type FindingKind = 'color' | 'spacing' | 'typography';

/**
 * Um valor visual solto encontrado no código.
 * O offset (posição absoluta no arquivo) é o que permite o autofix editar só o trecho.
 */
export interface Finding {
    file: string;
    line: number;
    column: number;
    offset: number;
    kind: FindingKind;
    value: string;
}
