require('dotenv').config();
console.log('--- DIAGNOSTIC ---');
console.log('Is GEMINI_API_KEY defined?', !!process.env.GEMINI_API_KEY);
console.log('First 5 chars of key:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : 'N/A');
console.log('------------------');
const http = require('http');
const express = require('express');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { init: initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
initSocket(server);

const port = process.env.PORT || 3000;

connectDB();

app.use(express.json());

app.use('/', require('./routes'));

app.use(errorHandler);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
