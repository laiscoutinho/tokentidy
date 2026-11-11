/**
 * Props de componente que recebem valor de CSS: `<Flex gap="1rem">`, `<Box padding="8px" color="#fff">`.
 * O componente repassa o valor para o estilo, então é um valor solto como outro qualquer. Mas o tipo da prop
 * é do componente: ele pode aceitar um passo da escala (`gap={2}`) ou um nome (`size="small"`), não `var()`.
 * Por isso só texto com unidade ou cor é lido, e o `fix` só reporta (host `component-prop`).
 */

import type * as t from '@babel/types';

import { toKebabCase } from '../collector.ts';
import type { FileCollector } from '../collector.ts';
import { literals } from './style-object.ts';

/** Props lidas quando a configuração não diz outras (`componentProps`). */
export const DEFAULT_COMPONENT_PROPS: ReadonlySet<string> = new Set([
    'gap', 'rowGap', 'columnGap',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingX', 'paddingY',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginX', 'marginY',
    'color', 'backgroundColor', 'borderColor', 'borderRadius', 'fontSize', 'lineHeight',
]);

/** A prop no nome da propriedade CSS que ela costuma alimentar. */
const PROPERTY_OF = new Map([['paddingX', 'padding-inline'], ['paddingY', 'padding-block'], ['marginX', 'margin-inline'], ['marginY', 'margin-block']]);

/** `<Flex>`, `<UI.Stack>`: começa com maiúscula ou é membro. Elemento HTML e SVG não é componente. */
export function isComponent(name: t.JSXOpeningElement['name']): boolean {
    if (name.type === 'JSXIdentifier') {
        return /^[A-Z]/.test(name.name);
    }
    return name.type === 'JSXMemberExpression';
}

export function componentProp(collector: FileCollector, attr: t.JSXAttribute, name: string, selector: string): void {
    const value = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
    if (!value || value.type === 'JSXEmptyExpression' || value.type === 'JSXElement' || value.type === 'JSXFragment') {
        return;
    }
    // Número puro é passo da escala do componente (`gap={2}` = 2 × 4px no `Flex`), não medida
    for (const literal of literals(collector.source, value).filter((l) => !l.numeric)) {
        collector.declaration({
            property: PROPERTY_OF.get(name) ?? toKebabCase(name), value: literal.text, offset: literal.offset,
            host: 'component-prop', siblings: new Map(), selector,
            ...(literal.branch === undefined ? {} : { branch: literal.branch }),
        });
    }
}
