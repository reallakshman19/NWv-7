import http.server
import socketserver
import json
import os
import hashlib
import tempfile

PORT = 3001
PUBLIC_DIR = os.path.join(os.getcwd(), 'public')
DATA_DIR = os.path.join(PUBLIC_DIR, 'data')
UP_AHEAD_DATASET_ENDPOINT = '/api/datasets/upAhead'
UP_AHEAD_DATASET_FILE = os.path.join(DATA_DIR, 'up_ahead.json')

EMPTY_UP_AHEAD_DATASET = {
    'timeline': [],
    'sections': {},
    'weekly_plan': [],
    'lastUpdated': None,
    'auditSummary': {'fallback': 'missing_or_invalid_up_ahead_dataset'},
    'dropReport': []
}

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# Map writable API endpoints to file paths
API_FILES = {
    '/api/settings': os.path.join(PUBLIC_DIR, 'settings.json'),
    '/api/blacklist': os.path.join(DATA_DIR, 'blacklist.json'),
    '/api/user_plan': os.path.join(DATA_DIR, 'user_plan.json'),
    '/api/market_snapshot': os.path.join(DATA_DIR, 'market_snapshot.json')
}

# Read-only dataset endpoints.
DATASET_API_FILES = {
    UP_AHEAD_DATASET_ENDPOINT: UP_AHEAD_DATASET_FILE
}


def load_json_file(filepath, fallback):
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError):
        return fallback


def get_missing_api_default(path):
    if 'blacklist' in path:
        return []
    return {}


def get_up_ahead_dataset_payload(filepath=UP_AHEAD_DATASET_FILE):
    return load_json_file(filepath, EMPTY_UP_AHEAD_DATASET)


def write_json_response(handler, payload, status=200, cache_control=None):
    handler.send_response(status)
    handler.send_header('Content-type', 'application/json')
    if cache_control:
        handler.send_header('Cache-Control', cache_control)
    handler.end_headers()
    handler.wfile.write(json.dumps(payload).encode('utf-8'))


PLANNER_ENDPOINT = '/api/user_plan'


def valid_plan_payload(payload):
    return isinstance(payload, dict) and all(isinstance(rows, list) for rows in payload.values())


def read_plan_for_update(filepath):
    # Invalid existing bytes must never be treated as an empty plan.
    try:
        with open(filepath, 'rb') as file:
            raw = file.read()
    except FileNotFoundError:
        raw = b'{}'
    payload = json.loads(raw)
    if not valid_plan_payload(payload):
        raise ValueError('Invalid existing planner data')
    return payload, '"' + hashlib.sha256(raw).hexdigest() + '"'


def write_plan_atomically(filepath, payload):
    # The single-process TCPServer serializes requests; replacement protects
    # the on-disk snapshot against partial writes or a failed JSON write.
    fd, temporary = tempfile.mkstemp(dir=os.path.dirname(filepath), prefix='.planner-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump(payload, file, indent=4)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, filepath)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def serve_file_or_default(handler, path, filepath):
    if path == PLANNER_ENDPOINT:
        try:
            payload, etag = read_plan_for_update(filepath)
        except (OSError, ValueError):
            write_json_response(handler, {'status': 'error', 'message': 'Planner unavailable'}, status=500)
            return
        handler.send_response(200)
        handler.send_header('Content-type', 'application/json')
        handler.send_header('ETag', etag)
        handler.send_header('Cache-Control', 'no-store')
        handler.end_headers()
        handler.wfile.write(json.dumps(payload).encode('utf-8'))
        return
    payload = load_json_file(filepath, get_missing_api_default(path))
    write_json_response(handler, payload)


def serve_dataset_endpoint(handler, path):
    if path != UP_AHEAD_DATASET_ENDPOINT:
        return False
    write_json_response(handler, get_up_ahead_dataset_payload(), cache_control='no-cache')
    return True


class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if serve_dataset_endpoint(self, self.path):
            return

        if self.path in API_FILES:
            serve_file_or_default(self, self.path, API_FILES[self.path])
            return

        # Serve static files otherwise (optional, mainly for verifying public/)
        super().do_GET()

    def do_POST(self):
        if self.path in DATASET_API_FILES:
            self.send_response(405)
            self.end_headers()
            return

        if self.path in API_FILES:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                # Validate JSON
                json_data = json.loads(post_data)

                filepath = API_FILES[self.path]
                # Ensure directory exists
                os.makedirs(os.path.dirname(filepath), exist_ok=True)

                if self.path == PLANNER_ENDPOINT:
                    if not valid_plan_payload(json_data):
                        write_json_response(self, {'status': 'error', 'message': 'Invalid plan'}, status=400)
                        return
                    expected = self.headers.get('If-Match')
                    if not expected:
                        write_json_response(self, {'status': 'error', 'message': 'Planner revision required'}, status=428)
                        return
                    _, actual = read_plan_for_update(filepath)
                    if expected != actual:
                        write_json_response(self, {'status': 'error', 'message': 'Planner revision conflict'}, status=412)
                        return
                    write_plan_atomically(filepath, json_data)
                else:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(json_data, f, indent=4)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success"}')
                print(f"Saved {self.path} to {filepath}")

            except json.JSONDecodeError:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"status": "error", "message": "Invalid JSON"}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f'{{"status": "error", "message": "{str(e)}"}}'.encode())
            return

        self.send_response(404)
        self.end_headers()


def run_server(port=PORT):
    print(f"Serving API on port {port}")
    print(f"Public Directory: {PUBLIC_DIR}")
    print(f"Data Directory: {DATA_DIR}")

    with socketserver.TCPServer(("", port), RequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    run_server()
