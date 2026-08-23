// Tiny local server for Astar Care — plain Node http, no deps.
// Run: node server.js  →  http://localhost:8766
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 8766;
var file = path.join(__dirname, 'index.html');

http.createServer(function (req, res) {
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(500); res.end('index.html not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}).listen(PORT, function () {
  console.log('Astar Care running at http://localhost:' + PORT);
});
