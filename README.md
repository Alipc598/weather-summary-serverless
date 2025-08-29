# Weather Summary API (Vercel)

`GET /weather-summary?city=Prague` → `{ city, temp_c, wind_kph, summary }`

## Local
npm run dev
# then
curl "http://127.0.0.1:3000/weather-summary?city=Prague"

## Test
npm test

## Deploy (manual)
npm run deploy

## CI
On push to `main`: lint → test → deploy (requires repo secret: VERCEL_TOKEN)

## Notes
- Open-Meteo geocoding + forecast, metric units.
- Handles both `current` and legacy `current_weather`.
- 60s in-memory cache per city.
