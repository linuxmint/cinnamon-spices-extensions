from math import pi, sin, asin, acos, cos, floor, atan, tan
from datetime import datetime, timezone, time, timedelta


class Suntimes:
  """ Calculates all time periods based on latitude and longitude
      Inspired by https://github.com/SatAgro/suntime

      author: TobiZog
  """
  def __init__(self) -> None:
    """ Initialization
    """
    self.today = datetime.now()


  def calc_suntimes(self, latitude: float, longitude: float) -> None:
    """ Start the calculation process

    Args:
        latitude (float): Current latitude
        longitude (float): Current longitude
    """
    self.latitude = latitude
    self.longitude = longitude
    self.calc_sun_events()

    
  def to_range(self, value: float, range_max: float) -> float:
    """ Converting a variable to a given range

    Args:
        value (float): The given value
        range_max (float): Upper boundary

    Returns:
        float: Corrected value inside range 0 to range_max
    """
    if value < 0:
      return value + range_max
    elif value >= range_max:
      return value - range_max
    else:
      return value


  def calc_sun_events(self):
    """ Parent sun event calculater. Calls calc_sunrise_sunset_time() for every time period
    """
    civial_dawn_start = self.calc_sunrise_sunset_time(True, 96)
    sunrise_start = self.calc_sunrise_sunset_time(True)
    morning_start = self.calc_sunrise_sunset_time(True, 89.167)
    
    sunset_start = self.calc_sunrise_sunset_time(False, 89.167)
    civial_dusk_start = self.calc_sunrise_sunset_time(False)
    night_start = self.calc_sunrise_sunset_time(False, 96)

    light_period_duration = timedelta(seconds=(sunset_start - morning_start).seconds / 8)

    noon_start = morning_start + 3 * light_period_duration
    afternoon_start = morning_start + 5 * light_period_duration
    evening_start = morning_start + 7 * light_period_duration

    self.day_periods = [
      time(hour=0, minute=0),
      time(civial_dawn_start.hour, civial_dawn_start.minute),
      time(sunrise_start.hour, sunrise_start.minute),
      time(morning_start.hour, morning_start.minute),
      time(noon_start.hour, noon_start.minute),
      time(afternoon_start.hour, afternoon_start.minute),
      time(evening_start.hour, evening_start.minute),
      time(sunset_start.hour, sunset_start.minute),
      time(civial_dusk_start.hour, civial_dusk_start.minute),
      time(night_start.hour, night_start.minute),
    ]


  def calc_sunrise_sunset_time(self, is_sunrise: bool, zenith=90.833) -> datetime:
    """ Calculate all values to estimate the day periods
    """
    RAD = pi / 180

    # Day of the year
    day_of_year = self.today.timetuple().tm_yday

    # 2
    lng_hour = self.longitude / 15

    if is_sunrise:
      t = day_of_year + ((6 - lng_hour) / 24)
    else:
      t = day_of_year + ((18 - lng_hour) / 24)

    # 3
    M = (0.9856 * t) - 3.289

    # 4
    L = self.to_range(M + (1.916 * sin(RAD * M)) + (0.020 * sin(RAD * 2 * M)) + 282.634, 360)

    # 5
    RA = self.to_range((1 / RAD) * atan(0.91764 * tan(RAD * L)), 360)
    RA += ((floor(L / 90)) * 90 - (floor(RA / 90)) * 90)
    RA /= 15

    # 6
    sin_dec = 0.39782 * sin(RAD * L)
    cos_dec = cos(asin(sin_dec))


    # 7a
    cos_h = (cos(RAD * zenith) - (sin_dec * sin(RAD * self.latitude))) / (cos_dec * cos(RAD * self.latitude))

    # The sun rises or sets never
    if cos_h > 1 or cos_h < -1:
      return None

    # 7b
    if is_sunrise:
      H = 360 - (1 / RAD) * acos(cos_h)
    else: #setting
      H = (1 / RAD) * acos(cos_h)

    H = H / 15

    # 8
    T = H + RA - (0.06571 * t) - 6.622

    # 9
    UT = T - lng_hour
    UT = self.to_range(UT, 24)   # UTC time in decimal format (e.g. 23.23)


    # 10
    hr = self.to_range(int(UT), 24)
    min = round((UT - int(UT))*60, 0)
    if min == 60:
      hr += 1
      min = 0

    hr = self.to_range(hr, 24)
    
    try:
      res = datetime(self.today.year, self.today.month, self.today.day, hr, int(min))
    except:
      print("Can not create datetime from %d.%d.%d %d:%d" % (self.today.year, self.today.month, self.today.day, hr, int(min)))
      return
    
    return res.replace(tzinfo=timezone.utc).astimezone(tz=None)
