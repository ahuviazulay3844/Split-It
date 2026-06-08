require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// connect to MongoDB
connectDB();

// middleware
app.use(express.json());

// routes
app.use('/', require('./routes'));

const Expense = require('./models/Expense.model.js'); // הייבוא של המודל שיצרנו

async function addExpense() {
  try {
    const newExpense = new Expense({
      title: "קניית מוצרים",
      amount: 50,
      date: new Date()
    });
    console.log("Saving to database:", mongoose.connection.name);
    await newExpense.save(); // כאן הקסם קורה והנתון נשמר ב-DB
    console.log("הוצאה חדשה נשמרה ב-Expenses!");
  } catch (err) {
    console.error("שגיאה:", err);
  }
}
const Category = require('./models/Category.model.js');

async function addCategory(categoryName) {
  try {
    const newCategory = new Category({
      name: categoryName,
      icon: "default-icon"
    });

    await newCategory.save();
    console.log(`קטגוריה '${categoryName}' נוספה בהצלחה!`);
  } catch (err) {
    console.error("שגיאה בהוספת קטגוריה:", err);
  }
}

// קריאה לפונקציה לדוגמה:
addCategory("אוכל");

addExpense();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
