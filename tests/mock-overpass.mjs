// Minimal stand-in for the Overpass API used by the local end-to-end import test.
// Usage: node tests/mock-overpass.mjs <fixture.json> [port]
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [fixturePath, port = '54399'] = process.argv.slice(2);
const fixture = readFileSync(fixturePath, 'utf8');

createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    // POST form body, or GET ?data= as sent by pg_net (public.osm_overpass_request)
    const search = new URL(req.url ?? '/', 'http://mock').searchParams;
    const query = (req.method === 'GET' ? search : new URLSearchParams(body)).get('data') ?? '';
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ua=${req.headers['user-agent']}\n${query}`);
    if (!['GET', 'POST'].includes(req.method ?? '') || !query.includes('[out:json]')) {
      res.writeHead(400).end('bad request');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(fixture);
  });
}).listen(Number(port), '0.0.0.0', () => console.log(`mock overpass on :${port}`));
