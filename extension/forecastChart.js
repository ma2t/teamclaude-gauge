// SPDX-License-Identifier: GPL-2.0-or-later
// Draws the forecast on a Cairo context. The window's drawing area and the
// PNG of tests/forecast-shot.js share it. The geometry is fixed, so the
// window knows its size before it draws.

import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

import {DAY} from './model.js';
import {CELL_LEVEL, changeRows, dayLabel, perDay, resetText} from './forecastText.js';

const MARGIN = 16;
const LABEL_MIN = 96;
const LABEL_MAX = 240;
const CELLS = 448;
const RESET_MIN = 88;
const AXIS = 24;
const ROW = 22;
const BAR = 12;
const GAP = 16;
// x offsets of the change list fields: prefix, time, level square, level
// word, accounts
const FIELDS = [0, 44, 144, 160, 220];
const SQUARE = 10;
const FONT = Pango.FontDescription.from_string('Sans 10');

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

// Dark uses the panel palette of stylesheet.css; light uses darker Adwaita
// shades, which keep their contrast on a near-white window.
export const THEMES = {
    dark: {bg: rgb('#222226'), fg: rgb('#ffffff'), red: rgb('#f66151'), amber: rgb('#ffa348'), green: rgb('#57e389')},
    light: {bg: rgb('#fafafb'), fg: rgb('#1e1e1e'), red: rgb('#e01b24'), amber: rgb('#e66100'), green: rgb('#26a269')},
};

// Widest pixel width of the strings, in the chart font.
function widest(strings) {
    const layout = Pango.Layout.new(PangoCairo.FontMap.get_default().create_context());
    layout.set_font_description(FONT);
    return Math.max(0, ...strings.map(value => {
        layout.set_text(value, -1);
        return layout.get_pixel_size()[0];
    }));
}

// Wide enough for the longest label, up to LABEL_MAX; a longer one loses
// its middle, so both the name and the domain stay readable. The measure
// and the drawing can round apart by a pixel: 4 px of slack.
function labelWidth(forecast) {
    return Math.min(LABEL_MAX, Math.max(LABEL_MIN, widest(forecast.accounts.map(a => a.short))) + 16);
}

// The reset column holds "7d back Wed 23:11" for a capped account, wider
// than a plain reset time: 8 px gap, the text, 4 px of slack.
function resetWidth(forecast) {
    return Math.max(RESET_MIN, widest(forecast.accounts.map(a => resetText(a, forecast.now))) + 12);
}

export function chartSize(forecast) {
    const {rows, notes} = changeRows(forecast);
    const lines = rows.length + notes.length;
    return [
        2 * MARGIN + labelWidth(forecast) + CELLS + resetWidth(forecast),
        2 * MARGIN + AXIS + (forecast.accounts.length + 1) * ROW + GAP + lines * ROW,
    ];
}

function text(cr, value, x, y, color, {alpha = 1, width = 0, ellipsize = Pango.EllipsizeMode.END} = {}) {
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(FONT);
    layout.set_text(value, -1);
    if (width > 0) {
        layout.set_width(width * Pango.SCALE);
        layout.set_ellipsize(ellipsize);
    }
    cr.setSourceRGBA(...color, alpha);
    cr.moveTo(x, y);
    PangoCairo.show_layout(cr, layout);
}

function box(cr, x, y, width, height, color, alpha = 1) {
    cr.setSourceRGBA(...color, alpha);
    cr.rectangle(x, y, width, height);
    cr.fill();
}

// Equal neighbor values as one span, so no seam shows between cells.
function runs(values) {
    const result = [];
    values.forEach((value, i) => {
        const last = result.at(-1);
        if (last?.value === value)
            last.to = i + 1;
        else
            result.push({value, from: i, to: i + 1});
    });
    return result;
}

export function drawForecast(cr, forecast, theme) {
    const label = labelWidth(forecast);
    const x0 = MARGIN + label;
    const cell = CELLS / forecast.columns.length;
    const columns = perDay(forecast);
    const top = MARGIN + AXIS;
    const levelY = top + forecast.accounts.length * ROW;
    const bottom = levelY + ROW;

    for (let k = 0; k * columns < forecast.columns.length; k++) {
        const x = x0 + k * columns * cell;
        text(cr, dayLabel(forecast.start + k * DAY), x + 4, MARGIN, theme.fg, {alpha: 0.7});
        box(cr, x, top, 1, bottom - top, theme.fg, 0.15);
    }

    forecast.accounts.forEach((account, row) => {
        const y = top + row * ROW;
        text(cr, account.short, MARGIN, y + 3, theme.fg, {width: label - 12, ellipsize: Pango.EllipsizeMode.MIDDLE});
        for (const {value, from, to} of runs(account.cells)) {
            const [x, width] = [x0 + from * cell, (to - from) * cell];
            if (value === 'past')
                box(cr, x, y + (ROW - BAR) / 2, width, BAR, theme.fg, 0.12);
            else if (value !== 'none')
                box(cr, x, y + (ROW - BAR) / 2, width, BAR, theme[CELL_LEVEL[value]]);
        }
        text(cr, resetText(account, forecast.now), x0 + CELLS + 8, y + 3, theme.fg, {alpha: 0.7});
    });

    text(cr, 'level', MARGIN, levelY + 3, theme.fg);
    for (const {value, from, to} of runs(forecast.levels)) {
        if (value !== null)
            box(cr, x0 + from * cell, levelY + 3, (to - from) * cell, ROW - 6, theme[value]);
    }

    const nowX = x0 + (forecast.now - forecast.start) / forecast.stepMs * cell;
    box(cr, nowX - 0.75, top - 4, 1.5, bottom - top + 4, theme.fg, 0.8);

    const {rows, notes} = changeRows(forecast);
    const accountsWidth = label + CELLS + resetWidth(forecast) - FIELDS[4];
    rows.forEach((row, i) => {
        const y = bottom + GAP + i * ROW;
        text(cr, row.prefix, MARGIN + FIELDS[0], y, theme.fg);
        text(cr, row.time, MARGIN + FIELDS[1], y, theme.fg);
        // Amber and green text fall under 4.5:1 on the light background: the
        // color goes to a square, the word stays in the text color.
        box(cr, MARGIN + FIELDS[2], y + 4, SQUARE, SQUARE, theme[row.level]);
        text(cr, row.level, MARGIN + FIELDS[3], y, theme.fg);
        text(cr, row.accounts, MARGIN + FIELDS[4], y, theme.fg, {width: accountsWidth});
    });
    notes.forEach((line, i) =>
        text(cr, line, MARGIN, bottom + GAP + (rows.length + i) * ROW, theme.fg, {alpha: 0.7}));
}
