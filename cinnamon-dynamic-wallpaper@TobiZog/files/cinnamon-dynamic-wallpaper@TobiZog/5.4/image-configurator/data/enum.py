from enum import Enum

class Source(Enum):
	SELECTED = 0	# Load previous selected images
	EXTRACT = 1		# Use a custom image set from a heic file
	SET = 2			# Use an included image set