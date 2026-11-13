#!/usr/bin/env python3
"""Tiny static server for Lament of Chernobrod (no caching, correct JS MIME).

    python3 serve.py [port] [--lan]

By default it only answers on this machine. Pass --lan to also answer other
devices on the same network (a phone on the same Wi-Fi, say).
"""
import http.server
import os
import socket
import sys

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = int(ARGS[0]) if ARGS else 5173
LAN = '--lan' in sys.argv[1:]
os.chdir(os.path.dirname(os.path.abspath(__file__)))


def lan_address():
    """This machine's address on the local network (no packets are sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def send_head(self):
        # never hand out dotfiles (.git, .claude, ...), least of all to the network
        if any(part.startswith('.') for part in self.path.split('?')[0].split('/') if part):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('0.0.0.0' if LAN else '127.0.0.1', PORT), Handler) as httpd:
        print(f'Lament of Chernobrod -> http://localhost:{PORT}')
        if LAN:
            addr = lan_address()
            print(f'On your phone (same Wi-Fi) -> http://{addr}:{PORT}' if addr
                  else 'No network address found: is this machine on Wi-Fi?')
        sys.stdout.flush()
        httpd.serve_forever()
