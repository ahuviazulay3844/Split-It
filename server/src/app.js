require('dotenv').config();
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
