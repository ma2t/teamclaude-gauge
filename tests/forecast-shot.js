// Draws the forecast of the fictional fleet (tests/demo.js) to PNG at 2x,
// with no display: `gjs -m tests/forecast-shot.js DIR [dark] [light]`.
// Writes forecast.png (dark) and forecast-light.png; both by default.

import cairo from 'cairo';
import GLib from 'gi://GLib';
import System from 'system';

import {buildForecast} from '../extension/forecast.js';
import {THEMES, chartSize, drawForecast} from '../extension/forecastChart.js';
import {demoFleet} from './demo.js';

const SCALE = 2;
const FILES = {dark: 'forecast.png', light: 'forecast-light.png'};

const [dir, ...asked] = System.programArgs;
const themes = asked.length > 0 ? asked : Object.keys(FILES);
if (!dir || !GLib.file_test(dir, GLib.FileTest.IS_DIR) || !themes.every(theme => theme in FILES)) {
    printerr('usage: gjs -m tests/forecast-shot.js DIR [dark] [light]');
    System.exit(2);
}

// Today 14:10, whatever the hour of the build: the README image always shows
// past cells, and a rebuild changes only the dates.
const now = new Date().setHours(14, 10, 0, 0);
const {quota, status} = demoFleet(now);
const forecast = buildForecast(quota, status, now);
const [width, height] = chartSize(forecast);
for (const theme of themes) {
    const surface = new cairo.ImageSurface(cairo.Format.ARGB32, width * SCALE, height * SCALE);
    const cr = new cairo.Context(surface);
    cr.scale(SCALE, SCALE);
    cr.setSourceRGB(...THEMES[theme].bg);
    cr.paint();
    drawForecast(cr, forecast, THEMES[theme]);
    surface.writeToPNG(GLib.build_filenamev([dir, FILES[theme]]));
    cr.$dispose();
}
