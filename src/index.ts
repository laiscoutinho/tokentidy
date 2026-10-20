// API pública: o que fica disponível com `import { ... } from 'tokentidy'`.
export { analyzeDirectory } from './analyze.ts';
export type { AnalysisResult } from './analyze.ts';
export { parseCss } from './parsers/css.ts';
export type { CssSyntax, ParseResult } from './parsers/css.ts';
export { findValues } from './parsers/css-values.ts';
export type { ValueMatch } from './parsers/css-values.ts';
export { ruleForProperty } from './rules.ts';
export type { PropertyRule, ValueMatcher } from './rules.ts';
export { scanDirectory, isSupportedExtension, SUPPORTED_EXTENSIONS } from './scanner.ts';
export type { ScanResult, SupportedExtension } from './scanner.ts';
export type { AnalysisError, Finding, FindingKind } from './types.ts';
