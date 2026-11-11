// Valores fora de `style={{}}`: objetos seguidos, DOM, CSS-in-JS, sx, Angular host, mixins. Cada um com o `fix` escrevendo código válido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { fixScope } from '../../src/fix/apply.ts';
import { collectFiles } from '../../src/project/scope.ts';
import { tempDir } from '../helpers.ts';

async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    return dir;
}

/** `arquivo regra propriedade valor`, violações e revisões juntas. */
async function found(files: Record<string, string>): Promise<string[]> {
    const dir = await project(files);
    const result = await analyzePaths([dir], { root: dir });
    assert.deepEqual(result.errors, []);
    return [...result.findings, ...result.review].map((f) => `${f.file} ${f.rule} ${f.property} ${f.value}`).sort();
}

const values = async (source: string, file = 'a.tsx') => (await found({ [file]: source })).map((line) => line.split(' ').slice(2).join(' ')).sort();

test('objects: a constant reaches style={} directly, by member, in a ternary and through a spread', async () => {
    assert.deepEqual(await values(`
const base = { margin: 20 };
const styles = { card: { color: '#111111' } };
const other = { color: '#222222' };
export const A = (p) => <div style={p.a ? styles.card : { ...base, ...other }} />;
`), ['color #111111', 'color #222222', 'margin 20']);
});

test('objects: reassigned variables and objects that never reach a style are not read', async () => {
    assert.deepEqual(await values(`
let changed = { color: '#111111' };
changed = {};
const config = { padding: 8, color: '#222222' };
export const A = () => <div style={changed} />;
`), []);
});

test('objects: an object used twice is reported once', async () => {
    assert.deepEqual(await values(`
const s = { color: '#111111' };
export const A = () => <><i style={s} /><b style={s} /></>;
`), ['color #111111']);
});

test('objects: imported from a relative file, reported where they are written', async () => {
    assert.deepEqual(await found({
        'src/A.tsx': `import { card } from './theme.js';\nimport * as all from './theme';\nexport const A = () => <><i style={card} /><b style={all.other} /></>;\n`,
        'src/theme.ts': `export const card = { color: '#111111' };\nconst other = { margin: 20 };\nexport { other };\nexport const unused = { color: '#222222' };\n`,
    }), ['src/theme.ts color/hardcoded color #111111', 'src/theme.ts spacing/hardcoded margin 20']);
});

test('objects: a file keeps its syntax tree for other files only when an export reaches an object', async () => {
    const { parseScript } = await import('../../src/parsers/script.ts');
    const links = async (source: string) => (await parseScript(source, 'a.tsx')).styleLinks;
    // Só componentes e funções: nada para outro arquivo pedir, a árvore do Babel é liberada
    assert.equal(await links(`export const A = () => <i />;\nexport default function B() {}\n`), undefined);
    const exporter = await links(`const theme = { card: { color: '#111111' } };\nexport default theme;\n`);
    assert.ok(exporter);
    // Quem só importa guarda os pedidos, sem árvore para emitir
    const importer = await links(`import theme from './theme';\nexport const A = () => <i style={theme.card} />;\n`);
    assert.deepEqual(importer?.imports.map((r) => [r.source, r.name, r.path]), [['./theme', 'default', ['card']]]);
    assert.deepEqual(await found({
        'src/A.tsx': `import theme from './theme';\nexport const A = () => <i style={theme.card} />;\n`,
        'src/theme.ts': `const theme = { card: { color: '#111111' } };\nexport default theme;\n`,
    }), ['src/theme.ts color/hardcoded color #111111']);
});

test('DOM: style assignments, setProperty, cssText, setAttribute and Object.assign', async () => {
    assert.deepEqual(await values(`
el.style.color = '#111111';
el.style['backgroundColor'] = '#222222';
el.style.padding = 9;
el.style.setProperty('margin-left', '11px');
el.style.setProperty('--local', '12px');
el.style.cssText = 'margin-top: 13px';
el.setAttribute('style', 'margin-right: 14px');
el.setAttribute('fill', '#333333');
Object.assign(el.style, { marginBottom: '15px', opacity: 0.5 });
`, 'a.ts'), ['background-color #222222', 'color #111111', 'fill #333333', 'margin-bottom 15px', 'margin-left 11px', 'margin-right 14px', 'margin-top 13px', 'opacity 0.5']);
});

test('values read by JavaScript: canvas, charts, and only colors for unknown functions', async () => {
    assert.deepEqual(await values(`
ctx.fillStyle = '#111111';
new Chart(el, { data: { datasets: [{ backgroundColor: ['#222222'], borderColor: '#333333', borderWidth: 2 }] } });
resize({ width: 300 });
configure({ color: '#444444', title: 'red', width: 320 });
`, 'a.ts'), ['color #111111', 'color #222222', 'color #333333', 'color #444444']);
});

test('matchMedia is a breakpoint for review', async () => {
    assert.deepEqual(await found({ 'a.ts': `window.matchMedia('(min-width: 600px)');\n` }), ['a.ts breakpoint/plain-css @media 600px']);
});

test('SVG presentation attributes in JSX', async () => {
    assert.deepEqual(await values(`export const A = (p) => <path fill="#111111" stroke={p.a ? '#222222' : 'none'} stopColor="#333333" />;`), ['fill #111111', 'stop-color #333333', 'stroke #222222']);
});

test('CSS-in-JS: values around interpolations, and a value with an interpolation inside is left out', async () => {
    assert.deepEqual(await values(`
const Box = styled.div<{ a: boolean }>\`
  color: #111111;
  \${mixin};
  margin: \${(p) => p.a}px 8px;
  background: \${(p) => p.bg};
  font-family: \${font}, Arial;
  @media (min-width: 768px) { font-size: 14px; }
\`;
const c = css\`gap: 10px;\`;
const k = keyframes\`from { color: #222222; }\`;
const G = createGlobalStyle\`body { color: #333333; }\`;
const W = styled(Box).attrs({})\`color: #444444;\`;
const N = notCss\`color: #555555;\`;
`), ['@media 768px', 'color #111111', 'color #222222', 'color #333333', 'color #444444', 'font-size 14px', 'gap 10px', 'margin 8px']);
});

test('CSS-in-JS: object styles, nested blocks and the css prop', async () => {
    assert.deepEqual(await values(`
const B = styled.div({ color: '#111111', padding: 4, '&:hover': { color: '#222222' } });
const c = css({ margin: 6 });
export const A = () => <><i css={{ color: '#333333' }} /><b css={\`color: #444444;\`} /></>;
`), ['color #111111', 'color #222222', 'color #333333', 'color #444444', 'margin 6', 'padding 4']);
});

test('MUI sx: aliases and breakpoint keys; theme steps (numbers) are not hardcoded values', async () => {
    assert.deepEqual(await values(`export const A = () => <Box sx={{
  p: 2, mt: '17px', bgcolor: '#111111', fontWeight: '700',
  margin: { xs: '18px', md: 3 }, '&:hover': { color: '#222222' },
}} />;`),
        ['background-color #111111', 'color #222222', 'margin 18px', 'margin-top 17px']);
});

test('MUI sx: the axis shorthands are spacing', async () => {
    assert.deepEqual(await values(`export const A = () => <Box sx={{ mx: '19px', my: '20px', px: '21px', py: '22px' }} />;`),
        ['margin-block 20px', 'margin-inline 19px', 'padding-block 22px', 'padding-inline 21px']);
});

test('Angular: host metadata, @HostBinding and Renderer2.setStyle', async () => {
    assert.deepEqual(await values(`
@Component({ template: '', host: { style: 'color: #111111', '[style.color]': "'#222222'", '[style.margin.px]': '8', '[class.a]': 'b', '[style.top]': 'dynamic' } })
export class H {
  @HostBinding('style.color') c = '#333333';
  @HostBinding('style.margin.px') m = 9;
  @HostBinding('class.x') x = '#444444';
  constructor(r, e) { r.setStyle(e, 'margin-top', '22px'); }
}
`, 'a.component.ts'), ['color #111111', 'color #222222', 'color #333333', 'margin 8', 'margin 9', 'margin-top 22px']);
});

const MIXIN = '@mixin btn($bg: #111111, $pad: 10px, $idle: 3px) { background: $bg; .x { padding: $pad; } }\n';

test('SCSS: mixin arguments take the type of the property that uses the parameter', async () => {
    assert.deepEqual(await values(`${MIXIN}.a { @include btn(#222222, 23px); }\n.b { @include btn($pad: 24px); }\n.c { @include btn(var(--x), $spacing); }\n`, 'a.scss'),
        ['@mixin 3px', 'background #111111', 'background #222222', 'padding 10px', 'padding 23px', 'padding 24px']);
});

test('SCSS: the mixin can be defined in another file', async () => {
    assert.deepEqual(await found({ 'a.scss': `.a { @include lib.btn(#222222); }\n`, '_lib.scss': '@mixin btn($bg) { background: $bg; }\n' }), ['a.scss color/hardcoded background #222222']);
});

test('SCSS: unknown mixins report colors as violations and measures for review', async () => {
    assert.deepEqual(await found({ 'a.scss': `.a { @include other(#222222, 25px, 'x', 1 + 2); }\n` }), [
        'a.scss color/hardcoded @include #222222',
        'a.scss value/unknown-destination @include 25px',
    ]);
});

test('SCSS: two mixins with the same name and different uses tell nothing', async () => {
    assert.deepEqual(await found({
        'a.scss': `.a { @include m(25px); }\n`,
        'b.scss': '@mixin m($v) { padding: $v; }\n',
        'c.scss': '@mixin m($v) { width: $v; }\n',
    }), ['a.scss value/unknown-destination @include 25px']);
});

test('SCSS: mat.*-overrides maps give the type by key', async () => {
    assert.deepEqual(await values(`.d { @include mat.button-overrides((\n  filled-container-color: #111111, filled-container-shape: 26px,\n  label-size: 27px, label-weight: 700, label-line-height: 1.5,\n  label-tracking: 1px, label-font: Arial, odd: 28px)); }\n`, 'a.scss'), [
        '@include 28px', 'border-radius 26px', 'color #111111', 'font-family Arial', 'font-size 27px', 'font-weight 700', 'letter-spacing 1px', 'line-height 1.5',
    ]);
});

test('fix writes valid code in every new place, and leaves JavaScript-read values and SVG attributes alone', async () => {
    const dir = await project({
        'tokens.css': ':root { --brand: #111111; --space: 8px; }\n.use { color: var(--brand); padding: var(--space); }\n',
        '_tokens.scss': '$brand: #111111;\n$space: 8px;\n.use { color: $brand; padding: $space; }\n',
        'src/a.tsx': `const s = { padding: 8, color: '#111111' };
const B = styled.div\`color: #111111; margin: \${x}px 8px;\`;
ctx.fillStyle = '#111111';
el.style.padding = '8px';
el.setAttribute('stroke', '#111111');
export const A = () => <><i style={s} /><b sx={{ mt: '8px' }} /><path fill="#111111" /></>;
`,
        'src/h.component.ts': `@Component({ template: '', host: { '[style.color]': "'#111111'", '[style.padding.px]': '8' } })
export class H {
  @HostBinding('style.color') c = '#111111';
  @HostBinding('style.padding.px') p = 8;
}
`,
        'src/m.scss': `@use '../tokens' as *;\n@mixin b($c: #111111) { color: $c; }\n.a { @include b(#111111); @include z(#111111); }\n`,
    });
    const { skipped } = await fixScope(await collectFiles([dir], dir), { tokensDir: path.join(dir, 'design-tokens') }) as unknown as { skipped: { reason: string }[] };
    assert.deepEqual(skipped.map((s) => s.reason).sort(), ['needs-token-module', 'svg-attribute', 'svg-attribute', 'unit-in-binding']);
    assert.equal(await readFile(path.join(dir, 'src/a.tsx'), 'utf8'), `const s = { padding: 'var(--space)', color: 'var(--brand)' };
const B = styled.div\`color: var(--brand); margin: \${x}px var(--space);\`;
ctx.fillStyle = '#111111';
el.style.padding = 'var(--space)';
el.setAttribute('stroke', '#111111');
export const A = () => <><i style={s} /><b sx={{ mt: 'var(--space)' }} /><path fill="#111111" /></>;
`);
    assert.equal(await readFile(path.join(dir, 'src/h.component.ts'), 'utf8'), `@Component({ template: '', host: { '[style.color]': "'var(--brand)'", '[style.padding.px]': '8' } })
export class H {
  @HostBinding('style.color') c = 'var(--brand)';
  @HostBinding('style.padding') p = 'var(--space)';
}
`);
    assert.equal(await readFile(path.join(dir, 'src/m.scss'), 'utf8'), `@use '../tokens' as *;\n@mixin b($c: $brand) { color: $c; }\n.a { @include b($brand); @include z($brand); }\n`);
});
