// Automation script for `tests/headless.sh live-load`. The Shell starts
// without the extension; this runs the command tools/live-load.sh prints,
// evaluated the way Looking Glass evaluates input, twice: a first load, then
// a reload from a fresh snapshot. Results go to $TCG_RESULT.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'teamclaude-gauge@ma2t.github.io';
const AsyncFunction = async function () {}.constructor;

export const METRICS = {};

// Mirrors LookingGlass._evaluate: the last ';' segment is returned.
function lookingGlass(command) {
    const lines = command.trim().split(';');
    lines.push(`return ${lines.pop()}`);
    return AsyncFunction('Main', 'Gio', 'GLib', lines.join(';'))(Main, Gio, GLib);
}

function liveLoadCommand() {
    const tool = GLib.build_filenamev([GLib.getenv('TCG_REPO'), 'tools', 'live-load.sh']);
    const [, stdout] = GLib.spawn_sync(null, [tool, '--print'], null, GLib.SpawnFlags.DEFAULT, null);
    return new TextDecoder().decode(stdout);
}

export async function run() {
    const results = [`before: ${Main.extensionManager.lookup(UUID) ? 'present' : 'absent'}`];
    results.push(`first: ${await lookingGlass(liveLoadCommand())}`);
    const first = Main.panel.statusArea[UUID];
    await Scripting.sleep(1000);
    results.push(`reload: ${await lookingGlass(liveLoadCommand())}`);
    const second = Main.panel.statusArea[UUID];
    results.push(`fresh: ${Boolean(first && second && first !== second)}`);
    GLib.file_set_contents(GLib.getenv('TCG_RESULT'), `${results.join('\n')}\n`);
}
