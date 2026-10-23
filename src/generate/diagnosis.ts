// Diagnóstico da escala: quantos valores diferentes o projeto usa por tipo, quantos viraram token
// e que parte dos usos já cai num token. Comparado com sistemas maduros, nunca limitado por eles:
// um projeto pode precisar de mais degraus, mas 40 espaçamentos diferentes costumam ser inconsistência.

import type { TokenType } from '../types.ts';

/** Escalas de referência: quantos degraus sistemas maduros usam. */
const REFERENCES = new Map<TokenType, { system: string; steps: number }>([
    // Carbon: spacing-01 a spacing-13
    ['spacing', { system: 'Carbon', steps: 13 }],
    // Material 3: display, headline, title, body e label, cada um em L/M/S
    ['font-size', { system: 'Material 3', steps: 15 }],
]);

export interface TypeDiagnosis {
    type: TokenType;
    /** Valores diferentes (depois da normalização). */
    distinct: number;
    /** Valores com token: os gerados agora e os que o projeto já tinha. */
    steps: number;
    uses: number;
    /** Usos de valores com token. */
    onStep: number;
    /** `onStep / uses`, de 0 a 1. */
    consistency: number;
    /** Valores usados uma vez só: os primeiros candidatos a consolidar. */
    singleUse: number;
    /** Presente quando o tipo tem escala de referência. */
    reference?: { system: string; steps: number };
}

interface Counted {
    type: TokenType;
    key: string;
    count: number;
}

/** Junta tokens, valores reutilizados e valores abaixo do mínimo de usos, por tipo, na ordem de `order`. */
export function diagnose(onStep: readonly Counted[], offStep: readonly Counted[], order: readonly TokenType[]): TypeDiagnosis[] {
    const byType = new Map<TokenType, { keys: Set<string>; steps: Set<string>; uses: number; onStep: number; singleUse: number }>();
    const add = (item: Counted, isStep: boolean) => {
        let entry = byType.get(item.type);
        if (!entry) {
            entry = { keys: new Set(), steps: new Set(), uses: 0, onStep: 0, singleUse: 0 };
            byType.set(item.type, entry);
        }
        entry.keys.add(item.key);
        entry.uses += item.count;
        if (isStep) {
            entry.steps.add(item.key);
            entry.onStep += item.count;
        }
        if (item.count === 1) {
            entry.singleUse++;
        }
    };
    onStep.forEach((item) => add(item, true));
    offStep.forEach((item) => add(item, false));

    return order.filter((type) => byType.has(type)).map((type) => {
        const entry = byType.get(type)!;
        const reference = REFERENCES.get(type);
        return {
            type,
            distinct: entry.keys.size,
            steps: entry.steps.size,
            uses: entry.uses,
            onStep: entry.onStep,
            consistency: entry.uses === 0 ? 1 : Math.round((entry.onStep / entry.uses) * 1000) / 1000,
            singleUse: entry.singleUse,
            ...(reference ? { reference } : {}),
        };
    });
}

/** Uma linha por tipo: `18 values, 9 tokens, 82% of uses on a token; above Carbon's 13 spacing steps, 7 values used once`. */
export function describe(diagnosis: TypeDiagnosis): string {
    const { type, distinct, steps, consistency, singleUse, reference } = diagnosis;
    const text = `${distinct} ${distinct === 1 ? 'value' : 'values'}, ${steps} ${steps === 1 ? 'token' : 'tokens'}, ${Math.round(consistency * 100)}% of uses on a token`;
    if (reference && distinct > reference.steps) {
        return `${text}; above ${reference.system}'s ${reference.steps} ${type} steps, ${singleUse} ${singleUse === 1 ? 'value' : 'values'} used once`;
    }
    return text;
}
