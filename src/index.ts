// API pública: o que fica disponível com `import { ... } from 'tokentidy'`.
export { analyzeDirectory } from './analyze.ts';
export type { AnalysisResult } from './analyze.ts';
export { parseCss } from './parsers/css.ts';
export type { StyleSyntax } from './parsers/css.ts';
export { parseHtml } from './parsers/html.ts';
export { parseScript } from './parsers/script.ts';
export { parseAngularTemplate } from './parsers/angular.ts';
export { parseDtcg } from './parsers/dtcg.ts';
export type { ParseResult, RootFontSize } from './parsers/collector.ts';
export { findValues } from './parsers/css-values.ts';
export type { ValueMatch } from './parsers/css-values.ts';
export { rulesForProperty } from './rules.ts';
export type { PropertyRule, ValueMatcher } from './rules.ts';
export { scanDirectory, isSupportedExtension, SUPPORTED_EXTENSIONS } from './scanner.ts';
export type { ScanResult, SupportedExtension } from './scanner.ts';
export type { AnalysisError, DefinitionSyntax, Finding, Host, TokenDefinition, TokenReference, TokenType } from './types.ts';
