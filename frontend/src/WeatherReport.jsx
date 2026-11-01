
import { useState } from "react";

const API_URL = "https://farmconnect-s3o5.onrender.com";

// Karnataka district headquarters and commonly searched towns.
// The search field also supports locations outside this list.
const KARNATAKA_LOCATIONS = [
  "Bagalkote",
  "Ballari",
  "Belagavi",
  "Bengaluru",
  "Bengaluru Rural",
  "Bidar",
  "Chamarajanagar",
  "Chikkaballapur",
  "Chikkamagaluru",
  "Chitradurga",
  "Davanagere",
  "Dharwad",
  "Gadag",
  "Hassan",
  "Haveri",
  "Kalaburagi",
  "Karwar",
  "Kolar",
  "Koppal",
  "Madikeri",
  "Mandya",
  "Mangaluru",
  "Mysuru",
  "Raichur",
  "Ramanagara",
  "Shivamogga",
  "Tumakuru",
  "Udupi",
  "Vijayapura",
  "Hosapete",
  "Yadgir"
];

const weatherDescription = (code) => {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Heavy thunderstorm with hail"
  };

  return descriptions[code] || "Weather information unavailable";
};

const weatherIcon = (code) => {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if ([3, 45, 48].includes(code)) return "☁️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return "🌧️";
  }
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75].includes(code)) return "❄️";

  return "🌦️";
};

function WeatherReport({ onBack }) {
  const [searchText, setSearchText] = useState("");
  const [locations, setLocations] = useState([]);
  const [weather, setWeather] = useState(null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [error, setError] = useState("");

  // Search any city, town, district or village.
  const searchLocations = async (query) => {
    const searchQuery = String(query || "").trim();

    if (searchQuery.length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }

    setError("");
    setWeather(null);
    setLocations([]);
    setSearchLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/weather/search?q=${encodeURIComponent(searchQuery)}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Location search failed.");
      }

      const results = Array.isArray(data.locations)
        ? data.locations
        : [];

      setLocations(results);

      if (results.length === 0) {
        setError(
          `No locations found for "${searchQuery}". Try another spelling.`
        );
      }
    } catch (err) {
      setError(
        err.message || "Unable to search locations. Check your connection."
      );
    } finally {
      setSearchLoading(false);
    }
  };

  // Search form submission.
  const handleSearch = (e) => {
    e.preventDefault();
    searchLocations(searchText);
  };

  // Quick-search a Karnataka district or town.
  const handleQuickSearch = (placeName) => {
    setSearchText(placeName);
    searchLocations(placeName);
  };

  // Load weather for the selected location.
  const selectLocation = async (place) => {
    setError("");
    setWeather(null);
    setLocations([]);
    setWeatherLoading(true);

    try {
      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        name: place.name || "",
        region: place.region || "",
        country: place.country || ""
      });

      const response = await fetch(
        `${API_URL}/api/weather?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Weather information unavailable."
        );
      }

      if (!data.current) {
        throw new Error("Current weather data is unavailable.");
      }

      setWeather(data);
    } catch (err) {
      setError(
        err.message || "Unable to load weather information."
      );
    } finally {
      setWeatherLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(`${date}T00:00:00`).toLocaleDateString(
      "en-IN",
      {
        weekday: "short",
        day: "numeric",
        month: "short"
      }
    );
  };

  return (
    <div className="weather-page">
      <style>{`
        .weather-page {
          max-width: 1100px;
          margin: 25px auto;
          padding: 24px;
          background: #f4faf5;
          border-radius: 16px;
          color: #20352a;
          box-sizing: border-box;
        }

        .weather-page * {
          box-sizing: border-box;
        }

        .weather-page h2 {
          margin-top: 0;
          color: #176b3a;
        }

        .weather-back {
          margin-bottom: 18px;
        }

        .weather-search {
          display: flex;
          gap: 10px;
          margin: 18px 0;
        }

        .weather-search input {
          flex: 1;
          min-width: 0;
          padding: 13px;
          border: 1px solid #b9d5c1;
          border-radius: 8px;
          font-size: 15px;
          background: white;
          color: #20352a;
        }

        .weather-page button {
          cursor: pointer;
          border: 0;
          border-radius: 8px;
          padding: 11px 16px;
          background: #19743e;
          color: white;
          font-weight: 600;
        }

        .weather-page button:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .weather-back {
          background: #345b43;
        }

        .weather-section {
          margin-top: 25px;
        }

        .quick-location-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
          gap: 9px;
          margin-top: 14px;
        }

        .quick-location-button {
          background: white !important;
          color: #176b3a !important;
          border: 1px solid #c9dfce !important;
          padding: 11px 8px !important;
          transition: background .2s;
        }

        .quick-location-button:hover {
          background: #e3f3e7 !important;
        }

        .location-list {
          display: grid;
          gap: 9px;
          margin: 18px 0;
        }

        .location-option {
          width: 100%;
          text-align: left;
          background: white !important;
          color: #20352a !important;
          border: 1px solid #d5e5d9 !important;
        }

        .location-option:hover {
          background: #e8f5eb !important;
        }

        .weather-current {
          background: white;
          padding: 22px;
          margin-top: 20px;
          border-radius: 14px;
          border: 1px solid #d8e9dc;
        }

        .weather-temperature {
          font-size: 42px;
          font-weight: 700;
          margin: 12px 0;
          color: #176b3a;
        }

        .weather-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-top: 20px;
        }

        .weather-detail {
          background: #eef7f0;
          padding: 13px;
          border-radius: 9px;
        }

        .weather-detail p {
          margin-bottom: 0;
        }

        .forecast-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
          gap: 10px;
          margin-top: 15px;
        }

        .forecast-card {
          background: white;
          border: 1px solid #d8e9dc;
          padding: 14px 9px;
          border-radius: 10px;
          text-align: center;
          overflow-wrap: anywhere;
        }

        .forecast-card h2 {
          font-size: 28px;
          margin: 12px 0;
        }

        .weather-error {
          color: #b42318;
          background: #fff0ef;
          border-radius: 8px;
          padding: 11px;
          margin: 12px 0;
        }

        .weather-muted {
          color: #607568;
          font-size: 14px;
        }

        .weather-loading {
          margin: 18px 0;
          color: #176b3a;
          font-weight: 600;
        }

        @media (max-width: 550px) {
          .weather-page {
            padding: 15px;
            margin: 12px auto;
          }

          .weather-search {
            flex-direction: column;
          }

          .weather-temperature {
            font-size: 34px;
          }
        }
      `}</style>

      <button
        className="weather-back"
        onClick={onBack}
      >
        ← Back to Dashboard
      </button>

      <h2>🌦️ Weather Report</h2>

      <p>
        Check current weather and seven-day forecasts for Karnataka
        and other locations.
      </p>

      {/* Location search */}
      <form
        className="weather-search"
        onSubmit={handleSearch}
      >
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search city, district or town (e.g. Shivamogga, Kolar)"
        />

        <button
          type="submit"
          disabled={searchLoading}
        >
          {searchLoading ? "Searching..." : "Search Location"}
        </button>
      </form>

      {/* Karnataka quick locations */}
      <div className="weather-section">
        <h3>📍 Karnataka Districts and Towns</h3>

        <p className="weather-muted">
          Select a location for its weather forecast.
        </p>

        <div className="quick-location-grid">
          {KARNATAKA_LOCATIONS.map((place) => (
            <button
              key={place}
              className="quick-location-button"
              onClick={() => handleQuickSearch(place)}
              disabled={searchLoading || weatherLoading}
            >
              {place}
            </button>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="weather-error">
          {error}
        </p>
      )}

      {/* Search results */}
      {locations.length > 0 && (
        <div className="location-list">
          <h3>📌 Select your location</h3>

          {locations.map((place) => (
            <button
              className="location-option"
              key={place.id}
              onClick={() => selectLocation(place)}
              disabled={weatherLoading}
            >
              📍 {place.name}
              {place.region ? `, ${place.region}` : ""}
              {place.country ? `, ${place.country}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {weatherLoading && (
        <p className="weather-loading">
          Loading weather forecast...
        </p>
      )}

      {searchLoading && (
        <p className="weather-loading">
          Searching locations...
        </p>
      )}

      {/* Current weather */}
      {weather && (
        <>
          <div className="weather-current">
            <h3>
              📍 {weather.location?.name || "Selected location"}
              {weather.location?.region
                ? `, ${weather.location.region}`
                : ""}
            </h3>

            <p className="weather-muted">
              {weather.location?.country || ""}
            </p>

            <div className="weather-temperature">
              {weatherIcon(weather.current?.weather_code)}{" "}
              {weather.current?.temperature_2m != null
                ? `${Math.round(weather.current.temperature_2m)}°C`
                : "N/A"}
            </div>

            <h3>
              {weatherDescription(weather.current?.weather_code)}
            </h3>

            <div className="weather-details">
              <div className="weather-detail">
                <strong>Feels Like</strong>
                <p>
                  {weather.current?.apparent_temperature ?? "N/A"}°C
                </p>
              </div>

              <div className="weather-detail">
                <strong>Humidity</strong>
                <p>
                  {weather.current?.relative_humidity_2m ?? "N/A"}%
                </p>
              </div>

              <div className="weather-detail">
                <strong>Wind Speed</strong>
                <p>
                  {weather.current?.wind_speed_10m ?? "N/A"} km/h
                </p>
              </div>

              <div className="weather-detail">
                <strong>Precipitation</strong>
                <p>
                  {weather.current?.precipitation ?? "N/A"} mm
                </p>
              </div>
            </div>
          </div>

          {/* Seven-day forecast */}
          <div className="weather-section">
            <h3>📅 7-Day Weather Forecast</h3>

            {Array.isArray(weather.daily?.time) &&
            weather.daily.time.length > 0 ? (
              <div className="forecast-grid">
                {weather.daily.time.map((date, index) => (
                  <div
                    className="forecast-card"
                    key={date}
                  >
                    <strong>
                      {formatDate(date)}
                    </strong>

                    <h2>
                      {weatherIcon(
                        weather.daily.weather_code?.[index]
                      )}
                    </h2>

                    <p>
                      {weatherDescription(
                        weather.daily.weather_code?.[index]
                      )}
                    </p>

                    <strong>
                      {weather.daily.temperature_2m_max?.[index] != null
                        ? Math.round(
                            weather.daily.temperature_2m_max[index]
                          )
                        : "N/A"}
                      {" / "}
                      {weather.daily.temperature_2m_min?.[index] != null
                        ? Math.round(
                            weather.daily.temperature_2m_min[index]
                          )
                        : "N/A"}
                      °C
                    </strong>

                    <p className="weather-muted">
                      Rain chance:{" "}
                      {weather.daily.precipitation_probability_max?.[index] ??
                        "N/A"}
                      %
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="weather-muted">
                Seven-day forecast is currently unavailable.
              </p>
            )}
          </div>

          <p className="weather-muted">
            Weather data provided by Open-Meteo. Forecasts are estimates
            and may change.
          </p>
        </>
      )}
    </div>
  );
}

export default WeatherReport;
