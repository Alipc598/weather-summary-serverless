/**
 * GET /weather-summary?city=Prague
 * Single serverless function (Vercel). No secrets.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map();

function computeSummary(tempC, windKph) {
  const t = Number(tempC);
  const w = Number(windKph);

  let tempWord;
  if (t >= 30) tempWord = "Hot";
  else if (t >= 22) tempWord = "Warm";
  else if (t >= 15) tempWord = "Mild";
  else if (t >= 8) tempWord = "Cool";
  else tempWord = "Cold";

  let windWord;
  if (w >= 30) windWord = "Windy";
  else if (w >= 15) windWord = "Breezy";
  else windWord = "Calm";

  return `${tempWord} + ${windWord}`;
}

async function geocode(city) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");

  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) throw new Error(`Geocoding failed: ${resp.status}`);
  const data = await resp.json();
  const first = data && data.results && data.results[0];
  return first ? { lat: first.latitude, lon: first.longitude } : null;
}

async function fetchCurrent(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,wind_speed_10m");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");

  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) throw new Error(`Weather failed: ${resp.status}`);
  const data = await resp.json();

  // Prefer modern shape; fall back to legacy if needed.
  if (
    data &&
    data.current &&
    typeof data.current.temperature_2m === "number" &&
    typeof data.current.wind_speed_10m === "number"
  ) {
    return {
      temp_c: data.current.temperature_2m,
      wind_kph: data.current.wind_speed_10m,
    };
  }
  if (
    data &&
    data.current_weather &&
    typeof data.current_weather.temperature === "number" &&
    typeof data.current_weather.windspeed === "number"
  ) {
    return {
      temp_c: data.current_weather.temperature,
      wind_kph: data.current_weather.windspeed,
    };
  }
  throw new Error("Unexpected weather response shape");
}

async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    const city = String(req.query.city || "").trim();
    if (!city) {
      res.status(400).json({ error: "Missing required query param 'city'" });
      return;
    }

    const key = city.toLowerCase();
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      res.status(200).json(cached.payload);
      return;
    }

    const geo = await geocode(city);
    if (!geo) {
      res.status(404).json({ error: `City not found: ${city}` });
      return;
    }

    const current = await fetchCurrent(geo.lat, geo.lon);
    const summary = computeSummary(current.temp_c, current.wind_kph);
    const payload = {
      city,
      temp_c: Number(current.temp_c),
      wind_kph: Number(current.wind_kph),
      summary,
    };

    cache.set(key, { ts: now, payload });
    res.setHeader("content-type", "application/json");
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({
      error: "Upstream failure",
      detail: String(err && err.message ? err.message : err),
    });
  }
}

module.exports = handler;
module.exports._internal = { computeSummary, geocode, fetchCurrent };
