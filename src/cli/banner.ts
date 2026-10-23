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
