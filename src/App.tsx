import { useEffect, useState } from 'react'
import './App.css'

type Location = {
  name: string
  country: string
  country_code: string
  latitude: number
  longitude: number
}

type GeocodingResponse = {
  results?: Location[]
}

type ForecastResponse = {
  current?: {
    temperature_2m: number
    time: string
    apparent_temperature: number
  }
  current_units?: {
    temperature_2m: string
  }
}

function App() {
  const [temperature, setTemperature] = useState<number | null>(null)
  const [feelsLike, setFeelsLike] = useState<number | null>(null)
  const [temperatureUnit, setTemperatureUnit] = useState('°C')
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadWeather() {
      try {
        const locationResponse = await fetch(
          'https://geocoding-api.open-meteo.com/v1/search?name=Lagos&count=10&language=en&format=json',
          { signal: controller.signal },
        )
        if (!locationResponse.ok) {
          throw new Error('Could not look up Lagos.')
        }

        const locationData: GeocodingResponse = await locationResponse.json()
        const lagos = locationData.results?.find(
          (location) => location.country_code === 'NG',
        )
        if (!lagos) {
          throw new Error('Lagos, Nigeria could not be found.')
        }

        const forecastUrl = new URL(
          'https://api.open-meteo.com/v1/forecast',
        )
        forecastUrl.search = new URLSearchParams({
          latitude: String(lagos.latitude),
          longitude: String(lagos.longitude),
          current: 'temperature_2m,apparent_temperature',
          timezone: 'auto',
        }).toString()

        const forecastResponse = await fetch(forecastUrl, {
          signal: controller.signal,
        })
        if (!forecastResponse.ok) {
          throw new Error('Could not load the current weather.')
        }

        const forecastData: ForecastResponse = await forecastResponse.json()
        const current = forecastData.current
        if (!current || typeof current.temperature_2m !== 'number') {
          throw new Error('The current temperature is unavailable.')
        }

        setTemperature(current.temperature_2m)
        setFeelsLike(current.apparent_temperature)
        setTemperatureUnit(forecastData.current_units?.temperature_2m ?? '°C')
        setUpdatedAt(current.time)
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Something went wrong while loading the weather.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadWeather()
    return () => controller.abort()
  }, [])

  return (
    <main className="weather-page">
      <section className="weather-card" aria-labelledby="weather-title">
        <p className="eyebrow">CURRENT WEATHER</p>
        <h1 id="weather-title">Lagos, Nigeria</h1>
        <p className="location-note">The latest conditions in your city</p>

        {loading ? (
          <p className="weather-status" role="status">
            Loading current temperature…
          </p>
        ) : error ? (
          <p className="weather-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="weather-reading" aria-live="polite">
            <p className="temperature">
              {temperature}
              <span>{temperatureUnit}</span>
            </p>
            {feelsLike !== null && (
              <p className="feels-like">
                Feels like {feelsLike}
                {temperatureUnit}
              </p>
            )}
            {updatedAt && (
              <p className="updated-at">
                Updated {updatedAt.replace('T', ' ')} local time
              </p>
            )}
          </div>
        )}

        <p className="weather-source">Weather data by Open-Meteo</p>
      </section>
    </main>
  )
}

export default App
