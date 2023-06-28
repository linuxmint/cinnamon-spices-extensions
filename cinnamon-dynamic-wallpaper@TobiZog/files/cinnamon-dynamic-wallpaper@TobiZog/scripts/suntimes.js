/**
 * @name	Cinnamon-Dynamic-Wallpaper
 * @alias 	TobiZog
 * @since	2023
 */

const DAYPERIOD = {
	MTWILIGHT: 0,
	SUNRISE: 1,
	MORNING: 2,
	NOON: 3,
	AFTERNOON: 4,
	EVENING: 5,
	SUNSET: 6,
	NTWILIGHT: 7,
	NIGHT: 8,
	NONE: 10
}

const DAYMS = 1000 * 60 * 60 * 24
const J1970 = 2440588
const J2000 = 2451545


function fromJulian(j) {
	let ms_date = (j + 0.5 - J1970) * DAYMS
	return new Date(ms_date)
}

/**
 * Calculating specific events of the sun during a day
 * 
 * @param {float} latitude Location latitude
 * @param {float} longitude Location longitude
 * 
 * @returns List of sun events in a day: dawn, sunrise, noon, sunset, dusk
 */
function sunEventsOfDay(latitude, longitude, date) {
	let rad = Math.PI / 180
	let lw = rad * (-longitude)

	let d = (date / DAYMS) - 0.5 + J1970 - J2000
	let n = Math.round(d - 0.0009 - lw / (2 * Math.PI))
	let ds = 0.0009 + lw / (2 * Math.PI) + n

	let M = rad * (357.5291 + 0.98560028 * ds)
	let C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
	let P = rad * 102.9372
	let L = M + C + P + Math.PI

	let dec = Math.asin(Math.sin(rad * 23.4397) * Math.sin(L))


	// Angles for the sun
	let angles = [-0.833, -6]

	for(var i = 0; i < angles.length; i++) {
		angles[i] = angles[i] * rad
		angles[i] = Math.acos((Math.sin(angles[i]) - Math.sin(rad * latitude) * Math.sin(dec)) / (Math.cos(rad * latitude) * Math.cos(dec)))
		angles[i] = 0.0009 + (angles[i] + lw) / (2 * Math.PI) + n
	}

	let jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)

	return {
		dawn: fromJulian(jnoon - (J2000 + angles[1] + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L) - jnoon)),
		sunrise: fromJulian(jnoon - (J2000 + angles[0] + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L) - jnoon)),
		noon: fromJulian(jnoon),
		sunset: fromJulian(J2000 + angles[0] + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)),
		dusk: fromJulian(J2000 + angles[1] + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L))
	}
}

function addMinutesToTime(date, minutes = 0) {
	let newDate = new Date(date)
	newDate.setMinutes(date.getMinutes() + minutes)
	return newDate
}

function subTimesToMinutes(date1, date2) {
	let diff = new Date(date1 - date2)
	return diff.getUTCHours() * 60 + diff.getMinutes()
}


function calcTimePeriod(latitude, longitude) {
	let todaySunEventsDay = sunEventsOfDay(latitude, longitude, Date.now())
	let tomorrowSunEventsDay = sunEventsOfDay(latitude, longitude, addMinutesToTime(new Date(), 1440))

	return {
		morning_twilight: [
			todaySunEventsDay.dawn, 
			addMinutesToTime(todaySunEventsDay.sunrise, -1)
		],
		sunrise: [
			todaySunEventsDay.sunrise, 
			addMinutesToTime(
				todaySunEventsDay.sunrise, 
				subTimesToMinutes(todaySunEventsDay.noon, todaySunEventsDay.sunrise) / 8 - 1
			)
		],
		morning: [
			addMinutesToTime(
				todaySunEventsDay.sunrise,
				(subTimesToMinutes(todaySunEventsDay.noon, todaySunEventsDay.sunrise) / 8) * 1
			),
			addMinutesToTime(
				todaySunEventsDay.sunrise,
				(subTimesToMinutes(todaySunEventsDay.noon, todaySunEventsDay.sunrise) / 8)*6 - 1
			)
		],
		noon: [
			addMinutesToTime(
				todaySunEventsDay.sunrise,
				(subTimesToMinutes(todaySunEventsDay.noon, todaySunEventsDay.sunrise) / 8) * 6
			),
			addMinutesToTime(
				todaySunEventsDay.noon,
				(subTimesToMinutes(todaySunEventsDay.sunset, todaySunEventsDay.noon) / 8) * 2 - 1
			)
		],
		afternoon: [
			addMinutesToTime(
				todaySunEventsDay.noon,
				(subTimesToMinutes(todaySunEventsDay.sunset, todaySunEventsDay.noon) / 8) * 2
			),
			addMinutesToTime(
				todaySunEventsDay.noon,
				(subTimesToMinutes(todaySunEventsDay.sunset, todaySunEventsDay.noon) / 8) * 5 - 1
			)
		],
		evening: [
			addMinutesToTime(
				todaySunEventsDay.noon,
				(subTimesToMinutes(todaySunEventsDay.sunset, todaySunEventsDay.noon) / 8) * 5
			),
			addMinutesToTime(
				todaySunEventsDay.noon,
				(subTimesToMinutes(todaySunEventsDay.sunset, todaySunEventsDay.noon) / 8) * 7 - 1
			)
		],
		sunset: [
			addMinutesToTime(
				todaySunEventsDay.noon,
				(subTimesToMinutes(todaySunEventsDay.sunset, todaySunEventsDay.noon) / 8) * 7 - 1
			), 
			todaySunEventsDay.sunset
		],
		night_twilight: [
			addMinutesToTime(todaySunEventsDay.sunset, 1), 
			todaySunEventsDay.dusk
		],
		night: [
			addMinutesToTime(todaySunEventsDay.dusk, 1), 
			addMinutesToTime(tomorrowSunEventsDay.dawn, -1)
		],
	}
}