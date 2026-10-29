// Read-only checks against the running proxy: it still serves the fields
// the views read, and tcg-forecast runs with no display. Skip when
// teamclaude is not running.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

import {buildForecast} from '../extension/forecast.js';
import {buildView} from '../extension/model.js';

const BASE = 'http://127.0.0.1:3456/teamclaude';

async function get(path) {
    try {
        const response = await fetch(`${BASE}/${path}`, {signal: AbortSignal.timeout(3000)});
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

test('live proxy payload has the fields the model reads', async t => {
    const quota = await get('quota');
    if (!quota) {
        t.skip('teamclaude proxy not reachable');
        return;
    }
    const status = await get('status');
    assert.ok(quota.aggregate?.weeklyShared, 'aggregate.weeklyShared');
    for (const account of quota.accounts) {
        assert.equal(typeof account.name, 'string');
        assert.equal(typeof account.status, 'string');
        assert.ok('weight' in account.tier);
    }
    assert.equal(typeof status?.currentAccount, 'string');
    assert.equal(typeof status?.switchThreshold, 'number');
    assert.equal(buildView(quota, status, Date.now()).state, 'ok');
});

test('live forecast builds, and tcg-forecast --json runs with no display', async t => {
    const quota = await get('quota');
    if (!quota) {
        t.skip('teamclaude proxy not reachable');
        return;
    }
    const forecast = buildForecast(quota, await get('status'), Date.now());
    assert.equal(forecast.accounts.length, quota.accounts.length);
    const env = {...process.env};
    delete env.DISPLAY;
    delete env.WAYLAND_DISPLAY;
    const cli = new URL('../bin/tcg-forecast', import.meta.url).pathname;
    const out = execFileSync(cli, ['--json'], {env, encoding: 'utf8', timeout: 20000});
    assert.equal(JSON.parse(out).accounts.length, quota.accounts.length);
});
