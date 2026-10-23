import {test} from 'node:test';
import assert from 'node:assert/strict';

import {buildView} from '../extension/model.js';
import {demoFleet} from './demo.js';

const NOW = Date.UTC(2026, 9, 23, 15, 11);

// The README images come from this fleet: keep it showing what they promise.
test('demo fleet shows a hot Fable bucket, its next resets and every tile color', () => {
    const {quota, status} = demoFleet(NOW);
    const view = buildView(quota, status, NOW);
    assert.equal(view.panel.text, 'Fable 91% · 7d 55%');
    assert.equal(view.comesBack.label, 'Next Fable resets');
    assert.deepEqual(new Set(view.accounts.map(a => a.fable.level)), new Set(['ok', 'warn', 'crit']));
    assert.ok(view.accounts.every(a => a.name.endsWith('.example')));
});
