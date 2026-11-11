/**
 * CSS dentro de template literal (styled-components, Emotion). Cada `${…}` vira um trecho do mesmo tamanho,
 * então as posições do CSS continuam iguais às do arquivo. O restante é a mesma análise de uma folha de estilo.
 */

import type * as t from '@babel/types';

import type { FileCollector } from '../collector.ts';
import { walkStylesheet } from '../css/stylesheet.ts';

const CSS_TAGS = new Set(['styled', 'css', 'keyframes', 'createGlobalStyle', 'injectGlobal']);

/** O identificador na origem do tag: `styled.div`, `styled(Button).attrs(…)`, `styled.div<Props>`. */
export function rootName(node: t.Node): string | undefined {
    switch (node.type) {
        case 'Identifier':
            return node.name;
        case 'MemberExpression':
            return rootName(node.object);
        case 'CallExpression':
            return rootName(node.callee);
        case 'TSInstantiationExpression':
            return rootName(node.expression);
        default:
            return undefined;
    }
}

export function isCssTag(node: t.Node): boolean {
    const name = rootName(node);
    return name !== undefined && CSS_TAGS.has(name);
}

export function walkCssTemplate(collector: FileCollector, template: t.TemplateLiteral): void {
    const built = templateText(collector.source, template);
    if (built) {
        walkSection(collector, built, 0, built.text.length, 'css-in-js');
    }
}

/** O texto do template com cada `${…}` trocado por um trecho do mesmo tamanho, e onde ficavam os buracos. */
export interface TemplateText {
    text: string;
    start: number;
    holes: { start: number; end: number }[];
}

export function templateText(source: string, template: t.TemplateLiteral): TemplateText | undefined {
    const first = template.quasis[0];
    const last = template.quasis.at(-1);
    if (!first || !last) {
        return undefined;
    }
    const start = first.start!;
    const end = last.end!;
    const holes = template.quasis.slice(0, -1).map((quasi, i) => ({ start: quasi.end!, end: template.quasis[i + 1]!.start! }));
    let text = '';
    let cursor = start;
    for (const hole of holes) {
        text += source.slice(cursor, hole.start);
        text += placeholder(text, source.slice(hole.end, end), hole.end - hole.start);
        cursor = hole.end;
    }
    text += source.slice(cursor, end);
    return { text, start, holes };
}

/** Analisa `text.slice(from, to)` como folha de estilo, nas posições do arquivo. */
export function walkSection(collector: FileCollector, built: TemplateText, from: number, to: number, host: 'css-in-js' | 'css-string'): void {
    const { findings, review } = collector.result;
    const findingsBefore = findings.length;
    const reviewBefore = review.length;
    walkStylesheet(collector, built.text.slice(from, to), built.start + from, 'scss', host);

    // Valor reportado inteiro (`font-family`, `box-shadow`) que contém um `${…}` não é valor solto
    const touchesHole = (item: { offset: number; endOffset: number }) => built.holes.some((hole) => item.offset < hole.end && hole.start < item.endOffset);
    collector.result.findings = [...findings.slice(0, findingsBefore), ...findings.slice(findingsBefore).filter((item) => !touchesHole(item))];
    collector.result.review = [...review.slice(0, reviewBefore), ...review.slice(reviewBefore).filter((item) => !touchesHole(item))];
}

/** Sozinho numa instrução (`${mixin};`) é um comentário, que o CSS aceita ali; no resto, um identificador. */
function placeholder(before: string, after: string, length: number): string {
    const previous = before.trimEnd().at(-1);
    const next = after.trimStart()[0];
    const startsStatement = previous === undefined || previous === ';' || previous === '{' || previous === '}';
    const endsStatement = next === undefined || next === ';' || next === '}' || /^[ \t]*\r?\n/.test(after);
    return startsStatement && endsStatement && length >= 4 ? `/*${'_'.repeat(length - 4)}*/` : '_'.repeat(length);
}
