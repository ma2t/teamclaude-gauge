import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const gjs = file => spawnSync('gjs', ['-m', new URL(file, import.meta.url).pathname], {
    env: {...process.env, DISPLAY: '', WAYLAND_DISPLAY: ''},
    encoding: 'utf8',
    timeout: 30000,
});

test('chart: a 7d or 5h cap text fits the window, with the weekday', t => {
    const result = gjs('./forecast-chart-check.js');
    if (result.error?.code === 'ENOENT') {
        t.skip('gjs not installed');
        return;
    }
    assert.equal(result.status, 0, result.stderr);
});
