// Automation script for `tests/headless.sh window DIR`: opens the forecast
// window through the gauge menu item, writes whether it opened to
// $TCG_RESULT, then screenshots the screen in the dark and the light theme.
// The window reads the real proxy, so the PNGs hold real account names:
// keep them out of the repo.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

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

export async function run() {
    Main.overview.hide();
    colorScheme('prefer-dark');
    await Scripting.sleep(2000);
    const item = Main.extensionManager.lookup(UUID).stateObj._indicator._forecast;
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
}
