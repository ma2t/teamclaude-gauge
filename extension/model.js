// SPDX-License-Identifier: GPL-2.0-or-later
// Turns teamclaude's /quota and /status payloads into what the panel and the
// menu display. No gi imports, so node --test runs it on plain fixtures.

const WARN = 0.7;
const CRIT = 0.9;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
