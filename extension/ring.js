// SPDX-License-Identifier: GPL-2.0-or-later
// Panel ring: a track plus an arc for the used fraction. The arc takes the
// foreground color of the CSS level class, so the palette lives in
// stylesheet.css only.

import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const GaugeRing = GObject.registerClass(
class GaugeRing extends St.DrawingArea {
    _init() {
        super._init({style_class: 'tcg-ring tcg-off', y_align: Clutter.ActorAlign.CENTER});
        this._fraction = 0;
        this._level = 'off';
    }

    update(fraction, level) {
        this.remove_style_class_name(`tcg-${this._level}`);
        this.add_style_class_name(`tcg-${level}`);
        this._fraction = fraction;
        this._level = level;
        this.queue_repaint();
    }

    vfunc_repaint() {
        const node = this.get_theme_node();
        const lineWidth = node.get_length('-tcg-ring-width');
        const [width, height] = this.get_surface_size();
        const radius = Math.min(width, height) / 2 - lineWidth / 2;
        const start = -Math.PI / 2;

        const cr = this.get_context();
        cr.setLineWidth(lineWidth);
        cr.setLineCap(Cairo.LineCap.ROUND);
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
});
