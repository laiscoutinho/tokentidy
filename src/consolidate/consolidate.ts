/**
 * Consolidação: valores quase iguais a outro (`15px` ao lado de `16px`, `#4f46e6` ao lado de `#4f46e5`) são inconsistência;
 * valores diferentes e ambos na grade são decisões (um card compacto e um de destaque) e nunca se juntam.
 * Aqui só se calcula quem iria para onde: quem autoriza são as guardas e a pessoa.
 */

import { deltaEOK, sameHue } from '../check/near.ts';
import { checkChanges } from '../coherence/guards.ts';
import type { Blocked, Change, GuardOptions } from '../coherence/guards.ts';
import { buildModel } from '../coherence/model.ts';
import type { ModelInput } from '../coherence/model.ts';
import { compoundsOf, describeSelector } from '../coherence/selectors.ts';
import type { Finding, TokenType } from '../types.ts';
import { colorInfo } from '../values/color-info.ts';
import { DEFAULT_ROOT_FONT_SIZE, formatNumber, lengthInPx, normalizeFinding, parseLength } from '../values/normalize.ts';

export interface ConsolidationOptions extends GuardOptions {
    gridBase: number;
}

export interface AbsorbedValue {
    key: string;
    findings: Finding[];
}

export interface ConsolidationGroup {
    /** Identifica a decisão em `tokentidy.decisions.json`. */
    id: string;
    type: TokenType;
    /** O que aparece na listagem: `.card padding`. */
    label: string;
    /** Valor normalizado que fica. */
    to: string;
    from: AbsorbedValue[];
}

export interface GuardedGroup extends ConsolidationGroup {
    /** Trocas que passaram pelas guardas. */
    changes: Change[];
    blocked: Blocked[];
    /** Relações que continuam valendo depois do grupo. */
    kept: string[];
}

/** Só estes tipos seguem a grade: borda, fonte e entrelinha têm outras escalas. */
const GRID_TYPES = new Set<TokenType>(['spacing', 'size', 'radius']);
/** `border-radius: 9999px` quer dizer "pílula": não é uma medida. */
const PILL_RADIUS = 100;
const EPSILON = 1e-6;

/** Nomes diferentes para o mesmo componente (R8), em inglês e português. */
const COMPONENT_FAMILIES = new Map(Object.entries({
    card: 'card', tile: 'card', panel: 'card', box: 'card', cartao: 'card', painel: 'card',
    btn: 'button', button: 'button', botao: 'button',
    input: 'field', field: 'field', select: 'field', textarea: 'field', campo: 'field',
    nav: 'nav', navbar: 'nav', menu: 'nav', sidebar: 'nav',
    modal: 'dialog', dialog: 'dialog', drawer: 'dialog',
}));

export function componentOf(finding: Pick<Finding, 'selector'>): string {
    const first = finding.selector?.split(',')[0];
    if (!first) {
        return '';
    }
    const last = compoundsOf(describeSelector(first).base).at(-1) ?? '';
    const word = /[a-z0-9]+/i.exec(last.normalize('NFD').replace(/\p{Diacritic}/gu, ''))?.[0].toLowerCase() ?? '';
    return COMPONENT_FAMILIES.get(word) ?? word;
}

export const propertyFamily = (property: string) => property.replace(/^-+/, '').split('-')[0] ?? property;

const onGrid = (px: number, grid: number) => Math.abs(px / grid - Math.round(px / grid)) < EPSILON;

/**
 * Para onde vai um valor fora da grade: o passo mais próximo, nunca mais de meia grade (`15px` → `16px`, não `12px`).
 * No empate (`14px` entre 12 e 16), o mais usado no projeto naquele tipo, e depois o múltiplo do dobro da grade.
 * Só depende do valor e do tipo: o mesmo valor vai para o mesmo alvo em todo o projeto.
 */
function targetOf(px: number, used: ReadonlyMap<number, number>, grid: number): number {
    const options = [Math.floor(px / grid) * grid, Math.ceil(px / grid) * grid];
    // Dois múltiplos vizinhos da grade nunca são ambos múltiplos do dobro dela: o critério "mais grosso" sempre desempata
    const coarser = (value: number) => (onGrid(value, grid * 2) ? 0 : 1);
    return options.toSorted((a, b) => {
        const distance = Math.abs(a - px) - Math.abs(b - px);
        return (Math.abs(distance) > EPSILON ? distance : 0) || (used.get(b) ?? 0) - (used.get(a) ?? 0) || coarser(a) - coarser(b);
    })[0]!;
}

function inUnitOf(key: string, px: number, root: number): string {
    return parseLength(key)?.unit === 'rem' ? `${formatNumber(px / root)}rem` : `${formatNumber(px)}px`;
}

class GroupBuilder {
    readonly #groups = new Map<string, { type: TokenType; label: string; family: string; to: string; from: Map<string, Finding[]> }>();

    add(type: TokenType, family: string, component: string, to: string, key: string, findings: readonly Finding[]): void {
        const id = `${type}|${family}|${component}|${to}`;
        let group = this.#groups.get(id);
        if (!group) {
            group = { type, label: [component ? `.${component}` : '', family].filter(Boolean).join(' '), family: id, to, from: new Map() };
            this.#groups.set(id, group);
        }
        group.from.set(key, [...(group.from.get(key) ?? []), ...findings]);
    }

    build(): ConsolidationGroup[] {
        return [...this.#groups.values()]
            .map(({ type, label, family, to, from }) => {
                const keys = [...from.keys()].sort();
                return { id: `${family}|${keys.join(',')}`, type, label, to, from: keys.map((key) => ({ key, findings: from.get(key)! })) };
            })
            .sort((a, b) => (a.id < b.id ? -1 : 1));
    }
}

function addMeasures(builder: GroupBuilder, findings: readonly Finding[], grid: number, root: number): void {
    const measures = findings.filter((f) => GRID_TYPES.has(f.type));
    // Uso de cada passo no projeto inteiro, por tipo: só desempata, e igual para todos os papéis
    const used = new Map<TokenType, Map<number, number>>();
    for (const finding of measures) {
        const px = lengthInPx(normalizeFinding(finding), root);
        if (px !== undefined && onGrid(px, grid)) {
            const ofType = used.get(finding.type) ?? new Map<number, number>();
            ofType.set(px, (ofType.get(px) ?? 0) + 1);
            used.set(finding.type, ofType);
        }
    }
    const inRole = Map.groupBy(measures, (f) => `${f.type}\u0000${propertyFamily(f.property)}\u0000${componentOf(f)}`);
    for (const ofRole of inRole.values()) {
        const { type, property } = ofRole[0]!;
        for (const [key, ofKey] of Map.groupBy(ofRole, normalizeFinding)) {
            const px = lengthInPx(key, root);
            // Abaixo da grade (`1px`) é detalhe deliberado: o passo seguinte seria 0 ou o dobro
            if (px === undefined || onGrid(px, grid) || px < grid || (type === 'radius' && px >= PILL_RADIUS)) {
                continue;
            }
            builder.add(type, propertyFamily(property), componentOf(ofRole[0]!), inUnitOf(key, targetOf(px, used.get(type) ?? new Map(), grid), root), key, ofKey);
        }
    }
}

/** Com a maioria em `rem`, o `px` de mesmo tamanho vira `rem`: a unidade que o projeto escolheu. */
function addFontSizes(builder: GroupBuilder, findings: readonly Finding[], root: number): void {
    const sizes = findings.filter((f) => f.type === 'font-size');
    const units = Map.groupBy(sizes, (f) => parseLength(normalizeFinding(f))?.unit ?? '');
    const pxSizes = units.get('px') ?? [];
    if ((units.get('rem')?.length ?? 0) <= pxSizes.length) {
        return;
    }
    for (const [key, ofKey] of Map.groupBy(pxSizes, normalizeFinding)) {
        builder.add('font-size', 'font-size', '', `${formatNumber(lengthInPx(key, root)! / root)}rem`, key, ofKey);
    }
}

/**
 * Cada cor entra na mais usada dentro da tolerância, e não na vizinha: assim não se formam cadeias a≈b≈c.
 * Nem a mais próxima serve se o tom muda (rosado → cinza): ver `sameHue`.
 * As âncoras (cores que já têm token) vêm antes de todas: perto de um token, o alvo é o token, mesmo que a cor solta seja mais usada.
 */
function addColors(builder: GroupBuilder, findings: readonly Finding[], tolerance: number, anchors: readonly string[]): void {
    const byKey = [...Map.groupBy(findings.filter((f) => f.type === 'color'), normalizeFinding)]
        .sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1));
    const representatives: { key: string; oklch: Parameters<typeof deltaEOK>[0]; alpha: number }[] = [];
    for (const key of new Set(anchors)) {
        const info = colorInfo(key);
        if (info) {
            representatives.push({ key, oklch: info.oklch, alpha: info.alpha });
        }
    }
    const anchored = new Set(representatives.map((r) => r.key));
    for (const [key, ofKey] of byKey) {
        if (anchored.has(key)) {
            continue;
        }
        const info = colorInfo(key);
        if (!info) {
            continue;
        }
        const into = representatives.find((r) => r.alpha === info.alpha && deltaEOK(r.oklch, info.oklch) <= tolerance && sameHue(r.oklch, info.oklch));
        if (into) {
            builder.add('color', 'color', '', into.key, key, ofKey);
        } else {
            representatives.push({ key, oklch: info.oklch, alpha: info.alpha });
        }
    }
}

/** `colorAnchors`: cores normalizadas que já têm token, em ordem de preferência (o `fix --approximate` passa as do projeto). */
export function findConsolidations(findings: readonly Finding[], options: ConsolidationOptions, colorAnchors: readonly string[] = []): ConsolidationGroup[] {
    const root = options.rootFontSize ?? DEFAULT_ROOT_FONT_SIZE;
    const builder = new GroupBuilder();
    addMeasures(builder, findings, options.gridBase, root);
    addFontSizes(builder, findings, root);
    addColors(builder, findings, options.colorTolerance, colorAnchors);
    return builder.build();
}

/** Passa cada grupo pelas guardas: todas as trocas juntas, para uma não esconder o efeito da outra. */
export function guardConsolidations(groups: readonly ConsolidationGroup[], input: ModelInput, options: ConsolidationOptions): GuardedGroup[] {
    const model = buildModel(input);
    const of = (group: ConsolidationGroup): Change[] => group.from.flatMap(({ findings }) => findings.map((finding) => ({ finding, to: group.to })));
    // Uma rodada só para todos os grupos: rodar as guardas de novo por grupo deixava o `generate` quadrático
    const { allowed, blocked, keptFor } = checkChanges(model, groups.flatMap(of), options);
    const pass = new Set(allowed.map((change) => change.finding));
    const reasons = new Map(blocked.map((item) => [item.finding, item]));
    return groups.map((group) => {
        const changes = of(group).filter((change) => pass.has(change.finding));
        return {
            ...group,
            changes,
            blocked: of(group).flatMap((change) => reasons.get(change.finding) ?? []),
            kept: keptFor(changes.map((change) => change.finding)),
        };
    });
}
