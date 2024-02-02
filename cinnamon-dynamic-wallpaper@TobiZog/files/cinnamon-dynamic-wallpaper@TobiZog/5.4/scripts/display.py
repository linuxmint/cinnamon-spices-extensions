import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gdk

class Display:
  """ Handling display informations and actions
  """
  def __init__(self) -> None:
    self.display = Gdk.Display.get_default()


  def get_screen_height(self) -> int:
    """ Estimate the height resolution of the primary display

    Returns:
        int: Height in pixel
    """
    geometry = self.display.get_monitor(0).get_geometry()

    return geometry.height
