// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../context/WeatherContext', () => ({
  useWeather: () => ({
    weatherData: {
      chennai: { name: 'Chennai', current: { temp: 27, condition: 'Clear', icon: '☀️' } },
      trichy: { name: 'Trichy', current: { temp: 29, condition: 'Clear', icon: '☀️' } },
      muscat: { name: 'Muscat', current: { temp: 30, condition: 'Clear', icon: '☀️' } },
    },
    booted: true,
    loading: false,
    error: null,
    ensureBoot: () => {},
    refreshWeather: () => {},
  }),
}));

vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { weather: { cities: ['chennai', 'trichy', 'muscat'] } },
    updateSettings: () => true,
  }),
}));

vi.mock('../services/weatherInsights.js', () => ({
  buildNextRiskSummary: () => null,
  buildTomorrowChip: () => null,
}));

vi.mock('./weather/QuickWeatherSignalStrip.jsx', () => ({
  default: () => null,
}));

import QuickWeather from './QuickWeather.jsx';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Quick Weather selected-city propagation', () => {
  it('notifies on city click, stores the same city, and updates the active badge', async () => {
    window.localStorage.setItem('weather_active_city', 'chennai');
    const onActiveCityChange = vi.fn();
    render(<QuickWeather onActiveCityChange={onActiveCityChange} />);

    await waitFor(() => expect(onActiveCityChange).toHaveBeenCalledWith('chennai'));
    fireEvent.click(screen.getByText('Muscat'));

    await waitFor(() => expect(onActiveCityChange).toHaveBeenLastCalledWith('muscat'));
    expect(window.localStorage.getItem('weather_active_city')).toBe('muscat');
    expect(document.querySelector('.qw-location-name')?.textContent).toBe('Muscat');
  });

  it('supports keyboard city selection and uses a configured fallback for an invalid saved city', async () => {
    window.localStorage.setItem('weather_active_city', 'invalid_location');
    const onActiveCityChange = vi.fn();
    render(<QuickWeather onActiveCityChange={onActiveCityChange} />);

    await waitFor(() => expect(onActiveCityChange).toHaveBeenCalledWith('chennai'));
    const trichyRow = screen.getByText('Trichy').closest('[role="button"]');
    fireEvent.keyDown(trichyRow, { key: 'Enter' });

    await waitFor(() => expect(onActiveCityChange).toHaveBeenLastCalledWith('trichy'));
    expect(window.localStorage.getItem('weather_active_city')).toBe('trichy');
  });
});
