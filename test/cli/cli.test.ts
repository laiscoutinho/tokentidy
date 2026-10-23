// Testes de ponta a ponta: rodam a CLI como processo, como um CI ou hook faria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CLI_ENTRY, FIXTURES, copyFixture } from '../helpers.ts';

const project = path.join(FIXTURES, 'basic-project');

// Roda a partir da pasta de FIXTURES, para os caminhos da saída ficarem curtos e previsíveis
function run(...args: string[]) {
    return runIn(FIXTURES, ...args);
}

// Sem `stdio: 'inherit'`, a CLI não está num terminal interativo: é o caso de CI
function runIn(cwd: string, ...args: string[]) {
    return spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd });
}

test('check prints one finding per line (file:line:column, severity, rule, property, value) and exits with 1', () => {
    const { stdout, stderr, status } = run('check', project);

    assert.equal(status, 1);
    assert.equal(stderr, '3 violations, 0 review in 3 files\n');
    assert.deepEqual(stdout.trim().split('\n'), [
        `${path.join('basic-project', 'src', 'App.jsx')}:2:32\tviolation\tcolor/hardcoded\tcolor\t#ff0000`,
        `${path.join('basic-project', 'src', 'App.scss')}:2:10\tviolation\tcolor/hardcoded\tcolor\t#ff0000`,
        `${path.join('basic-project', 'src', 'components', 'Button.css')}:2:12\tviolation\tspacing/hardcoded\tpadding\t12px`,
    ]);
});

test('check with no hardcoded values prints nothing and exits with 0', () => {
    const { stdout, status } = run('check', path.join(FIXTURES, 'clean-project'));

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
        type: 'color', rule: 'color/hardcoded', property: 'color', value: '#ff0000', host: 'scss', selector: '.app',
    });
    assert.deepEqual(data.errors, []);
});

test('a syntax error goes to stderr without stopping the other files', () => {
    const { stdout, stderr, status } = run('check', 'css');

    assert.equal(status, 1);
    assert.match(stderr, /broken\.css:2:14\tsyntax error\tMissed semicolon/);
    assert.match(stdout, /variables\.scss/);
});

test('a missing path goes to stderr and exits with 2', () => {
    const { stdout, stderr, status } = run('check', '/path/that/does/not/exist');

    assert.equal(status, 2);
    assert.equal(stdout, '');
    assert.match(stderr, /Path not found: \/path\/that\/does\/not\/exist/);
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

test('generate writes DTCG + CSS + SCSS into design-tokens/ and lists the files on stdout', async () => {
    const dir = await copyFixture('generate-project');
    try {
        const { stdout, stderr, status } = runIn(dir, 'generate', '.');

        assert.equal(status, 0);
        assert.deepEqual(stdout.trim().split('\n'), [
            path.join('design-tokens', 'tokens.tokens.json'),
            path.join('design-tokens', 'tokens.css'),
            path.join('design-tokens', '_tokens.scss'),
        ]);
        assert.match(stderr, /^6 new tokens, 0 kept, 0 semantic aliases$/m);
        assert.match(stderr, /values used fewer than 2 times were not turned into tokens/);
        assert.match(await readFile(path.join(dir, 'design-tokens', 'tokens.css'), 'utf8'), /--color-white: #ffffff;/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('with existing token files and no terminal, generate asks for --extend or --new and exits with 2', async () => {
    const dir = await copyFixture('generate-project');
    try {
        runIn(dir, 'generate', '.');
        const second = runIn(dir, 'generate', '.');
        assert.equal(second.status, 2);
        assert.equal(second.stdout, '');
        assert.match(second.stderr, /Existing token files found/);
        assert.match(second.stderr, /Use --extend to reuse them or --new to start over/);

        const extend = runIn(dir, 'generate', '.', '--extend');
        assert.equal(extend.status, 0);
        assert.match(extend.stderr, /^0 new tokens, 6 kept/m);

        const fresh = runIn(dir, 'generate', '.', '--new', '--min-occurrences', '3');
        assert.equal(fresh.status, 0);
        assert.match(fresh.stderr, /^2 new tokens, 0 kept/m);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('generate --dry-run prints the files and writes nothing', async () => {
    const dir = await copyFixture('generate-project');
    try {
        const { stdout, status } = runIn(dir, 'generate', '.', '--dry-run');

        assert.equal(status, 0);
        assert.match(stdout, /^==> design-tokens\/tokens\.tokens\.json <==\n\{/);
        assert.match(stdout, /==> design-tokens\/tokens\.css <==\n/);
        assert.equal(existsSync(path.join(dir, 'design-tokens')), false);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('generate --json prints only valid JSON, with tokens and their occurrences', () => {
    const { stdout, status } = run('generate', 'generate-project', '--json', '--dry-run');

    assert.equal(status, 0);
    const data = JSON.parse(stdout);
    assert.equal(data.mode, 'extend');
    assert.equal(data.config.minOccurrences, 2);
    assert.equal(data.tokens.length, 6);
    assert.ok(data.tokens.every((t: { occurrences: unknown[]; count: number }) => t.occurrences.length === t.count));
    assert.equal(data.belowThreshold.length, 6);
});

test('the config file is read from the project; options on the command line win', async () => {
    const dir = await copyFixture('generate-project');
    try {
        await writeFile(path.join(dir, 'tokentidy.config.json'), JSON.stringify({ minOccurrences: 3, output: 'tokens' }));
        const fromConfig = runIn(dir, 'generate', '.', '--dry-run');
        assert.match(fromConfig.stdout, /^==> tokens\/tokens\.tokens\.json <==/);
        assert.match(fromConfig.stderr, /^2 new tokens/m);

        const fromFlag = runIn(dir, 'generate', '.', '--dry-run', '--min-occurrences', '2');
        assert.match(fromFlag.stderr, /^6 new tokens/m);

        await writeFile(path.join(dir, 'tokentidy.config.json'), JSON.stringify({ minOccurences: 3 }));
        const invalid = runIn(dir, 'generate', '.');
        assert.equal(invalid.status, 2);
        assert.match(invalid.stderr, /unknown option "minOccurences"/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('usage errors in generate exit with 2', () => {
    const one = run('generate', 'generate-project', '--min-occurrences', '1');
    assert.equal(one.status, 2);
    assert.match(one.stderr, /--min-occurrences must be an integer >= 2/);

    const both = run('generate', 'generate-project', '--extend', '--new');
    assert.equal(both.status, 2);
    assert.match(both.stderr, /--extend and --new cannot be used together/);
});

test('check on one file inside a project reports paths from where it runs, with the summary on stderr', () => {
    const { stdout, stderr, status } = runIn(project, 'check', path.join('src', 'App.scss'));

    assert.equal(status, 1);
    assert.equal(stdout, `${path.join('src', 'App.scss')}:2:10\tviolation\tcolor/hardcoded\tcolor\t#ff0000\n`);
    assert.equal(stderr, '1 violation, 0 review in 1 file\n');
});

test('control characters in values are escaped in the text output', async () => {
    const dir = await copyFixture('clean-project');
    try {
        await writeFile(path.join(dir, 'evil.css'), '.a { font-family: "x\u001b[2Jy"; color: red; }\n');
        const { stdout } = runIn(dir, 'check');

        assert.doesNotMatch(stdout, /\u001b/);
        assert.match(stdout, /evil\.css:1:\d+\tviolation\tcolor\/hardcoded\tcolor\tred/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('skipped files and comment ignores are listed and counted on stderr', async () => {
    const dir = await copyFixture('clean-project');
    try {
        await writeFile(path.join(dir, 'App.vue'), '<template></template>');
        await writeFile(path.join(dir, 'b.css'), '.b { color: red; } /* tokentidy-ignore-line color/hardcoded -- brand */\n');
        const { stdout, stderr, status } = runIn(dir, 'check');

        assert.equal(status, 0);
        assert.equal(stdout, '');
        assert.match(stderr, /^App\.vue\tskipped\tunsupported$/m);
        assert.match(stderr, /0 violations, 0 review in \d+ files; 1 ignored by comment; 1 file skipped/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('generate refuses an output folder outside the project and a corrupted token file (exit 2)', async () => {
    const dir = await copyFixture('generate-project');
    try {
        const outside = runIn(dir, 'generate', '--out', path.join('..', 'elsewhere'));
        assert.equal(outside.status, 2);
        assert.match(outside.stderr, /must be inside the project/);

        await mkdir(path.join(dir, 'design-tokens'));
        await writeFile(path.join(dir, 'design-tokens', 'tokens.tokens.json'), '{ broken');
        const corrupted = runIn(dir, 'generate', '--extend');
        assert.equal(corrupted.status, 2);
        assert.match(corrupted.stderr, /tokens\.tokens\.json.*Fix it or use --out/s);
    } finally {
        await rm(dir, { recursive: true });
    }
});
