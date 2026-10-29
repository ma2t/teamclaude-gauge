import {test} from 'node:test';
import assert from 'node:assert/strict';

import {buildForecast} from '../extension/forecast.js';
import {changeRows, forecastLines} from '../extension/forecastText.js';
import {bucket, quotaOf} from './fleet.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Fri 2026-10-23 17:11 in Europe/Paris; clocks go back on Sun 25 at 03:00.
const NOW = Date.UTC(2026, 9, 23, 15, 11);
const STATUS = {switchThreshold: 0.99};

function account(name, fable, fableReset, five = [0, NOW + 2 * HOUR]) {
    return {
        name,
        type: 'oauth',
        disabled: false,
        status: 'active',
        tier: {weight: 20},
        buckets: {
            fiveHour: bucket(...five),
            weeklyShared: bucket(0.5, NOW + 72 * HOUR),
            weeklyFable: bucket(fable, fableReset),
        },
    };
}

const lines = (accounts, options = {}, color = false) =>
    forecastLines(buildForecast(quotaOf(accounts), STATUS, NOW, options), {color});
const CAPPED = [account('me@two.example', 1, NOW + 40 * HOUR), account('me@one.example', 1, NOW + 10 * HOUR)];
const chart = lines(CAPPED);

test('chart: day axis, ticks, rows by reset time, level letters', () => {
    const indent = ' '.repeat(13);
    assert.ok(chart[0].startsWith(`${indent}Fri 23  Sat 24  Sun 25  Mon 26`));
    assert.equal(chart[1], indent + '|·······'.repeat(7));
    assert.ok(chart[2].startsWith('one.example  ▓▓▓▓▓█████░'));
    assert.ok(chart[2].endsWith('  Sat 03:11'));
    assert.ok(chart[3].startsWith('two.example  ▓▓▓▓▓'));
    assert.ok(chart[3].endsWith('  Sun 08:11'));
    assert.ok(chart[4].startsWith(`level        ${' '.repeat(5)}RRRRRA`));
    assert.ok(!chart.join('\n').includes('\x1b['));
});

test('change list, demand line and legend', () => {
    assert.equal(chart[5], '');
    assert.deepEqual(chart.slice(6, 9), [
        'until Sat 03:11  red    0 accounts',
        'from  Sat 03:11  amber  1 account (one.example)',
        'from  Sun 08:11  green  2 accounts (two.example, one.example)',
    ]);
    assert.equal(chart.at(-2), 'fleet use: about 1 account every 78 h');
    assert.equal(chart.at(-1), '▓ past  █ no Fable  ▒ 85% or more  ░ room  level: R red  A amber  G green');
});

test('one level all along reads "for N days"', () => {
    const calm = lines([account('me@one.example', 0.01, NOW + 6 * DAY + 12 * HOUR),
        account('me@two.example', 0.01, NOW + 6 * DAY + 12 * HOUR)]);
    assert.equal(calm[6], 'for   7 days     green  2 accounts (one.example, two.example)');
});

test('a 5h cap that hides Fable room shows instead of the reset', () => {
    const blocked = lines([account('me@one.example', 0.2, NOW + 5 * DAY, [1, NOW + 90 * MIN]),
        account('me@two.example', 1, NOW + 5 * DAY)]);
    assert.ok(blocked[2].endsWith('  5h back 18:41'));
});

test('the change list stops at 8 rows', () => {
    const change = i => ({at: NOW + i * HOUR, until: null, level: i % 2 ? 'amber' : 'green', accounts: []});
    const f = {now: NOW, stepMs: 3 * HOUR, columns: Array(56).fill(0), changes: Array.from({length: 11}, (_, i) => change(i))};
    const {rows, more} = changeRows(f);
    assert.equal(rows.length, 8);
    assert.equal(more, 3);
});

test('6 h steps: short day labels, 4 columns a day', () => {
    const narrow = lines(CAPPED, {stepMs: 6 * HOUR});
    assert.ok(narrow[0].startsWith(`${' '.repeat(13)}F23 S24 S25 M26 `));
    assert.equal(narrow[1], ' '.repeat(13) + '|···'.repeat(7));
});

test('color mode paints the cells and the level row with ANSI', () => {
    const colored = lines(CAPPED, {}, true);
    assert.ok(colored[2].includes('\x1b[31m█\x1b[0m'));
    assert.ok(colored[4].includes('\x1b[31m█\x1b[0m'));
    assert.ok(!colored.at(-1).includes('level:'));
});
