// Tiny local server for Astar Care — plain Node http, no deps.
// Run: node server.js
//   Worker portal: http://localhost:8766
//   Admin portal:  http://localhost:8766/admin
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 8766;
var statics = {
  '/sw.js': ['sw.js', 'application/javascript; charset=utf-8'],
  '/manifest.json': ['manifest.json', 'application/manifest+json'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png']
};

http.createServer(function (req, res) {
  var p = req.url.split('?')[0];
  var entry = statics[p];
  var file = entry ? path.join(__dirname, entry[0]) : path.join(__dirname, 'index.html');
  var type = entry ? entry[1] : 'text/html; charset=utf-8';
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  });
}).listen(PORT, function () {
  console.log('Astar Care — worker http://localhost:' + PORT + '  admin http://localhost:' + PORT + '/admin');
});
