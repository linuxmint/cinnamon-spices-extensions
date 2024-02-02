import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

class UI:
	""" Class to handle UI components and actions
	"""
	def __init__(self, builder: Gtk.Builder) -> None:
    # Page 1
		self.tb_image_set: Gtk.ToggleButton = builder.get_object("tb_image_set")
		self.tb_heic_file: Gtk.ToggleButton = builder.get_object("tb_heic_file")
		self.tb_source_folder: Gtk.ToggleButton = builder.get_object("tb_source_folder")
		self.img_tb_image_set: Gtk.Image = builder.get_object("img_tb_image_set")
		self.img_tb_heic_file: Gtk.Image = builder.get_object("img_tb_heic_file")
		self.img_tb_source_folder: Gtk.Image = builder.get_object("img_tb_source_folder")

		# Image set
		self.lbr_image_set: Gtk.ListBoxRow = builder.get_object("lbr_image_set")
		self.cb_image_set: Gtk.ComboBox = builder.get_object("cb_image_set")

		# HEIC file		
		self.lbr_heic_file: Gtk.ListBoxRow = builder.get_object("lbr_heic_file")

		# Source folder
		self.lbr_source_folder: Gtk.ListBoxRow = builder.get_object("lbr_source_folder")
		self.btn_source_folder: Gtk.Button = builder.get_object("btn_source_folder")
		self.lbl_source_folder: Gtk.Label = builder.get_object("lbl_source_folder")

		# Time bar chart
		self.img_bar_images: Gtk.Image = builder.get_object("img_bar_images")
		self.etr_periods: list[Gtk.Entry] = [
			builder.get_object("etr_period_1"), builder.get_object("etr_period_2"),
			builder.get_object("etr_period_3"), builder.get_object("etr_period_4"),
			builder.get_object("etr_period_5"), builder.get_object("etr_period_6"),
			builder.get_object("etr_period_7"), builder.get_object("etr_period_8"),
			builder.get_object("etr_period_9"), builder.get_object("etr_period_10"),
		]

		self.img_periods: list[Gtk.Image] = [
			builder.get_object("img_period_0"), builder.get_object("img_period_1"),
			builder.get_object("img_period_2"), builder.get_object("img_period_3"),
			builder.get_object("img_period_4"), builder.get_object("img_period_5"),
			builder.get_object("img_period_6"), builder.get_object("img_period_7"),
			builder.get_object("img_period_8"), builder.get_object("img_period_9"),
		]

		self.cb_periods: list[Gtk.ComboBox] = [
			builder.get_object("cb_period_0"), builder.get_object("cb_period_1"), 
			builder.get_object("cb_period_2"), builder.get_object("cb_period_3"), 
			builder.get_object("cb_period_4"), builder.get_object("cb_period_5"), 
			builder.get_object("cb_period_6"), builder.get_object("cb_period_7"), 
			builder.get_object("cb_period_8"), builder.get_object("cb_period_9"), 
		]



		#### Page 2: Location & Times
		self.tb_network_location: Gtk.ToggleButton = builder.get_object("tb_network_location")
		self.tb_custom_location: Gtk.ToggleButton = builder.get_object("tb_custom_location")
		self.tb_time_periods: Gtk.ToggleButton = builder.get_object("tb_time_periods")
		self.img_tb_network_location: Gtk.Image = builder.get_object("img_tb_network_location")
		self.img_tb_custom_location: Gtk.Image = builder.get_object("img_tb_custom_location")
		self.img_tb_time_periods: Gtk.Image = builder.get_object("img_tb_time_periods")

		# Network Location
		self.lb_current_location: Gtk.Label = builder.get_object("lb_current_location")
		self.lbr_current_location: Gtk.ListBoxRow = builder.get_object("lbr_current_location")
		self.lbr_network_location: Gtk.ListBoxRow = builder.get_object("lbr_network_location")
		self.spb_network_location_refresh_time: Gtk.SpinButton = builder.get_object("spb_network_location_refresh_time")

		# Custom location
		self.lbr_custom_location_longitude: Gtk.ListBoxRow = builder.get_object("lbr_custom_location_longitude")
		self.lbr_custom_location_latitude: Gtk.ListBoxRow = builder.get_object("lbr_custom_location_latitude")
		self.lbr_time_periods: Gtk.ListBoxRow = builder.get_object("lbr_time_periods")
		self.etr_longitude: Gtk.Entry = builder.get_object("etr_longitude")
		self.etr_latitude: Gtk.Entry = builder.get_object("etr_latitude")
		self.img_bar_times: Gtk.Image = builder.get_object("img_bar_times")
		self.spb_periods_hour: list[Gtk.SpinButton] = [
			builder.get_object("spb_period_1_hour"),
			builder.get_object("spb_period_2_hour"),
			builder.get_object("spb_period_3_hour"),
			builder.get_object("spb_period_4_hour"),
			builder.get_object("spb_period_5_hour"),
			builder.get_object("spb_period_6_hour"),
			builder.get_object("spb_period_7_hour"),
			builder.get_object("spb_period_8_hour"),
			builder.get_object("spb_period_9_hour"),
		]
		self.spb_periods_minute: list[Gtk.SpinButton] = [
			builder.get_object("spb_period_1_minute"),
			builder.get_object("spb_period_2_minute"),
			builder.get_object("spb_period_3_minute"),
			builder.get_object("spb_period_4_minute"),
			builder.get_object("spb_period_5_minute"),
			builder.get_object("spb_period_6_minute"),
			builder.get_object("spb_period_7_minute"),
			builder.get_object("spb_period_8_minute"),
			builder.get_object("spb_period_9_minute")
		]
		self.lb_period_end: list[Gtk.Label] = [
			builder.get_object("lb_period_0_end"), builder.get_object("lb_period_1_end"),
			builder.get_object("lb_period_2_end"), builder.get_object("lb_period_3_end"),
			builder.get_object("lb_period_4_end"), builder.get_object("lb_period_5_end"),
			builder.get_object("lb_period_6_end"), builder.get_object("lb_period_7_end"),
			builder.get_object("lb_period_8_end"), builder.get_object("lb_period_9_end"), 
		]


		# Page 3: Behaviour
		self.cb_picture_aspect: Gtk.ComboBox = builder.get_object("cb_picture_aspect")
		self.sw_dynamic_background_color: Gtk.Switch = builder.get_object("sw_dynamic_background_color")


	def set_active_combobox_item(self, combobox: Gtk.ComboBoxText, active_item: str):
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
