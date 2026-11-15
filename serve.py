"""Local dev server for docs/. Serves the site on http://127.0.0.1:8766 and, for
testing only, accepts PUT /_save/<name> and writes the body to data/_test/<name>."""
import http.server, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "docs")
TEST = os.path.join(HERE, "data", "_test")


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEB, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_PUT(self):
        m = re.fullmatch(r"/_save/([\w.-]+)", self.path)
        if not m:
            self.send_error(404)
            return
        os.makedirs(TEST, exist_ok=True)
        n = int(self.headers.get("Content-Length", 0))
        with open(os.path.join(TEST, m.group(1)), "wb") as f:
            f.write(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
