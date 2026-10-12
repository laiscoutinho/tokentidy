// API pública: o que fica disponível com `import { ... } from 'tokentidy'`.
export { scanDirectory, isSupportedExtension, SUPPORTED_EXTENSIONS } from './scanner.ts';
export type { ScanResult, SupportedExtension } from './scanner.ts';
export type { Finding, FindingKind } from './types.ts';
