require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
// 1. ייבוא המודל
const Category = require('./models/Category.model.js');
const app = express();
const port = process.env.PORT || 3000;

// connect to MongoDB
connectDB();

// 2. פונקציה להוספת הקטגוריה "אוכל"
async function addInitialData() {
  try {
    const foodCategory = new Category({ name: 'אוכל' });
    await foodCategory.save();
    console.log('--- הקטגוריה "אוכל" נוספה בהצלחה! ---');
  } catch (err) {
    // אם הקטגוריה כבר קיימת, לא נורא
    console.log('--- הקטגוריה כנראה כבר קיימת או שיש שגיאה ---');
  }
}

// מריצים את הבדיקה אחרי שהשרת עולה
addInitialData();

// middleware
app.use(express.json());

// routes
app.use('/', require('./routes'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});