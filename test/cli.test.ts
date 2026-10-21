// Testes de ponta a ponta: rodam a CLI como processo, como um CI ou hook faria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cli = path.join(import.meta.dirname, '..', 'src', 'cli.ts');
const fixtures = path.join(import.meta.dirname, 'fixtures');
const project = path.join(fixtures, 'basic-project');

// Roda a partir da pasta de fixtures, para os caminhos da saída ficarem curtos e previsíveis
function run(...args: string[]) {
    return runIn(fixtures, ...args);
}

// Sem `stdio: 'inherit'`, a CLI não está num terminal interativo: é o caso de CI
function runIn(cwd: string, ...args: string[]) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd });
}

test('check prints one finding per line (file:line:column, token type, property, value) and exits with 1', () => {
    const { stdout, stderr, status } = run('check', project);

    assert.equal(status, 1);
    assert.equal(stderr, '');
    assert.deepEqual(stdout.trim().split('\n'), [
        `${path.join('basic-project', 'src', 'App.jsx')}:2:32\tcolor\tcolor\t#ff0000`,
        `${path.join('basic-project', 'src', 'App.scss')}:2:10\tcolor\tcolor\t#ff0000`,
        `${path.join('basic-project', 'src', 'components', 'Button.css')}:2:12\tspacing\tpadding\t12px`,
    ]);
});

test('check with no hardcoded values prints nothing and exits with 0', () => {
    const { stdout, status } = run('check', path.join(fixtures, 'clean-project'));

    assert.equal(status, 0);
    assert.equal(stdout, '');
});

test('check --json prints only valid JSON to stdout', () => {
    const { stdout, status } = run('check', project, '--json');

    assert.equal(status, 1);
    const data = JSON.parse(stdout);
    assert.equal(data.filesAnalyzed, 4);
    assert.deepEqual(data.findings[1], {
        file: 'src/App.scss', line: 2, column: 10, offset: 16, endOffset: 23,
        type: 'color', property: 'color', value: '#ff0000', host: 'scss', selector: '.app',
    });
    assert.deepEqual(data.errors, []);
});

test('a syntax error goes to stderr without stopping the other files', () => {
    const { stdout, stderr, status } = run('check', 'css');

    assert.equal(status, 1);
    assert.match(stderr, /broken\.css:2:14\tsyntax error\tMissed semicolon/);
    assert.match(stdout, /variables\.scss/);
});

test('a missing directory goes to stderr and exits with 2', () => {
    const { stdout, stderr, status } = run('check', '/path/that/does/not/exist');

    assert.equal(status, 2);
    assert.equal(stdout, '');
    assert.match(stderr, /Directory not found/);
});

test('an unknown option is a usage error: exit code 2', () => {
    const { stderr, status } = run('check', project, '--does-not-exist');

    assert.equal(status, 2);
    assert.match(stderr, /unknown option/);
});

test('--help and --version exit with 0', () => {
    assert.equal(run('--help').status, 0);
    assert.equal(run('--version').status, 0);
});

test('check does not show the banner', () => {
    const { stdout } = run('check', project);

    assert.doesNotMatch(stdout, /_____/);
});
