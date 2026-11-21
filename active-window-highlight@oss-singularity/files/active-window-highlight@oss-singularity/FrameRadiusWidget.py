#!/usr/bin/python3

from JsonSettingsWidgets import JSONSettingsSpinButton


class FrameRadiusWidget(JSONSettingsSpinButton):
    """Native radius control that follows the rounded-corners switch."""

    def __init__(self, info, key, settings):
        JSONSettingsSpinButton.__init__(self, "frame-radius", settings, info)
        settings.listen("round-top-corners", self._rounding_changed)
        self._rounding_changed(
            "round-top-corners", settings.get_value("round-top-corners")
        )

    def _rounding_changed(self, key, value):
        self.set_sensitive(bool(value))
