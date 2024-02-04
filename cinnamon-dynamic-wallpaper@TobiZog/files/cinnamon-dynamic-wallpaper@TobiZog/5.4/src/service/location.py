import urllib.request, json
from enums.NetworkLocationProvider import NetworkLocationProvider

class Location():
  """ Class to handle location requests
  """
  def get_location(self, provider: NetworkLocationProvider) -> dict:
    """ Request the location via network

    Returns:
        dict: latitude and longitude
    """
    if provider == NetworkLocationProvider.GEOJS:
      url = "http://get.geojs.io/v1/ip/geo.json"
    elif provider == NetworkLocationProvider.IPAPI:
      url = "http://ip-api.com/json/?fields=61439"
    elif provider == NetworkLocationProvider.IPWHOIS:
      url = "http://ipwho.is"

    try:
      request = urllib.request.urlopen(url)
      data = json.load(request)

      if provider == NetworkLocationProvider.GEOJS or provider == NetworkLocationProvider.IPWHOIS:
        param_lat = "latitude"
        param_lon = "longitude"
      else:
        param_lat = "lat"
        param_lon = "lon"

      return {
          "latitude": float(data[param_lat]),
          "longitude": float(data[param_lon]),
          "success": True
        }
    except:
      return {
        "success": False
      }
