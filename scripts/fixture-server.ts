/** Serves the test fixture site on a fixed port for manual/visual testing. */
import { goodSite, startFixtureServer } from '../tests/fixtures/site';
import http from 'node:http';

async function main() {
  const routes = goodSite();
  const byPath = new Map(routes.map((r) => [r.path, r]));
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const route = byPath.get(path) ?? byPath.get(path.replace(/\/$/, ''));
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Not found</h1></body></html>');
      return;
    }
    res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/html; charset=utf-8' });
    res.end(route.body);
  });
  server.listen(8799, '127.0.0.1', () => console.log('fixture site on http://127.0.0.1:8799'));
}
main();
