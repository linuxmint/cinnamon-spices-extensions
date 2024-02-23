import os, json

class Cinnamon_Pref_Handler:
  """ Class to work with the Cinnamon Extension preference format
  """
  def __init__(self) -> None:
    # Location of the Cinnamon preference file since Cinnamon 5.4
    self.pref_location = os.path.expanduser("~") + \
      "/.config/cinnamon/spices/cinnamon-dynamic-wallpaper@TobiZog/cinnamon-dynamic-wallpaper@TobiZog.json"
    
    self.load_preferences()

  
  def extract_json(self, parameter: str) -> any:
    """ Get a parameter from the json dictionary safely

    Args:
        parameter (str): Parameter to request

    Returns:
        str: Value of the parameter (or "" if not existing)
    """
    try:
      return self.pref_data[parameter]['value']
    except:
      return ""


  def load_preferences(self):
    """ Load the JSON preferences to the Preference object
    """
    with open(self.pref_location, "r") as pref_file:
      self.pref_data = json.load(pref_file)
    
    self.first_start = self.extract_json('first_start')
    self.picture_aspect = self.extract_json('picture_aspect')
    self.dynamic_background_color = self.extract_json('dynamic_background_color')
    self.image_source = self.extract_json('image_source')
    self.selected_image_set = self.extract_json('selected_image_set')
    self.source_folder = self.extract_json('source_folder')

    self.period_images = [
      self.extract_json('period_0_image'),
      self.extract_json('period_1_image'),
      self.extract_json('period_2_image'),
      self.extract_json('period_3_image'),
      self.extract_json('period_4_image'),
      self.extract_json('period_5_image'),
      self.extract_json('period_6_image'),
      self.extract_json('period_7_image'),
      self.extract_json('period_8_image'),
      self.extract_json('period_9_image')
    ]

    self.period_source = self.extract_json('period_source')
    self.location_refresh_intervals = self.extract_json('location_refresh_intervals')
    self.network_location_provider = self.extract_json('network_location_provider')
    self.latitude_auto = self.extract_json('latitude_auto')
    self.longitude_auto = self.extract_json('longitude_auto')
    self.latitude_custom = self.extract_json('latitude_custom')
    self.longitude_custom = self.extract_json('longitude_custom')

    self.period_custom_start_time = [
      self.extract_json('period_0_custom_start_time'),
      self.extract_json('period_1_custom_start_time'),
      self.extract_json('period_2_custom_start_time'),
      self.extract_json('period_3_custom_start_time'),
      self.extract_json('period_4_custom_start_time'),
      self.extract_json('period_5_custom_start_time'),
      self.extract_json('period_6_custom_start_time'),
      self.extract_json('period_7_custom_start_time'),
      self.extract_json('period_8_custom_start_time'),
      self.extract_json('period_9_custom_start_time')
    ]

    self.login_image = self.extract_json('login_image')


  def value_to_json(self, parameter: str, value: str):
    """ Storing safely a value to the dictionary

    Args:
        parameter (str): Parameter to write
        value (str): Value to write
    """
    try:
      self.pref_data[parameter]['value'] = value
    except:
      self.pref_data[parameter] = { 
        'type': 'generic',
        'value': value 
      }
      print(self.pref_data)


  def store_preferences(self):
    """ Store the values of the Preference object to the JSON file
    """
    self.value_to_json('first_start', self.first_start)
    self.value_to_json('picture_aspect', self.picture_aspect)
    self.value_to_json('dynamic_background_color', self.dynamic_background_color)
    self.value_to_json('image_source', self.image_source)
    self.value_to_json('selected_image_set', self.selected_image_set)
    self.value_to_json('source_folder', self.source_folder)
    self.value_to_json('period_0_image', self.period_images[0])
    self.value_to_json('period_1_image', self.period_images[1])
    self.value_to_json('period_2_image', self.period_images[2])
    self.value_to_json('period_3_image', self.period_images[3])
    self.value_to_json('period_4_image', self.period_images[4])
    self.value_to_json('period_5_image', self.period_images[5])
    self.value_to_json('period_6_image', self.period_images[6])
    self.value_to_json('period_7_image', self.period_images[7])
    self.value_to_json('period_8_image', self.period_images[8])
    self.value_to_json('period_9_image', self.period_images[9])
    self.value_to_json('period_source', self.period_source)
    self.value_to_json('location_refresh_intervals', self.location_refresh_intervals)
    self.value_to_json('network_location_provider', self.network_location_provider)
    self.value_to_json('latitude_auto', self.latitude_auto)
    self.value_to_json('longitude_auto', self.longitude_auto)
    self.value_to_json('latitude_custom', self.latitude_custom)
    self.value_to_json('longitude_custom', self.longitude_custom)
    self.value_to_json('period_0_custom_start_time', self.period_custom_start_time[0])
    self.value_to_json('period_1_custom_start_time', self.period_custom_start_time[1])
    self.value_to_json('period_2_custom_start_time', self.period_custom_start_time[2])
    self.value_to_json('period_3_custom_start_time', self.period_custom_start_time[3])
    self.value_to_json('period_4_custom_start_time', self.period_custom_start_time[4])
    self.value_to_json('period_5_custom_start_time', self.period_custom_start_time[5])
    self.value_to_json('period_6_custom_start_time', self.period_custom_start_time[6])
    self.value_to_json('period_7_custom_start_time', self.period_custom_start_time[7])
    self.value_to_json('period_8_custom_start_time', self.period_custom_start_time[8])
    self.value_to_json('period_9_custom_start_time', self.period_custom_start_time[9])
    self.value_to_json('login_image', self.login_image)


    # Write to file
    with open(self.pref_location, "w") as pref_file:
      json.dump(self.pref_data, pref_file, separators=(',', ':'), indent=4)
