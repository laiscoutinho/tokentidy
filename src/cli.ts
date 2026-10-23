#!/usr/bin/env node

/**
 * Ponto de entrada mínimo. O compile cache guarda em disco o código já compilado pelo V8,
 * e as execuções seguintes (hooks, CI) iniciam mais rápido. Ele só vale para os módulos
 * carregados depois de ligado, por isso o programa vem por import dinâmico, e não estático.
 */
import module from 'node:module';

module.enableCompileCache?.();

await import('./cli/program.ts');
