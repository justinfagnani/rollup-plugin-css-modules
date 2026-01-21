// A simple Node http server for local testing
// Run: npm run server

import * as http from 'http';

const host = 'localhost';
const port = 8000;

const requestListener: http.RequestListener = (req, res) => {
  console.log(req.url, req.headers);
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`
    <!doctype html>
    <html lang="en">      
      <head>
        <meta charset="utf-8">
        <title>Test</title> 
        <script type="module" src="index.js"></script>
      </head>
      <body>
       <h1>Test</h1>
      </body>
    </html>`);
  }
  if (req.url === '/index.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.writeHead(200);
    res.end(`
      import data from './data.json' with {type: 'json'};
      console.log('Testing', data);
      const response = fetch('./data.json');
    `);
  }
  if (req.url === '/data.json') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(`{"message": "Hello, world!"}`);
  }
};

const server = http.createServer(requestListener);
server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});
