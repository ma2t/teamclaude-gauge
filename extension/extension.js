// SPDX-License-Identifier: GPL-2.0-or-later
// TeamClaude Gauge: where the local teamclaude fleet stands on its 5h, weekly
// and Fable windows, as a ring and a smart label in the top panel.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {buildView, offView} from './model.js';
import {GaugeRing} from './ring.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const BASE_URL = 'http://127.0.0.1:3456/teamclaude';
const POLL_SECONDS = 30;
const TIMEOUT_SECONDS = 3;
const BAR_WIDTH = 96; // matches .tcg-track width
const MINI_WIDTH = 64; // matches .tcg-track.tcg-mini width
const TILES_PER_ROW = 3;
const DIM = 160;

function describe(error) {
    if (error instanceof SyntaxError)
        return 'unexpected response';
    if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CONNECTION_REFUSED))
        return 'proxy not running on :3456';
    if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT))
        return 'proxy not answering';
    return error.message;
}

function bar(fraction, level, width, styleClass = '') {
    const track = new St.Widget({style_class: `tcg-track ${styleClass}`, y_align: Clutter.ActorAlign.CENTER});
    const fill = new St.Widget({style_class: `tcg-fill tcg-${level}`});
    fill.set_style(`width: ${Math.round(fraction * width)}px;`);
    track.add_child(fill);
    return track;
}

function infoItem(child) {
    const item = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
        style_class: 'tcg-info',
    });
    item.add_child(child);
    return item;
}

const GaugeIndicator = GObject.registerClass(
class GaugeIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'TeamClaude Gauge');

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._ring = new GaugeRing();
        this._label = new St.Label({
            text: '...',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'tcg-panel-label',
        });
        box.add_child(this._ring);
        box.add_child(this._label);
        this.add_child(box);
        this._buildMenu();

        this._session = new Soup.Session({timeout: TIMEOUT_SECONDS});
        this._cancellable = new Gio.Cancellable();
        this._busy = false;
        this._lastError = null;
        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _buildMenu() {
        this._header = new St.Label({style_class: 'tcg-header'});
        this.menu.addMenuItem(infoItem(this._header));
        this._body = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._body);
        this._accounts = new PopupMenu.PopupSubMenuMenuItem('Accounts');
        this.menu.addMenuItem(this._accounts);
        this._dashboard = new PopupMenu.PopupMenuItem('Open dashboard');
        this._dashboard.connect('activate', () =>
            Gio.AppInfo.launch_default_for_uri(`${BASE_URL}/dashboard`, null));
        this.menu.addMenuItem(this._dashboard);
        this._footer = new St.Label({opacity: DIM});
        this._footerItem = infoItem(this._footer);
        this.menu.addMenuItem(this._footerItem);

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._refresh();
        });
    }

    async _getJson(path) {
        const message = Soup.Message.new('GET', `${BASE_URL}/${path}`);
        const bytes = await this._session.send_and_read_async(
            message, GLib.PRIORITY_DEFAULT, this._cancellable);
        if (message.get_status() !== Soup.Status.OK)
            throw new Error(`HTTP ${message.get_status()}`);
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    async _refresh() {
        if (this._busy)
            return;
        this._busy = true;
        let view;
        try {
            // /status only adds the current account, thresholds and probe age;
            // the gauge still works from /quota alone.
            const [quota, status] = await Promise.all([
                this._getJson('quota'),
                this._getJson('status').catch(() => null),
            ]);
            view = buildView(quota, status, Date.now());
        } catch (error) {
            view = offView(describe(error));
        } finally {
            this._busy = false;
        }
        if (!this._cancellable.is_cancelled())
            this._render(view);
    }

    _render(view) {
        if (view.error && view.error !== this._lastError)
            console.warn(`TeamClaude Gauge: ${view.error}`);
        this._lastError = view.error;

        this._ring.update(view.panel.fraction, view.panel.level);
        this._label.text = view.panel.text;
        this._header.text = view.header
            ? ['Fleet', `${view.header.accounts} accounts`, view.header.current && `via ${view.header.current}`]
                .filter(Boolean).join(' · ')
            : 'teamclaude unreachable';

        this._body.removeAll();
        if (view.error)
            this._body.addMenuItem(infoItem(new St.Label({text: view.error})));
        for (const bucket of view.buckets)
            this._body.addMenuItem(this._bucketRow(bucket));
        if (view.comesBack) {
            this._body.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(view.comesBack.label));
            for (const row of view.comesBack.rows)
                this._body.addMenuItem(this._comesBackRow(row));
        }
        this._body.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._accounts.visible = view.accounts.length > 0;
        this._accounts.label.text = `Accounts (${view.accounts.length})`;
        this._accounts.menu.removeAll();
        if (view.accounts.length > 0)
            this._accounts.menu.addMenuItem(infoItem(this._accountGrid(view.accounts)));

        this._dashboard.visible = view.state === 'ok';
        this._footer.text = view.state === 'off' ? 'Run: teamclaude service status' : view.footer ?? '';
        this._footerItem.visible = this._footer.text !== '';
    }

    _bucketRow(bucket) {
        const box = new St.BoxLayout({style_class: 'tcg-row'});
        box.add_child(new St.Label({text: bucket.label, style_class: 'tcg-bucket'}));
        box.add_child(bar(bucket.fraction, bucket.level, BAR_WIDTH));
        box.add_child(new St.Label({text: bucket.percent, style_class: 'tcg-percent'}));
        box.add_child(new St.Label({text: bucket.note, opacity: DIM}));
        return infoItem(box);
    }

    _comesBackRow(row) {
        const box = new St.BoxLayout({style_class: 'tcg-row', x_expand: true});
        box.add_child(new St.Label({text: row.when, style_class: 'tcg-when'}));
        box.add_child(new St.Label({text: row.name, x_expand: true}));
        box.add_child(new St.Label({text: row.gain, style_class: 'tcg-percent'}));
        return infoItem(box);
    }

    _accountGrid(accounts) {
        const grid = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'tcg-grid'});
        for (let i = 0; i < accounts.length; i += TILES_PER_ROW) {
            const row = new St.BoxLayout({style_class: 'tcg-grid'});
            for (const account of accounts.slice(i, i + TILES_PER_ROW))
                row.add_child(this._accountTile(account));
            grid.add_child(row);
        }
        return grid;
    }

    _accountTile(account) {
        const tile = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: account.current ? 'tcg-tile tcg-tile-current' : 'tcg-tile',
            opacity: account.dim ? 128 : 255,
        });

        const dial = new St.Widget({layout_manager: new Clutter.BinLayout(), x_align: Clutter.ActorAlign.CENTER});
        const ring = new GaugeRing('tcg-dial');
        ring.update(account.fable.fraction, account.fable.level);
        dial.add_child(ring);
        dial.add_child(new St.Label({
            text: account.fable.text,
            style_class: 'tcg-dial-text',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        tile.add_child(dial);
        tile.add_child(new St.Label({text: account.short, style_class: 'tcg-tile-name'}));

        for (const [label, gauge] of [['7d', account.weekly], ['5h', account.fiveHour]]) {
            const line = new St.BoxLayout({style_class: 'tcg-mini-row', x_align: Clutter.ActorAlign.CENTER});
            line.add_child(new St.Label({text: label, style_class: 'tcg-mini-label'}));
            line.add_child(bar(gauge.fraction, gauge.level, MINI_WIDTH, 'tcg-mini'));
            tile.add_child(line);
        }
        tile.add_child(new St.Label({text: account.note, style_class: 'tcg-tile-note', opacity: DIM}));
        return tile;
    }

    destroy() {
        GLib.Source.remove(this._timer);
        this._cancellable.cancel();
        this._session.abort();
        super.destroy();
    }
});

export default class TeamClaudeGaugeExtension extends Extension {
    enable() {
        this._indicator = new GaugeIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
