// SPDX-License-Identifier: GPL-2.0-or-later
// Read-only client for the local teamclaude API, shared by the panel, the
// forecast window and tcg-forecast. It runs in the Shell and in plain gjs.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

export const BASE_URL = 'http://127.0.0.1:3456/teamclaude';
// The forecast window's app id: the menu item finds an open window by it.
export const FORECAST_APP_ID = 'io.github.ma2t.TeamclaudeGauge.Forecast';
const TIMEOUT_SECONDS = 3;

// tcg-forecast --window and the window itself refuse to start without one.
export const hasDisplay = () => Boolean(GLib.getenv('DISPLAY') || GLib.getenv('WAYLAND_DISPLAY'));

export function newSession() {
    return new Soup.Session({timeout: TIMEOUT_SECONDS});
}

export function describe(error) {
    if (error instanceof SyntaxError)
        return 'unexpected response';
    if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CONNECTION_REFUSED))
        return 'proxy not running on :3456';
    if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT))
        return 'proxy not answering';
    return error.message;
}

export async function getJson(session, path, cancellable = null) {
    const message = Soup.Message.new('GET', `${BASE_URL}/${path}`);
    const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
    if (message.get_status() !== Soup.Status.OK)
        throw new Error(`HTTP ${message.get_status()}`);
    return JSON.parse(new TextDecoder().decode(bytes.get_data()));
}

// /status only adds the current account, thresholds and probe age; every
// view still works from /quota alone. `get` fetches one path.
export function getFleet(get) {
    return Promise.all([get('quota'), get('status').catch(() => null)]);
}
