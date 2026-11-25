import { createRequire } from 'node:module';
import { styleText } from 'node:util';

import { pkg } from './package-info.ts';

/**
 * O figlet só é carregado quando o banner aparece (help), e não em todo comando.
 * O commander pede o texto de forma síncrona, por isso require em vez de import().
 */
const require = createRequire(import.meta.url);

// Devolve o texto em vez de imprimir: o commander decide se vai para stdout ou stderr
export function bannerText(): string {
    const figlet = require('figlet') as typeof import('figlet').default;
    return `${styleText('cyan', figlet.textSync('TokenTidy'))}\n${styleText('gray', `  v${pkg.version} · ${pkg.description}`)}\n`;
}

/**
 * `tokentidy` sem comando: o banner, um obrigado e os três passos. O npm 7+ esconde a saída de scripts de instalação
 * (e pnpm e bun nem os rodam), então esta é a primeira tela que a pessoa vê de fato.
 */
export function welcomeText(): string {
    const step = (n: number, command: string, what: string) => `  ${styleText('bold', `${n}.`)} ${styleText('cyan', command.padEnd(20))}${what}`;
    return [
        bannerText(),
        `  Thanks for installing TokenTidy! Three steps to turn hardcoded values into tokens:`,
        '',
        step(1, 'tokentidy check', 'see the hardcoded colors, sizes and spacing'),
        step(2, 'tokentidy generate', 'create tokens.css from the values that repeat'),
        step(3, 'tokentidy fix', 'replace the values in your code with the tokens'),
        '',
        `  All commands and options: ${styleText('cyan', 'tokentidy --help')}`,
        '',
    ].join('\n');
}
