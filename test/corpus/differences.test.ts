import { test } from 'node:test';
import assert from 'node:assert/strict';

import { differences } from './corpus.ts';
import type { Counts } from './corpus.ts';

const base: Counts = {
    filesAnalyzed: 10, findings: { 'color/hardcoded': 5, 'spacing/hardcoded': 3 }, review: { 'size/no-context': 1 },
    hosts: { css: 8 }, types: { color: 5, spacing: 3 }, reviewShare: 0.111, skipped: {}, errors: 0,
};

test('the same counts give no difference', () => {
    assert.deepEqual(differences(base, structuredClone(base)), []);
});

test('a changed rule is named with the expected and the actual count', () => {
    const actual = structuredClone(base);
    actual.findings['color/hardcoded'] = 4;
    actual.findings['radius/hardcoded'] = 1;
    delete actual.findings['spacing/hardcoded'];
    actual.errors = 2;
    assert.deepEqual(differences(base, actual), [
        'findings.color/hardcoded: 5 → 4',
        'findings.radius/hardcoded: 0 → 1',
        'findings.spacing/hardcoded: 3 → 0',
        'errors: 0 → 2',
    ]);
});
