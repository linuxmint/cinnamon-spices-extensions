import urllib.request, json

class Location():
  """ Class to handle location requests
  """
  def __init__(self):
    self.GEO_URL = "https://get.geojs.io/v1/ip/geo.json"

  def get_location(self) -> dict:
    """ Request the location via network

    Returns:
        dict: latitude and longitude
    """
    request = urllib.request.urlopen(self.GEO_URL)

    data = json.load(request)

    return {
      "latitude": data["latitude"],
      "longitude": data["longitude"]
    }
