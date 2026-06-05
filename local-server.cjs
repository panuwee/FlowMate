const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
// Default to 3000 so it matches the Supabase Auth "Site URL" / redirect that
// most teams set up (Next.js default port). Override with `PORT=4174 node local-server.cjs`
// or `node local-server.cjs 4174`.
const port = Number(process.env.PORT) || Number(process.argv[2]) || 3000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".png": "image/png",
};

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const filePath = path.join(root, requestPath === "/" ? "index.html" : requestPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FlowMate local preview: http://127.0.0.1:${port}/`);
});
