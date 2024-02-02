import os

class Images:
	""" Class for image operations
	"""
	def __init__(self) -> None:
		pass


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
			extract_folder = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir)) + \
				"/images/extracted_images/"

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
			os.system("heif-convert '" + file_uri + "' '" + extract_folder + file_name + ".jpg'")

			return True
		except:
			return False
