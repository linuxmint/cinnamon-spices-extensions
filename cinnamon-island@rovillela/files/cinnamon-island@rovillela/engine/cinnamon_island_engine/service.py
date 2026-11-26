"""Base of the engine tabs: a D-Bus interface with its state in JSON.

Each tab exposes GetState() -> s and the StateChanged(s) signal, plus the
command methods it declares in METHODS.
"""
import json

from gi.repository import Gio, GLib

from . import OBJECT_PATH


class Service:
    # D-Bus interface name, e.g. 'org.cinnamonisland.Engine.Music'.
    INTERFACE = None
    # Commands of the tab: method name -> signature of the input arguments.
    METHODS = {}
    # Signals besides StateChanged: name -> signature. They carry data that
    # arrives many times per second and does not fit the JSON state.
    SIGNALS = {}

    def __init__(self, connection):
        self._connection = connection
        self._state = {}

        methods = ''.join(
            '<method name="%s">%s</method>' % (
                name,
                ''.join('<arg type="%s" direction="in"/>' % t for t in GLib.VariantType.new('(%s)' % sig).dup_string()[1:-1])
                if sig else '')
            for name, sig in self.METHODS.items())
        xml = (
            '<node><interface name="%s">'
            '<method name="GetState"><arg type="s" direction="out"/></method>'
            '<signal name="StateChanged"><arg type="s"/></signal>'
            '%s%s</interface></node>' % (self.INTERFACE, methods, ''.join(
                '<signal name="%s"><arg type="%s"/></signal>' % item for item in self.SIGNALS.items())))
        info = Gio.DBusNodeInfo.new_for_xml(xml)
        connection.register_object(OBJECT_PATH, info.interfaces[0], self._on_method_call, None, None)

    def _on_method_call(self, connection, sender, path, interface, method, parameters, invocation):
        if method == 'GetState':
            invocation.return_value(GLib.Variant('(s)', (json.dumps(self._state),)))
            return
        try:
            getattr(self, 'do_' + method)(*parameters.unpack())
        except Exception as error:  # a bad command must not bring the engine down
            invocation.return_dbus_error('org.cinnamonisland.Engine.Error', str(error))
            return
        invocation.return_value(None)

    def emit(self, signal, signature, *values):
        self._connection.emit_signal(
            None, OBJECT_PATH, self.INTERFACE, signal, GLib.Variant('(%s)' % signature, values))

    def set_state(self, state):
        """Stores the new state and tells the front ends, only if something
        changed.
        """
        if state == self._state:
            return
        self._state = state
        self._connection.emit_signal(
            None, OBJECT_PATH, self.INTERFACE, 'StateChanged',
            GLib.Variant('(s)', (json.dumps(state),)))
