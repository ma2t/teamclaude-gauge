import {test} from 'node:test';
import assert from 'node:assert/strict';

import {ago, backIn, clockTime, level, percent} from '../extension/model.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Fri 2026-10-23 17:11 in Europe/Paris (CEST, UTC+2); npm test pins TZ.
const NOW = Date.UTC(2026, 9, 23, 15, 11);

test('level: green under 70%, amber under 90%, red from 90%', () => {
    assert.equal(level(0.69), 'ok');
    assert.equal(level(0.7), 'warn');
    assert.equal(level(0.89), 'warn');
    assert.equal(level(0.9), 'crit');
});

test('percent rounds down and absorbs float noise', () => {
    assert.equal(percent(0.57), '57%');
    assert.equal(percent(0.29), '29%');
    assert.equal(percent(0.9927), '99%');
    assert.equal(percent(1.2), '100%');
});

test('clockTime: bare time today, weekday otherwise', () => {
    assert.equal(clockTime(Date.UTC(2026, 9, 23, 18, 59, 59), NOW), '20:59');
    assert.equal(clockTime(Date.UTC(2026, 9, 24, 4, 0), NOW), 'Sat 06:00');
});

test('backIn: minutes, hours, then clock time from 24 h', () => {
    assert.equal(backIn(NOW + 12 * MIN, NOW), 'back in 12m');
    assert.equal(backIn(NOW + 3 * HOUR + 48 * MIN, NOW), 'back in 3h48');
    assert.equal(backIn(Date.UTC(2026, 9, 24, 16, 0), NOW), 'back Sat 18:00');
});

test('ago: seconds, minutes, hours', () => {
    assert.equal(ago(45 * 1000), '45 s ago');
    assert.equal(ago(3 * MIN), '3 min ago');
    assert.equal(ago(2 * HOUR), '2 h ago');
});
