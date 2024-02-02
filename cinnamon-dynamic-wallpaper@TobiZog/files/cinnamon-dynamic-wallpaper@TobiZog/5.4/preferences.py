#!/usr/bin/python3

############################################################
#                         Imports                          #
############################################################

# Packages
import gi, os, subprocess, time
from datetime import timedelta

# Local scripts
from scripts import cinnamon_pref_handler, dialogs, display, images, location, suntimes, time_bar_chart, ui
from loop import *
from enums.ImageSourceEnum import ImageSourceEnum
from enums.PeriodSourceEnum import PeriodSourceEnum

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GdkPixbuf


# Global definitions
PREFERENCES_URI = os.path.dirname(os.path.abspath(__file__))
GLADE_URI = PREFERENCES_URI + "/preferences.glade"


class Preferences:
	""" Preference window class
	"""

	############################################################
	#                         Lifecycle                        #
	############################################################

	def __init__(self) -> None:
		# Objects from external scripts
		self.prefs = cinnamon_pref_handler.Cinnamon_Pref_Handler()
		self.dialogs = dialogs.Dialogs()
		self.display = display.Display()
		self.images = images.Images()
		self.location = location.Location()
		self.suntimes = suntimes.Suntimes()
		self.time_bar_chart = time_bar_chart.Time_Bar_Chart()

		# Glade
		self.builder = Gtk.Builder()
		self.builder.add_from_file(GLADE_URI)
		self.builder.connect_signals(self)

		self.ui = ui.UI(self.builder)


		# Local Config
		self.smaller_ui_height = 1000


	def show(self):
		""" Display the window to the screen
		"""
		window = self.builder.get_object("window_main")
		window.show_all()

		# Load from preferences
		if self.prefs.image_source == ImageSourceEnum.IMAGESET:
			self.ui.tb_image_set.set_active(True)
		elif self.prefs.image_source == ImageSourceEnum.HEICFILE:
			self.ui.tb_heic_file.set_active(True)
		elif self.prefs.image_source == ImageSourceEnum.SOURCEFOLDER:
			self.ui.tb_source_folder.set_active(True)

		
		# Remove icons in the ToggleButtons if the screen height resolution < 1000 px
		if self.display.get_screen_height() < self.smaller_ui_height:
			self.ui.img_tb_image_set.clear()
			self.ui.img_tb_heic_file.clear()
			self.ui.img_tb_source_folder.clear()
			self.ui.img_tb_network_location.clear()
			self.ui.img_tb_custom_location.clear()
			self.ui.img_tb_time_periods.clear()


		picture_aspects = ["centered", "scaled", "stretched", "zoom", "spanned"]
		self.ui.add_items_to_combo_box(self.ui.cb_picture_aspect, picture_aspects)
		self.ui.set_active_combobox_item(self.ui.cb_picture_aspect, self.prefs.picture_aspect)

		self.ui.sw_dynamic_background_color.set_active(self.prefs.dynamic_background_color)


		if self.prefs.period_source == PeriodSourceEnum.NETWORKLOCATION:
			self.ui.tb_network_location.set_active(True)
		elif self.prefs.period_source == PeriodSourceEnum.CUSTOMLOCATION:
			self.ui.tb_custom_location.set_active(True)
		elif self.prefs.period_source == PeriodSourceEnum.CUSTOMTIMEPERIODS:
			self.ui.tb_time_periods.set_active(True)


		# Time diagram
		try:
			self.refresh_chart()
		except:
			pass

		# Show the main window
		Gtk.main()

	
	def on_destroy(self, *args):
		""" Lifecycle handler when window will be destroyed
		"""
		Gtk.main_quit()



	############################################################
	#												Local methods											 #
	############################################################

	def refresh_chart(self):
		""" Recomputes both time bar charts and load them to the UI
		"""
		# Stores the start times of the periods in minutes since midnight
		time_periods_min = []

		if self.prefs.period_source == PeriodSourceEnum.CUSTOMTIMEPERIODS:
			for i in range(0, 10):
				time_str = self.prefs.period_custom_start_time[i]

				time_periods_min.append(int(time_str[0:2]) * 60 + int(time_str[3:5]))
		else:
			if self.prefs.period_source == PeriodSourceEnum.NETWORKLOCATION:
				self.suntimes.calc_suntimes(float(self.prefs.latitude_auto), float(self.prefs.longitude_auto))
			else:
				self.suntimes.calc_suntimes(float(self.ui.etr_latitude.get_text()), float(self.ui.etr_longitude.get_text()))	

			
			# Get all time periods. Store the minutes to the list and print the values to the text views
			for i in range(0, 10):
				time_range_now = self.suntimes.day_periods[i]

				if i != 9:
					time_range_next = self.suntimes.day_periods[i + 1]
				else:
					time_range_next = time(hour=23, minute=59)

				self.ui.etr_periods[i].set_text(
					str(time_range_now.hour).rjust(2, '0') + ":" + str(time_range_now.minute).rjust(2, '0') + \
						" - " + str(time_range_next.hour).rjust(2, '0') + ":" + str(time_range_next.minute).rjust(2, '0'))
				
				time_periods_min.append(time_range_now.hour * 60 + time_range_now.minute)

		# Create time bar
		# Reduce size for small displays
		if self.display.get_screen_height() < self.smaller_ui_height:
			bar_width = 1150
			bar_height = 110
		else:
			bar_width = 1300
			bar_height = 150

		self.time_bar_chart.create_bar_chart_with_polylines(PREFERENCES_URI, bar_width, bar_height, time_periods_min)
		self.time_bar_chart.create_bar_chart(PREFERENCES_URI, bar_width, bar_height, time_periods_min)

		# Load to the views
		pixbuf = GdkPixbuf.Pixbuf.new_from_file(PREFERENCES_URI + "/time_bar_polylines.svg")
		self.ui.img_bar_images.set_from_pixbuf(pixbuf)

		pixbuf2 = GdkPixbuf.Pixbuf.new_from_file(PREFERENCES_URI + "/time_bar.svg")
		self.ui.img_bar_times.set_from_pixbuf(pixbuf2)


	def load_image_options_to_combo_boxes(self, options: list):
		""" Add a list of Strings to all image option comboboxes

		Args:
				options (list): All possible options
		"""
		options.insert(0, "")

		for combobox in self.ui.cb_periods:
			self.ui.add_items_to_combo_box(combobox, options)


	def load_image_to_preview(self, image_preview: Gtk.Image, image_src: str):
		""" Scales the image to a lower resoultion and put them into the time bar chart

		Args:
				image_preview (Gtk.Image): Gtk Image where it will be displayed
				image_src (str): Absolute path to the image
		"""
		try:
			pixbuf = GdkPixbuf.Pixbuf.new_from_file(image_src)

			screen_height = self.display.get_screen_height()

			# Scaling the images smaller for screens
			if screen_height < self.smaller_ui_height:
				pixbuf = pixbuf.scale_simple(221, 128, GdkPixbuf.InterpType.BILINEAR)
			else:
				pixbuf = pixbuf.scale_simple(260, 150, GdkPixbuf.InterpType.BILINEAR)

			image_preview.set_from_pixbuf(pixbuf)
		except:
			pass


	############################################################
	#													Callbacks											 	 #
	############################################################

	## Image Configuration
			
	# +-----------+-----------+---------------+
	# | Image Set | HEIC file | Source Folder |
	# +-----------+-----------+---------------+

	def on_toggle_button_image_set_clicked(self, button: Gtk.ToggleButton):
		""" Clicked on ToggleButton "Image Set"

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.prefs.image_source = ImageSourceEnum.IMAGESET
			self.ui.tb_heic_file.set_active(False)
			self.ui.tb_source_folder.set_active(False)

			self.ui.lbr_image_set.set_visible(True)
			self.ui.lbr_heic_file.set_visible(False)
			self.ui.lbr_source_folder.set_visible(False)

			image_set_choices = [
				"aurora", "beach", 
				"bitday", "cliffs", 
				"earth", "gradient", 
				"lakeside", "mountains", 
				"sahara"
			]
			self.ui.add_items_to_combo_box(self.ui.cb_image_set, image_set_choices)

			self.ui.set_active_combobox_item(self.ui.cb_image_set, self.prefs.selected_image_set)

			for i, combobox in enumerate(self.ui.cb_periods):
				selected_image_name = self.prefs.period_images[i]
				self.ui.set_active_combobox_item(combobox, selected_image_name)

			# Make the comboboxes invisible
			for combobox in self.ui.cb_periods:
				combobox.set_visible(False)
		
	
	def on_toggle_button_heic_file_clicked(self, button: Gtk.ToggleButton):
		""" Clicked on ToggleButton "Heic file"

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.prefs.image_source = ImageSourceEnum.HEICFILE
			self.ui.tb_image_set.set_active(False)
			self.ui.tb_source_folder.set_active(False)

			self.ui.lbr_image_set.set_visible(False)
			self.ui.lbr_heic_file.set_visible(True)
			self.ui.lbr_source_folder.set_visible(False)

			# Make the comboboxes visible
			for combobox in self.ui.cb_periods:
				combobox.set_visible(True)

			# Load images from source folder
			files = self.images.get_images_from_folder(self.prefs.source_folder)

			if len(files) != 0:
				self.load_image_options_to_combo_boxes(files)

				# Load the values for the images from the preferences
				for i in range(0, 10):
					self.ui.set_active_combobox_item(self.ui.cb_periods[i], self.prefs.period_images[i])
			else:
				print("No image files!")


	def on_toggle_button_source_folder_clicked(self, button: Gtk.ToggleButton):
		""" Clicked on ToggleButton "Source Folder"

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.prefs.image_source = ImageSourceEnum.SOURCEFOLDER
			self.ui.tb_image_set.set_active(False)
			self.ui.tb_heic_file.set_active(False)

			self.ui.lbr_image_set.set_visible(False)
			self.ui.lbr_heic_file.set_visible(False)
			self.ui.lbr_source_folder.set_visible(True)

			# Make the comboboxes visible
			for combobox in self.ui.cb_periods:
				combobox.set_visible(True)

			# Load the source folder to the view
			# This will update the comboboxes in the preview to contain the right items
			self.ui.lbl_source_folder.set_label(self.prefs.source_folder)

			# Load files from saved source folder
			files = self.images.get_images_from_folder(self.prefs.source_folder)

			if len(files) != 0:
				self.load_image_options_to_combo_boxes(files)

				# Load the values for the images from the preferences
				for i in range(0, 10):
					self.ui.set_active_combobox_item(self.ui.cb_periods[i], self.prefs.period_images[i])
			else:
				print("No image files!")



	# +------------------------------------+
	# | Select an image set     | aurora ▼ |
	# +------------------------------------+

	def on_cb_image_set_changed(self, combobox: Gtk.ComboBox):
		""" User select on of the included image sets

		Args:
				combobox (Gtk.ComboBox): The used ComboBox
		"""
		tree_iter = combobox.get_active_iter()

		if tree_iter is not None and self.prefs.image_source == ImageSourceEnum.IMAGESET:
			# Get the selected value
			model = combobox.get_model()
			selected_image_set = model[tree_iter][0]

			# Store to the preferences
			self.prefs.selected_image_set = selected_image_set
			self.prefs.source_folder = os.path.abspath(os.path.join(PREFERENCES_URI, os.pardir)) + \
				  "/5.4/images/included_image_sets/" + selected_image_set + "/"
			
			# Load all possible options to the comboboxes
			image_names = self.images.get_images_from_folder(self.prefs.source_folder)
			self.load_image_options_to_combo_boxes(image_names)

			# Image sets have the same names for the images:
			# 9.jpg = Period 0
			# 1.jpg = Period 1
			# 2.jpg = Period 2
			# and so on....
			for i in range(0, 10):
				self.ui.cb_periods[i].set_active(i + 1)


	# +----------------------------------------------+
	# | Select a heic file to import     | (None) 📄 |
	# +----------------------------------------------+

	def on_fc_heic_file_file_set(self, fc_button: Gtk.FileChooser):
		""" User has a heic file selected with the FileChooserDialog

		Args:
				fc_button (Gtk.FileChooser): Parameter about the selected file
		"""
		# The the absolute path to the heic file
		file_path: str = fc_button.get_filename()

		# Extract the heic file
		result = self.images.extract_heic_file(file_path)

		# Update the preferences
		self.prefs.selected_image_set = ""
		self.prefs.source_folder = PREFERENCES_URI + "/images/extracted_images/"

		# Load images only if the extraction was successfully
		if result:
			# Collect all extracted images and push them to the comboboxes
			image_names = self.images.get_images_from_folder(self.prefs.source_folder)
			self.load_image_options_to_combo_boxes(image_names)
		else:
			self.dialogs.message_dialog("Error during extraction")


	# +------------------------------------------------------------+
	# | Select a source folder     | 📂 Open file selection dialog |
	# |             /home/developer/Downloads/
	# +------------------------------------------------------------+

	def on_btn_source_folder_clicked(self, button: Gtk.Button):
		""" Button to choose an image source folder was clicked

		Args:
				button (Gtk.Button): The clicked button
		"""
		folder = self.dialogs.source_folder_dialog()
		files = self.images.get_images_from_folder(folder)

		# Update the preferences
		self.prefs.selected_image_set = ""
		self.prefs.source_folder = folder + "/"

		# Update the label
		self.ui.lbl_source_folder.set_label(folder)

		# Update the image comboboxes
		self.load_image_options_to_combo_boxes(files)

		# Load the values for the images from the preferences
		for i in range(0, 10):
			self.ui.cb_periods[i].set_active(0)

		if len(files) == 1:
			self.dialogs.message_dialog("No image files found!")
	

	def on_cb_period_preview_changed(self, combobox: Gtk.ComboBox):
		""" User select an image from the ComboBox for the time period

		Args:
				combobox (Gtk.ComboBox): The used ComboBox
		"""
		tree_iter = combobox.get_active_iter()

		combobox_name = Gtk.Buildable.get_name(combobox)
		period_index = int(combobox_name[10:11])

		if tree_iter is not None:
			# Get the selected value
			model = combobox.get_model()
			image_file_name = model[tree_iter][0]

			# Store selection to preferences
			self.prefs.period_images[period_index] = image_file_name

			# Build up image path
			image_path = self.prefs.source_folder + image_file_name

			self.load_image_to_preview(self.ui.img_periods[period_index], image_path)
	

	## Location & Times

	def on_toggle_button_network_location_clicked(self, button: Gtk.ToggleButton):
		""" User clicks on the ToggleButton for the network location

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.prefs.period_source = PeriodSourceEnum.NETWORKLOCATION
			self.ui.tb_custom_location.set_active(False)
			self.ui.tb_time_periods.set_active(False)

			self.ui.lbr_network_location.set_visible(True)
			self.ui.lbr_current_location.set_visible(True)
			self.ui.lbr_custom_location_longitude.set_visible(False)
			self.ui.lbr_custom_location_latitude.set_visible(False)
			self.ui.lbr_time_periods.set_visible(False)

			self.ui.spb_network_location_refresh_time.set_value(self.prefs.location_refresh_intervals)
		

			# Display the location in the UI
			current_location = self.location.get_location()
			self.ui.lb_current_location.set_text("Latitude: " + current_location["latitude"] + \
																		 ", Longitude: " + current_location["longitude"])
			
			# Store the location to the preferences
			self.prefs.latitude_auto = float(current_location["latitude"])
			self.prefs.longitude_auto = float(current_location["longitude"])

			self.refresh_chart()


	def on_toggle_button_custom_location_clicked(self, button: Gtk.ToggleButton):
		if button.get_active():
			self.prefs.period_source = PeriodSourceEnum.CUSTOMLOCATION
			self.ui.tb_network_location.set_active(False)
			self.ui.tb_time_periods.set_active(False)

			self.ui.lbr_network_location.set_visible(False)
			self.ui.lbr_current_location.set_visible(False)
			self.ui.lbr_custom_location_longitude.set_visible(True)
			self.ui.lbr_custom_location_latitude.set_visible(True)
			self.ui.lbr_time_periods.set_visible(False)

			self.ui.etr_latitude.set_text(str(self.prefs.latitude_custom))
			self.ui.etr_longitude.set_text(str(self.prefs.longitude_custom))


	def on_toggle_button_time_periods_clicked(self, button: Gtk.ToggleButton):
		if button.get_active():
			self.prefs.period_source = PeriodSourceEnum.CUSTOMTIMEPERIODS
			self.ui.tb_network_location.set_active(False)
			self.ui.tb_custom_location.set_active(False)

			self.ui.lbr_network_location.set_visible(False)
			self.ui.lbr_current_location.set_visible(False)
			self.ui.lbr_custom_location_longitude.set_visible(False)
			self.ui.lbr_custom_location_latitude.set_visible(False)
			self.ui.lbr_time_periods.set_visible(True)
			
			
			for i in range(0, 9):
				pref_value = self.prefs.period_custom_start_time[i + 1]
				time_parts = [int(pref_value[0:pref_value.find(":")]), int(pref_value[pref_value.find(":") + 1:])]

				self.ui.spb_periods_hour[i].set_value(time_parts[0])
				self.ui.spb_periods_minute[i].set_value(time_parts[1])



	def on_spb_period_value_changed(self, spin_button: Gtk.SpinButton):
		""" Callback if one of the time spinners (minute or hour) will be clicked

					 (1)							 (2)							 (3)
			Previous period		Current period		 Next period
			12:34 - 14:40			14:41 - 16:20			16:21 - 17:30
													^
										Variable to change

		Args:
				spin_button (Gtk.SpinButton): SpinButton which was changed
		"""
		spin_button_name = Gtk.Buildable.get_name(spin_button)
		index = int(spin_button_name[11:12]) - 1

		# Determe time string and store to prefs
		time_current_start = datetime(2024,1,1, int(self.ui.spb_periods_hour[index].get_value()), int(self.ui.spb_periods_minute[index].get_value()))
		time_current_start_str = str(time_current_start.hour).rjust(2, '0') + ":" + str(time_current_start.minute).rjust(2, '0')

		self.prefs.period_custom_start_time[index + 1] = time_current_start_str
		

		time_previous_end = time_current_start - timedelta(minutes=1)
		self.ui.lb_period_end[index].set_text(str(time_previous_end.hour).rjust(2, '0') + ":" + str(time_previous_end.minute).rjust(2, '0'))


		self.refresh_chart()


	def on_spb_network_location_refresh_time_changed(self, spin_button: Gtk.SpinButton):
		""" User changed the refresh time of network location estimation

		Args:
				spin_button (Gtk.SpinButton): The used SpinButton
		"""
		self.prefs.location_refresh_intervals = spin_button.get_value()


	def on_etr_longitude_changed(self, entry: Gtk.Entry):
		""" User changes the value of the longitude Entry

		Args:
				entry (Gtk.Entry): The manipulated Entry object
		"""
		try:
			self.prefs.longitude_custom = float(entry.get_text())
			self.refresh_chart()
		except:
			pass


	def on_etr_latitude_changed(self, entry: Gtk.Entry):
		""" User changes the value of the latitude Entry

		Args:
				entry (Gtk.Entry): The manipulated Entry object
		"""
		try:
			self.prefs.latitude_custom = float(entry.get_text())
			self.refresh_chart()
		except:
			pass


	# Behaviour
		
	def on_cb_picture_aspect_changed(self, combobox: Gtk.ComboBox):
		tree_iter = combobox.get_active_iter()

		if tree_iter is not None:
			model = combobox.get_model()
			self.prefs.picture_aspect = model[tree_iter][0]
		
	def on_sw_dynamic_background_color_state_set(self, switch: Gtk.Switch, state):
		self.prefs.dynamic_background_color = state


	# About

	def on_cinnamon_spices_website_button_clicked(self, button: Gtk.Button):
		""" Callback for the button to navigate to the Cinnamon Spices web page of this project

		Args:
				button (Gtk.Button): Button which was clicked
		"""
		subprocess.Popen(["xdg-open", "https://cinnamon-spices.linuxmint.com/extensions/view/97"])


	def on_github_website_button_clicked(self, button: Gtk.Button):
		""" Callback for the button to navigate to the GitHub web page of this project

		Args:
				button (Gtk.Button): Button which was clicked
		"""
		subprocess.Popen(["xdg-open", "https://github.com/TobiZog/cinnamon-dynamic-wallpaper"])


	def on_create_issue_button_clicked(self, button):
		""" Callback for the button to navigate to the Issues page on GitHub of this project

		Args:
				button (Gtk.Button): Button which was clicked
		"""
		subprocess.Popen(["xdg-open", "https://github.com/TobiZog/cinnamon-dynamic-wallpaper/issues/new"])


	def on_ok(self, *args):
		""" Callback for the OK button in the top bar
		"""
		try:
			self.on_apply()
		except:
			pass

		# Close the window
		self.on_destroy()


	def on_apply(self, *args):
		""" Callback for the Apply button in the top bar
		"""
		# Store all values to the JSON file
		self.prefs.store_preferences()

		# Use the new settings
		loop = Loop()
		loop.exchange_image()


if __name__ == "__main__":
	Preferences().show()