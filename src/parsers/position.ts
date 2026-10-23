/**
 * Converte offset (posição absoluta no texto) em linha e coluna.
 * Fica fora dos parsers porque cada parser informa posição de um jeito; o offset é o denominador comum.
 */

export interface Position {
    line: number;
    column: number;
}

/**
 * Prepara um conversor de offset → linha/coluna (ambas começando em 1).
 * Guarda o início de cada linha uma vez e depois faz busca binária: O(log n) por consulta.
 * A coluna conta unidades UTF-16, igual aos índices de string do JavaScript.
 * O BOM do início do arquivo é invisível no editor: não conta na coluna da linha 1 (o offset continua contando).
 */
export function createPositionLookup(text: string): (offset: number) => Position {
    const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const lineStarts = [bom];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            lineStarts.push(i + 1);
        }
    }

    return (offset) => {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid]! <= offset) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return { line: low + 1, column: Math.max(offset - lineStarts[low]!, 0) + 1 };
    };
}
