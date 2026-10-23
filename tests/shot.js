// Automation script for tests/headless.sh: screenshots the panel, the open
// menu and the accounts submenu, in the dark then the light theme, into
// $TCG_SHOT_DIR. The Shell exits on its own when run() returns.

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

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(3000); // first poll of the proxy
    await shot('panel.png');

    const indicator = Main.panel.statusArea[UUID];
    const accounts = Main.extensionManager.lookup(UUID).stateObj._indicator._accounts;
    indicator.menu.open(false);
    await Scripting.sleep(1000); // the refresh on open re-renders the menu
    await shot('menu.png');

    accounts.setSubmenuShown(true);
    await Scripting.sleep(1000);
    await shot('accounts.png');

    indicator.menu.close(false);
    new Gio.Settings({schema_id: 'org.gnome.desktop.interface'})
        .set_string('color-scheme', 'prefer-light');
    await Scripting.sleep(1000);
    indicator.menu.open(false);
    await Scripting.sleep(1000);
    await shot('menu-light.png');

    accounts.setSubmenuShown(true);
    await Scripting.sleep(1000);
    await shot('accounts-light.png');
}
