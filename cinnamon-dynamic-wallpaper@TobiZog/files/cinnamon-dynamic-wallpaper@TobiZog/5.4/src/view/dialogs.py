import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

class Dialogs(Gtk.Window):
  """ All used Gtk dialogs

  Args:
      Gtk (Gtk.Window): Window of Gtk application
  """
  def __init__(self) -> None:
    super().__init__()


  def source_folder_dialog(self) -> str:
    """ Display a FileChooser dialog where the user choose a folder

    Returns:
        str: Absolute path to the selected folder
    """
    dialog = Gtk.FileChooserDialog(
      title= "Please choose a folder with images",
      parent=self,
      action=Gtk.FileChooserAction.SELECT_FOLDER
    )

    dialog.add_buttons(
      Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL, "Select", Gtk.ResponseType.OK
    )

    dialog.set_default_size(800, 400)

    response = dialog.run()
    location = ""

    if response == Gtk.ResponseType.OK:
      location = dialog.get_filename()

    dialog.destroy()

    return location
  
  
  def message_dialog(self, message: str, type: Gtk.MessageType = Gtk.MessageType.INFO):
    """ Displaying a Gtk Message dialog to the user

    Args:
        message (str): Message which appear in the dialog
    """
    dialog = Gtk.MessageDialog(
      transient_for=self,
      flags=0,
      message_type=type,
      buttons=Gtk.ButtonsType.OK,
      text=message
    )

    dialog.run()
    dialog.destroy()
