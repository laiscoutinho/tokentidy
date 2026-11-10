/**
 * O que um seletor diz sobre o elemento: qual é a base, se é um estado (`:hover`, `.is-open`) ou uma variante (`.btn--sm`).
 * Estado perde o feedback se virar a mesma cor da base; variante perde a diferença de tamanho se colapsar.
 */

/** Pseudo-classes que são estado de interação. */
const PSEUDO_STATES = ['focus-visible', 'focus-within', 'hover', 'focus', 'active', 'disabled', 'checked'];

/** Palavras que, numa classe modificadora, dizem estado (inglês e português). As outras são variante. */
const STATE_WORDS = new Set([
    'hover', 'focus', 'focused', 'active', 'ativo', 'ativa', 'disabled', 'desabilitado', 'desabilitada', 'open', 'opened', 'aberto', 'aberta',
    'closed', 'fechado', 'fechada', 'selected', 'selecionado', 'selecionada', 'checked', 'expanded', 'collapsed', 'current', 'error', 'erro',
    'invalid', 'invalido', 'valid', 'valido', 'loading', 'carregando', 'on', 'off', 'visible', 'hidden',
]);

/** Sem `--` nem classe composta, só estas palavras no fim (`.btn-sm`) dizem variante: `.card-header` é outro elemento. */
const VARIANT_WORDS = new Set([
    'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'small', 'medium', 'large', 'pequeno', 'medio', 'grande', 'compact', 'compacto', 'wide', 'dense',
    'primary', 'secondary', 'tertiary', 'ghost', 'outline', 'outlined', 'filled', 'link', 'text', 'plain',
]);

export interface SelectorInfo {
    /** Seletor sem estado nem modificador: `.btn--active:hover` → `.btn`. */
    base: string;
    state?: string;
    variant?: { block: string; name: string };
}

/** Partes separadas por combinador: `.a > .b` → `.a`, `.b`. */
export function compoundsOf(selector: string): string[] {
    return selector.trim().split(/\s*[\s>~+]\s*/).filter(Boolean);
}

function strippedWord(word: string): string {
    return word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Classe modificadora (`is-open`, `btn--active`, `btn-sm`), separada em bloco e palavra. */
function modifierOf(className: string): { block: string; word: string; bem: boolean } | undefined {
    const bem = /^(.+?)--(.+)$/.exec(className);
    if (bem) {
        return { block: bem[1]!, word: strippedWord(bem[2]!), bem: true };
    }
    const dash = className.lastIndexOf('-');
    return dash > 0 ? { block: className.slice(0, dash), word: strippedWord(className.slice(dash + 1)), bem: false } : undefined;
}

export function describeSelector(selector: string): SelectorInfo {
    const compounds = compoundsOf(selector);
    let last = compounds.at(-1) ?? '';
    const states: string[] = [];
    for (const pseudo of PSEUDO_STATES) {
        const written = `:${pseudo}`;
        // `:focus` não pode casar dentro de `:focus-visible`: as maiores vêm antes e já saíram
        if (last.includes(written)) {
            last = last.replace(written, '');
            states.push(pseudo);
        }
    }

    let variant: SelectorInfo['variant'];
    const classes = last.match(/\.[\w-]+/g)?.map((c) => c.slice(1)) ?? [];
    const remove = (name: string) => {
        last = last.replace(`.${name}`, '');
    };
    for (const name of classes) {
        const prefix = /^(is|has)-(.+)$/.exec(name);
        const modifier = modifierOf(name);
        if (prefix && classes.length > 1) {
            remove(name);
            states.push(strippedWord(prefix[2]!));
        } else if (modifier && STATE_WORDS.has(modifier.word)) {
            last = last.replace(`.${name}`, `.${modifier.block}`);
            states.push(modifier.word);
        } else if (modifier && (modifier.bem || VARIANT_WORDS.has(modifier.word))) {
            last = last.replace(`.${name}`, `.${modifier.block}`);
            variant = { block: modifier.block, name: modifier.word };
        } else if (name !== classes[0] && !variant) {
            // Segunda classe que não é estado: `.btn.primary`
            remove(name);
            variant = { block: classes[0]!, name: strippedWord(name) };
        }
    }

    const base = [...compounds.slice(0, -1), last].join(' ');
    return { base, ...(states.length > 0 ? { state: states.join(' ') } : {}), ...(variant ? { variant } : {}) };
}
