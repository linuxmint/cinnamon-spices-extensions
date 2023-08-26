import gi, os, glob, json, shutil, threading, subprocess
from data.enum import Source

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GdkPixbuf

CONFIGURATOR_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(CONFIGURATOR_DIR) + "/"
UI_PATH = CONFIGURATOR_DIR + "/" + "image-configurator.glade"

IMAGE_DIR = PROJECT_DIR + "images/"
IMAGE_EXTRACT_DIR = IMAGE_DIR + "extracted/"
IMAGE_SETS_DIR = IMAGE_DIR + "included_image_sets/"
IMAGE_SELECTED_DIR = IMAGE_DIR + "selected/"
IMAGE_DEFAULT_DIR = IMAGE_DIR + "default/"


class WindowHandler:
	def __init__(self, pref_path: str) -> None:

		########### Class variables ###########
		self.pref_path = pref_path

		self.time_values = [
			"etr_morning_twilight_times",
			"etr_sunrise_times",
			"etr_morning_times",
			"etr_noon_times",
			"etr_afternoon_times",
			"etr_evening_times",
			"etr_sunset_times",
			"etr_night_twilight_times",
			"etr_night_times"
		]

		self.img_values = [
			"etr_img_morning_twilight",
			"etr_img_sunrise",
			"etr_img_morning",
			"etr_img_noon",
			"etr_img_afternoon",
			"etr_img_evening",
			"etr_img_sunset",
			"etr_img_night_twilight",
			"etr_img_night"
		]

		self.img_sets = [
			"aurora",
			"beach",
			"bitday",
			"cliffs",
			"gradient",
			"lakeside",
			"mountains",
			"sahara"
		]

		########### Create the folder ###########
		try:
			os.mkdir(IMAGE_EXTRACT_DIR)
		except:
			pass

		try:
			os.mkdir(IMAGE_SELECTED_DIR)
		except:
			pass

		########### GTK stuff ###########
		self.builder = Gtk.Builder()
		self.builder.add_from_file(UI_PATH)
		self.builder.connect_signals(self)

		########### Glade Ressources ###########
		self.rb_included_image_set = self.builder.get_object("rb_included_image_set")
		self.rb_external_image_set = self.builder.get_object("rb_external_image_set")

		self.lb_image_set = self.builder.get_object("lb_image_set")
		self.cb_image_set = self.builder.get_object("cb_image_set")

		self.lb_heic_file = self.builder.get_object("lb_heic_file")
		self.fc_heic_file = self.builder.get_object("fc_heic_file")

		self.lb_times = [
			self.builder.get_object("lb_times_1"),
			self.builder.get_object("lb_times_2"),
			self.builder.get_object("lb_times_3"),
			self.builder.get_object("lb_times_4"),
			self.builder.get_object("lb_times_5"),
			self.builder.get_object("lb_times_6"),
			self.builder.get_object("lb_times_7"),
			self.builder.get_object("lb_times_8"),
			self.builder.get_object("lb_times_9")
		]

		self.img_previews = [
			self.builder.get_object("img_preview_1"),
			self.builder.get_object("img_preview_2"),
			self.builder.get_object("img_preview_3"),
			self.builder.get_object("img_preview_4"),
			self.builder.get_object("img_preview_5"),
			self.builder.get_object("img_preview_6"),
			self.builder.get_object("img_preview_7"),
			self.builder.get_object("img_preview_8"),
			self.builder.get_object("img_preview_9")
		]

		self.cb_previews = [
			self.builder.get_object("cb_preview_1"),
			self.builder.get_object("cb_preview_2"),
			self.builder.get_object("cb_preview_3"),
			self.builder.get_object("cb_preview_4"),
			self.builder.get_object("cb_preview_5"),
			self.builder.get_object("cb_preview_6"),
			self.builder.get_object("cb_preview_7"),
			self.builder.get_object("cb_preview_8"),
			self.builder.get_object("cb_preview_9")
		]

		# The GtkStack
		self.stack_main = self.builder.get_object("stack_main")
		self.stack_main.add_named(self.builder.get_object("page_config"), "config")
		self.stack_main.add_named(self.builder.get_object("page_load"), "load")
		self.stack_main.set_visible_child_name("config")
		

		########### Load predefinitions and settings ###########
		for set in self.img_sets:
			self.cb_image_set.append_text(set)

		self.image_source = Source.SELECTED

		# Load preferences
		self.loadFromSettings()


	def showMainWindow(self):
		""" Opens the main window, starts the Gtk main routine
		"""
		window = self.builder.get_object("main_window")
		window.show_all()

		self.imageSetVisibility(self.image_source)
		self.rb_external_image_set.set_active(self.image_source == Source.EXTRACT)

		Gtk.main()

	
	def loadFromSettings(self):
		""" Load preferences from the Cinnamon preference file
		"""
		#try:
		# Load the settings
		with open(self.pref_path, "r") as pref_file:
			pref_data = json.load(pref_file)


		# Get all images in the "selected" folder
		choosable_images = os.listdir(IMAGE_SELECTED_DIR)
		choosable_images.sort()


		# Add the founded image names to the ComboBoxes
		if pref_data["etr_choosen_image_set"]["value"] == "custom":
			for combobox in self.cb_previews:
				for option in choosable_images:
					combobox.append_text(option)
		else:
			for i, set in enumerate(self.img_sets):
				if set == pref_data["etr_choosen_image_set"]["value"]:
					self.cb_image_set.set_active(i)


		for i, val in enumerate(self.img_values):
			# Bugfix: Load the images only, if there is choosen one
			if pref_data[val]['value'] != None:
				# Set the preview image
				self.changePreviewImage(i, IMAGE_SELECTED_DIR + pref_data[val]['value'])

				# Set the ComboBox selection
				if pref_data["etr_choosen_image_set"]["value"] == "custom":
					self.image_source = Source.EXTRACT

					for j, set in enumerate(choosable_images):
						if set == pref_data[val]["value"]:
							self.cb_previews[i].set_active(j)
				else:
					self.image_source = Source.SET

		# Print the times of the day
		for i, val in enumerate(self.time_values):
			self.lb_times[i].set_text(pref_data[val]['value'])


	def writeToSettings(self):
		""" Save preferences to the Cinnamon preference file
		"""
		# Load the settings
		with open(self.pref_path, "r") as pref_file:
			pref_data = json.load(pref_file)


		# Update the settings
		if self.image_source == Source.SET:
			pref_data["etr_choosen_image_set"]["value"] = self.cb_image_set.get_active_text()

			for i, val in enumerate(self.img_values):
				pref_data[val]['value'] = str(i + 1) + ".jpg"
		else:
			pref_data["etr_choosen_image_set"]["value"] = "custom"

			for i, val in enumerate(self.img_values):
				image_name = self.cb_previews[i].get_active_text()

				pref_data[val]['value'] = image_name


		# Write the settings
		with open(self.pref_path, "w") as pref_file:
			json.dump(pref_data, pref_file, separators=(',', ':'), indent=4)


	def changePreviewImage(self, imageId: int, imageURI: str):
		""" Exchanges the image in the preview

		Args:
			imageId (int): The number of the preview (0-8)
			imageURI (str): URI to the new image
		"""
		try:
			pixbuf = GdkPixbuf.Pixbuf.new_from_file(imageURI)
			pixbuf = pixbuf.scale_simple(300, 200, GdkPixbuf.InterpType.BILINEAR)

			self.img_previews[imageId].set_from_pixbuf(pixbuf)
		except:
			pass


	def extractHeifImages(self, imageURI: str):
		""" Extract all images in a heif file

		Args:
			imageURI (str): URI to the heif file
		"""
		imageURI = imageURI.replace("%20", "\ ")
		
		filename = imageURI[imageURI.rfind("/") + 1:imageURI.rfind(".")]

		self.image_source = Source.EXTRACT

		self.wipeImages(Source.EXTRACT)
		os.system("heif-convert " + imageURI + " " + IMAGE_EXTRACT_DIR + filename + ".jpg")

		self.createExtracted()


	def wipeImages(self, source: Source):
		""" Removes all image of a folder

		Args:
			source (Source): Choose the folder by selecting the Source
		"""
		if source == Source.EXTRACT:
			dir = IMAGE_EXTRACT_DIR + "*"
		elif source == Source.SELECTED:
			dir = IMAGE_SELECTED_DIR + "*"
		
		for file in glob.glob(dir):
			os.remove(file)


	def createExtracted(self):
		""" Create the extracted images array
		"""
		try:
			if self.image_source == Source.SELECTED:
				self.extracted = os.listdir(IMAGE_SELECTED_DIR)
			elif self.image_source == Source.EXTRACT:
				self.extracted = os.listdir(IMAGE_EXTRACT_DIR)

			self.extracted.sort()

			for combobox in self.cb_previews:
				for option in self.extracted:
					combobox.append_text(option)
		except:
			pass

		self.stack_main.set_visible_child_name("config")


	def copyToSelected(self, source: Source):
		""" Copies the extracted images to "res/"
		"""
		# Clean the "selected folder up"
		self.wipeImages(Source.SELECTED)

		# Estimate the source folder
		if source == Source.EXTRACT:
			source_folder = IMAGE_EXTRACT_DIR
		else:
			source_folder = IMAGE_SETS_DIR + self.cb_image_set.get_active_text() + "/"

		# Copy it to "selected/"
		for image in os.listdir(source_folder):
			shutil.copy(source_folder + image, IMAGE_SELECTED_DIR + image)


	def imageSetVisibility(self, source: Source):
		""" Toggle the visibility of the option in the "Image set" box

		Args:
			source (Source): Toggle by type of Source
		"""
		self.image_source = source

		self.lb_image_set.set_visible(source == Source.SET)
		self.cb_image_set.set_visible(source == Source.SET)

		self.lb_heic_file.set_visible(source != Source.SET)
		self.fc_heic_file.set_visible(source != Source.SET)

		for i in range(0, 9):
			self.cb_previews[i].set_visible(source != Source.SET)



	########## UI Signals ##########

	def onImageSetSelected(self, cb):
		""" UI signal if the image set combo box value changed

		Args:
			cb (GtkComboBox): The active ComboBox
		"""
		if self.image_source != Source.SELECTED:
			set_name = cb.get_active_text()
			
			for i, _ in enumerate(self.img_previews):
				self.changePreviewImage(i, IMAGE_SETS_DIR + set_name + "/" + str(i + 1) + ".jpg")


	def onRadioImageSet(self, rb):
		""" UI signal if the radio buttons are toggled

		Args:
			rb (GtkRadioButton): The toggled RadioButton
		"""
		if rb.get_active():
			self.imageSetVisibility(Source.SET)
		else:
			self.imageSetVisibility(Source.EXTRACT)


	def onHeifSelected(self, fc):
		""" UI signal if the filechooser has a file selected

		Args:
			fc (filechooser): The selected filechooser
		"""
		# Get the URI to the file
		uri = fc.get_file().get_uri()
		uri = uri[7:]

		self.stack_main.set_visible_child_name("load")

		thread = threading.Thread(target=self.extractHeifImages, args=(uri, ))
		thread.daemon = True
		thread.start()


	def onPreviewComboboxSelected(self, cb):
		""" UI signal if one of the preview combobox is selected

		Args:
			cb (ComboBox): The selected combobox
		"""
		number = Gtk.Buildable.get_name(cb)
		number = number[number.rfind("_") + 1:]
		
		if self.image_source == Source.EXTRACT:
			self.changePreviewImage(int(number) - 1, IMAGE_EXTRACT_DIR + cb.get_active_text())


	def onApply(self, *args):
		""" UI signal if the user presses the "Apply" button
		"""
		self.writeToSettings()
		self.copyToSelected(self.image_source)

		Gtk.main_quit()


	def onDestroy(self, *args):
		""" UI signal if the window is closed by the user
		"""
		Gtk.main_quit()