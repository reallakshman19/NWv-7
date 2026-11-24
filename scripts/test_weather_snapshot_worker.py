from unittest import TestCase
from unittest.mock import Mock, call, patch

import requests

from scripts import weather_snapshot_worker as worker


def response_with_status(status_code):
    response = requests.Response()
    response.status_code = status_code
    response.url = "https://api.open-meteo.com/v1/forecast"
    return response


class WeatherSnapshotWorkerTest(TestCase):
    location = worker.WEATHER_LOCATIONS["chennai"]

    @patch.object(worker, "sleep")
    @patch.object(worker.requests, "get")
    def test_retries_transport_and_server_failures_before_using_recovered_data(self, get, sleep):
        payload = {"current": {"temperature_2m": 28}}
        good_response = Mock()
        good_response.json.return_value = payload
        get.side_effect = [requests.ReadTimeout("first attempt"), response_with_status(503), good_response]

        self.assertEqual(worker.fetch_forecast(self.location), payload)
        self.assertEqual(get.call_args_list, [call(worker.build_url(self.location), timeout=(5, 20))] * 3)
        self.assertEqual(sleep.call_args_list, [call(1), call(3)])

    @patch.object(worker, "sleep")
    @patch.object(worker.requests, "get")
    def test_stops_after_three_transport_attempts(self, get, sleep):
        get.side_effect = requests.ConnectionError("unavailable")
        with self.assertRaises(requests.ConnectionError):
            worker.fetch_forecast(self.location)
        self.assertEqual(get.call_count, 3)
        self.assertEqual(sleep.call_args_list, [call(1), call(3)])

    @patch.object(worker, "sleep")
    @patch.object(worker.requests, "get")
    def test_respects_client_and_rate_limit_responses(self, get, sleep):
        for status in (400, 403, 429):
            with self.subTest(status=status):
                get.reset_mock()
                get.return_value = response_with_status(status)
                with self.assertRaises(requests.HTTPError):
                    worker.fetch_forecast(self.location)
                self.assertEqual(get.call_count, 1)
        sleep.assert_not_called()

    @patch.object(worker, "sleep")
    @patch.object(worker.requests, "get")
    def test_does_not_retry_certificate_errors(self, get, sleep):
        get.side_effect = requests.exceptions.SSLError("invalid certificate")
        with self.assertRaises(requests.exceptions.SSLError):
            worker.fetch_forecast(self.location)
        self.assertEqual(get.call_count, 1)
        sleep.assert_not_called()

    @patch.object(worker, "atomic_write_json")
    @patch.object(worker, "fetch_city")
    def test_missing_city_never_replaces_the_published_snapshot(self, fetch_city, write):
        def fetch(city):
            if city == "muscat":
                raise requests.ReadTimeout("provider unavailable after retry")
            return {"current": {"temp": 25}, "hourly24": [{}] * 24}

        fetch_city.side_effect = fetch
        with self.assertRaisesRegex(SystemExit, "Incomplete weather snapshot 3/4"):
            worker.run_worker()
        write.assert_not_called()
