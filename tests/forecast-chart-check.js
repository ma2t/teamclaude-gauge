// Renders a fleet with a 7d and a 5h cap, then checks that the right edge of
// the PNG is background only, so no reset text is cut off. Run by
// forecastChart.test.js: `gjs -m tests/forecast-chart-check.js`.

import cairo from 'cairo';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import System from 'system';

import {buildForecast} from '../extension/forecast.js';
import {THEMES, chartSize, drawForecast} from '../extension/forecastChart.js';
import {resetText} from '../extension/forecastText.js';
import {bucket, quotaOf} from './fleet.js';

const MIN = 60 * 1000;
// Wed 14:10 local: a reset on another day shows its weekday.
const now = new Date(2026, 9, 28, 14, 10).getTime();
const account = (name, five, week, fable, fableIn, weekIn, fiveIn) => ({
    name, type: 'oauth', disabled: false, status: 'active', tier: {weight: 20},
    buckets: {
        fiveHour: bucket(five, now + fiveIn * MIN),
        weeklyShared: bucket(week, now + weekIn * MIN),
        weeklyFable: bucket(fable, now + fableIn * MIN),
    },
});
const forecast = buildForecast(quotaOf([
    account('a@one.example', 0.2, 0.99, 0.4, 5000, 3 * 24 * 60 + 540, 120),
    account('b@two.example', 0.99, 0.5, 0.3, 4000, 4000, 600),
    account('c@three.example', 0.1, 0.4, 0.97, 300, 300, 120),
]), {switchThreshold: 0.99}, now);

const texts = forecast.accounts.map(a => resetText(a, now));
if (!texts.some(t => t.startsWith('7d back')) || !texts.some(t => t.startsWith('5h back'))) {
    printerr(`fixture lost its caps: ${texts}`);
    System.exit(3);
}

const [width, height] = chartSize(forecast);
const dir = GLib.dir_make_tmp('tcg-chart-XXXXXX');
let failed = false;
for (const name of ['dark', 'light']) {
    const theme = THEMES[name];
    const surface = new cairo.ImageSurface(cairo.Format.ARGB32, width, height);
    const cr = new cairo.Context(surface);
    cr.setSourceRGB(...theme.bg);
    cr.paint();
    drawForecast(cr, forecast, theme);
    const file = GLib.build_filenamev([dir, `${name}.png`]);
    surface.writeToPNG(file);
    cr.$dispose();
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file(file);
    const [stride, channels, pixels] = [pixbuf.get_rowstride(), pixbuf.get_n_channels(), pixbuf.get_pixels()];
    const bg = theme.bg.map(c => Math.round(c * 255));
    // Text may use the 4 px of slack and the 16 px margin, but not the last 8 px.
    for (let x = width - 8; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const at = y * stride + x * channels;
            if (bg.some((c, i) => Math.abs(pixels[at + i] - c) > 2)) {
                printerr(`${name}: ink at x=${x} y=${y}, text reaches the right edge`);
                failed = true;
                break;
            }
        }
        if (failed)
            break;
    }
    GLib.unlink(file);
}
GLib.rmdir(dir);
System.exit(failed ? 1 : 0);
