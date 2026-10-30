// SPDX-License-Identifier: GPL-2.0-or-later
// The Fable forecast in a terminal. It loads no GTK module, so it runs over
// SSH with no display; only --window needs a desktop session.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

import {describe, getFleet, getJson, hasDisplay, newSession} from '../extension/api.js';
import {STEPS, buildForecast} from '../extension/forecast.js';
import {forecastLines} from '../extension/forecastText.js';

const USAGE = 'usage: tcg-forecast [--days 1-14] [--step 1h|3h|6h, 6h from 8 days] [--json] [--window]';

function parse(args) {
    const options = {days: 7, step: null, json: false, window: false};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--json')
            options.json = true;
        else if (args[i] === '--window')
            options.window = true;
        else if (args[i] === '--days' && /^\d+$/.test(args[i + 1] ?? ''))
            options.days = Number(args[++i]);
        else if (args[i] === '--step' && i + 1 < args.length)
            options.step = args[++i];
        else
            return null;
    }
    // Over a week, 3 h columns no longer fit a terminal.
    options.step ??= options.days > 7 ? '6h' : '3h';
    const valid = Number.isInteger(options.days) && options.days >= 1 && options.days <= 14 &&
        Object.hasOwn(STEPS, options.step);
    return valid ? options : null;
}

function exit(message, code) {
    printerr(message);
    System.exit(code);
}

const options = parse(System.programArgs);
if (!options)
    exit(USAGE, 2);

if (options.window) {
    if (!hasDisplay())
        exit('no display: --window needs a desktop session', 2);
    const window = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent()
        .resolve_relative_path('extension/forecastWindow.js').get_path();
    // Its own session, so closing the terminal does not close the window.
    Gio.Subprocess.new(['setsid', '-f', 'gjs', '-m', window],
        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
    System.exit(0);
}

let quota, status;
try {
    const session = newSession();
    [quota, status] = await getFleet(path => getJson(session, path));
} catch (error) {
    exit(`teamclaude unreachable: ${describe(error)}`, 1);
}
const forecast = buildForecast(quota, status, Date.now(), {days: options.days, stepMs: STEPS[options.step]});
if (forecast.error)
    exit(forecast.error, 1);
if (options.json) {
    print(JSON.stringify(forecast, null, 2));
} else {
    const color = !GLib.getenv('NO_COLOR') && GLib.getenv('TERM') !== 'dumb' &&
        GLib.log_writer_supports_color(1);
    print(forecastLines(forecast, {color}).join('\n'));
}
