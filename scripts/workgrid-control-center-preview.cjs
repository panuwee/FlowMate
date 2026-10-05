// Local-only preview. Serves the offline demo assets, never project secrets.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = new Map([
  ['/home/control-center.html', ['home/control-center.html', 'text/html; charset=utf-8']],
  ['/workgrid-control-center.js', ['workgrid-control-center.js', 'text/javascript; charset=utf-8']],
  ['/workgrid-control-center.css', ['workgrid-control-center.css', 'text/css; charset=utf-8']],
]);
const port = Number(process.env.WCC_PREVIEW_PORT || 4178);
http.createServer((req, res) => {
  const item = assets.get(new URL(req.url, 'http://127.0.0.1').pathname);
  if (!item || !['GET','HEAD'].includes(req.method)) {res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200, {'content-type':item[1], 'cache-control':'no-store'});
  res.end(req.method==='HEAD' ? '' : fs.readFileSync(path.join(root,item[0])));
}).listen(port,'127.0.0.1',()=>console.log(`Offline preview: http://127.0.0.1:${port}/home/control-center.html?demo=1`));
