// SPDX-License-Identifier: GPL-2.0-or-later
// Panel ring: a track plus an arc for the used fraction. The arc takes the
// foreground color of the CSS level class, so the palette lives in
// stylesheet.css only. A plain class around St.DrawingArea, not a GObject
// subclass: a GType name cannot be registered twice, which would block a
// reload in a running Shell (tools/live-load.sh).

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class GaugeRing {
    constructor(styleClass = '') {
        this.actor = new St.DrawingArea({
            style_class: `tcg-ring ${styleClass} tcg-off`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.connect('repaint', area => this._repaint(area));
        this._fraction = 0;
        this._level = 'off';
    }

    update(fraction, level) {
        this.actor.remove_style_class_name(`tcg-${this._level}`);
        this.actor.add_style_class_name(`tcg-${level}`);
        this._fraction = fraction;
        this._level = level;
        this.actor.queue_repaint();
    }

    _repaint(area) {
        const node = area.get_theme_node();
        const lineWidth = node.get_length('-tcg-ring-width');
        const [width, height] = area.get_surface_size();
        const radius = Math.min(width, height) / 2 - lineWidth / 2;
        const start = -Math.PI / 2;

        const cr = area.get_context();
        cr.setLineWidth(lineWidth);
        cr.translate(width / 2, height / 2);

        cr.setSourceColor(node.get_color('-tcg-track-color'));
        cr.arc(0, 0, radius, 0, 2 * Math.PI);
        cr.stroke();

        if (this._fraction > 0) {
            cr.setSourceColor(node.get_foreground_color());
            cr.arc(0, 0, radius, start, start + 2 * Math.PI * this._fraction);
            cr.stroke();
        }
        cr.$dispose();
    }
}
