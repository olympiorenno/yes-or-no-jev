#!/usr/bin/env python3
"""Local-only launcher. Uses Python's standard library; never logs requests or keys."""
import json
import re
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STOP_WORDS = set('qual quais quem como onde quando porque por que um uma uns umas o a os as de do da dos das em no na nos nas e é são fica ficam tem têm existe existem ser se eu meu minha pode podem para com'.split())

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

OPENER = urllib.request.build_opener(NoRedirect)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def allowed(self):
        host = self.headers.get('Host', '')
        return host == f'127.0.0.1:{self.server.server_port}' and self.headers.get('Origin', f'http://{host}') == f'http://{host}'

    def send(self, status, data, content_type='application/json; charset=utf-8'):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        elif isinstance(data, str):
            data = data.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.allowed():
            return self.send(403, {'error': 'Acesso local apenas.'})
        if urllib.parse.urlparse(self.path).path not in ('/', '/index.html'):
            return self.send(404, {'error': 'Não encontrado.'})
        return self.send(200, (ROOT / 'index.html').read_bytes(), 'text/html; charset=utf-8')

    def do_POST(self):
        if not self.allowed():
            return self.send(403, {'error': 'Origem não permitida.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 60000:
                return self.send(413, {'error': 'Pedido muito grande ou vazio.'})
            raw = self.rfile.read(length)
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                return self.send(400, {'error': 'Pedido inválido.'})
            if self.path == '/api/jev':
                authorization = 'Bearer ' + self.headers.get('X-TypeSafe-Key', '')
                if not re.fullmatch(r'Bearer [^\s]{1,512}', authorization):
                    return self.send(401, {'error': 'Invalid key'})
                if payload.get('model') != 'jev-latest' or not payload.get('state') or not isinstance(payload.get('questions'), dict) or len(payload['questions']) > 8:
                    return self.send(400, {'error': 'Invalid request'})
                request = urllib.request.Request('https://api.typesafe.ai/v1/systemone', data=raw, headers={'Authorization': authorization, 'Content-Type': 'application/json'}, method='POST')
                with OPENER.open(request, timeout=32) as response:
                    return self.send(200, json.load(response))
            if self.path == '/api/references':
                question = payload.get('question')
                if not isinstance(question, str) or len(question) > 1500:
                    return self.send(400, {'error': 'Invalid question'})
                words = re.sub(r'[?!.,;:()\[\]{}"“”]', ' ', question).split()
                query = ' '.join(word for word in words if word.lower() not in STOP_WORDS)[:240] or question[:240]
                params = {'action': 'query', 'format': 'json', 'formatversion': '2', 'generator': 'search', 'gsrsearch': query, 'gsrlimit': '3', 'gsrnamespace': '0', 'prop': 'extracts|info', 'inprop': 'url', 'exintro': '1', 'explaintext': '1', 'exchars': '2400'}
                request = urllib.request.Request('https://pt.wikipedia.org/w/api.php?' + urllib.parse.urlencode(params), headers={'User-Agent': 'SimOuNaoJev/1.0 (personal question app)', 'Accept': 'application/json'})
                with OPENER.open(request, timeout=7) as response:
                    data = json.load(response)
                pages = sorted(data.get('query', {}).get('pages', []), key=lambda p: p.get('index', 0))
                references = [{'title': p['title'], 'url': p['fullurl'], 'text': p['extract'][:2400]} for p in pages if p.get('extract') and p.get('fullurl', '').startswith('https://pt.wikipedia.org/wiki/')][:3]
                return self.send(200, {'references': references})
            return self.send(404, {'error': 'Não encontrado.'})
        except urllib.error.HTTPError as error:
            status = error.code if self.path == '/api/jev' else 502
            return self.send(status, {'error': 'External service request failed'})
        except (ValueError, TypeError):
            return self.send(400, {'error': 'Pedido inválido.'})
        except Exception:
            return self.send(502, {'error': 'Não foi possível conectar ao serviço.'})

def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'\nSim ou Não · Jev\n\nAbra no navegador: {url}\n\nMantenha esta janela aberta durante o uso.\nPara encerrar, pressione Ctrl+C.\n', flush=True)
    if '--no-open' not in sys.argv:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
