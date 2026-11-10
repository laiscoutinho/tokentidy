/** O `import` do módulo de tokens num arquivo: desvia de nomes que já existem e aproveita o import que já está lá. */

import { importUrl } from './imports.ts';
import { moduleId } from './module-id.ts';
import type { Edit } from './plan-types.ts';
import type { ScriptFacts } from './script-facts.ts';
import { jsQuote } from './surrounding-syntax.ts';

export class ModuleImport {
    readonly #source: string;
    readonly #url: string;
    readonly #moduleFile: string;
    readonly #facts: ScriptFacts;
    /** Exportações que o arquivo passa a importar: nome → nome local. */
    readonly #added = new Map<string, string>();

    constructor(file: string, source: string, moduleFile: string, facts: ScriptFacts) {
        this.#source = source;
        this.#moduleFile = moduleFile;
        this.#facts = facts;
        this.#url = importUrl(file, moduleFile);
    }

    /** Nome local de uma exportação. */
    local(name: string): string {
        const existing = this.#facts.imports.get(moduleId(this.#url))?.names.get(name) ?? this.#added.get(name);
        if (existing) {
            return existing;
        }
        let local = this.#facts.names.has(name) ? `token${name[0]!.toUpperCase()}${name.slice(1)}` : name;
        while (this.#facts.names.has(local)) {
            local = `${local}_`;
        }
        this.#added.set(name, local);
        return local;
    }

    edit(): Edit | undefined {
        if (this.#added.size === 0) {
            return undefined;
        }
        const specifiers = [...this.#added].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, local]) => (name === local ? name : `${name} as ${local}`)).join(', ');
        const existing = this.#facts.imports.get(moduleId(this.#url));
        if (existing) {
            return { offset: existing.end, endOffset: existing.end, text: `, ${specifiers}` };
        }
        // Segue o que o arquivo já escreve; sem exemplo, TS fica sem extensão (bundlers) e JS precisa dela (ESM no navegador)
        const written = /\bfrom\s+['"]\.{1,2}\/[^'"]+\.([cm]?[jt]s)['"]/.exec(this.#source)?.[1];
        const extension = written ? `.${written}` : this.#moduleFile.endsWith('.js') ? '.js' : '';
        const quote = jsQuote(this.#source);
        const eol = this.#source.includes('\r\n') ? '\r\n' : '\n';
        const statement = `import { ${specifiers} } from ${quote}${moduleId(this.#url)}${extension}${quote};`;
        const { insertAt, afterLine } = this.#facts;
        return { offset: insertAt, endOffset: insertAt, text: afterLine ? `${eol}${statement}` : `${statement}${eol}` };
    }
}
