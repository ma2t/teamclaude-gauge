// Automation script for `tests/headless.sh window DIR`: opens the forecast
// window through the gauge menu item, writes whether it opened to
// $TCG_RESULT, then screenshots the screen in the dark and the light theme.
// The panel and the window both read the fictional fleet of tests/demo.js,
// so the PNGs hold no real account name.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import {demoFleet} from './demo.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot');

const UUID = 'teamclaude-gauge@ma2t.github.io';

export const METRICS = {};

async function shot(name) {
    const path = GLib.build_filenamev([GLib.getenv('TCG_SHOT_DIR'), name]);
    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot(false, stream);
    stream.close(null);
}

function colorScheme(value) {
    new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_string('color-scheme', value);
}

// The window is its own process: it gets the fleet over HTTP, from this
// server, through the TCG_BASE_URL it inherits when the menu item starts it.
function serveDemoFleet() {
    const server = new Soup.Server();
    server.add_handler('/teamclaude', (_server, message, path) => {
        const fleet = demoFleet(Date.now());
        const body = {'/teamclaude/quota': fleet.quota, '/teamclaude/status': fleet.status}[path];
        if (!body) {
            message.set_status(404, null);
            return;
        }
        message.set_status(200, null);
        message.set_response('application/json', Soup.MemoryUse.COPY, new TextEncoder().encode(JSON.stringify(body)));
    });
    server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
    GLib.setenv('TCG_BASE_URL', `http://127.0.0.1:${server.get_uris()[0].get_port()}/teamclaude`, true);
    return server;
}

export async function run() {
    Main.overview.hide();
    colorScheme('prefer-dark');
    await Scripting.sleep(2000); // let the startup poll of the real proxy finish
    const server = serveDemoFleet();
    const gauge = Main.extensionManager.lookup(UUID).stateObj._indicator;
    gauge._getJson = async path => {
        const fleet = demoFleet(Date.now());
        return path === 'quota' ? fleet.quota : fleet.status;
    };
    await gauge._refresh();
    const item = gauge._forecast;
    let open = false;
    if (item.visible) {
        item.activate(Clutter.get_current_event());
        await Scripting.sleep(6000); // gjs start, GTK init, first fetch
        open = global.get_window_actors().some(actor => actor.meta_window.get_title() === 'Fable forecast');
    }
    GLib.file_set_contents(GLib.getenv('TCG_RESULT'), `window: ${open ? 'present' : 'absent'}\n`);
    await shot('window.png');

    colorScheme('prefer-light');
    await Scripting.sleep(1500);
    await shot('window-light.png');
    server.disconnect();
}
