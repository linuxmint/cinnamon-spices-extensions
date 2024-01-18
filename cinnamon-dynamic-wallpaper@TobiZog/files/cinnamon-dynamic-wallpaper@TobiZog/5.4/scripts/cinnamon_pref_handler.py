import os, json

class Cinnamon_Pref_Handler:
  """ Class to work with the Cinnamon Extension preference format
  """
  def __init__(self) -> None:
    # Location of the Cinnamon preference file since Cinnamon 5.4
    self.pref_location = os.path.expanduser("~") + \
      "/.config/cinnamon/spices/cinnamon-dynamic-wallpaper@TobiZog/cinnamon-dynamic-wallpaper@TobiZog.json"
    
    self.load_preferences()


  def load_preferences(self):
    """ Load the JSON preferences to the Preference object
    """
    with open(self.pref_location, "r") as pref_file:
      pref_data = json.load(pref_file)
    
    self.picture_aspect = pref_data['picture_aspect']['value']
    self.dynamic_background_color = pref_data['dynamic_background_color']['value']
    self.image_source = pref_data['image_source']['value']
    self.selected_image_set = pref_data['selected_image_set']['value']
    self.source_folder = pref_data['source_folder']['value']

    self.period_images = [
      pref_data['period_0_image']['value'],
      pref_data['period_1_image']['value'],
      pref_data['period_2_image']['value'],
      pref_data['period_3_image']['value'],
      pref_data['period_4_image']['value'],
      pref_data['period_5_image']['value'],
      pref_data['period_6_image']['value'],
      pref_data['period_7_image']['value'],
      pref_data['period_8_image']['value'],
      pref_data['period_9_image']['value']
    ]

    self.period_source = pref_data['period_source']['value']
    self.location_refresh_intervals = pref_data['location_refresh_intervals']['value']
    self.latitude_auto = pref_data['latitude_auto']['value']
    self.longitude_auto = pref_data['longitude_auto']['value']
    self.latitude_custom = pref_data['latitude_custom']['value']
    self.longitude_custom = pref_data['longitude_custom']['value']

    self.period_custom_start_time = [
      pref_data['period_0_custom_start_time']['value'],
      pref_data['period_1_custom_start_time']['value'],
      pref_data['period_2_custom_start_time']['value'],
      pref_data['period_3_custom_start_time']['value'],
      pref_data['period_4_custom_start_time']['value'],
      pref_data['period_5_custom_start_time']['value'],
      pref_data['period_6_custom_start_time']['value'],
      pref_data['period_7_custom_start_time']['value'],
      pref_data['period_8_custom_start_time']['value'],
      pref_data['period_9_custom_start_time']['value']
  ]


  def store_preferences(self):
    """ Store the values of the Preference object to the JSON file
    """
    with open(self.pref_location, "r") as pref_file:
      pref_data = json.load(pref_file)

    pref_data['picture_aspect']['value'] = self.picture_aspect
    pref_data['dynamic_background_color']['value'] = self.dynamic_background_color
    pref_data['image_source']['value'] = self.image_source
    pref_data['selected_image_set']['value'] = self.selected_image_set
    pref_data['source_folder']['value'] = self.source_folder
    pref_data['period_0_image']['value'] = self.period_images[0]
    pref_data['period_1_image']['value'] = self.period_images[1]
    pref_data['period_2_image']['value'] = self.period_images[2]
    pref_data['period_3_image']['value'] = self.period_images[3]
    pref_data['period_4_image']['value'] = self.period_images[4]
    pref_data['period_5_image']['value'] = self.period_images[5]
    pref_data['period_6_image']['value'] = self.period_images[6]
    pref_data['period_7_image']['value'] = self.period_images[7]
    pref_data['period_8_image']['value'] = self.period_images[8]
    pref_data['period_9_image']['value'] = self.period_images[9]
    pref_data['period_source']['value'] = self.period_source
    pref_data['location_refresh_intervals']['value'] = self.location_refresh_intervals
    pref_data['latitude_auto']['value'] = self.latitude_auto
    pref_data['longitude_auto']['value'] = self.longitude_auto
    pref_data['latitude_custom']['value'] = self.latitude_custom
    pref_data['longitude_custom']['value'] = self.longitude_custom
    pref_data['period_0_custom_start_time']['value'] = self.period_custom_start_time[0]
    pref_data['period_1_custom_start_time']['value'] = self.period_custom_start_time[1]
    pref_data['period_2_custom_start_time']['value'] = self.period_custom_start_time[2]
    pref_data['period_3_custom_start_time']['value'] = self.period_custom_start_time[3]
    pref_data['period_4_custom_start_time']['value'] = self.period_custom_start_time[4]
    pref_data['period_5_custom_start_time']['value'] = self.period_custom_start_time[5]
    pref_data['period_6_custom_start_time']['value'] = self.period_custom_start_time[6]
    pref_data['period_7_custom_start_time']['value'] = self.period_custom_start_time[7]
    pref_data['period_8_custom_start_time']['value'] = self.period_custom_start_time[8]
    pref_data['period_9_custom_start_time']['value'] = self.period_custom_start_time[9]

    # Write to file
    with open(self.pref_location, "w") as pref_file:
      json.dump(pref_data, pref_file, separators=(',', ':'), indent=4)
