import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyIgnores, parseIgnoreDirectives, unusedDirectives } from '../../src/analysis/ignore.ts';

test('directives in every comment syntax, for the same line or the next one', () => {
    const source = [
        '.a { color: red; } /* tokentidy-ignore-line color/hardcoded -- partner brand */',
        '// tokentidy-ignore-next-line spacing/hardcoded, radius/hardcoded',
        '<!-- tokentidy-ignore-line color/hardcoded -->',
        '{/* tokentidy-ignore-next-line color/hardcoded */}',
    ].join('\n');
    const { directives, warnings } = parseIgnoreDirectives(source, 'a.css');

    assert.deepEqual(directives.map((d) => [d.line, d.target, d.rules]), [
        [1, 1, ['color/hardcoded']],
        [2, 3, ['spacing/hardcoded', 'radius/hardcoded']],
        [3, 3, ['color/hardcoded']],
        [4, 5, ['color/hardcoded']],
    ]);
    assert.deepEqual(warnings, []);
});

test('a directive without rule ids ignores nothing and is reported; unknown rules are reported', () => {
    const source = '/* tokentidy-ignore */\n/* tokentidy-ignore-line -- no rules */\n/* tokentidy-ignore-line colour/hardcoded */';
    const { directives, warnings } = parseIgnoreDirectives(source, 'a.css');

    assert.deepEqual(warnings.map((w) => `${w.line}:${w.column} ${w.rule}`), ['1:4 ignore/too-broad', '2:4 ignore/too-broad', '3:4 ignore/unknown-rule']);
    assert.deepEqual(directives.map((d) => d.rules), [[]]);
});

test('text without the marker costs nothing; the marker outside a comment is not a directive', () => {
    assert.deepEqual(parseIgnoreDirectives('.a { color: red; }', 'a.css'), { directives: [], warnings: [] });
    assert.deepEqual(parseIgnoreDirectives('.a { content: "tokentidy-ignore-line color/hardcoded"; }', 'a.css').directives, []);
});

test('only the named rules on the target line are ignored; unused rules become warnings', () => {
    const { directives } = parseIgnoreDirectives('/* tokentidy-ignore-next-line color/hardcoded, spacing/hardcoded */\n.a {}', 'a.css');
    const items = [
        { line: 2, rule: 'color/hardcoded' },
        { line: 2, rule: 'radius/hardcoded' },
        { line: 3, rule: 'color/hardcoded' },
    ];
    const { kept, ignored } = applyIgnores(items, directives);

    assert.equal(ignored, 1);
    assert.deepEqual(kept, [items[1], items[2]]);
    assert.deepEqual(unusedDirectives(directives).map((w) => `${w.rule} ${w.message}`), ['ignore/unused nothing to ignore for spacing/hardcoded on line 2']);
});
