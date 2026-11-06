"""Clipboard tab: history of what was copied (text only).

The history lives in memory only: nothing that was copied is written to disk,
and it is gone when the engine restarts.
"""
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, Gtk

from .service import Service

import re
import urllib.parse

# Parameters whose only purpose is to track where the click came from. Those
# ending in '*' match as a prefix.
TRACKERS = (
    'utm_*', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid',
    'igshid', 'igsh', 'mc_cid', 'mc_eid', 'mkt_tok', '_hsenc', '_hsmi', 'vero_id', 'oly_anon_id',
    'oly_enc_id', 'ref_src', 'ref_url', 'srsltid', 'si', 'feature', 'pp', 'spm', 'scid', 'trk',
    'trackingid', 'cmpid', 's_cid', 'ncid',
)
URL = re.compile(r'^https?://\S+$', re.I)


def _is_tracker(name):
    name = name.lower()
    return any(name.startswith(t[:-1]) if t.endswith('*') else name == t for t in TRACKERS)


def clean_url(text):
    """Returns the link without its tracking parameters (or the text unchanged)."""
    candidate = text.strip()
    if not URL.match(candidate):
        return text
    parts = urllib.parse.urlsplit(candidate)
    if not parts.query:
        return text
    kept = [pair for pair in parts.query.split('&') if pair and not _is_tracker(pair.split('=', 1)[0])]
    if len(kept) == len([pair for pair in parts.query.split('&') if pair]):
        return text
    return urllib.parse.urlunsplit(parts._replace(query='&'.join(kept)))

MAX_ITEMS = 50
MAX_TEXT = 100_000   # characters
PREVIEW_CHARS = 300
# Password managers (KeePassXC, Bitwarden and others) tag what they copy with
# this type, asking clipboard histories not to keep the password.
PASSWORD_HINT = 'x-kde-passwordManagerHint'


class Clipboard(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Clipboard'
    METHODS = {'Copy': 'u', 'Remove': 'u', 'Clear': '', 'SetCleanLinks': 'b'}

    def __init__(self, connection, notices=None):
        super().__init__(connection)
        self._notices = notices
        self._clean_links = True
        self._items = []   # most recent first: (id, text)
        self._next_id = 1
        self._clipboard = None
        if Gdk.Display.get_default() is not None:
            self._clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
            self._clipboard.connect('owner-change', self._on_owner_change)
        self._publish()

    def _on_owner_change(self, clipboard, event):
        clipboard.request_targets(self._on_targets)

    def _on_targets(self, clipboard, targets, n_targets=None):
        names = [target.name() for target in targets or []]
        if PASSWORD_HINT in names:
            return
        clipboard.request_text(self._on_text)

    def _on_text(self, clipboard, text):
        # Huge texts are left out: the whole history travels to the island on
        # every change.
        if not text or not text.strip() or len(text) > MAX_TEXT:
            return
        # A copied link with trackers is replaced by the clean version. The
        # island is the one that puts the clean version on the clipboard,
        # through the notice; it then comes back here, already clean, and
        # enters the history.
        if self._clean_links and self._notices:
            cleaned = clean_url(text)
            if cleaned != text:
                self._notices.notify('link', copy=cleaned)
                return
        # Copying something that is already in the history just moves it to the
        # top.
        self._items = [item for item in self._items if item[1] != text]
        self._items.insert(0, (self._next_id, text))
        self._next_id += 1
        del self._items[MAX_ITEMS:]
        self._publish()

    def _publish(self):
        self.set_state({
            'available': self._clipboard is not None,
            'items': [
                {'id': item_id, 'text': ' '.join(text[:PREVIEW_CHARS].split())}
                for item_id, text in self._items],
        })

    def do_Copy(self, item_id):
        """Puts a history item back on the clipboard."""
        for current_id, text in self._items:
            if current_id == item_id and self._clipboard:
                self._clipboard.set_text(text, -1)
                self._clipboard.store()
                return

    def do_Remove(self, item_id):
        self._items = [item for item in self._items if item[0] != item_id]
        self._publish()

    def do_Clear(self):
        self._items = []
        self._publish()

    def do_SetCleanLinks(self, enabled):
        self._clean_links = enabled
