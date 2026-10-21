// Aliases semânticos: o papel de uma cor na interface (`color.text.danger`), apontando para o primitivo
// (`{color.red.600}`). O papel vem de ONDE a cor é usada, nunca do valor:
// - função: a propriedade (`color` → texto, `background` → fundo, `border-color` → borda);
// - intenção: palavras do seletor, em inglês e português (`.btn-remover` → danger);
// - estado: a pseudo-classe (`:hover`).
// Só vira alias o que é inequívoco: se o mesmo papel usa duas cores diferentes, ou um seletor
// sugere duas intenções, nada é gerado. Um nome semântico errado seria pior do que nenhum.

import type { Finding } from '../types.ts';
import type { GeneratedToken } from './generate.ts';

export interface SemanticAlias {
    /** Caminho no DTCG (`['color', 'text', 'danger']`). */
    path: string[];
    /** Nome em CSS, sem o `--` (`color-text-danger`). */
    name: string;
    /** Token primitivo para onde o alias aponta. */
    target: string[];
    count: number;
    /** Ocorrências em que o autofix deve usar o alias em vez do primitivo. */
    occurrences: Finding[];
}

/** Papel da cor pela propriedade. Propriedades sem papel claro (`fill`, `caret-color`) ficam de fora. */
function roleOf(property: string): string | undefined {
    if (property === 'color') {
        return 'text';
    }
    if (property === 'background' || property === 'background-color') {
        return 'bg';
    }
    if (/^(border|outline)(-|$)/.test(property)) {
        return 'border';
    }
    return undefined;
}

/** Palavras do seletor que indicam a intenção, em inglês e português. */
const INTENTS: Record<string, readonly string[]> = {
    danger: ['danger', 'error', 'erro', 'invalid', 'invalido', 'destructive', 'delete', 'deletar', 'remove', 'remover', 'excluir', 'apagar'],
    success: ['success', 'sucesso', 'valid', 'valido', 'done', 'concluido', 'concluida', 'complete', 'completed'],
    warning: ['warning', 'warn', 'aviso', 'alerta', 'alert', 'atencao'],
    info: ['info', 'informacao'],
    primary: ['primary', 'primario', 'primaria', 'principal', 'brand', 'marca', 'cta'],
    muted: ['muted', 'placeholder', 'hint', 'caption', 'subtle', 'legenda', 'dica'],
    disabled: ['disabled', 'desabilitado', 'desabilitada', 'inativo', 'inativa'],
};

const STATES: Record<string, string> = {
    hover: 'hover', focus: 'focus', 'focus-visible': 'focus', 'focus-within': 'focus', active: 'active', disabled: 'disabled',
};

/** Seletores da página como um todo: a cor deles é a padrão do texto e do fundo. */
const ROOT_SELECTORS = new Set(['html', 'body', ':root']);

/**
 * Intenção e estado de um seletor, ou `undefined` se for ambíguo.
 * `button.btn-remover:hover` → `{ intent: 'danger', state: 'hover' }`.
 */
function contextOf(selector: string | undefined): { intent: string; state?: string } | undefined {
    if (!selector || selector.includes(',')) {
        // Lista de seletores (`a, b`) aplica a mesma cor a contextos diferentes
        return undefined;
    }
    if (ROOT_SELECTORS.has(selector.trim())) {
        return { intent: 'default' };
    }
    // Sem acento e em minúsculas: `.botão-excluir` e `.botao-excluir` dizem o mesmo
    const plain = selector.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const words = new Set(plain.split(/[^a-z0-9]+/).filter(Boolean));
    const intents = Object.entries(INTENTS).filter(([, keywords]) => keywords.some((k) => words.has(k))).map(([intent]) => intent);
    // Estado só na parte final do seletor (`.btn:hover`), não em `.btn:hover .icon`
    const last = plain.split(/\s+|>|~|\+/).filter(Boolean).at(-1) ?? '';
    const states = [...new Set([...last.matchAll(/:([a-z-]+)/g)].map((m) => STATES[m[1]!]).filter((s): s is string => s !== undefined))];
    if (intents.length !== 1 || states.length > 1) {
        return undefined;
    }
    return states[0] ? { intent: intents[0]!, state: states[0] } : { intent: intents[0]! };
}

/** Aliases das cores com papel inequívoco e usados pelo menos `minOccurrences` vezes. */
export function semanticAliases(tokens: readonly GeneratedToken[], minOccurrences: number): SemanticAlias[] {
    const candidates = new Map<string, { path: string[]; targets: Map<string, GeneratedToken>; occurrences: Finding[] }>();
    for (const token of tokens) {
        if (token.type !== 'color') {
            continue;
        }
        for (const occurrence of token.occurrences) {
            const role = roleOf(occurrence.property);
            const context = contextOf(occurrence.selector);
            if (!role || !context) {
                continue;
            }
            const path = ['color', role, context.intent, ...(context.state ? [context.state] : [])];
            const id = path.join('-');
            const candidate = candidates.get(id) ?? { path, targets: new Map<string, GeneratedToken>(), occurrences: [] as Finding[] };
            candidate.targets.set(token.name, token);
            candidate.occurrences.push(occurrence);
            candidates.set(id, candidate);
        }
    }

    const aliases: SemanticAlias[] = [];
    for (const [name, candidate] of candidates) {
        const [target] = [...candidate.targets.values()];
        if (candidate.targets.size !== 1 || !target || candidate.occurrences.length < minOccurrences) {
            continue;
        }
        aliases.push({ path: candidate.path, name, target: target.path, count: candidate.occurrences.length, occurrences: candidate.occurrences });
    }
    return aliases.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
