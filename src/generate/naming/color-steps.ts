/**
 * Degrau de cada cor de uma família (`gray-300`, `blue-700`), pela luminosidade OKLCH na curva da própria
 * família no Tailwind: `#0000ff` (L 0.452) cai entre o `blue-700` (0.488) e o `blue-800` (0.424), mais perto do 800.
 * O número sempre cresce do mais claro para o mais escuro, como 50 → 950: `gray-303` é mais escuro que `gray-300`.
 */

import { PALETTE, PALETTE_STEPS } from './palette.ts';

const STEP_NUMBERS = PALETTE_STEPS.map(Number);
/**
 * Até esta distância do degrau mais próximo, a cor fica com o nome dele (se estiver livre e nenhuma outra
 * estiver no caminho). Cada cor só olha o próprio degrau mais próximo, então a ordem nunca se inverte.
 */
const SNAP = 50;

/**
 * Posição contínua na escala (0 = branco, 1000 = preto) pela luminosidade, interpolando a curva da família.
 * Fora da curva, vai até o branco (L 1 → 0) ou até o preto (L 0 → 1000).
 */
export function stepPosition(family: string, lightness: number): number {
    const curve = PALETTE.get(family) ?? PALETTE.get('gray')!;
    const points: [number, number][] = [[1, 0], ...curve.map((oklch, i): [number, number] => [oklch[0], STEP_NUMBERS[i]!]), [0, 1000]];
    for (let i = 1; i < points.length; i++) {
        const [lighter, from] = points[i - 1]!;
        const [darker, to] = points[i]!;
        if (lightness >= darker) {
            const span = lighter - darker;
            return span <= 0 ? from : from + ((lighter - lightness) / span) * (to - from);
        }
    }
    return 1000;
}

/**
 * Nome do degrau de cada cor: o degrau padrão mais próximo, ou o número da posição quando o degrau já tem
 * dono ou outra cor está entre os dois. Os mais próximos escolhem primeiro; nenhum nome sai de ordem.
 */
export function colorSteps<T>(members: readonly T[], family: string, lightness: (member: T) => number): Map<T, string> {
    const positions = members.map((member) => ({ member, at: stepPosition(family, lightness(member)) }));
    const choices = positions.map((p) => {
        const step = STEP_NUMBERS.reduce((a, b) => (Math.abs(b - p.at) < Math.abs(a - p.at) ? b : a));
        return { ...p, step, distance: Math.abs(p.at - step) };
    })
        .filter((c) => c.distance <= SNAP)
        .sort((a, b) => a.distance - b.distance);
    const names = new Map<T, string>();
    const taken = new Set<number>();
    for (const { member, at, step } of choices) {
        if (names.has(member) || taken.has(step)) {
            continue;
        }
        const low = Math.min(at, step);
        const high = Math.max(at, step);
        const crosses = positions.some((other) => other.member !== member && other.at >= low && other.at <= high);
        if (!crosses) {
            taken.add(step);
            names.set(member, String(step));
        }
    }
    for (const { member, at } of positions) {
        if (!names.has(member)) {
            names.set(member, String(Math.min(999, Math.max(1, Math.round(at)))));
        }
    }
    return names;
}
