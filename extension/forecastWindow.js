// SPDX-License-Identifier: GPL-2.0-or-later
// The Fable forecast window: a GTK 4 app that the gauge menu and
// `tcg-forecast --window` start as their own process. One instance only: a
// second start brings the open window to the front.

import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';

import {FORECAST_APP_ID, describe, getFleet, getJson, newSession} from './api.js';
import {buildForecast} from './forecast.js';
import {THEMES, chartSize, drawForecast} from './forecastChart.js';

const REFRESH_SECONDS = 60;

// With no display variable GTK falls back to the wayland-0 socket, which
// over SSH is the station's own screen.
if (!GLib.getenv('DISPLAY') && !GLib.getenv('WAYLAND_DISPLAY')) {
    printerr('no display: the forecast window needs a desktop session');
    System.exit(2);
}

function openWindow(app) {
    const session = newSession();
    const cancellable = new Gio.Cancellable();
    const style = Adw.StyleManager.get_default();
    let forecast = null;

    const area = new Gtk.DrawingArea();
    area.set_draw_func((_area, cr) => {
        if (forecast)
            drawForecast(cr, forecast, THEMES[style.dark ? 'dark' : 'light']);
        cr.$dispose();
    });
    style.connect('notify::dark', () => area.queue_draw());

    const error = new Adw.StatusPage({icon_name: 'network-offline-symbolic', title: 'No forecast'});
    const stack = new Gtk.Stack();
    stack.add_named(new Gtk.ScrolledWindow({
        child: area,
        propagate_natural_width: true,
        propagate_natural_height: true,
    }), 'chart');
    stack.add_named(error, 'error');

    const view = new Adw.ToolbarView({content: stack});
    view.add_top_bar(new Adw.HeaderBar());
    const window = new Adw.ApplicationWindow({application: app, title: 'Fable forecast', content: view});

    const refresh = async () => {
        try {
            const [quota, status] = await getFleet(path => getJson(session, path, cancellable));
            const next = buildForecast(quota, status, Date.now());
            if (next.error)
                throw new Error(next.error);
            forecast = next;
            const [width, height] = chartSize(forecast);
            area.set_content_width(width);
            area.set_content_height(height);
            area.queue_draw();
            stack.visible_child_name = 'chart';
            // GTK 4 does not grow a mapped window on its own.
            const [, natural] = view.get_preferred_size();
            window.set_default_size(natural.width, natural.height);
        } catch (e) {
            if (cancellable.is_cancelled())
                return;
            error.description = describe(e);
            stack.visible_child_name = 'error';
        }
    };
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
        refresh();
        return GLib.SOURCE_CONTINUE;
    });
    window.connect('close-request', () => {
        GLib.Source.remove(timer);
        cancellable.cancel();
        session.abort();
        return false;
    });
    // Shown after the first fetch: the chart size is known by then, so the
    // window opens at the size of its content.
    refresh().then(() => window.present());
}

const app = new Adw.Application({application_id: FORECAST_APP_ID});
app.connect('activate', () => {
    if (app.active_window)
        app.active_window.present();
    else
        openWindow(app);
});
app.run([System.programInvocationName, ...System.programArgs]);
