"""Notes tab: a block of text that saves itself."""
import datetime
import os

from gi.repository import GLib

from .service import Service

NOTES_FILE = os.path.join(GLib.get_user_data_dir(), 'cinnamon-island', 'notes.txt')
# Where notes sent to the file shelf are kept.
EXPORT_DIR = os.path.join(GLib.get_user_data_dir(), 'cinnamon-island', 'notes')


class Notes(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Notes'
    METHODS = {'SetText': 's', 'SendToShelf': ''}

    def __init__(self, connection, files):
        super().__init__(connection)
        self._files = files
        try:
            with open(NOTES_FILE, encoding='utf-8') as file:
                text = file.read()
        except OSError:
            text = ''
        self.set_state({'text': text})

    def do_SetText(self, text):
        try:
            os.makedirs(os.path.dirname(NOTES_FILE), exist_ok=True)
            # Notes are personal: the file is created readable by its owner
            # only.
            descriptor = os.open(NOTES_FILE + '.tmp', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
                file.write(text)
            os.replace(NOTES_FILE + '.tmp', NOTES_FILE)
        except OSError:
            pass
        self.set_state({'text': text})

    def do_SendToShelf(self):
        """Writes the current note to a .txt file and puts it on the shelf."""
        text = self._state.get('text', '')
        if not text.strip():
            return
        name = datetime.datetime.now().strftime('note-%Y-%m-%d-%H%M%S.txt')
        path = os.path.join(EXPORT_DIR, name)
        os.makedirs(EXPORT_DIR, exist_ok=True)
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
            file.write(text)
        self._files.add([path])
