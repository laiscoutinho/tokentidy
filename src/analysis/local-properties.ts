/**
 * Custom properties locais: `.card { --gap: 12px }` é um valor com nome, dentro do próprio componente.
 * Não é reportado (o papel de um valor local não dá para afirmar), e também não é token do projeto:
 * sai das definições, para o `fix` não sugerir `--gap` em outro arquivo.
 * Decidir exige o projeto inteiro: o mesmo nome definido num bloco de tokens (`:root`) é tema, não valor local.
 */

import type { CustomPropertyCandidate } from '../parsers/collector.ts';
import { findValues } from '../parsers/css/values.ts';

export interface LocalPropertiesResult {
    /** Custom properties locais com cor ou medida: saem das definições, porque não são tokens do projeto. */
    local: Set<CustomPropertyCandidate>;
}

/**
 * Separa as custom properties locais:
 * - fora de bloco de tokens e com um nome que nenhum bloco de tokens define;
 * - com cor ou medida no valor (`1fr 2fr` e `""` não são valor de design, e continuam definições).
 * A redefinição de um nome de token (`.card { --color-primary: red }`) é tema e fica de fora.
 */
export function resolveLocalProperties(candidates: readonly CustomPropertyCandidate[]): LocalPropertiesResult {
    const tokenNames = new Set(candidates.filter((c) => c.tokenBlock).map((c) => c.name));
    const local = new Set(candidates.filter((candidate) => !candidate.tokenBlock && !tokenNames.has(candidate.name)
        && (findValues(candidate.value, 'color').length > 0 || findValues(candidate.value, 'length').length > 0)));
    return { local };
}
