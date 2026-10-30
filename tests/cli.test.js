// Argument checks of the commands: each bad call fails before it reads the
// proxy or starts a Shell.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const path = file => new URL(file, import.meta.url).pathname;
const run = (command, args, env = {}) => spawnSync(command, args, {
    env: {...process.env, DISPLAY: '', WAYLAND_DISPLAY: '', ...env},
    encoding: 'utf8',
    timeout: 30000,
});
const noGjs = () => spawnSync('gjs', ['--version']).error?.code === 'ENOENT';

test('tcg-forecast: a missing or non-decimal value prints the usage, exit 2', t => {
    if (noGjs()) {
        t.skip('gjs not installed');
        return;
    }
    for (const args of [['--step'], ['--days'], ['--days', '0x5'], ['--days', '7', '--step']]) {
        const result = run(path('../bin/tcg-forecast'), args);
        assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /^usage: tcg-forecast /);
    }
});

test('forecast-shot.js: a DIR that is not a directory prints the usage, exit 2', t => {
    if (noGjs()) {
        t.skip('gjs not installed');
        return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'tcg-cli-'));
    try {
        const file = join(dir, 'file');
        writeFileSync(file, '');
        for (const target of [file, join(dir, 'missing')]) {
            const result = run('gjs', ['-m', path('./forecast-shot.js'), target]);
            assert.equal(result.status, 2, result.stderr);
            assert.match(result.stderr, /^usage: gjs -m tests\/forecast-shot.js /);
        }
    } finally {
        rmSync(dir, {recursive: true});
    }
});

// A stub dbus-run-session stands in for the Shell, so a broken check cannot
// start one here.
test('headless.sh window: a DIR inside the repo is refused, exit 2', () => {
    const stub = mkdtempSync(join(tmpdir(), 'tcg-stub-'));
    try {
        writeFileSync(join(stub, 'dbus-run-session'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
        const env = {PATH: `${stub}:${process.env.PATH}`};
        for (const target of [path('../'), path('./shots-check')]) {
            const result = run('bash', [path('./headless.sh'), 'window', target], env);
            assert.equal(result.status, 2, result.stderr);
            assert.match(result.stderr, /outside the repo/);
        }
    } finally {
        rmSync(stub, {recursive: true});
    }
});
