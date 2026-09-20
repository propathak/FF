/** Serves the poorly-optimised fixture site for visual/manual testing. */
import http from 'node:http';
import { poorSite } from '../tests/fixtures/site';

const byPath = new Map(poorSite().map((r) => [r.path, r]));
http
  .createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const route = byPath.get(path) ?? byPath.get(path.replace(/\/$/, ''));
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Not found</h1></body></html>');
      return;
    }
    res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/html; charset=utf-8' });
    res.end(route.body);
  })
  .listen(8800, '127.0.0.1', () => console.log('poor fixture on http://127.0.0.1:8800'));
