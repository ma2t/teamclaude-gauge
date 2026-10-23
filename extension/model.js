// SPDX-License-Identifier: GPL-2.0-or-later
// Turns teamclaude's /quota and /status payloads into what the panel and the
// menu display. No gi imports, so node --test runs it on plain fixtures.

const WARN = 0.7;
const CRIT = 0.9;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BUCKETS = [
    {key: 'fiveHour', label: '5h', source: 'unified5h'},
    {key: 'weeklyShared', label: '7d', source: 'unified7d'},
    {key: 'weeklyFable', label: 'Fable', source: 'unified7dFable'},
];
// A capped 7d or 5h window blocks every model; a capped Fable blocks only Fable.
const CAP_ORDER = ['weeklyShared', 'fiveHour', 'weeklyFable'];
const DEFAULT_THRESHOLD = 0.99;

const pad = n => String(n).padStart(2, '0');
const clamp = x => Math.max(0, Math.min(1, x));

export function level(fraction) {
    if (fraction >= CRIT)
        return 'crit';
    return fraction >= WARN ? 'warn' : 'ok';
}

// Rounded down so 99.3% never reads as 100% while capacity remains; the
// epsilon absorbs float noise such as 0.57 * 100 = 56.99999999999999.
export function percent(fraction) {
    return `${Math.floor(clamp(fraction) * 100 + 1e-6)}%`;
}

export function clockTime(ms, nowMs) {
    const date = new Date(ms);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return date.toDateString() === new Date(nowMs).toDateString()
        ? time : `${WEEKDAYS[date.getDay()]} ${time}`;
}

export function backIn(ms, nowMs) {
    if (ms - nowMs >= DAY)
        return `back ${clockTime(ms, nowMs)}`;
    const minutes = Math.max(0, Math.ceil((ms - nowMs) / MINUTE));
    if (minutes < 60)
        return `back in ${minutes}m`;
    return `back in ${Math.floor(minutes / 60)}h${pad(minutes % 60)}`;
}

export function ago(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60)
        return `${seconds} s ago`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} min ago`;
    return `${Math.floor(seconds / 3600)} h ago`;
}

export function offView(error) {
    return {
        state: 'off',
        error,
        panel: {text: 'TC off', level: 'off', fraction: 0},
        header: null,
        buckets: [],
        comesBack: null,
        accounts: [],
        footer: null,
    };
}

function threshold(status, source) {
    const table = status?.switchThresholds;
    return table?.[source] ?? table?.default ?? status?.switchThreshold ?? DEFAULT_THRESHOLD;
}

const active = account => !account.disabled && account.status === 'active';

// A window whose reset already passed has rolled over, whatever it last read.
const usable = (bucket, limit, nowMs) =>
    (bucket.resetAt != null && bucket.resetAt <= nowMs) || bucket.utilization < limit;

function bucketView(def, aggregate, accounts, status, nowMs) {
    const limit = threshold(status, def.source);
    const live = accounts.filter(a => active(a) && a.buckets?.[def.key]).map(a => a.buckets[def.key]);
    const capped = live.length > 0 && !live.some(b => usable(b, limit, nowMs));
    const resets = live.map(b => b.resetAt).filter(t => t != null && t > nowMs);
    const nextReset = resets.length > 0 ? Math.min(...resets) : null;
    const fraction = clamp(aggregate.utilization);
    let note = '';
    if (capped)
        note = nextReset ? backIn(nextReset, nowMs) : 'capped';
    else if (nextReset)
        note = `resets ${clockTime(nextReset, nowMs)}`;
    return {
        key: def.key,
        label: def.label,
        percent: percent(fraction),
        level: capped ? 'crit' : level(fraction),
        fraction: capped ? 1 : fraction,
        capped,
        note,
    };
}

function comesBack(focus, aggregate, accounts, nowMs) {
    if (!focus.capped && focus.fraction < CRIT)
        return null;
    const capacity = aggregate[focus.key].capacityWeight;
    const rows = accounts
        .filter(a => active(a) && a.tier?.weight && a.buckets?.[focus.key]?.resetAt > nowMs)
        .map(a => ({
            resetAt: a.buckets[focus.key].resetAt,
            name: a.name,
            gain: Math.round(clamp(a.buckets[focus.key].utilization) * a.tier.weight / capacity * 100),
        }))
        .filter(row => row.gain >= 1)
        .sort((x, y) => x.resetAt - y.resetAt)
        .slice(0, 3)
        .map(row => ({when: clockTime(row.resetAt, nowMs), name: row.name, gain: `+${row.gain}%`}));
    if (rows.length === 0)
        return null;
    return {label: focus.capped ? `${focus.label} comes back` : `Next ${focus.label} resets`, rows};
}

function accountRows(accounts, current) {
    const share = (account, key) => {
        const bucket = account.buckets?.[key];
        return bucket ? percent(bucket.utilization) : '-';
    };
    const fableUse = account => account.buckets?.weeklyFable?.utilization ?? 2; // unknown sorts last
    return [...accounts]
        .sort((x, y) => (y.name === current) - (x.name === current) || fableUse(x) - fableUse(y))
        .map(account => ({
            name: account.name,
            current: account.name === current,
            dim: !active(account),
            fiveHour: share(account, 'fiveHour'),
            weekly: share(account, 'weeklyShared'),
            fable: share(account, 'weeklyFable'),
        }));
}

export function buildView(quota, status, nowMs) {
    const aggregate = quota?.aggregate;
    const accounts = quota?.accounts;
    if (!aggregate || !Array.isArray(accounts))
        return offView('unexpected response');
    if (!accounts.some(active))
        return offView('no active account');
    const buckets = BUCKETS.filter(def => aggregate[def.key])
        .map(def => bucketView(def, aggregate[def.key], accounts, status, nowMs));
    if (buckets.length === 0)
        return offView('no quota data');

    const ranked = [...buckets].sort((a, b) => b.fraction - a.fraction);
    const cappedFocus = CAP_ORDER.map(key => buckets.find(b => b.key === key)).find(b => b?.capped);
    const focus = cappedFocus ?? ranked[0];
    const text = cappedFocus
        ? `${focus.label} ${focus.percent} · ${focus.note}`
        : ranked.slice(0, focus.fraction >= WARN ? 2 : 1).map(b => `${b.label} ${b.percent}`).join(' · ');

    const current = status?.currentAccount ?? null;
    const probedAt = Date.parse(status?.probe?.lastRunFinishedAt ?? '');
    return {
        state: 'ok',
        error: null,
        panel: {text, level: focus.level, fraction: focus.fraction},
        header: {accounts: aggregate.weeklyShared?.knownAccounts ?? accounts.length, current},
        buckets,
        comesBack: comesBack(focus, aggregate, accounts, nowMs),
        accounts: accountRows(accounts, current),
        footer: Number.isFinite(probedAt) ? `Probed ${ago(nowMs - probedAt)}` : null,
    };
}
