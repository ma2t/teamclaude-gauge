// TCG_BASE_URL points the views at another loopback server, and nowhere else.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';

import {demoFleet} from './demo.js';

const path = file => new URL(file, import.meta.url).pathname;
const noGjs = () => spawnSync('gjs', ['--version']).error?.code === 'ENOENT';
const DEFAULT_URL = 'http://127.0.0.1:3456/teamclaude';

const baseUrl = value => {
    const env = {...process.env, TCG_BASE_URL: value};
    if (value === undefined)
        delete env.TCG_BASE_URL;
    return spawnSync('gjs', ['-m', path('./base-url-check.js')], {env, encoding: 'utf8', timeout: 30000}).stdout.trim();
};

test('TCG_BASE_URL: a loopback http URL replaces the default, any other is ignored', t => {
    if (noGjs()) {
        t.skip('gjs not installed');
        return;
    }
    assert.equal(baseUrl(undefined), DEFAULT_URL);
    assert.equal(baseUrl('http://127.0.0.1:4567/teamclaude'), 'http://127.0.0.1:4567/teamclaude');
    assert.equal(baseUrl('http://localhost:4567/teamclaude/'), 'http://localhost:4567/teamclaude');
    for (const other of ['http://example.com:4567/teamclaude', 'http://127.0.0.1.example.com:80/x',
        'https://127.0.0.1:4567/teamclaude', 'http://127.0.0.1/teamclaude', ''])
        assert.equal(baseUrl(other), DEFAULT_URL, other);
});

test('tcg-forecast reads the server TCG_BASE_URL names', async t => {
    if (noGjs()) {
        t.skip('gjs not installed');
        return;
    }
    const fleet = demoFleet(Date.now());
    const server = createServer((request, response) => {
        const body = {'/teamclaude/quota': fleet.quota, '/teamclaude/status': fleet.status}[request.url];
        response.writeHead(body ? 200 : 404, {'content-type': 'application/json'});
        response.end(body ? JSON.stringify(body) : '');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const env = {...process.env, TCG_BASE_URL: `http://127.0.0.1:${server.address().port}/teamclaude`};
        const {stdout} = await promisify(execFile)(path('../bin/tcg-forecast'), ['--json'], {env, timeout: 30000});
        const names = JSON.parse(stdout).accounts.map(a => a.name);
        assert.equal(names.length, fleet.quota.accounts.length);
        assert.ok(names.every(name => name.endsWith('.example')));
    } finally {
        server.close();
    }
});
