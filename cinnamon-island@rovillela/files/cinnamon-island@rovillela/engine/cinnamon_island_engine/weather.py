"""Weather tab: forecast (Open-Meteo, no key needed) and upcoming events.

The calendar is read from an iCal address, such as the "secret address in iCal
format" Google Calendar offers in the settings of each calendar. That way no
login or app registration with Google is needed.
"""
import datetime
import json
import os
import threading
import urllib.parse
import urllib.request

from gi.repository import GLib

from .net import download
from .service import Service

# Size cap for a weather response or a calendar file.
MAX_DOWNLOAD = 10 * 1024 * 1024

try:
    from dateutil import rrule
except ImportError:  # without python3-dateutil, recurring events are ignored
    rrule = None

try:
    import zoneinfo
except ImportError:
    zoneinfo = None

CONFIG_FILE = os.path.join(GLib.get_user_config_dir(), 'cinnamon-island', 'weather.json')
WEATHER_INTERVAL_S = 30 * 60
CALENDAR_INTERVAL_S = 15 * 60
MAX_EVENTS = 4
LOOKAHEAD_DAYS = 14

GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search?count=%d&language=%s&name=%s'
MAX_MATCHES = 4
MAX_PLACES = 5
FORECAST_URL = ('https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=3'
                '&current=temperature_2m,weather_code,is_day'
                '&daily=weather_code,temperature_2m_max,temperature_2m_min'
                '&latitude=%s&longitude=%s')


def _fetch(url):
    return download(url, MAX_DOWNLOAD).decode('utf-8', 'replace')


def search_places(query, count=MAX_MATCHES):
    """Searches cities by name. Returns a list of places."""
    language = (os.environ.get('LANG') or 'en')[:2].lower()
    url = GEOCODING_URL % (count, language if language.isalpha() else 'en', urllib.parse.quote(query))
    return [
        {'name': r['name'], 'region': r.get('admin1', ''), 'country': r.get('country', ''),
         'latitude': r['latitude'], 'longitude': r['longitude']}
        for r in json.loads(_fetch(url)).get('results', [])]


def fetch_weather(place):
    """Returns the weather state of a place, or raises an exception."""
    data = json.loads(_fetch(FORECAST_URL % (place['latitude'], place['longitude'])))
    current, daily = data['current'], data['daily']
    return {
        'city': place['name'],
        'latitude': place['latitude'],
        'longitude': place['longitude'],
        'temperature': round(current['temperature_2m']),
        'code': current['weather_code'],
        'is_day': bool(current['is_day']),
        'days': [
            {'date': daily['time'][i], 'code': daily['weather_code'][i],
             'max': round(daily['temperature_2m_max'][i]), 'min': round(daily['temperature_2m_min'][i])}
            for i in range(len(daily['time']))],
    }


# --- iCal --------------------------------------------------------------------

def _unfold(text):
    """Joins the folded lines of iCal (those starting with a space)."""
    lines = []
    for line in text.replace('\r\n', '\n').split('\n'):
        if line[:1] in (' ', '\t') and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _parse_time(value, params, local):
    """Converts a DTSTART/DTEND into (datetime in the local zone, all day?)."""
    if len(value) == 8:
        day = datetime.datetime.strptime(value, '%Y%m%d')
        return day.replace(tzinfo=local), True
    moment = datetime.datetime.strptime(value.rstrip('Z'), '%Y%m%dT%H%M%S')
    if value.endswith('Z'):
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    else:
        zone = None
        if 'TZID' in params and zoneinfo:
            try:
                zone = zoneinfo.ZoneInfo(params['TZID'])
            except Exception:
                zone = None
        moment = moment.replace(tzinfo=zone or local)
    return moment.astimezone(local), False


def _read_events(text):
    """Reads the events of an iCal file, without expanding recurrences yet."""
    local = datetime.datetime.now().astimezone().tzinfo
    raw = []
    event = None
    for line in _unfold(text):
        if line == 'BEGIN:VEVENT':
            event = {}
        elif line == 'END:VEVENT' and event is not None:
            raw.append(event)
            event = None
        elif event is not None and ':' in line:
            key, value = line.split(':', 1)
            name, *raw_params = key.split(';')
            params = dict(p.split('=', 1) for p in raw_params if '=' in p)
            event[name] = (value, params)

    events = []
    for event in raw:
        if 'DTSTART' not in event or event.get('STATUS', ('',))[0] == 'CANCELLED':
            continue
        try:
            start, all_day = _parse_time(*event['DTSTART'], local)
            if 'DTEND' in event:
                end = _parse_time(*event['DTEND'], local)[0]
            else:
                end = start + (datetime.timedelta(days=1) if all_day else datetime.timedelta(hours=1))
        except ValueError:
            continue
        title = event.get('SUMMARY', ('',))[0].replace('\\,', ',').replace('\\;', ';').replace('\\n', ' ')
        rule = None
        if 'RRULE' in event and rrule and 'RECURRENCE-ID' not in event:
            try:
                rule = rrule.rrulestr(event['RRULE'][0], dtstart=start)
            except (ValueError, TypeError):
                rule = None
        events.append({'title': title, 'start': start, 'duration': end - start, 'all_day': all_day, 'rule': rule})
    return events


def _occurrences(events, begin, end):
    """Every time an event happens between `begin` and `end`."""
    for event in events:
        if event['rule'] is not None:
            try:
                starts = event['rule'].between(begin - event['duration'], end, inc=True)
            except (ValueError, TypeError):
                starts = [event['start']]
        else:
            starts = [event['start']]
        for start in starts:
            if start + event['duration'] > begin and start < end:
                yield event, start


def parse_calendar(text, now=None):
    """Returns (upcoming events, days of the current month that have an event)."""
    local = datetime.datetime.now().astimezone().tzinfo
    now = now or datetime.datetime.now(local)
    events = _read_events(text)

    upcoming = [
        {'title': event['title'], 'start': start.isoformat(), 'all_day': event['all_day']}
        for event, start in _occurrences(events, now, now + datetime.timedelta(days=LOOKAHEAD_DAYS))]
    upcoming.sort(key=lambda e: e['start'])

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month = (month_start + datetime.timedelta(days=32)).replace(day=1)
    days = sorted({start.day for event, start in _occurrences(events, month_start, next_month)
                   if month_start <= start < next_month})
    return upcoming[:MAX_EVENTS], days


def parse_events(text, now=None):
    """Upcoming events of an iCal file, in order."""
    return parse_calendar(text, now)[0]


class Weather(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Weather'
    METHODS = {'Configure': 's', 'Refresh': '', 'Search': 's', 'SelectPlace': 'u',
               'ChoosePlace': 'u', 'RemovePlace': 'u'}

    def __init__(self, connection):
        super().__init__(connection)
        config = {}
        try:
            with open(CONFIG_FILE) as file:
                config = json.load(file)
        except (OSError, ValueError):
            pass
        # The saved cities and which one is on display. Older versions stored a
        # single city, in 'place'.
        places = config.get('places')
        if not isinstance(places, list):
            places = [config.get('place')]
        self._places = [p for p in places if isinstance(p, dict) and 'latitude' in p][:MAX_PLACES]
        self._selected = min(max(0, int(config.get('selected', 0) or 0)), max(0, len(self._places) - 1))
        self._forecasts = {}  # (latitude, longitude) -> last forecast
        # Older versions stored only the name of the city; it is turned into a
        # place on the first search.
        self._legacy_city = '' if self._place else str(config.get('city', ''))
        self._calendar_url = str(config.get('calendar_url', ''))
        self._calendar_invalid = False
        self._matches = []
        self._searching = False
        self._search_id = 0
        self._weather = None
        self._events = None
        self._month_days = []
        self._calendar_error = False
        self._publish()
        self._refresh_weather()
        self._refresh_calendar()
        GLib.timeout_add_seconds(WEATHER_INTERVAL_S, lambda: self._refresh_weather() or True)
        GLib.timeout_add_seconds(CALENDAR_INTERVAL_S, lambda: self._refresh_calendar() or True)

    def _publish(self):
        self.set_state({
            'place_set': self._place is not None,
            'places': [{'name': p['name'], 'region': p.get('region', '')} for p in self._places],
            'selected': self._selected,
            'max_places': MAX_PLACES,
            'weather': self._weather,
            'matches': [
                {'name': m['name'], 'region': m['region'], 'country': m['country']}
                for m in self._matches],
            'searching': self._searching,
            'calendar_set': bool(self._calendar_url),
            'calendar_invalid': self._calendar_invalid,
            'calendar_error': self._calendar_error,
            'events': self._events or [],
            # Days of the current month with an event, to mark on the calendar.
            'month_days': self._month_days,
        })

    def _in_background(self, work, done):
        """Runs `work` off the main loop and hands the result to `done`."""
        def run():
            try:
                result = work()
            except Exception:
                result = None
            GLib.idle_add(lambda: done(result) and False)
        threading.Thread(target=run, daemon=True).start()

    @property
    def _place(self):
        """The city on display, or None if none is saved."""
        return self._places[self._selected] if self._places else None

    def _save_config(self):
        try:
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            # The calendar address grants read access to it: the file stays
            # readable by the user only.
            descriptor = os.open(CONFIG_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, 'w') as file:
                json.dump({'places': self._places, 'selected': self._selected,
                           'calendar_url': self._calendar_url}, file, indent=2)
        except OSError:
            pass

    def _refresh_weather(self):
        if not self._place and self._legacy_city:
            city, self._legacy_city = self._legacy_city, ''

            def migrated(result):
                if result and not self._place:
                    self._add_place(result[0])
                    self._save_config()
                    self._refresh_weather()
            self._in_background(lambda: search_places(city, 1), migrated)
            return

        place = self._place
        if not place:
            self._weather = None
            self._publish()
            return

        def done(result):
            if place is not self._place:
                return
            # A network failure keeps the last known forecast.
            if result is not None:
                self._forecasts[(place['latitude'], place['longitude'])] = result
                self._weather = result
            elif self._weather is None:
                self._weather = {'error': 'network'}
            self._publish()
        self._in_background(lambda: fetch_weather(place), done)

    def _refresh_calendar(self):
        url = self._calendar_url
        if not url:
            self._events, self._month_days, self._calendar_error = None, [], False
            self._publish()
            return

        def done(result):
            if url != self._calendar_url:
                return
            self._calendar_error = result is None
            if result is not None:
                self._events, self._month_days = result
            self._publish()
        self._in_background(lambda: parse_calendar(_fetch(url)), done)

    def do_Configure(self, text):
        config = json.loads(text)
        typed = str(config.get('calendar_url', '')).strip()
        url = typed
        if url.startswith('webcal://'):
            url = 'https://' + url[len('webcal://'):]
        if not url.startswith(('https://', 'http://')) or ' ' in url:
            url = ''
        # Something was typed but it is not a link: the front end tells the
        # person.
        self._calendar_invalid = bool(typed) and not url
        if url != self._calendar_url:
            self._calendar_url = url
            self._save_config()
            self._events = None
            self._refresh_calendar()
        else:
            self._publish()

    def do_Search(self, query):
        """Searches cities; the result shows up as `matches` in the state."""
        query = query.strip()
        self._search_id += 1
        search_id = self._search_id
        if len(query) < 2:
            self._matches, self._searching = [], False
            self._publish()
            return
        self._searching = True
        self._publish()

        def done(result):
            if search_id != self._search_id:
                return  # a newer search is already in progress
            self._matches, self._searching = result or [], False
            self._publish()
        self._in_background(lambda: search_places(query), done)

    def do_SelectPlace(self, index):
        """Stores one of the places from the last search and starts showing it."""
        if index >= len(self._matches):
            return
        self._add_place(self._matches[index])
        self._matches = []
        self._search_id += 1
        self._show_selected()

    def do_ChoosePlace(self, index):
        """Switches to another of the saved cities."""
        if index < len(self._places) and index != self._selected:
            self._selected = index
            self._show_selected()

    def do_RemovePlace(self, index):
        if index >= len(self._places):
            return
        del self._places[index]
        if self._selected >= index:
            self._selected = max(0, self._selected - 1)
        self._show_selected()

    def _add_place(self, place):
        """Adds the city to the list (if not there yet) and puts it on display."""
        key = (place['latitude'], place['longitude'])
        for i, saved in enumerate(self._places):
            if (saved['latitude'], saved['longitude']) == key:
                self._selected = i
                return
        if len(self._places) >= MAX_PLACES:
            # List full: the new city takes the place of the one on display.
            self._places[self._selected] = place
        else:
            self._places.append(place)
            self._selected = len(self._places) - 1

    def _show_selected(self):
        place = self._place
        # The known forecast shows right away; the new one arrives next.
        self._weather = self._forecasts.get((place['latitude'], place['longitude'])) if place else None
        self._save_config()
        self._publish()
        self._refresh_weather()

    def do_Refresh(self):
        self._refresh_weather()
        self._refresh_calendar()
