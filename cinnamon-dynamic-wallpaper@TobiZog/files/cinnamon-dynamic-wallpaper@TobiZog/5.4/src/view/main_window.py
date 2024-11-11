############################################################
#                         Imports                          #
############################################################

# GTK
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GdkPixbuf

# Packages
import subprocess, threading, time
from datetime import timedelta, datetime

# Local scripts
from model.main_view_model import *
from view.dialogs import *
from enums.ImageSourceEnum import *
from enums.PeriodSourceEnum import *


class Main_Window:
	############################################################
	#                         Lifecycle                        #
	############################################################

	def __init__(self) -> None:
		""" Initialize all UI components which should be handleable

		Args:
				builder (Gtk.Builder): Gtk self.builder resource
		"""
		# View Model
		self.view_model = Main_View_Model()

		# Glade
		self.builder = Gtk.Builder()
		self.builder.set_translation_domain(self.view_model.UUID)
		self.builder.add_from_file(self.view_model.GLADE_URI)
		self.builder.connect_signals(self)


		# Objects from scripts
		self.dialogs = Dialogs()



    # Page 1: Image Configuration
		# Toggle Buttons
		self.tb_image_set: Gtk.ToggleButton = self.builder.get_object("tb_image_set")
		self.tb_heic_file: Gtk.ToggleButton = self.builder.get_object("tb_heic_file")
		self.tb_source_folder: Gtk.ToggleButton = self.builder.get_object("tb_source_folder")
		self.img_tb_image_set: Gtk.Image = self.builder.get_object("img_tb_image_set")
		self.img_tb_heic_file: Gtk.Image = self.builder.get_object("img_tb_heic_file")
		self.img_tb_source_folder: Gtk.Image = self.builder.get_object("img_tb_source_folder")

		# Image set
		self.lbr_image_set: Gtk.ListBoxRow = self.builder.get_object("lbr_image_set")
		self.cb_image_set: Gtk.ComboBox = self.builder.get_object("cb_image_set")

		# HEIC file		
		self.lbr_heic_file: Gtk.ListBoxRow = self.builder.get_object("lbr_heic_file")

		# Source folder
		self.lbr_source_folder: Gtk.ListBoxRow = self.builder.get_object("lbr_source_folder")
		self.btn_source_folder: Gtk.Button = self.builder.get_object("btn_source_folder")
		self.lbl_source_folder: Gtk.Label = self.builder.get_object("lbl_source_folder")

		# Time bar chart
		self.img_bar_images: Gtk.Image = self.builder.get_object("img_bar_images")
		self.etr_periods: list[Gtk.Label] = [
			self.builder.get_object("etr_period_1"), self.builder.get_object("etr_period_2"),
			self.builder.get_object("etr_period_3"), self.builder.get_object("etr_period_4"),
			self.builder.get_object("etr_period_5"), self.builder.get_object("etr_period_6"),
			self.builder.get_object("etr_period_7"), self.builder.get_object("etr_period_8"),
			self.builder.get_object("etr_period_9"), self.builder.get_object("etr_period_10"),
		]

		self.img_periods: list[Gtk.Image] = [
			self.builder.get_object("img_period_0"), self.builder.get_object("img_period_1"),
			self.builder.get_object("img_period_2"), self.builder.get_object("img_period_3"),
			self.builder.get_object("img_period_4"), self.builder.get_object("img_period_5"),
			self.builder.get_object("img_period_6"), self.builder.get_object("img_period_7"),
			self.builder.get_object("img_period_8"), self.builder.get_object("img_period_9"),
		]

		self.cb_periods: list[Gtk.ComboBox] = [
			self.builder.get_object("cb_period_0"), self.builder.get_object("cb_period_1"), 
			self.builder.get_object("cb_period_2"), self.builder.get_object("cb_period_3"), 
			self.builder.get_object("cb_period_4"), self.builder.get_object("cb_period_5"), 
			self.builder.get_object("cb_period_6"), self.builder.get_object("cb_period_7"), 
			self.builder.get_object("cb_period_8"), self.builder.get_object("cb_period_9"), 
		]


		#### Page 2: Location & Times
		# Toggle Buttons
		self.tb_network_location: Gtk.ToggleButton = self.builder.get_object("tb_network_location")
		self.tb_custom_location: Gtk.ToggleButton = self.builder.get_object("tb_custom_location")
		self.tb_time_periods: Gtk.ToggleButton = self.builder.get_object("tb_time_periods")
		self.img_tb_network_location: Gtk.Image = self.builder.get_object("img_tb_network_location")
		self.img_tb_custom_location: Gtk.Image = self.builder.get_object("img_tb_custom_location")
		self.img_tb_time_periods: Gtk.Image = self.builder.get_object("img_tb_time_periods")

		# Network Location
		self.lbr_network_refresh_time: Gtk.ListBoxRow = self.builder.get_object("lbr_network_refresh_time")
		self.spb_network_refresh_time: Gtk.SpinButton = self.builder.get_object("spb_network_refresh_time")
		self.lbr_network_provider: Gtk.ListBoxRow = self.builder.get_object("lbr_network_provider")
		self.cb_network_provider: Gtk.ComboBox = self.builder.get_object("cb_network_provider")
		self.lbr_current_location: Gtk.ListBoxRow = self.builder.get_object("lbr_current_location")
		self.lb_current_location: Gtk.Label = self.builder.get_object("lb_current_location")

		# Custom location
		self.lbr_custom_location_longitude: Gtk.ListBoxRow = self.builder.get_object("lbr_custom_location_longitude")
		self.lbr_custom_location_latitude: Gtk.ListBoxRow = self.builder.get_object("lbr_custom_location_latitude")
		self.lbr_time_periods: Gtk.ListBoxRow = self.builder.get_object("lbr_time_periods")
		self.etr_longitude: Gtk.Entry = self.builder.get_object("etr_longitude")
		self.etr_latitude: Gtk.Entry = self.builder.get_object("etr_latitude")
		self.img_bar_times: Gtk.Image = self.builder.get_object("img_bar_times")
		self.spb_periods_hour: list[Gtk.SpinButton] = [
			self.builder.get_object("spb_period_1_hour"),
			self.builder.get_object("spb_period_2_hour"),
			self.builder.get_object("spb_period_3_hour"),
			self.builder.get_object("spb_period_4_hour"),
			self.builder.get_object("spb_period_5_hour"),
			self.builder.get_object("spb_period_6_hour"),
			self.builder.get_object("spb_period_7_hour"),
			self.builder.get_object("spb_period_8_hour"),
			self.builder.get_object("spb_period_9_hour"),
		]
		self.spb_periods_minute: list[Gtk.SpinButton] = [
			self.builder.get_object("spb_period_1_minute"),
			self.builder.get_object("spb_period_2_minute"),
			self.builder.get_object("spb_period_3_minute"),
			self.builder.get_object("spb_period_4_minute"),
			self.builder.get_object("spb_period_5_minute"),
			self.builder.get_object("spb_period_6_minute"),
			self.builder.get_object("spb_period_7_minute"),
			self.builder.get_object("spb_period_8_minute"),
			self.builder.get_object("spb_period_9_minute")
		]
		self.lb_period_end: list[Gtk.Label] = [
			self.builder.get_object("lb_period_0_end"), self.builder.get_object("lb_period_1_end"),
			self.builder.get_object("lb_period_2_end"), self.builder.get_object("lb_period_3_end"),
			self.builder.get_object("lb_period_4_end"), self.builder.get_object("lb_period_5_end"),
			self.builder.get_object("lb_period_6_end"), self.builder.get_object("lb_period_7_end"),
			self.builder.get_object("lb_period_8_end"), self.builder.get_object("lb_period_9_end"), 
		]


		# Page 3: Behaviour
		self.cb_picture_aspect: Gtk.ComboBox = self.builder.get_object("cb_picture_aspect")
		self.sw_dynamic_background_color: Gtk.Switch = self.builder.get_object("sw_dynamic_background_color")
		self.sw_login_image: Gtk.Switch = self.builder.get_object("sw_login_image")


	def show(self):
		""" Display the window to the screen
		"""
		self.builder.get_object("window_main").show_all()

		# Smaller UI handling
		if self.view_model.screen_height < self.view_model.breakpoint_ui:
			self.img_tb_image_set.clear()
			self.img_tb_heic_file.clear()
			self.img_tb_source_folder.clear()
			self.img_tb_network_location.clear()
			self.img_tb_custom_location.clear()
			self.img_tb_time_periods.clear()

		# Page 1: Image Configuration
		self.add_items_to_combo_box(self.cb_image_set, self.view_model.image_sets)
		self.image_source = self.image_source  # This triggers the @image_source.setter

		## Disable the HEIF-Converter option, if the plugin isn't installed
		if not self.view_model.check_for_imagemagick():
			self.tb_heic_file.set_sensitive(False)
		else:
			## Remove the Tooltip
			self.tb_heic_file.set_tooltip_text("")

		# Page 2: Location & Times
		self.add_items_to_combo_box(self.cb_network_provider, self.view_model.network_location_provider)
		self.period_source = self.period_source	# This triggers the  @period_source.setter

		# Page 3: Behaviour
		self.add_items_to_combo_box(self.cb_picture_aspect, self.view_model.picture_aspects)
		self.set_active_combobox_item(self.cb_picture_aspect, self.view_model.cinnamon_prefs.picture_aspect)
		self.sw_dynamic_background_color.set_active(self.view_model.cinnamon_prefs.dynamic_background_color)
		self.sw_login_image.set_active(self.view_model.cinnamon_prefs.login_image)


		# Show the main window
		Gtk.main()


	############################################################
	#                        Observer                          #
	############################################################
	

	@property
	def selected_image_set(self):
		return self.view_model.cinnamon_prefs.selected_image_set
	
	@selected_image_set.setter
	def selected_image_set(self, new_value):
		# Save to the preferences
		self.view_model.cinnamon_prefs.selected_image_set = new_value

		# Refresh images
		image_names = self.view_model.get_images_from_folder(self.view_model.cinnamon_prefs.source_folder)
		self.load_image_options_to_combo_boxes(image_names)

		# Image sets have the same names for the images:
		# 9.jpg = Period 0
		# 1.jpg = Period 1
		# 2.jpg = Period 2...
		for i in range(0, 10):
			self.cb_periods[i].set_active(i + 1)


	@property
	def image_source(self):
		return self.view_model.cinnamon_prefs.image_source
	
	@image_source.setter
	def image_source(self, new_value):
		self.view_model.cinnamon_prefs.image_source = new_value

		# Disable the wrong ToggleButtons
		self.tb_image_set.set_active(new_value == ImageSourceEnum.IMAGESET)
		self.tb_heic_file.set_active(new_value == ImageSourceEnum.HEICFILE)
		self.tb_source_folder.set_active(new_value == ImageSourceEnum.SOURCEFOLDER)

		# Show or hide ListBoxRows
		self.lbr_image_set.set_visible(new_value == ImageSourceEnum.IMAGESET)
		self.lbr_heic_file.set_visible(new_value == ImageSourceEnum.HEICFILE)
		self.lbr_source_folder.set_visible(new_value == ImageSourceEnum.SOURCEFOLDER)

		# Make the comboboxes invisible
		for combobox in self.cb_periods:
			combobox.set_visible(new_value != ImageSourceEnum.IMAGESET)


	@property
	def period_source(self):
		return self.view_model.cinnamon_prefs.period_source


	@period_source.setter
	def period_source(self, new_value):
		self.view_model.cinnamon_prefs.period_source = new_value

		self.tb_network_location.set_active(new_value == PeriodSourceEnum.NETWORKLOCATION)
		self.tb_custom_location.set_active(new_value == PeriodSourceEnum.CUSTOMLOCATION)
		self.tb_time_periods.set_active(new_value == PeriodSourceEnum.CUSTOMTIMEPERIODS)

		# Show/Hide the right ListBoxRows
		self.lbr_network_refresh_time.set_visible(new_value == PeriodSourceEnum.NETWORKLOCATION)
		self.lbr_network_provider.set_visible(new_value == PeriodSourceEnum.NETWORKLOCATION)
		self.lbr_current_location.set_visible(new_value == PeriodSourceEnum.NETWORKLOCATION)
		self.lbr_custom_location_longitude.set_visible(new_value == PeriodSourceEnum.CUSTOMLOCATION)
		self.lbr_custom_location_latitude.set_visible(new_value == PeriodSourceEnum.CUSTOMLOCATION)
		self.lbr_time_periods.set_visible(new_value == PeriodSourceEnum.CUSTOMTIMEPERIODS)

		self.refresh_charts_and_times()




	############################################################
	#													UI Helper											 	 #
	############################################################

	def set_active_combobox_item(self, combobox: Gtk.ComboBox, active_item: str):
		""" Change active item in combobox by String value

		Args:
				combobox (Gtk.ComboBoxText): ComboBox to set active
				active_item (str): String item to set active
		"""
		list_store = combobox.get_model()

		for i in range(0, len(list_store)):
			row = list_store[i]
			if row[0] == active_item:
				combobox.set_active(i)


	def get_active_combobox_item(self, combobox: Gtk.ComboBox) -> str:
		""" Request the current selected combobox label

		Args:
				combobox (Gtk.ComboBox): ComboBox where to get value from

		Returns:
				str: Selected value
		"""
		tree_iter = combobox.get_active_iter()

		model = combobox.get_model()
		return model[tree_iter][0]


	def add_items_to_combo_box(self, combobox: Gtk.ComboBox, items: list):
		""" Add items to a combo box

		Args:
				combobox (Gtk.ComboBox): ComboBox where to add the options
				items (list): Possible options
		"""
		model = combobox.get_model()
		store = Gtk.ListStore(str)

		for image_set in items:
			store.append([image_set])

		combobox.set_model(store)

		if model == None:
			renderer_text = Gtk.CellRendererText()
			combobox.pack_start(renderer_text, True)
			combobox.add_attribute(renderer_text, "text", 0)


	def load_image_options_to_combo_boxes(self, options: list):
		""" Add a list of Strings to all image option comboboxes

		Args:
				options (list): All possible options
		"""
		options.insert(0, "")

		for combobox in self.cb_periods:
			self.add_items_to_combo_box(combobox, options)


	def load_image_to_preview(self, image_preview: Gtk.Image, image_src: str):
		""" Scales the image to a lower resoultion and put them into the time bar chart

		Args:
				image_preview (Gtk.Image): Gtk Image where it will be displayed
				image_src (str): Absolute path to the image
		"""
		try:
			pixbuf = GdkPixbuf.Pixbuf.new_from_file(image_src)

			# Scaling the images for smaller screens
			if self.view_model.screen_height < self.view_model.breakpoint_ui:
				pixbuf = pixbuf.scale_simple(221, 128, GdkPixbuf.InterpType.BILINEAR)
			else:
				pixbuf = pixbuf.scale_simple(260, 150, GdkPixbuf.InterpType.BILINEAR)

			image_preview.set_from_pixbuf(pixbuf)
		except:
			pass


	def refresh_charts_and_times(self):
		""" Refresh the charts and put them to the image views
		"""
		self.view_model.refresh_charts()
		start_times = self.view_model.calulate_time_periods()

		for i in range(0, 10):
			label_txt = self.view_model.time_to_string_converter(start_times[i]) + " - "

			if i != 9:
				diff = timedelta(hours=start_times[i + 1].hour, minutes=start_times[i + 1].minute) - timedelta(minutes=1)
				prev_time = time(hour=diff.seconds // 3600, minute=diff.seconds // 60 % 60)
				label_txt += self.view_model.time_to_string_converter(prev_time)
			else:
				label_txt += "23:59"

			self.etr_periods[i].set_text(label_txt)

		# Load to the views
		pixbuf = GdkPixbuf.Pixbuf.new_from_file(self.view_model.TIMEBAR_URI_POLYLINES)
		self.img_bar_images.set_from_pixbuf(pixbuf)

		pixbuf2 = GdkPixbuf.Pixbuf.new_from_file(self.view_model.TIMEBAR_URI)
		self.img_bar_times.set_from_pixbuf(pixbuf2)




	############################################################
	#													Callbacks											 	 #
	############################################################

	# +-----------+-----------+---------------+
	# | Image Set | HEIC file | Source Folder |
	# +-----------+-----------+---------------+

	def on_toggle_button_image_set_clicked(self, button: Gtk.ToggleButton):
		""" Clicked on ToggleButton "Image Set"

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.image_source = ImageSourceEnum.IMAGESET

			self.set_active_combobox_item(self.cb_image_set, self.selected_image_set)

			for i, combobox in enumerate(self.cb_periods):
				selected_image_name = self.view_model.cinnamon_prefs.period_images[i]
				self.set_active_combobox_item(combobox, selected_image_name)

	
	def on_toggle_button_heic_file_clicked(self, button: Gtk.ToggleButton):
		""" Clicked on ToggleButton "Heic file"

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.image_source = ImageSourceEnum.HEICFILE

			# Load images from source folder
			files = self.view_model.get_images_from_folder(self.view_model.cinnamon_prefs.source_folder)

			if len(files) != 0:
				self.load_image_options_to_combo_boxes(files)

				# Load the values for the images from the preferences
				for i in range(0, 10):
					self.set_active_combobox_item(self.cb_periods[i], self.view_model.cinnamon_prefs.period_images[i])
			else:
				print("No image files!")


	def on_toggle_button_source_folder_clicked(self, button: Gtk.ToggleButton):
		""" Clicked on ToggleButton "Source Folder"

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.image_source = ImageSourceEnum.SOURCEFOLDER

			# Load the source folder to the view
			# This will update the comboboxes in the preview to contain the right items
			self.lbl_source_folder.set_label(self.view_model.cinnamon_prefs.source_folder)

			# Load files from saved source folder
			files = self.view_model.get_images_from_folder(self.view_model.cinnamon_prefs.source_folder)

			if len(files) != 0:
				self.load_image_options_to_combo_boxes(files)

				# Load the values for the images from the preferences
				for i in range(0, 10):
					self.set_active_combobox_item(self.cb_periods[i], self.view_model.cinnamon_prefs.period_images[i])
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
		if self.view_model.cinnamon_prefs.image_source == ImageSourceEnum.IMAGESET:
			# Get the selected value
			selected_image_set = self.get_active_combobox_item(combobox)

			# Store to the preferences
			self.view_model.cinnamon_prefs.source_folder = \
				self.view_model.IMAGES_DIR + "/included_image_sets/" + selected_image_set + "/"
			
			self.selected_image_set = selected_image_set
	

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
		result = self.view_model.extract_heic_file(file_path)

		# Update the preferences
		self.view_model.cinnamon_prefs.selected_image_set = ""
		self.view_model.cinnamon_prefs.source_folder = self.view_model.IMAGES_DIR + "/extracted_images/"

		# Load images only if the extraction was successfully
		if result:
			# Collect all extracted images and push them to the comboboxes
			image_names = self.view_model.get_images_from_folder(self.view_model.cinnamon_prefs.source_folder)
			self.load_image_options_to_combo_boxes(image_names)
		else:
			self.dialogs.message_dialog("Error during extraction!", Gtk.MessageType.ERROR)


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
		files = self.view_model.get_images_from_folder(folder)

		# Update the preferences
		self.view_model.cinnamon_prefs.selected_image_set = ""
		self.view_model.cinnamon_prefs.source_folder = folder + "/"

		# Update the label
		self.lbl_source_folder.set_label(folder)

		# Update the image comboboxes
		self.load_image_options_to_combo_boxes(files)

		# Load the values for the images from the preferences
		for i in range(0, 10):
			self.cb_periods[i].set_active(0)

		if len(files) == 1:
			self.dialogs.message_dialog("No image files found!")
	

	def on_cb_period_preview_changed(self, combobox: Gtk.ComboBox):
		""" User select an image from the ComboBox for the time period

		Args:
				combobox (Gtk.ComboBox): The used ComboBox
		"""
		combobox_name = Gtk.Buildable.get_name(combobox)
		period_index = int(combobox_name[10:11])

		# Get the selected value
		image_file_name = self.get_active_combobox_item(combobox)

		# Store selection to preferences
		self.view_model.cinnamon_prefs.period_images[period_index] = image_file_name

		# Build up image path
		image_path = self.view_model.cinnamon_prefs.source_folder + image_file_name

		self.load_image_to_preview(self.img_periods[period_index], image_path)
	

	## Location & Times

	def on_toggle_button_network_location_clicked(self, button: Gtk.ToggleButton):
		""" User clicks on the ToggleButton for the network location

		Args:
				button (Gtk.ToggleButton): Clicked ToggleButton
		"""
		if button.get_active():
			self.period_source = PeriodSourceEnum.NETWORKLOCATION

			self.spb_network_refresh_time.set_value(self.view_model.cinnamon_prefs.location_refresh_intervals)
			self.set_active_combobox_item(self.cb_network_provider, self.view_model.cinnamon_prefs.network_location_provider)


	def on_toggle_button_custom_location_clicked(self, button: Gtk.ToggleButton):
		if button.get_active():
			self.period_source = PeriodSourceEnum.CUSTOMLOCATION

			self.etr_latitude.set_text(str(self.view_model.cinnamon_prefs.latitude_custom))
			self.etr_longitude.set_text(str(self.view_model.cinnamon_prefs.longitude_custom))


	def on_toggle_button_time_periods_clicked(self, button: Gtk.ToggleButton):
		if button.get_active():
			self.period_source = PeriodSourceEnum.CUSTOMTIMEPERIODS
			
			for i in range(0, 9):
				pref_value = self.view_model.cinnamon_prefs.period_custom_start_time[i + 1]
				time_parts = [int(pref_value[0:pref_value.find(":")]), int(pref_value[pref_value.find(":") + 1:])]

				self.spb_periods_hour[i].set_value(time_parts[0])
				self.spb_periods_minute[i].set_value(time_parts[1])


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
		time_current_start = datetime(2024,1,1, int(self.spb_periods_hour[index].get_value()), int(self.spb_periods_minute[index].get_value()))
		time_current_start_str = str(time_current_start.hour).rjust(2, '0') + ":" + str(time_current_start.minute).rjust(2, '0')

		self.view_model.cinnamon_prefs.period_custom_start_time[index + 1] = time_current_start_str
		

		time_previous_end = time_current_start - timedelta(minutes=1)
		self.lb_period_end[index].set_text(str(time_previous_end.hour).rjust(2, '0') + ":" + str(time_previous_end.minute).rjust(2, '0'))


		self.refresh_charts_and_times()


	def on_spb_network_location_refresh_time_changed(self, spin_button: Gtk.SpinButton):
		""" User changed the refresh time of network location estimation

		Args:
				spin_button (Gtk.SpinButton): The used SpinButton
		"""
		self.view_model.cinnamon_prefs.location_refresh_intervals = spin_button.get_value()


	def on_cb_network_provider_changed(self, combobox: Gtk.ComboBox):
		""" User changed the provider to estimate the location

		Args:
				combobox (Gtk.ComboBox): The used ComboBox
		"""
		def network_refresh_thread():
			success = self.view_model.refresh_location()

			if success:
				self.lb_current_location.set_text(\
					"Latitude: " + str(self.view_model.cinnamon_prefs.latitude_auto) + ", Longitude: " + str(self.view_model.cinnamon_prefs.longitude_auto))
			else:
				self.dialogs.message_dialog("Error during fetching location. Are you connected to the network?", Gtk.MessageType.ERROR)
				self.lb_current_location.set_text("Latitude: ?, Longitude: ?")


		self.view_model.cinnamon_prefs.network_location_provider = self.get_active_combobox_item(combobox)

		thread = threading.Thread(target=network_refresh_thread)
		thread.start()


	def on_etr_longitude_changed(self, entry: Gtk.Entry):
		""" User changes the value of the longitude Entry

		Args:
				entry (Gtk.Entry): The manipulated Entry object
		"""
		try:
			self.view_model.cinnamon_prefs.longitude_custom = float(entry.get_text())
			self.refresh_charts_and_times()
		except:
			pass


	def on_etr_latitude_changed(self, entry: Gtk.Entry):
		""" User changes the value of the latitude Entry

		Args:
				entry (Gtk.Entry): The manipulated Entry object
		"""
		try:
			self.view_model.cinnamon_prefs.latitude_custom = float(entry.get_text())
			self.refresh_charts_and_times()
		except:
			pass


	# Behaviour
	
	def on_cb_picture_aspect_changed(self, combobox: Gtk.ComboBox):
		""" User changes the value for the picture aspect ratio

		Args:
				combobox (Gtk.ComboBox): The used ComboBox
		"""
		self.view_model.cinnamon_prefs.picture_aspect = self.get_active_combobox_item(combobox)


	def on_sw_dynamic_background_color_state_set(self, _: Gtk.Switch, state: bool):
		""" User switches dynamic background on or off

		Args:
				_ (Gtk.Switch): Used Switch
				state (bool): Current state
		"""
		self.view_model.cinnamon_prefs.dynamic_background_color = state

	
	def on_sw_login_image_state_set(self, _: Gtk.Switch, state: bool):
		""" User switches login background image on or off

		Args:
				_ (Gtk.Switch): Used Switch
				state (bool): Current state
		"""
		self.view_model.cinnamon_prefs.login_image = state


	# About

	def on_cinnamon_spices_website_button_clicked(self, _: Gtk.Button):
		""" Callback for the button to navigate to the Cinnamon Spices web page of this project

		Args:
				button (Gtk.Button): Button which was clicked
		"""
		subprocess.Popen(["xdg-open", "https://cinnamon-spices.linuxmint.com/extensions/view/97"])


	def on_github_website_button_clicked(self, _: Gtk.Button):
		""" Callback for the button to navigate to the GitHub web page of this project

		Args:
				button (Gtk.Button): Button which was clicked
		"""
		subprocess.Popen(["xdg-open", "https://github.com/TobiZog/cinnamon-dynamic-wallpaper"])


	def on_create_issue_button_clicked(self, _: Gtk.Button):
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
			self.dialogs.message_dialog(
				"Error on apply the settings. Please check the settings and contact the developer.", 
				Gtk.MessageType.ERROR
			)

		# Close the window
		self.on_destroy()


	def on_apply(self, *args):
		""" Callback for the Apply button in the top bar
		"""
		# Store all values to the JSON file
		self.view_model.cinnamon_prefs.store_preferences()

		# Use the new settings
		self.view_model.refresh_image()
		self.view_model.set_background_gradient()
		self.view_model.set_login_image()


	def on_destroy(self, *args):
		""" Lifecycle handler when window will be destroyed
		"""
		Gtk.main_quit()