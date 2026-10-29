import {test} from 'node:test';
import assert from 'node:assert/strict';

import {buildForecast} from '../extension/forecast.js';
import {bucket, quotaOf} from './fleet.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Fri 2026-10-23 17:11 in Europe/Paris (CEST, UTC+2); npm test pins TZ.
const NOW = Date.UTC(2026, 9, 23, 15, 11);
const STATUS = {switchThreshold: 0.99, switchThresholds: null};

// Fable use and reset; the 7d and 5h windows stay open unless `caps` says so.
function account(name, fable, fableReset, {caps = {}, ...extra} = {}) {
    return {
        name,
        type: 'oauth',
        disabled: false,
        status: 'active',
        tier: {weight: 20},
        buckets: {
            fiveHour: bucket(caps.five?.[0] ?? 0, caps.five?.[1] ?? NOW + 2 * HOUR),
            weeklyShared: bucket(caps.week?.[0] ?? 0.5, caps.week?.[1] ?? NOW + 3 * DAY),
            weeklyFable: fable === null ? null : bucket(fable, fableReset),
        },
        ...extra,
    };
}

const forecast = accounts => buildForecast(quotaOf(accounts), STATUS, NOW);
const levels = f => f.changes.map(c => c.level);
const row = (f, short) => f.accounts.find(a => a.short === short);

// Both capped: one.example resets in 10 h, two.example in 40 h.
const TWO_CAPPED = [
    account('me@one.example', 1, NOW + 10 * HOUR),
    account('me@two.example', 1, NOW + 40 * HOUR),
];

test('a Fable reset makes an account available at its exact time', () => {
    const f = forecast(TWO_CAPPED);
    assert.deepEqual(f.changes[0], {at: null, until: NOW + 10 * HOUR, level: 'red', accounts: []});
    assert.deepEqual(f.changes[1], {at: NOW + 10 * HOUR, until: NOW + 40 * HOUR, level: 'amber', accounts: ['one.example']});
    assert.equal(f.changes[2].at, NOW + 40 * HOUR);
    assert.deepEqual(f.changes[2].accounts, ['one.example', 'two.example']);
    // Off the 15 min grid too.
    const offGrid = forecast([account('me@one.example', 1, NOW + 10 * HOUR + 7 * MIN), TWO_CAPPED[1]]);
    assert.equal(offGrid.changes[1].at, NOW + 10 * HOUR + 7 * MIN);
});

test('a window whose reset passed has rolled over', () => {
    const f = forecast([account('me@one.example', 1, NOW - HOUR), TWO_CAPPED[1]]);
    assert.equal(f.changes[0].level, 'amber');
    assert.equal(row(f, 'one.example').resetAt, NOW - HOUR + 7 * DAY);
    assert.equal(row(f, 'one.example').use, 0);
});

test('level: green from 2 accounts under 85%, amber from 1 available, red at 0', () => {
    const pair = (a, b) => forecast([
        account('me@one.example', a, NOW + 5 * DAY),
        account('me@two.example', b, NOW + 5 * DAY),
    ]);
    assert.equal(pair(0.5, 0.6).changes[0].level, 'green');
    assert.equal(pair(0.5, 1).changes[0].level, 'amber');
    assert.equal(pair(0.9, 0.95).changes[0].level, 'amber');
    assert.equal(pair(1, 0.99).changes[0].level, 'red');
    // Column 5 holds now: both accounts have room, above 85%.
    assert.deepEqual(pair(0.9, 0.95).accounts.map(a => a.cells[5]), ['weak', 'weak']);
});

test('demand refills a reset account, so green turns amber again', () => {
    const f = forecast([
        account('me@one.example', 0.5, NOW + 6 * DAY),
        account('me@two.example', 1, NOW + 2 * HOUR),
        account('me@three.example', 1, NOW + 3 * DAY),
    ]);
    assert.deepEqual(levels(f).slice(0, 3), ['amber', 'green', 'amber']);
    assert.equal(f.changes[1].at, NOW + 2 * HOUR);
    // The most used open account takes the load: one.example passes 85% first.
    assert.ok(f.changes[2].at < NOW + DAY);
});

test('demand: the largest use over the age of the newest windows, 3 h at least', () => {
    // 2 x 20 weight used; the oldest window opened 158 h ago, the newer 128 h ago.
    const capped = forecast(TWO_CAPPED);
    assert.ok(Math.abs(capped.demandPerHour - 40 / 158) < 1e-9);
    assert.ok(Math.abs(capped.hoursPerAccount - 20 * 0.99 / (40 / 158)) < 1e-9);
    // A window 4 h old already holds 10 weight: 2.5 per hour.
    const recent = forecast([
        account('me@one.example', 0.5, NOW + 7 * DAY - 4 * HOUR),
        account('me@two.example', 1, NOW + 10 * HOUR),
    ]);
    assert.ok(Math.abs(recent.demandPerHour - 2.5) < 1e-9);
    // A window 1 h old counts over 3 h.
    const young = forecast([account('me@one.example', 0.1, NOW + 7 * DAY - HOUR)]);
    assert.ok(Math.abs(young.demandPerHour - 2 / 3) < 1e-9);
});

test('an account with no tier weight counts as an average one', () => {
    const f = forecast([
        account('me@one.example', 0.9, NOW + 5 * DAY, {tier: {weight: null}}),
        account('me@two.example', 0.1, NOW + 5 * DAY),
    ]);
    // 20 weight used in windows 48 h old, 20 x 0.99 weight per account.
    assert.equal(Math.round(f.hoursPerAccount), 48);
});

test('a capped 7d window blocks Fable until its reset, and says so', () => {
    const f = forecast([
        account('me@one.example', 0.2, NOW + 5 * DAY, {caps: {week: [1, NOW + 5 * HOUR]}}),
        account('me@two.example', 1, NOW + 5 * DAY),
    ]);
    assert.deepEqual(f.changes[0], {at: null, until: NOW + 5 * HOUR, level: 'red', accounts: []});
    assert.equal(f.changes[1].level, 'amber');
    assert.deepEqual(row(f, 'one.example').blocked, {window: '7d', until: NOW + 5 * HOUR});
    assert.equal(row(f, 'two.example').blocked, null);
    // A 7d cap that outlasts the Fable reset keeps the account out.
    const later = forecast([
        account('me@one.example', 1, NOW + 10 * HOUR, {caps: {week: [0.99, NOW + 30 * HOUR]}}),
        account('me@two.example', 1, NOW + 5 * DAY),
    ]);
    assert.equal(later.changes[0].until, NOW + 30 * HOUR);
    assert.equal(row(later, 'one.example').blocked, null);
});

test('a capped 5h window ends at its reset', () => {
    const f = forecast([
        account('me@one.example', 0.2, NOW + 5 * DAY, {caps: {five: [1, NOW + 90 * MIN]}}),
        account('me@two.example', 1, NOW + 5 * DAY),
    ]);
    assert.equal(f.changes[0].until, NOW + 90 * MIN);
    assert.equal(f.changes[1].level, 'amber');
    assert.deepEqual(row(f, 'one.example').blocked, {window: '5h', until: NOW + 90 * MIN});
});

test('a disabled account is never available; no Fable data gives none cells', () => {
    const f = forecast([
        account('me@one.example', 0, NOW + 5 * DAY, {disabled: true}),
        account('me@two.example', 1, NOW + 6 * DAY + 12 * HOUR),
        account('me@three.example', null, null),
    ]);
    assert.deepEqual(levels(f), ['red']);
    assert.ok(row(f, 'one.example').cells.slice(5).every(c => c === 'out'));
    assert.ok(row(f, 'three.example').cells.slice(5).every(c => c === 'none'));
    assert.equal(row(f, 'three.example').known, false);
});

test('cells: past before the column of now, then the worst state of each 3 h column', () => {
    const f = forecast(TWO_CAPPED);
    // Columns start Fri 00:00; now (17:11) is inside column 5.
    assert.equal(f.columns.length, 56);
    assert.equal(f.start, NOW - (17 * HOUR + 11 * MIN));
    const one = f.accounts[0];
    assert.equal(one.short, 'one.example');
    assert.deepEqual(one.cells.slice(0, 6), [...Array(5).fill('past'), 'out']);
    // The reset lands at 27h11 from the start: column 9 still holds the cap.
    assert.equal(one.cells[9], 'out');
    assert.equal(one.cells[10], 'strong');
    assert.equal(f.levels[4], null);
    assert.equal(f.levels[5], 'red');
    assert.equal(f.levels[9], 'red');
    assert.equal(f.levels[10], 'amber');
    assert.equal(f.threshold, 0.99);
    assert.equal(f.strong, 0.85);
});

test('bad payloads give an error', () => {
    assert.deepEqual(buildForecast({}, null, NOW), {error: 'unexpected response'});
    const off = account('me@one.example', 0.5, NOW + DAY, {disabled: true});
    assert.deepEqual(buildForecast(quotaOf([off]), null, NOW), {error: 'no active account'});
});
