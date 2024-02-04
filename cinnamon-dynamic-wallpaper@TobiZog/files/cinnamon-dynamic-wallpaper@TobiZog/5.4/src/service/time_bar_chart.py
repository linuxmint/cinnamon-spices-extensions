import math

class Time_Bar_Chart:
  """ Class to handle the creation of the day time period bar
  """
  def __init__(self) -> None:
    self.image_code = []

    self.colors = [
        "00193d", 
        "05597f", 
        "54babf", 
        "9ec3a1", 
        "ffb95e", 
        "fcae4e", 
        "f37f73", 
        "b45bbc", 
        "7e38ce", 
        "00285f"
      ]

    self.bar_pos_x = []


  def create_bar_chart_with_polylines(self, save_location: str, image_width: int, image_height: int, times: list):
    """ Create a time bar chart WITH polylines

    Args:
        save_location (str): Absolute path to store
        image_width (int): Width of the image in pixel
        image_height (int): Height of the image in pixel
        times (list): List of start times of the periods in minutes since midnight
    """
    self.create_bar(image_width, image_height, times)
    self.create_polylines(image_width, image_height)
    self.create_time_markers(image_width, image_height)

    # Write to file
    self.image_code.insert(0, '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s">' % (image_width, image_height))
    self.image_code.append('</svg>')
    
    file = open(save_location, "w")
    for i in self.image_code:
      file.write(i + '\n')

    self.image_code.clear()
    self.bar_pos_x.clear()


  def create_bar_chart(self, save_location: str, image_width: int, image_height: int, times: list):
    """ Create a time bar chart WITHOUT polylines

    Args:
        save_location (str): Absolute path to store
        image_width (int): Width of the image in pixel
        image_height (int): Height of the image in pixel
        times (list): List of start times of the periods in minutes since midnight
    """
    self.create_bar(image_width, image_height, times)
    self.create_time_markers(image_width, image_height)

    # Write to file
    self.image_code.insert(0, '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s">' % (image_width, image_height))
    self.image_code.append('</svg>')
    
    file = open(save_location, "w")
    for i in self.image_code:
      file.write(i + '\n')

    self.image_code.clear()
    self.bar_pos_x.clear()


  def create_bar(self, image_width: int, image_height: int, times: list):
    """ Generates the code for the horizontal multi-color bar chart

    Args:
        image_width (int): Total width of the image
        image_height (int): Total height of the image
        times (list): List of start times of the periods, in minutes
    """
    x = 0
    y = 40
    width = 0
    height = image_height - 80

    if times[len(times) - 1] != 1440:
      times.append(1440)

    # Adding the bar parts
    for i in range(1, len(times)):
      width = math.ceil((((100 / 1440) * (times[i] - times[i - 1]) / 100) * image_width))

      self.image_code.append(
        '<rect fill="#%s" x="%s" y="%s" width="%s" height="%s"/>' % (self.colors[i - 1], x, y, width, height)
      )

      self.bar_pos_x.append(x)
      x += width


  def create_time_markers(self, image_width: int, image_height: int):
    """ Generates the code for the vertical hour markers

    Args:
        image_width (int): Total width of the image
        image_height (int): Total height of the image
    """
    for i in range(0, 8):
      # 3 hour vertical line
      self.image_code.append(
        '<line x1="%s" y1="40" x2="%s" y2="%s" stroke="white" stroke-width="2" />' %
          (i * (image_width // 8), i * (image_width // 8), image_height - 40)
      )

      # The two hours between the 3 hour lines
      for j in range(1, 3):
        self.image_code.append(
          '<line x1="%s" y1="40" x2="%s" y2="%s" stroke="white" stroke-width="0.5" />' %
            (i * (image_width // 8) + image_width // 24 * j, i * (image_width // 8) + image_width // 24 * j, image_height - 40)
        )
      
      # Time labels
      self.image_code.append(
        '<text x="%s" y="%s" fill="white" font-size="20" font-family="Liberation Sans">%s</text>' %
          (i * (image_width // 8) + 5, image_height - 45, i * 3)
      )


  def create_polylines(self, image_width: int, image_height: int):
    """ Generates the code for the polylines which connect the images with the bar sections

    Args:
        image_width (int): Total width of the image
        image_height (int): Total height of the image
    """
    bar_x_start = 0

    self.bar_pos_x.append(image_width)
    
    for i in range(0, len(self.bar_pos_x) - 1):
      # X-Middle of a bar
      bar_mid = bar_x_start + (self.bar_pos_x[i + 1] - bar_x_start) / 2

      # Position of the image in the window
      image_x = (image_width - 32) / 10 + ((i // 2) % 5) * image_width / 5
    
      # i == 0, 2, 4, ... => Upper Polylines
      if (i % 2 == 0):
        polyline_y = 0
      else:
        polyline_y = image_height

      if i == 0 or i == 8:
        polyline_x = 30
      elif i == 2 or i == 6:
        polyline_x = 20
      elif i == 1 or i == 9:
        polyline_x = image_height - 30
      elif i == 3 or i == 7:
        polyline_x = image_height - 20
      elif i == 5:
        polyline_x = image_height - 10
      else:
        polyline_x = 10
      
      self.image_code.append(
        '<polyline points="%s,%s %s,%s %s,%s %s,%s" stroke="#%s" fill="none" stroke-width="5" />' % 
          (image_x, polyline_y, image_x, polyline_x, bar_mid, polyline_x, bar_mid, image_height / 2, self.colors[i])
      )

      # Store the end point of the bar as start point of the next
      bar_x_start = self.bar_pos_x[i + 1]
