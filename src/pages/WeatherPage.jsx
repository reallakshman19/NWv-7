import React, { useCallback, useEffect } from 'react';
import WeatherStickyHeader from '../components/WeatherStickyHeader';
import DetailedWeatherCard from '../components/DetailedWeatherCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import WeatherLocationManager from '../components/weather/WeatherLocationManager.jsx';
import WeeklyWeatherForecast from '../components/weather/WeeklyWeatherForecast.jsx';
import WeatherCityComparison from '../components/weather/WeatherCityComparison.jsx';
import WeatherPlanningSummary from '../components/weather/WeatherPlanningSummary.jsx';
import WeatherHourIntervals from '../components/weather/WeatherHourIntervals.jsx';
import WeatherOfficialAlerts from '../components/weather/WeatherOfficialAlerts.jsx';
import WeatherCityStrip from '../components/weather/WeatherCityStrip.jsx';
import '../components/weather/WeatherCitywise.css';
import GradeBadge from '../components/audit/GradeBadge.jsx';
import { useWeatherTabViewModel } from '../viewModels/useWeatherTabViewModel';

/**
 * Weather Page
 * Dedicated page for detailed weather forecast with sticky header.
 * Release 6K: page is render-focused; Weather ViewModel owns context/settings/storage/audit.
 */
function WeatherPage() {
  const { isDesktop } = useMediaQuery();

  const {
    weatherData,
    activeCity,
    cities,
    setActiveCity,
    weatherTabAudit,
    loading,
    error,
    hasRenderableWeatherData,
    refreshWeather,
    locationManagerProps,
    detailedWeatherCardProps,
    stickyHeaderProps,
    cityComparisonProps,
    planningSummaryProps,
    weeklyForecastProps,
  } = useWeatherTabViewModel();

  useEffect(() => {
    if (!loading && hasRenderableWeatherData) {
      const firstCityData = Object.values(weatherData)[0];

      if (import.meta.env.DEV) {
        console.log('[Phase 6 Diagnostics]', {
          page: 'weather',
          activeCity,
          sourceMode: firstCityData?.sourceMode || 'none',
        });
      }
    }
  }, [activeCity, hasRenderableWeatherData, loading, weatherData]);

  const handleRefresh = useCallback(async () => (
    refreshWeather(true)
  ), [refreshWeather]);

  const { pullDistance } = usePullToRefresh(handleRefresh);

  if (loading && !hasRenderableWeatherData) {
    return (
      <div
        className="page-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <div className="loading">
          <div className="loading__spinner"></div>
          <span>Loading Forecast...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container weather-page" style={{ padding: 0 }}>
      <div
        style={{
          height: `${pullDistance}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'var(--bg-secondary)',
          color: 'var(--accent-primary)',
          fontSize: '0.8rem',
          transition: pullDistance === 0 ? 'height 0.3s ease' : 'none',
        }}
      >
        {pullDistance > 40 ? 'Release to refresh' : 'Pull to refresh'}
      </div>

      {hasRenderableWeatherData && (
        <WeatherStickyHeader
          {...stickyHeaderProps}
          isDesktop={isDesktop}
        />
      )}

      <main className="main-content" style={{ padding: 0, marginTop: 0 }}>
        {error && !weatherData?.[activeCity]?.current && (
          <p className="weather-quiet-error" role="status">Weather could not refresh. Choose a city or retry.</p>
        )}

        <WeatherCityStrip cities={cities} activeCity={activeCity} weatherData={weatherData} onSelect={setActiveCity} />
        <div className="weather-city-toolbar">
          <WeatherLocationManager {...locationManagerProps} />
          <GradeBadge audit={weatherTabAudit} label="Weather tab quality grade" position="inline" compact />
          <WeatherOfficialAlerts />
        </div>

        {weatherData?.[activeCity]?.current ? (
          <div className="weather-citywise-content">
            <WeatherHourIntervals cityData={weatherData[activeCity]} />
            <DetailedWeatherCard {...detailedWeatherCardProps} />
            {cities.length > 1 && <details className="weather-secondary-details" open={isDesktop}>
              <summary>Compare cities <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
              <WeatherCityComparison {...cityComparisonProps} />
            </details>}
            <details className="weather-secondary-details" open={isDesktop}>
              <summary>Week at a glance <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
              <WeatherPlanningSummary {...planningSummaryProps} />
            </details>
            <WeeklyWeatherForecast {...weeklyForecastProps} />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 16.6A5 5 0 0018 7h-1.3a7 7 0 00-12 3.5A4.5 4.5 0 005 19h11"/><path d="M16 14l5 5m0-5l-5 5"/></svg></div>
            <p>Weather data unavailable.</p>
            <button onClick={handleRefresh} className="btn btn--secondary mt-md">Retry</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default WeatherPage;
