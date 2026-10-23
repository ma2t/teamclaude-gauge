// The fleet behind the README images: nine fictional Max 20x accounts on
// reserved .example domains. Times are relative to nowMs.

import {bucket, quotaOf} from './fleet.js';

const MINUTE = 60 * 1000;

// name, 5h, 7d, Fable, minutes until the weekly windows reset
const ACCOUNTS = [
    ['me@studio.example', 0.38, 0.71, 0.99, 134],
    ['me@lab.example', 0.05, 0.34, 0.45, 4560],
    ['me@ops.example', 0.12, 0.58, 0.82, 1980],
    ['me@home.example', 0, 0.83, 1, 340],
    ['me@client-a.example', 0, 0.62, 0.99, 1800],
    ['me@client-b.example', 0.21, 0.47, 0.99, 545],
    ['me@client-c.example', 0, 0.66, 1, 3000],
    ['me@side.example', 0, 0.52, 0.99, 870],
    ['me@archive.example', 0, 0.29, 0.99, 5820],
];

export function demoFleet(nowMs) {
    const accounts = ACCOUNTS.map(([name, five, week, fable, weeklyIn], i) => {
        const weeklyReset = nowMs + weeklyIn * MINUTE;
        return {
            name,
            type: 'oauth',
            disabled: false,
            status: 'active',
            tier: {weight: 20},
            buckets: {
                fiveHour: bucket(five, nowMs + (40 + 25 * i) * MINUTE),
                weeklyShared: bucket(week, weeklyReset),
                weeklyFable: bucket(fable, weeklyReset),
            },
        };
    });
    return {
        quota: quotaOf(accounts),
        status: {
            currentAccount: ACCOUNTS[0][0],
            switchThreshold: 0.99,
            switchThresholds: null,
            probe: {lastRunFinishedAt: new Date(nowMs - 50 * 1000).toISOString()},
        },
    };
}
