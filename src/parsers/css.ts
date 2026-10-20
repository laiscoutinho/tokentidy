// Parser de CSS e SCSS: percorre as declarações com PostCSS e entrega cada valor para o css-values.
// Aqui fica só o "como percorrer"; o "o que é violação" está em rules.ts e css-values.ts.

import postcss, { CssSyntaxError } from 'postcss';
import scss from 'postcss-scss';
import type { Root } from 'postcss';

import { createPositionLookup } from '../position.ts';
import { ruleForProperty } from '../rules.ts';
import type { AnalysisError, Finding } from '../types.ts';
import { findValues } from './css-values.ts';

export type CssSyntax = 'css' | 'scss';

export interface ParseResult {
    findings: Finding[];
    errors: AnalysisError[];
}

/**
 * Analisa o conteúdo de um arquivo CSS ou SCSS.
 * Erro de sintaxe não lança exceção: volta em `errors`, para a análise dos outros arquivos continuar.
 */
export function parseCss(source: string, file: string, syntax: CssSyntax): ParseResult {
    let root: Root;
    try {
        root = syntax === 'scss' ? scss.parse(source) : postcss.parse(source);
    } catch (error) {
        if (error instanceof CssSyntaxError) {
            return { findings: [], errors: [{ file, line: error.line ?? 1, column: error.column ?? 1, message: error.reason }] };
        }
        throw error;
    }

    const positionOf = createPositionLookup(source);
    // O PostCSS descarta o BOM do início do arquivo e conta os offsets sem ele
    const bom = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    const findings: Finding[] = [];

    root.walkDecls((decl) => {
        const rule = ruleForProperty(decl.prop);
        const declOffset = decl.source?.start?.offset;
        if (!rule || declOffset === undefined) {
            return;
        }
        const start = declOffset + bom;

        // O PostCSS tira comentários de `decl.value`; o texto original fica em `raws.value.raw`.
        // As posições precisam ser as do texto original.
        const rawValue = decl.raws.value?.raw ?? decl.value;
        const valueOffset = start + decl.prop.length + (decl.raws.between?.length ?? 0);

        for (const match of findValues(rawValue, rule.match)) {
            const offset = valueOffset + match.start;
            findings.push({
                file,
                ...positionOf(offset),
                offset,
                endOffset: valueOffset + match.end,
                kind: rule.kind,
                property: decl.prop.toLowerCase(),
                value: match.text,
            });
        }
    });

    return { findings, errors: [] };
}
