import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { handleJev, handleReferences } from './api.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const server = createServer(async (req, res) => {
  const host = req.headers.host || '';
  if (!/^127\.0\.0\.1:\d+$/.test(host)) { res.writeHead(403); res.end('Acesso local apenas.'); return; }
  const origin = `http://${host}`;
  if (req.headers.origin && req.headers.origin !== origin) { res.writeHead(403); res.end('Origem não permitida.'); return; }
  const path = new URL(req.url, origin).pathname;
  try {
    if (req.method === 'POST' && (path === '/api/jev' || path === '/api/references')) {
      const parts = []; let bytes = 0;
      for await (const part of req) { bytes += part.length; if (bytes > 60000) { res.writeHead(413); res.end('Pedido muito grande.'); return; } parts.push(part); }
      const request = new Request(`${origin}${path}`, { method: 'POST', headers: req.headers, body: Buffer.concat(parts) });
      const response = await (path === '/api/jev' ? handleJev : handleReferences)(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    if (req.method !== 'GET' || (path !== '/' && path !== '/index.html')) { res.writeHead(404); res.end('Não encontrado.'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(await readFile(resolve(root, 'index.html')));
  } catch { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Não foi possível concluir a consulta.' })); }
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`\nSim ou Não · Jev\n\nAbra no navegador: ${url}\n\nMantenha esta janela aberta durante o uso.\nPara encerrar, pressione Ctrl+C.\n`);
  if (!process.argv.includes('--no-open')) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, { stdio: 'ignore', detached: true }); child.on('error', () => {}); child.unref();
  }
});
process.on('SIGINT', () => { server.close(); process.exit(0); });
