// SPDX-License-Identifier: GPL-2.0-or-later
// The forecast as text: the terminal chart of tcg-forecast, plus the change
// list and demand line that the window draws too. No gi imports.

import {DAY, WEEKDAYS, clockTime, hhmm, pad} from './model.js';

const CHANGE_ROWS = 8;
const GLYPHS = {past: '▓', out: '█', weak: '▒', strong: '░', none: ' '};
const LETTERS = {red: 'R', amber: 'A', green: 'G'};
const ANSI = {red: '\x1b[31m', amber: '\x1b[33m', green: '\x1b[32m'};
const ANSI_RESET = '\x1b[0m';
export const CELL_LEVEL = {out: 'red', weak: 'amber', strong: 'green'};

export const perDay = forecast => Math.round(DAY / forecast.stepMs);
const daysOf = forecast => forecast.columns.length / perDay(forecast);

// Read at noon, so a daylight saving change cannot shift the date. The short
// form fits the 4 columns a day of 6 h steps: "T29 ".
export function dayLabel(dayStartMs, {short = false} = {}) {
    const date = new Date(dayStartMs + DAY / 2);
    const day = WEEKDAYS[date.getDay()];
    return short ? `${day[0]}${pad(date.getDate())}` : `${day} ${pad(date.getDate())}`;
}

// Within a 14-day horizon a weekday repeats, and next Friday would read
// like this Friday: 6 days or more away, the day of month joins it.
export function timeText(ms, nowMs) {
    if (ms - nowMs < 6 * DAY)
        return clockTime(ms, nowMs);
    const date = new Date(ms);
    return `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())} ${hhmm(date)}`;
}

// A disabled or failing account is out for as long as it stays so, in the
// gauge tiles' words. A 7d or 5h cap comes next: it is why the row is out.
export function resetText(account, nowMs) {
    if (account.state)
        return account.state;
    if (!account.known)
        return 'no data';
    const {blocked} = account;
    if (blocked)
        return blocked.until == null ? `${blocked.window} capped` : `${blocked.window} back ${timeText(blocked.until, nowMs)}`;
    return account.resetAt == null ? '-' : timeText(account.resetAt, nowMs);
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function demandLine(forecast) {
    return forecast.hoursPerAccount == null
        ? 'no Fable use in the current windows'
        : `fleet use: about 1 account every ${Math.round(forecast.hoursPerAccount)} h`;
}

// The first rows only, so a fleet whose level flips at every reset still
// fits a screen; --json keeps every change. The notes go under the rows.
export function changeRows(forecast) {
    const rows = forecast.changes.slice(0, CHANGE_ROWS).map((change, i) => {
        const count = change.accounts.length;
        const [prefix, at] = i > 0 ? ['from', change.at] : change.until == null ? ['for', null] : ['until', change.until];
        return {
            prefix,
            time: at == null ? plural(daysOf(forecast), 'day') : timeText(at, forecast.now),
            level: change.level,
            accounts: count > 0 && count <= 3 ? `${plural(count, 'account')} (${change.accounts.join(', ')})` : plural(count, 'account'),
        };
    });
    const more = Math.max(0, forecast.changes.length - CHANGE_ROWS);
    const notes = [...(more > 0 ? [plural(more, 'more change')] : []), demandLine(forecast)];
    return {rows, more, notes};
}

export function forecastLines(forecast, {color = false} = {}) {
    const width = Math.max('level'.length, ...forecast.accounts.map(a => a.short.length)) + 2;
    const columns = perDay(forecast);
    const days = daysOf(forecast);
    const indent = ' '.repeat(width);
    const axis = Array.from({length: days}, (_, k) =>
        dayLabel(forecast.start + k * DAY, {short: columns < 7}).padEnd(columns)).join('');
    const ticks = `|${'·'.repeat(columns - 1)}`.repeat(days);
    const paint = (level, text) => color ? `${ANSI[level]}${text}${ANSI_RESET}` : text;
    const cell = value => CELL_LEVEL[value] ? paint(CELL_LEVEL[value], GLYPHS[value]) : GLYPHS[value];
    const rows = forecast.accounts.map(account =>
        `${account.short.padEnd(width)}${account.cells.map(cell).join('')}  ${resetText(account, forecast.now)}`);
    const mark = level => {
        if (level === null)
            return ' ';
        return color ? paint(level, '█') : LETTERS[level];
    };
    const {rows: changes, notes} = changeRows(forecast);
    const legend = `${GLYPHS.past} past  ${GLYPHS.out} no Fable  ${GLYPHS.weak} 85% or more  ${GLYPHS.strong} room`;
    return [
        indent + axis,
        indent + ticks,
        ...rows,
        `${'level'.padEnd(width)}${forecast.levels.map(mark).join('')}`,
        '',
        ...changes.map(row => `${row.prefix.padEnd(5)} ${row.time.padEnd(12)}  ${row.level.padEnd(5)}  ${row.accounts}`),
        ...notes,
        color ? legend : `${legend}  level: R red  A amber  G green`,
    ];
}
