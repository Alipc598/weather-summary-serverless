/**
 * GET /weather-summary?city=Prague
 *     /weather-summary?lat=50.08&lon=14.43
 * Considers precipitation + weather_code for higher-fidelity summaries.
 */
const CACHE_TTL_MS = 60_000
const cache = new Map()

// Minimal code groups from Open-Meteo docs
// https://open-meteo.com/en/docs#api_form
function codeToPrecipLabel(code) {
  if (code >= 95) return "Thunderstorm"       // 95-99
  if (code >= 85 && code <= 86) return "Snow" // snow showers
  if (code >= 80 && code <= 82) return "Rain" // rain showers
  if (code >= 71 && code <= 77) return "Snow" // snow
  if (code >= 51 && code <= 67) return "Rain" // drizzle / rain
  return null
}

function tempWord(t) {
  if (t >= 30) return "Hot"
  if (t >= 22) return "Warm"
  if (t >= 15) return "Mild"
  if (t >= 8)  return "Cool"
  return "Cold"
}

function windWord(kph) {
  if (kph >= 30) return "Windy"
  if (kph >= 15) return "Breezy"
  return "Calm"
}

function computeSummary(t, kph, code, precip) {
  // Precipitation first: if any rain/snow/thunder OR measurable precip
  const precipLabel = codeToPrecipLabel(code) || (precip > 0 ? "Rain" : null)
  if (precipLabel) return `${precipLabel} + ${tempWord(t)}`
  // Otherwise temperature + wind
  return `${tempWord(t)} + ${windWord(kph)}`
}

async function geocode(city) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
  url.searchParams.set("name", city)
  url.searchParams.set("count", "1")
  url.searchParams.set("language", "en")
  const resp = await fetch(url, { headers: { accept: "application/json" } })
  if (!resp.ok) throw new Error(`Geocoding failed: ${resp.status}`)
  const data = await resp.json()
  const first = data && data.results && data.results[0]
  return first ? { lat: first.latitude, lon: first.longitude, resolvedName: first.name } : null
}

async function fetchCurrent(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast")
  url.searchParams.set("latitude", String(lat))
  url.searchParams.set("longitude", String(lon))
  url.searchParams.set("current", "temperature_2m,wind_speed_10m,precipitation,weather_code")
  url.searchParams.set("temperature_unit", "celsius")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "auto")

  const resp = await fetch(url, { headers: { accept: "application/json" } })
  if (!resp.ok) throw new Error(`Weather failed: ${resp.status}`)
  const data = await resp.json()
  const cur = data && data.current
  if (!cur) throw new Error("Missing current weather")

  return {
    temp_c: Number(cur.temperature_2m),
    wind_kph: Number(cur.wind_speed_10m),
    precip_mm: Number(cur.precipitation ?? 0),
    code: Number(cur.weather_code ?? 0),
  }
}

async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" })
      return
    }

    const q = req.query || {}
    const lat = q.lat != null ? Number(q.lat) : null
    const lon = q.lon != null ? Number(q.lon) : null
    const cityRaw = (q.city || "").toString().trim()

    if (!(cityRaw || (Number.isFinite(lat) && Number.isFinite(lon)))) {
      res.status(400).json({ error: "Provide ?city=Name or ?lat=..&lon=.." })
      return
    }

    // Cache key: prefer exact coords to avoid mixing cities
    const key = cityRaw
      ? `city:${cityRaw.toLowerCase()}`
      : `coord:${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`
    const now = Date.now()
    const cached = cache.get(key)
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      res.status(200).json(cached.payload)
      return
    }

    let coords = { lat, lon, resolvedName: null }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const g = await geocode(cityRaw)
      if (!g) {
        res.status(404).json({ error: `City not found: ${cityRaw}` })
        return
      }
      coords = { lat: g.lat, lon: g.lon, resolvedName: g.resolvedName }
    }

    const cur = await fetchCurrent(coords.lat, coords.lon)
    const summary = computeSummary(cur.temp_c, cur.wind_kph, cur.code, cur.precip_mm)
    const payload = {
      city: coords.resolvedName || cityRaw || `${coords.lat},${coords.lon}`,
      lat: coords.lat,
      lon: coords.lon,
      temp_c: cur.temp_c,
      wind_kph: cur.wind_kph,
      precip_mm: cur.precip_mm,
      weather_code: cur.code,
      summary,
    }

    cache.set(key, { ts: now, payload })
    res.setHeader("content-type", "application/json")
    res.status(200).json(payload)
  } catch (err) {
    res.status(502).json({
      error: "Upstream failure",
      detail: String(err && err.message ? err.message : err),
    })
  }
}

module.exports = handler
module.exports._internal = { computeSummary }

