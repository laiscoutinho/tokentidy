import { readFileSync } from 'node:fs';

interface PackageInfo {
    version: string;
    description: string;
}

// Lido em tempo de execução: o caminho funciona tanto de src/ quanto de dist/
export const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageInfo;
