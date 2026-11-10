/** Sem extensão: `./tokens` e `./tokens.js` são o mesmo módulo. */
export const moduleId = (specifier: string) => specifier.replace(/\.(?:[cm]?[jt]s|[jt]sx)$/, '');
