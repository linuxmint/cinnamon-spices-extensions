# GTK
from gi.repository import Gio, Gdk, GLib

# Packages
import os, time, locale, subprocess, getpass
from PIL import Image

# Local scripts
from service.cinnamon_pref_handler import *
from service.suntimes import *
from service.time_bar_chart import *
from service.location import *
from enums.PeriodSourceEnum import *


class Main_View_Model:
	""" The main ViewModel for the application
	"""

	def __init__(self) -> None:
		""" Initialization
		"""
		# Paths
		self.WORKING_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
		self.RES_DIR = self.WORKING_DIR + "/res"
		self.IMAGES_DIR = self.RES_DIR + "/images"
		self.GLADE_URI = self.RES_DIR + "/preferences.glade"
		self.TIMEBAR_URI = self.WORKING_DIR + "/src/time_bar.svg"
		self.TIMEBAR_URI_POLYLINES = self.WORKING_DIR + "/src/time_bar_polylines.svg"
		self.PREF_URI = os.path.expanduser("~") + \
      "/.config/cinnamon/spices/cinnamon-dynamic-wallpaper@TobiZog/cinnamon-dynamic-wallpaper@TobiZog.json"

		# Datasets
		self.image_sets = ["aurora", "beach", "bitday", "cliffs", "desert", "earth", 
										 "gradient", "island", "lake", "lakeside", "mountains", "sahara"]
		self.picture_aspects = ["centered", "scaled", "stretched", "zoom", "spanned"]
		self.network_location_provider = ["geojs.io", "ip-api.com", "ipwho.is"]

		# Objects from scripts
		self.cinnamon_prefs = Cinnamon_Pref_Handler()
		self.time_bar_chart = Time_Bar_Chart()
		self.suntimes = Suntimes()
		self.location = Location()

		self.background_settings = Gio.Settings.new("org.cinnamon.desktop.background")


		# Language support
		self.UUID = "cinnamon-dynamic-wallpaper@TobiZog"
		self.localeDir = os.path.expanduser("~") + "/.local/share/locale"
		locale.bindtextdomain(self.UUID, self.localeDir)


		# Other Variables
		self.display = Gdk.Display.get_default()
		self.screen_height = self.display.get_monitor(0).get_geometry().height
		self.breakpoint_ui = 1000


	def refresh_charts(self):
		""" Refreshes the two variants of the time bar charts
		"""
		# Stores the start times of the periods in minutes since midnight
		time_periods_min = []

		if self.cinnamon_prefs.period_source == PeriodSourceEnum.CUSTOMTIMEPERIODS:
			for i in range(0, 10):
				time_str = self.cinnamon_prefs.period_custom_start_time[i]

				time_periods_min.append(int(time_str[0:2]) * 60 + int(time_str[3:5]))
		else:
			if self.cinnamon_prefs.period_source == PeriodSourceEnum.NETWORKLOCATION:
				self.suntimes.calc_suntimes(float(self.cinnamon_prefs.latitude_auto), float(self.cinnamon_prefs.longitude_auto))
			else:
				self.suntimes.calc_suntimes(float(self.cinnamon_prefs.latitude_custom), float(self.cinnamon_prefs.longitude_custom))	

			
			# Get all time periods. Store the minutes to the list and print the values to the text views
			for i in range(0, 10):
				time_range_now = self.suntimes.day_periods[i]
				time_periods_min.append(time_range_now.hour * 60 + time_range_now.minute)


		# Create time bar
		# Reduce size for small displays
		if self.screen_height < self.breakpoint_ui:
			bar_width = 1150
			bar_height = 110
		else:
			bar_width = 1300
			bar_height = 150

		self.time_bar_chart.create_bar_chart_with_polylines(self.TIMEBAR_URI_POLYLINES, bar_width, bar_height, time_periods_min)
		self.time_bar_chart.create_bar_chart(self.TIMEBAR_URI, bar_width, bar_height, time_periods_min)

	
	def refresh_location(self) -> bool:
		""" Updating the location by IP, store the result to cinnamon_prefs
				Run it in a parallel thread to avoid UI freeze!

		Returns:
				bool: Successful or not
		"""
		current_location = self.location.get_location(self.cinnamon_prefs.network_location_provider)

		if current_location['success']:
			self.cinnamon_prefs.latitude_auto = current_location['latitude']
			self.cinnamon_prefs.longitude_auto = current_location['longitude']

		return current_location['success']
	

	def string_to_time_converter(self, raw_str: str) -> time:
		""" Convert a time string like "12:34" to a time object

		Args:
				raw_str (str): Raw string

		Returns:
				time: Time object
		"""
		hour = raw_str[0:raw_str.find(":")]
		minute = raw_str[raw_str.find(":") + 1:]

		return time(hour=int(hour), minute=int(minute))
	

	def time_to_string_converter(self, _time: time) -> str:
		""" Convert a time object to a string like "12:34"

		Args:
				time (time): Given time object to convert

		Returns:
				str: Converted string
		"""
		return "{:0>2}:{:0>2}".format(_time.hour, _time.minute)


	def calulate_time_periods(self) -> list[time]:
		""" Calculate the ten time periods based on the period source in the preferences

		Returns:
				list[time]: Time periods
		"""
		result = []

		if self.cinnamon_prefs.period_source == PeriodSourceEnum.CUSTOMTIMEPERIODS:
			# User uses custom time periods
			for i in range(0, 10):
				result.append(self.string_to_time_converter(self.cinnamon_prefs.period_custom_start_time[i]))
		else:
			# Time periods have to be estimate by coordinates
			if self.cinnamon_prefs.period_source == PeriodSourceEnum.NETWORKLOCATION:
				# Get coordinates from the network
				self.suntimes.calc_suntimes(self.cinnamon_prefs.latitude_auto, self.cinnamon_prefs.longitude_auto)

			elif self.cinnamon_prefs.period_source == PeriodSourceEnum.CUSTOMLOCATION:
				# Get coordinates from user input
				self.suntimes.calc_suntimes(self.cinnamon_prefs.latitude_custom, self.cinnamon_prefs.longitude_custom)

			# Return the time periods
			result = self.suntimes.day_periods
		
		return result


	def refresh_image(self):
		""" Replace the desktop image if needed
		"""
		start_times = self.calulate_time_periods()

		# Get the time of day
		time_now = time(datetime.now().hour, datetime.now().minute)

		# Assign the last image as fallback
		self.current_image_uri = self.cinnamon_prefs.source_folder + self.cinnamon_prefs.period_images[9]

		for i in range(0, 9):
			# Replace the image URI, if it's not the last time period of the day
			if start_times[i] <= time_now and time_now < start_times[i + 1]:
				self.current_image_uri = self.cinnamon_prefs.source_folder + self.cinnamon_prefs.period_images[i]
				break

		# Update the background
		self.background_settings['picture-uri'] = "file://" + self.current_image_uri

		# Update the login_image
		if self.cinnamon_prefs.login_image:
			# Create the folder in /tmp
			directory = '/usr/share/pixmaps/cinnamon_dynamic_wallpaper'

			if not os.path.isdir(directory):
				subprocess.run(['pkexec', 'install', '-o', getpass.getuser(), '-d', directory])
			
			# Copy the current image to the temp folder for the login screen
			os.system("cp " + self.current_image_uri + " " + directory + "/login_image.jpg")

		# Set background stretching
		self.background_settings['picture-options'] = self.cinnamon_prefs.picture_aspect

	
	def get_images_from_folder(self, URI: str) -> list:
		""" List all images in a folder

		Args:
				URI (str): Absolute path of the folder

		Returns:
				list: List of file names which are images
		"""
		items = []

		for file in os.listdir(URI):
			if file.endswith(("jpg", "jpeg", "png", "bmp", "svg")):
				items.append(file)

		items.sort()
		return items
	

	def extract_heic_file(self, file_uri: str) -> bool:
		""" Extract a heic file to an internal folder

		Args:
				file_uri (str): Absolute path to the heic file

		Returns:
				bool: Extraction was successful
		"""
		try:
			extract_folder = self.IMAGES_DIR + "/extracted_images/"

			file_name: str = file_uri[file_uri.rfind("/") + 1:]
			file_name = file_name[:file_name.rfind(".")]

			# Create the buffer folder if its not existing
			try:
				os.mkdir(extract_folder)
			except:
				pass

			# Cleanup the folder
			for file in self.get_images_from_folder(extract_folder):
				os.remove(extract_folder + file)

			# Extract the HEIC file
			print(self.get_imagemagick_prompt() + " " + file_uri + " -quality 100% " + extract_folder + file_name + ".jpg")
			os.system(self.get_imagemagick_prompt() + " " + file_uri + " -quality 100% " + extract_folder + file_name + ".jpg")

			return True
		except:
			return False


	def set_background_gradient(self):
		""" Setting a gradient background to hide images, which are not high enough
		"""
		# Load the image
		try:
			im = Image.open(self.current_image_uri)
			pix = im.load()

			# Width and height of the current setted image
			width, height = im.size

			# Color of the top and bottom pixel in the middle of the image
			top_color = pix[width / 2,0]
			bottom_color = pix[width / 2, height - 1]

			# Create the gradient
			self.background_settings['color-shading-type'] = "vertical"

			if self.cinnamon_prefs.dynamic_background_color:
				self.background_settings['primary-color'] = f"#{top_color[0]:x}{top_color[1]:x}{top_color[2]:x}"
				self.background_settings['secondary-color'] = f"#{bottom_color[0]:x}{bottom_color[1]:x}{bottom_color[2]:x}"
			else:
				self.background_settings['primary-color'] = "#000000"
				self.background_settings['secondary-color'] = "#000000"
		except:
			self.background_settings['primary-color'] = "#000000"
			self.background_settings['secondary-color'] = "#000000"


	def set_login_image(self):
		""" Writes a path to file in /tmp/cinnamon_dynamic_wallpaper to display the wallpaper on the login screen
		"""
		# New config file content
		file_content = ""

		# Location of the config file
		file_location = self.WORKING_DIR + "/slick-greeter.conf"

		if self.cinnamon_prefs.login_image:
			self.refresh_image()
			
			if os.path.isfile("/etc/lightdm/slick-greeter.conf"):
				# File already exists, make a copy of the config
				with open("/etc/lightdm/slick-greeter.conf", "r") as conf_file:
					for line in conf_file.readlines():
						if not line.startswith("background"):
							file_content += line
						elif line.endswith("cinnamon_dynamic_wallpaper/login_image.jpg"):
							# Skip the configuration. It's already perfect!
							return

			else:
				# File doesn't exists	
				file_content = "[Greeter]\n"
			
			file_content += "background=/usr/share/pixmaps/cinnamon_dynamic_wallpaper/login_image.jpg"

			# Create the file
			with open(file_location, "w") as conf_file:
				conf_file.write(file_content)
				conf_file.close()

			# Move it to /etc/lightdm
			if os.path.isfile("/etc/lightdm/slick-greeter.conf"):
				subprocess.call(['pkexec', 'mv', '/etc/lightdm/slick-greeter.conf', '/etc/lightdm/slick-greeter.conf.backup'])
				subprocess.call(['pkexec', 'mv', file_location, '/etc/lightdm/'])
			else:
				subprocess.call(['pkexec', 'mv', file_location, '/etc/lightdm/'])

		else:
			self.reset_login_image()


	def reset_login_image(self):
		if os.path.isfile('/etc/lightdm/slick-greeter.conf.backup'):
			subprocess.call(['pkexec', 'rm', '/etc/lightdm/slick-greeter.conf'])
			subprocess.call(['pkexec', 'mv', '/etc/lightdm/slick-greeter.conf.backup', '/etc/lightdm/slick-greeter.conf'])


	def check_for_imagemagick(self) -> bool:
		# Imagemagick < v.7.0
		if GLib.find_program_in_path("convert") != None:
			return True
		# Imagemagick >= v.7.0
		elif GLib.find_program_in_path("imagemagick") != None:
			return True
		# Not installed
		else:
			return False
		
	def get_imagemagick_prompt(self) -> str:
		# Imagemagick < v.7.0
		if GLib.find_program_in_path("convert") != None:
			return "convert"
		# Imagemagick >= v.7.0
		elif GLib.find_program_in_path("imagemagick") != None:
			return "imagemagick convert"
		
