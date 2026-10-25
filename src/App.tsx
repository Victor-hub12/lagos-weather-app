import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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

type DailyForecast = {
  date: string
  minimum: number
  maximum: number
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
  daily?: {
    time: string[]
    temperature_2m_min: number[]
    temperature_2m_max: number[]
  }
  daily_units?: {
    temperature_2m_min: string
    temperature_2m_max: string
  }
}

function formatForecastDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function App() {
  const [temperature, setTemperature] = useState<number | null>(null)
  const [feelsLike, setFeelsLike] = useState<number | null>(null)
  const [temperatureUnit, setTemperatureUnit] = useState('°C')
  const [dailyForecast, setDailyForecast] = useState<DailyForecast[]>([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cityQuery, setCityQuery] = useState('')
  const [locationName, setLocationName] = useState('Lagos, Nigeria')
  const [searchResult, setSearchResult] = useState<Location | null>(null)
  const [searchMessage, setSearchMessage] = useState('')
  const [searching, setSearching] = useState(false)
  const searchController = useRef<AbortController | null>(null)
  const weatherController = useRef<AbortController | null>(null)

  const loadWeatherForLocation = useCallback(async (location: Location) => {
    weatherController.current?.abort()

    const controller = new AbortController()
    weatherController.current = controller
    setLoading(true)
    setError(null)
    setLocationName(`${location.name}, ${location.country}`)
    setSearchResult(location)

    try {
      const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
      forecastUrl.search = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        current: 'temperature_2m,apparent_temperature',
        daily: 'temperature_2m_min,temperature_2m_max',
        forecast_days: '4',
        timezone: 'auto',
      }).toString()

      const forecastResponse = await fetch(forecastUrl, {
        signal: controller.signal,
      })
      if (!forecastResponse.ok) {
        throw new Error(
          `Could not load the current weather for ${location.name}.`,
        )
      }

      const forecastData: ForecastResponse = await forecastResponse.json()
      const current = forecastData.current
      if (!current || typeof current.temperature_2m !== 'number') {
        throw new Error(`The current temperature for ${location.name} is unavailable.`)
      }

      const daily = forecastData.daily
      const dailyForecastData = daily?.time
        .map((date, index) => ({
          date,
          minimum: daily.temperature_2m_min[index],
          maximum: daily.temperature_2m_max[index],
        }))
        .filter((day) => day.date > daily.time[0])
        .slice(0, 3)

      if (
        !dailyForecastData ||
        dailyForecastData.length !== 3 ||
        dailyForecastData.some(
          (day) =>
            typeof day.minimum !== 'number' ||
            typeof day.maximum !== 'number',
        )
      ) {
        throw new Error(`The 3-day forecast for ${location.name} is unavailable.`)
      }

      setTemperature(current.temperature_2m)
      setFeelsLike(current.apparent_temperature)
      setTemperatureUnit(forecastData.current_units?.temperature_2m ?? '°C')
      setDailyForecast(dailyForecastData)
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
        weatherController.current = null
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadDefaultWeather() {
      try {
        const locationUrl = new URL(
          'https://geocoding-api.open-meteo.com/v1/search',
        )
        locationUrl.search = new URLSearchParams({
          name: 'Lagos',
          count: '10',
          language: 'en',
          format: 'json',
        }).toString()

        const response = await fetch(locationUrl, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Could not look up Lagos.')
        }

        const data: GeocodingResponse = await response.json()
        const lagos = data.results?.find(
          (location) => location.country_code === 'NG',
        )
        if (!lagos) {
          throw new Error('Lagos, Nigeria could not be found.')
        }

        await loadWeatherForLocation(lagos)
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Something went wrong while loading the weather.',
          )
          setLoading(false)
        }
      }
    }

    void loadDefaultWeather()

    return () => {
      controller.abort()
      searchController.current?.abort()
      weatherController.current?.abort()
    }
  }, [loadWeatherForLocation])

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    searchController.current?.abort()
    searchController.current = null
    setSearching(false)
    const query = cityQuery.trim()

    if (!query) {
      setSearchResult(null)
      setSearchMessage('Enter a city name to search.')
      return
    }

    const controller = new AbortController()
    searchController.current = controller
    setSearching(true)
    setSearchResult(null)
    setSearchMessage('')

    try {
      const searchUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
      searchUrl.search = new URLSearchParams({
        name: query,
        count: '1',
        language: 'en',
        format: 'json',
      }).toString()

      const response = await fetch(searchUrl, { signal: controller.signal })
      if (!response.ok) {
        throw new Error('Could not search for that city.')
      }

      const data: GeocodingResponse = await response.json()
      const location = data.results?.[0]
      if (!location) {
        setSearchMessage('No matching city found. Try another spelling.')
        return
      }

      await loadWeatherForLocation(location)
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setSearchMessage(
          requestError instanceof Error
            ? requestError.message
            : 'Something went wrong while searching.',
        )
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false)
        searchController.current = null
      }
    }
  }

  return (
    <main className="weather-page">
      <section className="weather-card" aria-labelledby="weather-title">
        <p className="eyebrow">CURRENT WEATHER</p>
        <h1 id="weather-title">{locationName}</h1>
        <p className="location-note">The latest conditions in your city</p>

        <form className="city-search" onSubmit={handleSearch}>
          <label htmlFor="city-search-input">Search for a city</label>
          <div className="city-search-controls">
            <input
              id="city-search-input"
              type="search"
              value={cityQuery}
              onChange={(event) => {
                searchController.current?.abort()
                searchController.current = null
                setSearching(false)
                setCityQuery(event.target.value)
                setSearchResult(null)
                setSearchMessage('')
              }}
              placeholder="e.g. Accra"
            />
            <button type="submit" disabled={searching || loading}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {searching && (
            <p className="search-feedback" role="status">
              Searching for {cityQuery.trim()}…
            </p>
          )}
          {!searching && searchMessage && (
            <p className="search-feedback" role="status">
              {searchMessage}
            </p>
          )}
          {!searching && searchResult && (
            <p className="search-feedback" role="status">
              Found {searchResult.name}, {searchResult.country}.
            </p>
          )}
        </form>

        {loading ? (
          <p className="weather-status" role="status">
            Loading current temperature…
          </p>
        ) : error ? (
          <p className="weather-error" role="alert">
            {error}
          </p>
        ) : (
          <>
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
            <section className="forecast" aria-labelledby="forecast-title">
              <h2 id="forecast-title">Next 3 days</h2>
              <ul className="forecast-list">
                {dailyForecast.map((day) => (
                  <li className="forecast-day" key={day.date}>
                    <h3>{formatForecastDate(day.date)}</h3>
                    <p className="forecast-high">
                      <span className="visually-hidden">High</span>
                      {day.maximum}
                      {temperatureUnit}
                    </p>
                    <p className="forecast-low">
                      <span className="visually-hidden">Low</span>
                      {day.minimum}
                      {temperatureUnit}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <p className="weather-source">Weather data by Open-Meteo</p>
      </section>
    </main>
  )
}

export default App
