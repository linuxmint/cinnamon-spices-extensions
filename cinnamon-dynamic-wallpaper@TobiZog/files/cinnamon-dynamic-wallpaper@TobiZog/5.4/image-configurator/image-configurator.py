import os
import windowHandler

if __name__ == "__main__":
	wh = windowHandler.WindowHandler(os.path.expanduser("~") + "/.config/cinnamon/spices/cinnamon-dynamic-wallpaper@TobiZog/cinnamon-dynamic-wallpaper@TobiZog.json")
	wh.showMainWindow()
