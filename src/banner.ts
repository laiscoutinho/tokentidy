import { styleText } from 'node:util';
import figlet from 'figlet';

import { pkg } from './package-info.ts';

// Devolve o texto em vez de imprimir: o commander decide se vai para stdout ou stderr
export function bannerText(): string {
    return `${styleText('cyan', figlet.textSync('TokenTidy'))}\n${styleText('gray', `  v${pkg.version} · ${pkg.description}`)}\n`;
}
