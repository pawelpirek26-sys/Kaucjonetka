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
    const query = new URLSearchParams(body).get('data') ?? '';
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ua=${req.headers['user-agent']}\n${query}`);
    if (req.method !== 'POST' || !query.includes('[out:json]')) {
      res.writeHead(400).end('bad request');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(fixture);
  });
}).listen(Number(port), '0.0.0.0', () => console.log(`mock overpass on :${port}`));
