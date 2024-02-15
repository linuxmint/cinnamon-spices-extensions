#!/usr/bin/python3

import sys
from view.main_window import *
from model.main_view_model import *

if __name__ == "__main__":
  if len(sys.argv) == 1:
    # Load the configuration window
    main = Main_Window()
    main.show()

  elif sys.argv[1] == "loop":
    # Run the methods which updates the data
    view_model = Main_View_Model()
    view_model.set_login_image()
    view_model.refresh_image()
    view_model.set_background_gradient()
