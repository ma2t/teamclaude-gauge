// Automation script for `tests/headless.sh demo DIR`: feeds the fictional
// fleet of tests/demo.js to the indicator, then saves the README images into
// $TCG_SHOT_DIR: the panel with the open menu, and the accounts grid.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import {demoFleet} from './demo.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');

const UUID = 'teamclaude-gauge@ma2t.github.io';

export const METRICS = {};

// Screenshots the box around the given actors, plus a margin in stage pixels.
async function shot(name, actors, margin) {
    const boxes = actors.map(actor => {
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        return {x1: x, y1: y, x2: x + width, y2: y + height};
    });
    const x1 = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.x1))) - margin);
    const y1 = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.y1))) - margin);
    const x2 = Math.min(global.stage.width, Math.ceil(Math.max(...boxes.map(b => b.x2))) + margin);
    const y2 = Math.min(global.stage.height, Math.ceil(Math.max(...boxes.map(b => b.y2))) + margin);
    const path = GLib.build_filenamev([GLib.getenv('TCG_SHOT_DIR'), name]);
    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot_area(x1, y1, x2 - x1, y2 - y1, stream);
    stream.close(null);
}

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(2000); // let the startup poll of the real proxy finish

    const gauge = Main.extensionManager.lookup(UUID).stateObj._indicator;
    gauge._getJson = async path => {
        const fleet = demoFleet(Date.now());
        return path === 'quota' ? fleet.quota : fleet.status;
    };
    await gauge._refresh();

    gauge.menu.open(false);
    await Scripting.sleep(1000);
    await shot('menu.png', [gauge.button, gauge.menu.actor], 24);

    gauge._accounts.setSubmenuShown(true);
    await Scripting.sleep(1000);
    // Tight: the menu border sits 4 px left of the grid, a separator 8 px above.
    await shot('accounts.png', [gauge._accounts, gauge._accounts.menu.actor], 2);
}
