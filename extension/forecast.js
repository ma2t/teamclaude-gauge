// SPDX-License-Identifier: GPL-2.0-or-later
// When Fable comes back: replays the next days of the fleet from the /quota
// and /status payloads, account by account. No gi imports, so node --test,
// tcg-forecast and the forecast window all run it.

import {active, shortName, threshold} from './model.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const TICK = 15 * MINUTE;
const MIN_SPAN = 3 * HOUR;
// The governor's margin: only an account under it counts toward green.
const STRONG = 0.85;

export const STEPS = {'1h': HOUR, '3h': 3 * HOUR, '6h': 6 * HOUR};

const CELL_RANK = {none: 0, strong: 1, weak: 2, out: 3};
const LEVEL_RANK = {green: 0, amber: 1, red: 2};

// A 7d or 5h window at its threshold blocks every model until it resets;
// the later of the two wins. The forecast does not project those windows
// past that reset.
function blocking(account, status, nowMs) {
    let block = {window: null, until: nowMs};
    for (const [key, window, source] of [['weeklyShared', '7d', 'unified7d'], ['fiveHour', '5h', 'unified5h']]) {
        const bucket = account.buckets?.[key];
        if (!bucket || bucket.utilization < threshold(status, source))
            continue;
        const until = bucket.resetAt ?? Infinity;
        if (until > block.until)
            block = {window, until};
    }
    return block;
}

function nextReset(resetAt, nowMs) {
    let next = resetAt;
    while (next != null && next <= nowMs)
        next += WEEK;
    return next;
}

// An account with no known tier weighs as much as the average one.
function meanWeight(accounts) {
    const known = accounts.map(a => a.tier?.weight).filter(w => w > 0);
    return known.length > 0 ? known.reduce((sum, w) => sum + w, 0) / known.length : 1;
}

function simAccounts(quota, status, limit, nowMs) {
    const fallback = meanWeight(quota.accounts);
    return quota.accounts.map(account => {
        const fable = account.buckets?.weeklyFable;
        // A window whose reset already passed has rolled over.
        const current = fable && (fable.resetAt == null || fable.resetAt > nowMs);
        const block = blocking(account, status, nowMs);
        return {
            short: shortName(account.name, quota.accounts),
            live: active(account),
            known: Boolean(fable),
            weight: account.tier?.weight > 0 ? account.tier.weight : fallback,
            use: current ? Math.max(0, fable.utilization ?? 0) : 0,
            resetAt: fable ? nextReset(fable.resetAt, nowMs) : null,
            blockedBy: block.window,
            blockedUntil: block.until,
            limit,
        };
    });
}

// Fleet demand in tier weight per hour. All the use in the windows opened
// since a time T came in after T, so their use over (now - T) is a lower
// bound of the demand; the largest bound over the window starts wins. Demand
// the fleet could not serve while capped is not seen. The live ratePerHour
// is no help: it is 0 while capped and swings 10x between probes.
function demandPerHour(sims, nowMs) {
    const counted = sims.filter(s => s.live && s.known && s.resetAt != null)
        .sort((x, y) => y.resetAt - x.resetAt);
    let used = 0;
    let demand = 0;
    for (const s of counted) {
        used += Math.min(s.use, 1) * s.weight;
        const span = Math.max(MIN_SPAN, nowMs - (s.resetAt - WEEK));
        demand = Math.max(demand, used / (span / HOUR));
    }
    return demand;
}

const available = (s, t) => s.live && s.known && s.use < s.limit && t >= s.blockedUntil;

function cellOf(s, t) {
    if (!s.known)
        return 'none';
    if (!available(s, t))
        return 'out';
    return s.use < STRONG ? 'strong' : 'weak';
}

function levelOf(open) {
    if (open.length === 0)
        return 'red';
    return open.filter(s => s.use < STRONG).length >= 2 ? 'green' : 'amber';
}

// teamclaude keeps an account until its switch threshold, then moves on, so
// the most used open account takes the load first.
function fill(sims, t, load) {
    const open = sims.filter(s => available(s, t)).sort((x, y) => y.use - x.use);
    for (const s of open) {
        if (load <= 0)
            break;
        const room = (s.limit - s.use) * s.weight;
        if (load >= room) {
            s.use = s.limit;
            load -= room;
        } else {
            s.use += load / s.weight;
            load = 0;
        }
    }
}

// Steps of 15 min at most, cut at every reset and unblock time, so a change
// a reset causes has its exact time.
function simulate(sims, nowMs, endMs, demand) {
    const samples = [];
    const record = t => {
        const open = sims.filter(s => available(s, t));
        samples.push({t, cells: sims.map(s => cellOf(s, t)), level: levelOf(open), open: open.map(s => s.short)});
    };
    let t = nowMs;
    record(t);
    while (t < endMs) {
        const events = sims.flatMap(s => [s.resetAt, s.blockedUntil]).filter(e => e != null && e > t);
        const next = Math.min(t + TICK, endMs, ...events);
        fill(sims, t, demand * (next - t) / HOUR);
        t = next;
        for (const s of sims) {
            if (s.resetAt != null && s.resetAt <= t) {
                s.use = 0;
                s.resetAt += WEEK;
            }
        }
        record(t);
    }
    return samples;
}

// A column shows the worst value it holds: the one carried in at its start,
// then every change inside it.
function worst(samples, from, to, read, rank) {
    let result = null;
    for (let i = 0; i < samples.length; i++) {
        const {t} = samples[i];
        const carried = t < from && (i + 1 === samples.length || samples[i + 1].t > from);
        if (!carried && (t < from || t >= to))
            continue;
        const value = read(samples[i]);
        if (result === null || rank[value] > rank[result])
            result = value;
    }
    return result;
}

function changes(samples) {
    const runs = [];
    for (const sample of samples) {
        const last = runs.at(-1);
        if (last?.level === sample.level)
            continue;
        if (last)
            last.until = sample.t;
        runs.push({at: last ? sample.t : null, until: null, level: sample.level, accounts: sample.open});
    }
    return runs;
}

export function buildForecast(quota, status, nowMs, {days = 7, stepMs = STEPS['3h']} = {}) {
    if (!Array.isArray(quota?.accounts))
        return {error: 'unexpected response'};
    if (!quota.accounts.some(active))
        return {error: 'no active account'};

    const limit = threshold(status, 'unified7dFable');
    const sims = simAccounts(quota, status, limit, nowMs);
    const first = sims.map(s => ({use: s.use, resetAt: s.resetAt}));
    const demand = demandPerHour(sims, nowMs);
    const counted = sims.filter(s => s.live && s.known);
    const weight = counted.reduce((sum, s) => sum + s.weight, 0) / Math.max(1, counted.length);

    const midnight = new Date(nowMs);
    midnight.setHours(0, 0, 0, 0);
    const start = midnight.getTime();
    const end = start + days * DAY;
    const samples = simulate(sims, nowMs, end, demand);
    const columns = Array.from({length: Math.round(days * DAY / stepMs)}, (_, i) => start + i * stepMs);
    // The column that holds now shows the forecast, not the past.
    const over = (read, rank) => columns.map(c => c + stepMs > nowMs ? worst(samples, c, c + stepMs, read, rank) : null);

    const accounts = quota.accounts.map((account, i) => {
        const s = sims[i];
        // Only a cap that hides Fable room is worth naming.
        const hidden = s.live && s.known && first[i].use < limit && s.blockedUntil > nowMs;
        return {
            name: account.name,
            short: s.short,
            known: s.known,
            use: first[i].use,
            resetAt: first[i].resetAt,
            blocked: hidden ? {window: s.blockedBy, until: Number.isFinite(s.blockedUntil) ? s.blockedUntil : null} : null,
            cells: over(sample => sample.cells[i], CELL_RANK).map(cell => cell ?? 'past'),
        };
    });
    const unknown = Number.MAX_SAFE_INTEGER;
    accounts.sort((x, y) => (x.resetAt ?? unknown) - (y.resetAt ?? unknown));

    return {
        now: nowMs,
        start,
        end,
        stepMs,
        threshold: limit,
        strong: STRONG,
        demandPerHour: demand,
        hoursPerAccount: demand > 0 ? weight * limit / demand : null,
        columns,
        accounts,
        levels: over(sample => sample.level, LEVEL_RANK),
        changes: changes(samples),
    };
}
