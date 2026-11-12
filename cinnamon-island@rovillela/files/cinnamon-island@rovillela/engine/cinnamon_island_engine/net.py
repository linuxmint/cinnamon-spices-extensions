"""Downloading data from the internet, carefully.

Everything the engine fetches from outside (weather, calendar, lyrics, album
covers) goes through here: http and https addresses only, with a timeout and a
size cap, so a huge or endless response cannot exhaust memory.
"""
import urllib.request

USER_AGENT = 'cinnamon-island-engine'


def download(url, limit, timeout=15):
    """Returns the bytes of `url`; raises OSError if anything is not right."""
    if not url.lower().startswith(('https://', 'http://')):
        raise OSError('address not allowed')
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise OSError('response larger than the limit')
    return data
