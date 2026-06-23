# SplitIt

**מערכת לניהול הוצאות משותפות בקבוצות** — Full-Stack Web Application

SplitIt מאפשר למשתמשים ליצור קבוצות (שותפים לדירה, טיול, אירוע), לרשום הוצאות, לחלק אותן בין חברי הקבוצה, ולקבל תמונת מצב ברורה של מי חייב למי — כולל סילוק חובות ועוזר AI בשפה טבעית.

---

## תקציר למנהלים

| | |
|---|---|
| **הבעיה** | ניהול הוצאות משותפות בין מספר אנשים נוטה להיות מבלבל — מי שילם, מי חייב, וכמה בדיוק. |
| **הפתרון** | אפליקציית Web שמרכזת הוצאות לפי קבוצות, מחשבת יתרות אוטומטית, ומציגה את מינימום ההעברות הנדרש לסגירת חובות. |
| **ערך עסקי** | שקיפות כספית בין משתתפים, הפחתת מחלוקות, וחוויית משתמש מודרנית עם דשבורד, גרפים ועוזר חכם. |

### יכולות עיקריות

- **הרשמה והתחברות** — אימות מאובטח עם JWT
- **קבוצות** — יצירת קבוצות, ניהול חברים, קוד קבוצה ייחודי
- **הוצאות** — רישום הוצאות עם חלוקה שווה או מותאמת אישית, קטגוריות ותיאור
- **יתרות וחובות** — חישוב אוטומטי של "מי חייב למי" + אלגוריתם לפישוט חובות (מינימום העברות)
- **סילוק חובות** — סימון תשלומים שבוצעו ועדכון יתרות
- **דשבורד** — תמונת מצב אישית: קבוצות פעילות, מאזן נטו, הוצאות ממתינות
- **עוזר AI** — צ'אט בעברית/אנגלית (Google Gemini) לביצוע פעולות בשפה טבעית — "הוסף הוצאה של 200 ש״ח על ארוחה"
- **זמן אמת** — עדכונים מיידיים בקבוצה דרך Socket.io

---

## טכנולוגיות

| שכבה | טכנולוגיה |
|------|-----------|
| **Backend** | Node.js, Express.js, JavaScript |
| **Frontend** | Angular 20, TypeScript, Tailwind CSS 4 |
| **Database** | MongoDB (Mongoose ODM) |
| **Authentication** | JWT (`jsonwebtoken`) + bcrypt |
| **Validation** | Zod (שרת), Angular Forms (לקוח) |
| **Real-time** | Socket.io |
| **AI** | Google Gemini API |
| **Charts** | ApexCharts (`ng-apexcharts`) |
| **Dev tools** | nodemon, Angular CLI, Karma/Jasmine |

---

## ארכיטקטורה

הפרויקט בנוי כ-**Monorepo** עם שני חלקים עצמאיים:

```text
SplitIt/
├── server/          # REST API + Socket.io  →  http://localhost:3000
└── client/          # Angular SPA           →  http://localhost:4200
```

### Backend — שכבות

```
Routes → Controllers → Services → Models
```

- **Routes** — הגדרת endpoints ו-middleware
- **Controllers** — קליטת בקשות והחזרת תגובות בלבד
- **Services** — לוגיקה עסקית, transactions, חישובי יתרות
- **Models** — סכמות Mongoose + אינדקסים
- **Middleware** — אימות JWT, הרשאות קבוצה, ולידציה (Zod), טיפול מרכזי בשגיאות

> כללי פיתוח מפורטים: [`AGENTS.md`](AGENTS.md) — ראו סעיף [AGENTS.md — כללי פיתוח](#agentsmd--כללי-פיתוח-למפתחים-ול-ai)

בפיתוח, `client/proxy.conf.json` מעביר בקשות מ-`/api`, `/health` ו-`/socket.io` לשרת.

---

## AGENTS.md — כללי פיתוח (למפתחים ול-AI)

[`AGENTS.md`](AGENTS.md) הוא **מסמך חובה** שמגדיר את כללי הארכיטקטורה של הפרויקט. הוא נועד גם למפתחים אנושיים וגם ל-AI agents (Cursor וכו') — כדי שכל שינוי בקוד ישמור על אותה מבנה, אבטחה ועקביות.

### למה הוא קיים?

| קהל | מה הוא מקבל |
|-----|-------------|
| **מנהל / מרviewer** | ודאות שהקוד עוקב אחר שכבות ברורות, transactions, ולידציה — לא "סpaghetti" |
| **מפתח חדש** | מדריך מה מותר ומה אסור לפני שכותבים שורה ראשונה |
| **AI Agent** | הנחיות קשיחות שלא לדלג על middleware, לא לשים לוגיקה ב-controller, וכו' |

### ארכיטקטורת שכבות (חובה)

```
Routes → Controllers → Services → Models
```

כל בקשה עוברת את השרשרת הזו — **אסור לדלג על שכבה** או לערבב אחריות.

### מה **אסור** (FORBIDDEN)

| כלל | הסבר |
|-----|------|
| לוגיקה עסקית ב-controllers | Controller רק מעביר ל-service ומחזיר תגובה |
| שאילתות DB ישירות ב-controllers | רק services נוגעים ב-Mongoose |
| hardcode של config | הכל דרך `process.env` |
| async בלי try/catch | כל service/controller async חייב טיפול בשגיאות |
| דילוג על middleware | auth → validate → controller — תמיד |
| קוד סינכרוני ב-services | רק `async/await` |

### מה **חובה** (REQUIRED)

| שכבה | דרישות |
|------|---------|
| **Controllers** | req/res בלבד, delegate ל-service, `next(err)` בשגיאה |
| **Services** | async + try/catch, transactions לפעולות רב-מסמכיות, החזרת data בלבד (לא HTTP) |
| **Models** | Mongoose schema, timestamps, unique indexes |
| **Middleware** | Zod validation לפני controller, auth לפני routes מוגנים |
| **Config** | `.env` + עדכון `.env.example` |

### Cursor Skill — `.cursor/skills/splitit-feature/`

בנוסף ל-`AGENTS.md`, יש **Skill ייעודי** ל-Cursor AI:

```text
.cursor/skills/splitit-feature/SKILL.md
```

ה-Skill מרחיב את `AGENTS.md` עם:
- **Workflow** מסודר להוספת feature חדש (Model → Validator → Service → Controller → Route)
- **Templates** מוכנים ל-service עם transaction, controller, route
- **רשימת infrastructure** קיים שלא ליצור מחדש (`auth.middleware`, `validate.middleware`, `errorHandler`)
- כללים נוספים — atomic balances, `.select()` בלי password, response shape אחיד

> כשמוסיפים endpoint / model / service חדש — עובדים לפי `AGENTS.md` + ה-Skill.

### קישורים

| מסמך | תוכן |
|------|------|
| [`AGENTS.md`](AGENTS.md) | כללי ארכיטקטורה — גרסה קצרה |
| [`.cursor/skills/splitit-feature/SKILL.md`](.cursor/skills/splitit-feature/SKILL.md) | מדריך מפורט + templates ל-AI |
| [`untitled-plan-splitItPro.prompt.md`](untitled-plan-splitItPro.prompt.md) | תכנון מלא — DB, API, roadmap |

---

## מבנה הפרויקט — תיקיות וקבצים

### שורש הפרויקט (`SplitIt/`)

| קובץ / תיקייה | תפקיד |
|---------------|--------|
| `package.json` | סקריפטים מרכזיים להרצת server/client והתקנת תלויות |
| `README.md` | תיעוד הפרויקט (קובץ זה) |
| `AGENTS.md` | **כללי ארכיטקטורה חובה** — שכבות, איסורים, דרישות (ראו [סעיף AGENTS](#agentsmd--כללי-פיתוח-למפתחים-ול-ai)) |
| `.cursor/skills/splitit-feature/` | Skill ל-Cursor AI — workflow + templates להוספת features |
| `INIT.md` | מדריך התחלה מהיר — endpoints ומבנה Angular |
| `untitled-plan-splitItPro.prompt.md` | מסמך תכנון מקורי — ארכיטקטורה, סכמות DB, roadmap |
| `.gitignore` | קבצים שלא נכנסים ל-git (`.env`, `node_modules` וכו') |
| `server/` | Backend — Express + MongoDB |
| `client/` | Frontend — Angular |

---

### Backend (`server/`)

```text
server/
├── src/
│   ├── app.js                    # נקודת כניסה — Express, DB, routes, Socket.io
│   ├── socket.js                 # Socket.io: אימות JWT, חדרי קבוצה, צ'אט AI
│   ├── config/
│   │   └── db.js                 # חיבור ל-MongoDB (Mongoose)
│   ├── routes/                   # הגדרת URL-ים — מחבר middleware → controller
│   ├── controllers/              # req/res בלבד — מעביר ל-service
│   ├── services/                 # לוגיקה עסקית + transactions
│   ├── models/                   # סכמות Mongoose
│   ├── middleware/               # auth, validation, errors
│   ├── validators/               # סכמות Zod לקלט
│   └── utils/                    # עזרים טהורים (אלגוריתמים, Gemini client)
├── thunder-tests/                # אוסף בקשות ל-Thunder Client (בדיקות API)
├── .env.example                  # תבנית משתני סביבה
├── package.json
└── package-lock.json
```

#### `src/app.js` — נקודת כניסה

טוען `.env`, יוצר את אפליקציית Express, מתחבר ל-MongoDB, מאתחל Socket.io, מגדיר JSON parser, טוען routes, ומריץ error handler מרכזי.

#### `src/config/`

| קובץ | תפקיד |
|------|--------|
| `db.js` | `connectDB()` — חיבור ל-MongoDB לפי `MONGO_URI`, לוג הצלחה/כשל |

#### `src/routes/` — ניתוב HTTP

| קובץ | Prefix | מה מוגדר |
|------|--------|----------|
| `index.js` | `/` | מאגד את כל ה-routes + `GET /health` + 404 catch-all |
| `auth.routes.js` | `/api/auth` | register, login |
| `user.routes.js` | `/api/users` | חיפוש משתמשים |
| `group.routes.js` | `/api/groups` | יצירת קבוצה, הוצאות, balance, overview |
| `expense.routes.js` | `/api/expenses` | הוספת הוצאה |
| `category.routes.js` | `/api/categories` | רשימת קטגוריות |
| `dashboard.routes.js` | `/api/dashboard` | דשבורד אישי |
| `settlement.routes.js` | `/api/settlements` | סילוק חוב |
| `assistant.routes.js` | `/api/assistant` | צ'אט AI (REST) |

#### `src/controllers/` — שכבת HTTP

כל controller מקבל `req`/`res`, קורא ל-service, ומחזיר JSON. **אין** לוגיקה עסקית או שאילתות DB ישירות.

| קובץ | אחריות |
|------|---------|
| `auth.controller.js` | הרשמה והתחברות |
| `user.controller.js` | חיפוש משתמשים |
| `group.controller.js` | יצירת קבוצה |
| `expense.controller.js` | הוספת/רשימת הוצאות |
| `balance.controller.js` | יתרה אישית ו-overview קבוצתי |
| `settlement.controller.js` | סילוק חוב |
| `dashboard.controller.js` | נתוני דשבורד |
| `category.controller.js` | קטגוריות |
| `assistant.controller.js` | צ'אט AI |
| `healthController.js` | `GET /health` — בדיקת תקינות |

#### `src/services/` — לוגיקה עסקית

| קובץ | תפקיד |
|------|--------|
| `auth.service.js` | hash סיסמה (bcrypt), יצירת JWT, register/login |
| `user.service.js` | חיפוש משתמשים לפי שם/אימייל |
| `group.service.js` | יצירת קבוצה + חברים (transaction), קוד קבוצה ייחודי |
| `expense.service.js` | הוספת הוצאה, חלוקה equal/custom, עדכון יתרות (transaction) |
| `balance.service.js` | חישוב יתרות, overview, הפעלת פישוט חובות |
| `settlement.service.js` | סילוק חוב — עדכון balances + רישום settlement |
| `dashboard.service.js` | אגרגציה: קבוצות, מאזן נטו, settlements ממתינים |
| `category.service.js` | שליפת קטגוריות הוצאות |
| `assistant.service.js` | שליחה ל-Gemini, בחירת action, ביצוע, תשובה בשפה טבעית |
| `assistant.actions.js` | קטלוג פעולות AI — declarations + execute (create group, add expense וכו') |

#### `src/models/` — MongoDB / Mongoose

| קובץ | Collection | שדות עיקריים |
|------|------------|--------------|
| `User.model.js` | `Users` | firstName, familyName, email, password (hash) |
| `Group.model.js` | `Group` | groupCode, groupName, adminId, totalExpenses |
| `GroupMember.model.js` | `GroupMembers` | groupId, userId, role, balance |
| `Expense.model.js` | `Expenses` | groupId, payerId, amount, splitType, splits, participants |
| `Category.model.js` | `Categories` | שם קטגוריה (Food, Transport...) |
| `Settlement.model.js` | `Settlements` | fromUser, toUser, amount, groupId, status |
| `Payment.model.js` | `Payments` | רישום תשלומים בין משתמשים |

#### `src/middleware/`

| קובץ | תפקיד |
|------|--------|
| `auth.middleware.js` | אימות JWT — מוסיף `req.user` |
| `authGroup.middleware.js` | וידוא שהמשתמש חבר בקבוצה (`:groupId`) |
| `validate.middleware.js` | הרצת סכמת Zod על body/params/query |
| `errorHandler.js` | טיפול מרכזי בשגיאות — status + message אחיד |

#### `src/validators/` — Zod Schemas

| קובץ | מה מאמת |
|------|---------|
| `auth.validators.js` | register, login |
| `group.validators.js` | createGroup |
| `expense.validators.js` | createExpense |
| `settlement.validators.js` | settle |
| `assistant.validators.js` | chat message |

#### `src/utils/`

| קובץ | תפקיד |
|------|--------|
| `debtSimplification.js` | אלגוריתם Greedy — ממזער העברות כסף בין חברי קבוצה |
| `geminiClient.js` | wrapper ל-Google Gemini API (generateContent, models, timeout) |

#### `src/socket.js`

- אימות JWT ב-handshake (כמו REST)
- `join:group` / `leave:group` — חדרים לפי קבוצה
- `assistant:chat` — צ'אט AI בזמן אמת
- broadcast עדכונים לחדר קבוצה

#### `server/thunder-tests/`

קבצי Thunder Client לבדיקות API ידניות (`thunderCollection.json`, `thunderEnvironment.json`).

---

### Frontend (`client/`)

```text
client/
├── src/
│   ├── main.ts                   # bootstrap — מריץ את האפליקציה
│   ├── index.html                # HTML ראשי
│   ├── styles.scss               # Tailwind + סגנונות גלובליים
│   └── app/
│       ├── app.ts                # root component
│       ├── app.config.ts         # providers: router, HTTP, interceptor
│       ├── app.routes.ts         # ניתוב + lazy loading + guards
│       ├── app.html / app.scss
│       ├── core/                 # שירותים, guards, models — singleton
│       ├── features/             # מסכים לפי דומיין
│       └── shared/               # קומפוננטות לשימוש חוזר
├── public/                       # favicon וקבצים סטטיים
├── proxy.conf.json               # proxy ל-API ב-dev
├── angular.json                  # הגדרות Angular CLI
├── postcss.config.json           # Tailwind / PostCSS
├── tsconfig.json                 # TypeScript
└── package.json
```

#### `src/app/` — קבצי שורש

| קובץ | תפקיד |
|------|--------|
| `app.ts` | Root component — `<router-outlet>` |
| `app.config.ts` | DI providers: Router, HttpClient + `authInterceptor` |
| `app.routes.ts` | Routes: `/auth`, `/dashboard`, `/groups/:groupId` + guards |
| `app.html` / `app.scss` | layout בסיסי |

#### `core/` — תשתית משותפת

```text
core/
├── config/
│   └── api.config.ts             # base URLs ל-API
├── constants/
│   └── auth.constants.ts         # מפתחות localStorage (token)
├── guards/
│   ├── auth.guard.ts             # מגן על routes מחוברים
│   └── guest.guard.ts            # מפנה משתמש מחובר מ-/auth
├── interceptors/
│   └── auth.interceptor.ts       # מוסיף Authorization header לכל בקשה
├── models/                       # TypeScript interfaces
│   ├── user.model.ts
│   ├── group.model.ts
│   ├── expense.model.ts
│   ├── dashboard.model.ts
│   ├── assistant.model.ts
│   ├── health.model.ts
│   └── api-response.model.ts
└── services/
    ├── api.service.ts            # wrapper גנרי ל-HTTP
    ├── auth.service.ts           # login, register, logout, user signal
    ├── user.service.ts           # חיפוש משתמשים
    ├── group.service.ts          # קבוצות, הוצאות, balance
    ├── dashboard.service.ts      # נתוני דשבורד
    ├── health.service.ts         # GET /health
    └── socket.service.ts         # חיבור Socket.io + events
```

| שירות | מה עושה |
|--------|---------|
| `auth.service.ts` | שמירת JWT, login/register, signal של משתמש מחובר |
| `group.service.ts` | CRUD קבוצות, הוצאות, overview |
| `dashboard.service.ts` | שליפת דשבורד אישי |
| `socket.service.ts` | חיבור ל-Socket.io, join/leave group, assistant chat |
| `auth.interceptor.ts` | מצרף `Bearer token` אוטומטית לכל HTTP request |

#### `features/` — מסכים (Lazy Loaded)

```text
features/
├── auth/
│   ├── auth-page/                # מסך התחברות/הרשמה
│   ├── login-form/               # טופס login
│   └── register-form/            # טופס register
├── dashboard/
│   └── dashboard.component.*     # דשבורד — קבוצות, סטטיסטיקות, יצירת קבוצה
├── groups/
│   ├── group-page/               # מסך קבוצה — הוצאות, יתרות, גרפים, AI
│   ├── create-group/             # modal/dialog יצירת קבוצה
│   └── add-expense/              # modal הוספת הוצאה
└── health/
    └── health-check.component.*  # בדיקת חיבור לשרת
```

| Feature | Route | תיאור |
|---------|-------|--------|
| `auth-page` | `/auth` | מסך כניסה — login + register (guestGuard) |
| `dashboard` | `/dashboard` | רשימת קבוצות, סיכום מאזן, כפתור + ליצירת קבוצה |
| `group-page` | `/groups/:groupId` | הוצאות, מי חייב למי, גרף עוגה, צ'אט AI, סילוק |
| `health-check` | (פנימי) | בדיקה שה-API זמין |

#### `shared/` — קומפוננטות לשימוש חוזר

```text
shared/
├── assistant-chat/               # widget צ'אט AI (Socket.io + UI)
└── charts/
    └── pie-card/                 # גרף עוגה (ApexCharts) — הוצאות לפי קטגוריה
```

#### קבצי תצורה ב-`client/`

| קובץ | תפקיד |
|------|--------|
| `proxy.conf.json` | מעביר `/api`, `/health`, `/socket.io` → `localhost:3000` |
| `angular.json` | build, serve, assets, styles |
| `postcss.config.json` | Tailwind CSS 4 |
| `tsconfig*.json` | הגדרות TypeScript (app, spec) |

---

### זרימת בקשה — דוגמה

**הוספת הוצאה:**

```text
[Angular] add-expense.component
    → group.service.ts  (POST /api/expenses)
        → proxy.conf.json  →  localhost:3000
            → expense.routes.js
                → auth.middleware  →  validate.middleware  →  expense.controller
                    → expense.service  (transaction)
                        → Expense.model + GroupMember.model
                    ← JSON response
                ← HTTP 201
            ← Socket.io broadcast ל-group room
    ← UI מתעדכן
```

**צ'אט AI:**

```text
[Angular] assistant-chat.component
    → socket.service  (event: assistant:chat)
        → socket.js  →  assistant.service
            → geminiClient  (Gemini API)
            → assistant.actions  (execute action)
            → domain service (expense / group / ...)
        ← תשובה בשפה טבעית
```

---


## דרישות מקדימות

- **Node.js** 18 ומעלה
- **npm** 9 ומעלה
- **MongoDB** — Atlas או instance מקומי
- **(אופציונלי)** מפתח Google Gemini — לעוזר ה-AI

---

## התקנה והרצה

### 1. Clone והתקנת תלויות

```bash
git clone <repository-url>
cd SplitIt
npm run install:all
```

### 2. הגדרת סביבה

```bash
cp server/.env.example server/.env
```

ערוך את `server/.env` והגדר לפחות:

| משתנה | תיאור |
|-------|--------|
| `MONGO_URI` | מחרוזת חיבור ל-MongoDB |
| `PORT` | פורט השרת (ברירת מחדל: `3000`) |
| `JWT_SECRET` | מפתח סודי לחתימת JWT |
| `JWT_EXPIRES_IN` | תוקף טוקן (למשל `7d`) |
| `GEMINI_API_KEY` | מפתח API לעוזר AI (אופציונלי) |

### 3. הרצה

פתח **שני** טרמינלים:

```bash
# טרמינל 1 — Backend
npm run server

# טרמינל 2 — Frontend
npm run client
```

| שירות | כתובת |
|-------|--------|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/health |

### סקריפטים נוספים

```bash
npm run install:all    # התקנת תלויות server + client
npm run server         # שרת ב-dev (nodemon)
npm run client         # Angular dev server
npm run build:client   # build ל-production
```

---

## API — סקירה

| Method | Endpoint | תיאור |
|--------|----------|--------|
| `GET` | `/health` | בדיקת תקינות השרת |
| `POST` | `/api/auth/register` | הרשמת משתמש |
| `POST` | `/api/auth/login` | התחברות + JWT |
| `GET` | `/api/users/search?q=` | חיפוש משתמשים |
| `POST` | `/api/groups` | יצירת קבוצה |
| `GET` | `/api/groups/:groupId/expenses` | רשימת הוצאות |
| `GET` | `/api/groups/:groupId/balance` | יתרה אישית בקבוצה |
| `GET` | `/api/groups/:groupId/overview` | תמונת מצב מלאה + העברות מפושטות |
| `POST` | `/api/expenses` | הוספת הוצאה |
| `GET` | `/api/categories` | קטגוריות הוצאות |
| `GET` | `/api/dashboard` | דשבורד אישי |
| `POST` | `/api/settlements/settle` | סילוק חוב |
| `POST` | `/api/assistant/chat` | צ'אט עם עוזר AI |

> כל ה-endpoints (מלבד `/health` ו-auth) דורשים Header: `Authorization: Bearer <token>`

---

## מודל נתונים

| Collection | תפקיד |
|------------|--------|
| `Users` | משתמשים רשומים |
| `Group` | קבוצות הוצאות |
| `GroupMembers` | חברות בקבוצות |
| `Expenses` | הוצאות + פירוט חלוקה |
| `Categories` | קטגוריות (Food, Transport וכו') |
| `Settlements` / `Payments` | רישום סילוקי חוב |

פעולות רב-מסמכיות (יצירת קבוצה, הוספת הוצאה, סילוק) מתבצעות ב-**MongoDB Transactions** לשמירה על עקביות.

---

## לוגיקה עסקית מרכזית

1. **חלוקת הוצאות** — כל הוצאה נרשמת עם משלם, סכום, משתתפים, וחלוקה (`equal` / `custom`)
2. **חישוב יתרות** — לכל חבר בקבוצה: כמה שילם מול כמה חייב → מאזן נטו
3. **פישוט חובות** — אלגוריתם Greedy (`debtSimplification.js`) שממזער את מספר ההעברות הנדרש
4. **עוזר AI** — Gemini מזהה כוונה, מפעיל פעולות דרך domain services, ומחזיר תשובה בשפה טבעית

---

## אבטחה

- סיסמאות מוצפנות עם **bcrypt**
- אימות **JWT** ב-REST וב-Socket.io
- **Zod validation** על כל קלט נכנס
- בדיקת **חברות בקבוצה** לפני גישה לנתוני קבוצה
- משתני סביבה רגישים ב-`.env` (לא ב-git)

---

## רישיון

MIT
