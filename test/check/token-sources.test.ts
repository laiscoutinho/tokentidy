// Outras fontes de token: tema JS, redefinição por tema e primitivo onde já existe alias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CLI_ENTRY, tempDir } from '../helpers.ts';
import { resolvesUnder } from '../../src/token-index.ts';

async function withProject(files: Record<string, string>, run: (dir: string) => Promise<void> | void): Promise<void> {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
        for (const [name, content] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
            await writeFile(path.join(dir, name), content);
        }
        await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd });

const THEME = `import { createTheme, ThemeProvider } from '@mui/material';
const theme = createTheme({
  palette: { primary: { main: '#123456' } },
  shape: { borderRadius: '6px' },
  components: { MuiButton: { styleOverrides: { root: { color: '#654321' } } } },
});
export const A = () => <ThemeProvider theme={theme}><div style={{ color: '#123456', borderRadius: '6px' }} /></ThemeProvider>;
`;

test('a JS theme is a token source: not reported, and suggested in JSX', async () => {
    await withProject({ 'a.tsx': THEME }, (dir) => {
        const lines = cli(dir, 'check', '.').stdout.trim().split('\n');
        assert.deepEqual(lines.map((line) => line.split('\t').slice(3)), [
            ['color', '#123456', 'theme.palette.primary.main'],
            ['border-radius', '6px', 'theme.shape.borderRadius'],
        ]);
    });
});

test('ThemeProvider with an object of its own is a source too', async () => {
    const source = `const custom = { colors: { brand: '#0a0b0c' } };
export const A = () => <ThemeProvider theme={custom}><b style={{ color: '#0a0b0c' }} /></ThemeProvider>;
`;
    await withProject({ 'a.tsx': source }, (dir) => {
        assert.match(cli(dir, 'check', '.').stdout, /\t#0a0b0c\ttheme\.colors\.brand\n$/);
    });
});

test('a theme value is not suggested in CSS, and fix never writes it', async () => {
    await withProject({ 'a.tsx': THEME, 'a.css': '.a { color: #123456; }\n' }, async (dir) => {
        const line = cli(dir, 'check', 'a.css').stdout;
        assert.equal(line, 'a.css:1:13\tviolation\tcolor/hardcoded\tcolor\t#123456\n');
        cli(dir, 'fix', '.');
        assert.equal(await readFile(path.join(dir, 'a.tsx'), 'utf8'), THEME);
    });
});

const OVERRIDES = `:root { --bg: #ffffff; }
.dark { --bg: #111111; }
.dark .sidebar { --bg: #222222; }
.dark .card { background: #111111; }
.card { background: #111111; }
.darker .card { background: #111111; }
.dark .sidebar .item { background: #111111; }
`;

test('fix uses a theme override only where it resolves to that value', async () => {
    await withProject({ 'a.css': OVERRIDES }, async (dir) => {
        cli(dir, 'fix', '.');
        const text = await readFile(path.join(dir, 'a.css'), 'utf8');
        assert.match(text, /\.dark \.card \{ background: var\(--bg\); \}/);
        assert.match(text, /^\.card \{ background: #111111; \}/m);
        assert.match(text, /\.darker \.card \{ background: #111111; \}/);
        assert.match(text, /\.sidebar \.item \{ background: #111111; \}/, 'um escopo mais específico redefine o token ali');
    });
});

test('which selectors a scope reaches', () => {
    assert.ok(resolvesUnder('.dark .a', '.dark', []));
    assert.ok(resolvesUnder('.dark:hover', '.dark', []));
    assert.ok(resolvesUnder('html.dark .a', '.dark', []));
    assert.ok(resolvesUnder(':root[data-theme=dark] .a', '[data-theme=dark]', []));
    assert.ok(resolvesUnder('.dark .a, .dark .b', '.dark', []));
    assert.ok(!resolvesUnder('.dark .a, .b', '.dark', []), 'todas as partes precisam estar sob o escopo');
    assert.ok(!resolvesUnder('.darker .a', '.dark', []));
    assert.ok(!resolvesUnder(undefined, '.dark', []));
    assert.ok(!resolvesUnder(':is(.dark, .x) .a', '.dark', []));
    assert.ok(!resolvesUnder('.dark .x .a', '.dark', ['.dark .x']));
});

const ALIAS = `:root { --color-red-500: #f00; --color-text-danger: var(--color-red-500); }
.error { color: var(--color-red-500); }
.card { color: var(--color-red-500); }
`;

test('a primitive where a semantic alias exists is a suggestion that never fails', async () => {
    await withProject({ 'a.css': ALIAS }, (dir) => {
        const { stdout, status } = cli(dir, 'check', '.');
        assert.equal(stdout, 'a.css:2:21\tsuggestion\ttoken/prefer-alias\tcolor\t--color-red-500\t--color-text-danger\n');
        assert.equal(status, 0);
        const json = JSON.parse(cli(dir, 'check', '.', '--json').stdout) as { aliasHints: { alias: string }[] };
        assert.equal(json.aliasHints[0]!.alias, '--color-text-danger');
    });
});

test('fix leaves existing references alone, and generated aliases count', async () => {
    await withProject({ 'a.css': ALIAS }, async (dir) => {
        cli(dir, 'fix', '.');
        assert.equal(await readFile(path.join(dir, 'a.css'), 'utf8'), ALIAS);
    });
    const tree = { color: { $type: 'color', red: { 500: { $value: { colorSpace: 'srgb', components: [1, 0, 0] } } }, text: { danger: { $value: '{color.red.500}' } } } };
    await withProject({ 'design-tokens/tokens.tokens.json': JSON.stringify(tree), 'a.css': '.error { color: var(--color-red-500); }\n' }, (dir) => {
        assert.match(cli(dir, 'check', 'a.css').stdout, /\t--color-text-danger\n$/);
    });
});
