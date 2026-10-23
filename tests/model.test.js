import {test} from 'node:test';
import assert from 'node:assert/strict';

import {ago, backIn, buildView, clockTime, level, percent} from '../extension/model.js';

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

const STATUS = {currentAccount: 'b@example.com', switchThreshold: 0.99, switchThresholds: null};

function account(name, use = {}, extra = {}) {
    const {five = 0, week = 0.5, fable = 0.5} = use;
    const resets = {five: NOW + 2 * HOUR, week: NOW + 30 * HOUR, fable: NOW + 30 * HOUR, ...use.resets};
    const bucket = (utilization, resetAt) =>
        utilization == null ? null : {utilization, remaining: 1 - utilization, resetAt};
    return {
        name,
        type: 'oauth',
        disabled: false,
        status: 'active',
        tier: {weight: 20},
        buckets: {
            fiveHour: bucket(five, resets.five),
            weeklyShared: bucket(week, resets.week),
            weeklyFable: bucket(fable, resets.fable),
        },
        ...extra,
    };
}

// Mirrors teamclaude's aggregateBucket for the fields model.js reads.
function quotaOf(accounts) {
    const aggregate = key => {
        const known = accounts.filter(a => a.buckets[key]);
        if (known.length === 0)
            return null;
        const capacityWeight = known.reduce((sum, a) => sum + a.tier.weight, 0);
        const usedWeight = known.reduce((sum, a) => sum + a.tier.weight * a.buckets[key].utilization, 0);
        return {capacityWeight, usedWeight, utilization: usedWeight / capacityWeight, knownAccounts: known.length};
    };
    return {
        accounts,
        aggregate: {
            fiveHour: aggregate('fiveHour'),
            weeklyShared: aggregate('weeklyShared'),
            weeklyFable: aggregate('weeklyFable'),
        },
    };
}

const fableBucket = view => view.buckets.find(b => b.key === 'weeklyFable');

test('off when the payload has no aggregate', () => {
    for (const quota of [null, {}, {aggregate: {}}]) {
        const view = buildView(quota, STATUS, NOW);
        assert.equal(view.state, 'off');
        assert.deepEqual(view.panel, {text: 'TC off', level: 'off', fraction: 0});
    }
});

test('off when no account is active', () => {
    const quota = quotaOf([
        account('a@example.com', {}, {disabled: true}),
        account('b@example.com', {}, {status: 'error'}),
    ]);
    assert.equal(buildView(quota, STATUS, NOW).error, 'no active account');
});

test('calm fleet shows its top bucket in green', () => {
    const quota = quotaOf([account('a@example.com', {five: 0.03, week: 0.6, fable: 0.5})]);
    const {panel} = buildView(quota, STATUS, NOW);
    assert.equal(panel.text, '7d 60%');
    assert.equal(panel.level, 'ok');
});

test('busy fleet shows its top two buckets', () => {
    const quota = quotaOf([account('a@example.com', {five: 0.72, week: 0.6, fable: 0.1})]);
    const {panel} = buildView(quota, STATUS, NOW);
    assert.equal(panel.text, '5h 72% · 7d 60%');
    assert.equal(panel.level, 'warn');
});

test('a Fable cap on every account shows the countdown to the first reset', () => {
    const quota = quotaOf([
        account('a@example.com', {fable: 0.99, resets: {fable: NOW + 3 * HOUR + 48 * MIN}}),
        account('b@example.com', {fable: 1, resets: {fable: NOW + 5 * HOUR}}),
    ]);
    const {panel} = buildView(quota, STATUS, NOW);
    assert.deepEqual(panel, {text: 'Fable 99% · back in 3h48', level: 'crit', fraction: 1});
});

test('a capped 7d window outranks a capped Fable', () => {
    const quota = quotaOf([account('a@example.com', {week: 0.99, fable: 1})]);
    assert.match(buildView(quota, STATUS, NOW).panel.text, /^7d 99% · back /);
});

test('one account under the threshold keeps the bucket open', () => {
    const quota = quotaOf([account('a@example.com', {fable: 1}), account('b@example.com', {fable: 0.98})]);
    const view = buildView(quota, STATUS, NOW);
    assert.equal(view.panel.text, 'Fable 99% · 7d 50%');
    assert.equal(fableBucket(view).capped, false);
});

test('per-bucket thresholds come from switchThresholds', () => {
    const quota = quotaOf([account('a@example.com', {fable: 0.85})]);
    const strict = {...STATUS, switchThresholds: {unified7dFable: 0.8}};
    assert.equal(fableBucket(buildView(quota, strict, NOW)).capped, true);
    assert.equal(fableBucket(buildView(quota, STATUS, NOW)).capped, false);
});

test('without /status the threshold defaults to 99% and no account is current', () => {
    const quota = quotaOf([account('a@example.com', {fable: 0.99})]);
    const view = buildView(quota, null, NOW);
    assert.equal(fableBucket(view).capped, true);
    assert.equal(view.header.current, null);
});

test('a window whose reset has passed counts as open', () => {
    const quota = quotaOf([account('a@example.com', {fable: 1, resets: {fable: NOW - MIN}})]);
    assert.equal(fableBucket(buildView(quota, STATUS, NOW)).capped, false);
});

test('bucket notes: countdown when capped, next reset otherwise', () => {
    const quota = quotaOf([account('a@example.com', {
        five: 0.03,
        fable: 1,
        resets: {five: Date.UTC(2026, 9, 23, 16, 30), fable: NOW + 2 * HOUR},
    })]);
    const notes = Object.fromEntries(buildView(quota, STATUS, NOW).buckets.map(b => [b.key, b.note]));
    assert.deepEqual(notes, {
        fiveHour: 'resets 18:30',
        weeklyShared: 'resets Sat 23:11',
        weeklyFable: 'back in 2h00',
    });
});

test('comes-back lists the three soonest resets with their fleet gain', () => {
    const accounts = Array.from({length: 11}, (_, i) =>
        account(`${i}@example.com`, {fable: 0.99, resets: {fable: NOW + (11 - i) * HOUR}}));
    const {comesBack} = buildView(quotaOf(accounts), STATUS, NOW);
    assert.equal(comesBack.label, 'Fable comes back');
    assert.deepEqual(comesBack.rows.map(r => r.name), ['10@example.com', '9@example.com', '8@example.com']);
    assert.deepEqual(comesBack.rows[0], {when: '18:11', name: '10@example.com', gain: '+9%'});
});

test('no comes-back list under 90%', () => {
    const quota = quotaOf([account('a@example.com', {week: 0.6, fable: 0.5})]);
    assert.equal(buildView(quota, STATUS, NOW).comesBack, null);
});

test('accounts: current first, then most Fable headroom, inactive dimmed', () => {
    const quota = quotaOf([
        account('a@example.com', {fable: 0.9}),
        account('b@example.com', {fable: 0.99}),
        account('c@example.com', {fable: 0.2}, {disabled: true}),
        account('d@example.com', {fable: null}),
    ]);
    const rows = buildView(quota, STATUS, NOW).accounts;
    assert.deepEqual(rows.map(r => r.name), ['b@example.com', 'c@example.com', 'a@example.com', 'd@example.com']);
    assert.deepEqual(rows.map(r => r.dim), [false, true, false, false]);
    assert.equal(rows[0].current, true);
});

test('account gauges carry the whole percent, fill and level of each bucket', () => {
    const quota = quotaOf([
        account('a@example.com', {five: 0.35, week: 0.72, fable: 0.99}),
        account('b@example.com', {fable: null}),
    ]);
    const [b, a] = buildView(quota, STATUS, NOW).accounts;
    assert.deepEqual(a.fable, {text: '99', fraction: 0.99, level: 'crit'});
    assert.deepEqual(a.weekly, {text: '72', fraction: 0.72, level: 'warn'});
    assert.deepEqual(a.fiveHour, {text: '35', fraction: 0.35, level: 'ok'});
    assert.deepEqual(b.fable, {text: '-', fraction: 0, level: 'off'});
});

test('short names: the domain when unique, the full address when shared', () => {
    const quota = quotaOf([
        account('me@example.org'),
        account('x@example.com'),
        account('y@example.com'),
        account('api-key'),
    ]);
    const shorts = Object.fromEntries(buildView(quota, STATUS, NOW).accounts.map(r => [r.name, r.short]));
    assert.deepEqual(shorts, {
        'me@example.org': 'example.org',
        'x@example.com': 'x@example.com',
        'y@example.com': 'y@example.com',
        'api-key': 'api-key',
    });
});

test('account notes: Fable cap, blocking cap, inactive state', () => {
    const quota = quotaOf([
        account('a@example.com', {fable: 1, resets: {fable: NOW + HOUR}}),
        account('b@example.com', {week: 0.99, fable: 1}),
        account('c@example.com', {}, {disabled: true}),
        account('d@example.com', {}, {status: 'error'}),
        account('e@example.com'),
    ]);
    const notes = Object.fromEntries(buildView(quota, STATUS, NOW).accounts.map(r => [r.name, r.note]));
    assert.deepEqual(notes, {
        'a@example.com': 'back 18:11',
        'b@example.com': '7d back Sat 23:11',
        'c@example.com': 'disabled',
        'd@example.com': 'error',
        'e@example.com': '',
    });
});

test('header counts accounts and names the current one; footer shows probe age', () => {
    const quota = quotaOf([account('a@example.com'), account('b@example.com')]);
    const probed = {...STATUS, probe: {lastRunFinishedAt: new Date(NOW - 2 * MIN).toISOString()}};
    const view = buildView(quota, probed, NOW);
    assert.deepEqual(view.header, {accounts: 2, current: 'b@example.com'});
    assert.equal(view.footer, 'Probed 2 min ago');
    assert.equal(buildView(quota, STATUS, NOW).footer, null);
});
