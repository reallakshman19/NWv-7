// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mock = vi.hoisted(() => ({ settings: {}, save: vi.fn() }));
vi.mock('../context/WeatherContext', () => ({
  useWeather: () => ({
    weatherData: {
      chennai: { name: 'Chennai', current: { temp: 27, condition: 'Clear', icon: '☀️' } },
      trichy: { name: 'Trichy', current: { temp: 29, condition: 'Clear', icon: '☀️' } },
      muscat: { name: 'Muscat', current: { temp: 30, condition: 'Clear', icon: '☀️' } },
    },
    booted: true, loading: false, error: null,
    ensureBoot: () => {}, refreshWeather: () => {},
  }),
}));
vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: mock.settings,
    updateSettings: next => {
      mock.settings = next;
      mock.save(next);
      return true;
    },
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

beforeEach(() => {
  mock.settings = {
    weather: { cities: ['chennai', 'trichy', 'muscat'], activeCity: 'chennai' },
    travelLocation: { city: 'colombo', enabled: true, prioritizeStories: true },
  };
  mock.save.mockClear();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('Quick Weather selected-city sync', () => {
  it('changes shared weather city with a click, without overwriting manual travel city', async () => {
    render(<QuickWeather />);
    fireEvent.click(screen.getByText('Muscat'));
    await waitFor(() => expect(mock.save).toHaveBeenCalled());
    expect(mock.settings.weather.activeCity).toBe('muscat');
    expect(mock.settings.travelLocation.city).toBe('colombo');
    expect(window.localStorage.getItem('weather_active_city')).toBe('muscat');
    expect(document.querySelector('.qw-location-name')?.textContent).toBe('Muscat');
  });

  it('supports keyboard city selection and persists the chosen city', async () => {
    render(<QuickWeather />);
    fireEvent.keyDown(screen.getByText('Trichy').closest('[role="button"]'), { key: 'Enter' });
    await waitFor(() => expect(mock.settings.weather.activeCity).toBe('trichy'));
    expect(window.localStorage.getItem('weather_active_city')).toBe('trichy');
  });

  it('migrates the prior stored weather city into shared settings', async () => {
    mock.settings.weather.activeCity = undefined;
    window.localStorage.setItem('weather_active_city', 'muscat');
    render(<QuickWeather />);
    await waitFor(() => expect(mock.settings.weather.activeCity).toBe('muscat'));
    expect(mock.settings.travelLocation.city).toBe('colombo');
  });
});
