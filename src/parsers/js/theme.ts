/**
 * Temas JS (`createTheme`, `<ThemeProvider theme={…}>`) como fonte de tokens: `theme.palette.primary.main` é uma
 * decisão do projeto, com o valor exato escrito ali. Só strings entram: `spacing: 8` não diz a unidade nem o papel.
 */

import type * as t from '@babel/types';

import { rulesForProperty } from '../../analysis/rules.ts';
import { toKebabCase } from '../collector.ts';
import type { FileCollector } from '../collector.ts';

const MAX_DEPTH = 16;
/** Estilos de componentes dentro do tema (MUI `components`, Chakra `styles`): não são escala, são uso. */
const NOT_SCALE = new Set(['components', 'overrides', 'styles']);

function keyOf(prop: t.ObjectProperty): string | undefined {
    if (prop.computed) {
        return undefined;
    }
    return prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : undefined;
}

export function themeDefinitions(collector: FileCollector, object: t.ObjectExpression, follow: (value: t.Expression) => t.ObjectExpression[]): void {
    const walk = (node: t.ObjectExpression, trail: readonly string[], depth: number): void => {
        if (depth > MAX_DEPTH) {
            return;
        }
        for (const prop of node.properties) {
            const key = prop.type === 'ObjectProperty' ? keyOf(prop) : undefined;
            if (prop.type !== 'ObjectProperty' || key === undefined || NOT_SCALE.has(key)) {
                continue;
            }
            const value = prop.value as t.Expression;
            const path = [...trail, key];
            if (value.type === 'StringLiteral') {
                // O nome da chave só diz o tipo quando é uma propriedade CSS (`borderRadius`); `main` fica para o valor decidir
                const type = rulesForProperty(toKebabCase(key))[0]?.type;
                collector.definition(path.join('.'), 'js-theme', value.value, value.start! + 1, undefined, type);
            } else {
                for (const nested of follow(value)) {
                    walk(nested, path, depth + 1);
                }
            }
        }
    };
    walk(object, ['theme'], 0);
}
