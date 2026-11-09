// Códigos de saída e erro de uso: o CI e os hooks decidem pelo código, nunca pelo texto.

/** Formato do `--json`: sobe quando um campo muda ou sai; campo novo não muda a versão. */
export const JSON_SCHEMA_VERSION = 1;

export const EXIT = { ok: 0, findings: 1, error: 2 } as const;

/** Erro de uso: mensagem no stderr e exit code 2. */
export class UsageError extends Error {}
