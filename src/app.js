require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');

const app = express();
const port = process.env.PORT || 3000;

// connect to MongoDB
connectDB();

// middleware
app.use(express.json());

// routes
app.use('/', require('./routes'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
