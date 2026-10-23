// Read-only check that the running proxy still serves the fields model.js
// reads. Skips when teamclaude is not running.
import {test} from 'node:test';
import assert from 'node:assert/strict';

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
