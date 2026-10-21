// Parser de HTML: estilo inline (`style="..."`) e blocos `<style>`.
// O parse5 segue o algoritmo de parsing do padrão HTML (o mesmo dos navegadores), então nunca falha
// em HTML "torto" e informa a posição de cada atributo e de cada texto.

import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

import { FileCollector, elementSelector } from './collector.ts';
import type { ParseResult } from './collector.ts';
import { walkDeclarationList, walkStylesheet } from './css.ts';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export function parseHtml(source: string, file: string): ParseResult {
    const collector = new FileCollector(file, source);
    const document = parse(source, { sourceCodeLocationInfo: true });
    visit(document, (node) => {
        if (!('tagName' in node)) {
            return;
        }
        const element = node as Element;
        if (element.tagName === 'style') {
            for (const child of element.childNodes) {
                const location = child.sourceCodeLocation;
                if (child.nodeName === '#text' && location) {
                    walkStylesheet(collector, source.slice(location.startOffset, location.endOffset), location.startOffset, 'css');
                }
            }
            return;
        }
        const style = attributeValueRange(source, element, 'style');
        if (style) {
            walkDeclarationList(collector, source.slice(style.start, style.end), style.start, 'html', elementSelector(element.tagName, element.attrs));
        }
    });
    return collector.result;
}

function visit(node: Node, callback: (node: Node) => void): void {
    callback(node);
    if ('childNodes' in node) {
        for (const child of node.childNodes) {
            visit(child, callback);
        }
    }
    // Conteúdo de `<template>` fica num fragmento à parte
    if ('content' in node && node.content) {
        visit(node.content, callback);
    }
}

/**
 * Posição do valor de um atributo no arquivo, sem as aspas.
 * O parse5 informa onde o atributo inteiro começa e termina (`style="..."`); o valor é o que vem depois do `=`.
 * O texto é lido do arquivo, não do valor decodificado pelo parse5, para as posições baterem com o arquivo.
 */
function attributeValueRange(source: string, element: Element, name: string): { start: number; end: number } | undefined {
    const location = element.sourceCodeLocation?.attrs?.[name];
    if (!location) {
        return undefined;
    }
    let i = location.startOffset + name.length;
    while (i < location.endOffset && source[i] !== '=') {
        i++;
    }
    i++;
    while (i < location.endOffset && (source[i] === ' ' || source[i] === '\t' || source[i] === '\n' || source[i] === '\r')) {
        i++;
    }
    if (i >= location.endOffset) {
        return undefined;
    }
    const quote = source[i];
    return quote === '"' || quote === "'"
        ? { start: i + 1, end: location.endOffset - 1 }
        : { start: i, end: location.endOffset };
}
