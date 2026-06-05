# SplitIn AI Agent Instructions

Welcome! This is a **group expense management system** (SplitIn/SplitIt Pro) in early development. Use this guide to be immediately productive.

## Quick Start
 
- **Entry point**: [src/app.js](src/app.js)
- **Start dev server**: `npm run dev` (auto-reload with nodemon)
- **Database**: MongoDB (URI in `.env`, defaults to `mongodb://localhost:27017/splitin`)
- **API base**: `http://localhost:3000`

## Project Architecture

### Current State
- ✅ Basic Express/Mongoose setup
- ✅ Health check endpoint (`GET /health`)
- ✅ User model skeleton
- ⚠️ Most services and features are not yet implemented

### Full Architecture Plan
See [untitled-plan-splitItPro.prompt.md](untitled-plan-splitItPro.prompt.md) for the complete system design including:
- 6 Mongoose models (User, Group, GroupMember, Expense, Payment, Category)
- 7 service layers (Auth, Group, Expense, Settlement, Balance, ExitValidation)
- RESTful API with ~30 endpoints
- Middleware chain (Auth, ErrorHandler, Ownership, GroupPermissions, Validation)

## Core Conventions

### Layer Separation (CRITICAL)
Follow strict separation of concerns:
```
Routes (map HTTP) → Controllers (handle req/res) 
                  → Services (business logic)
                  → Models (data layer)
```

**Never** mix business logic into controllers. **Always** use services for:
- Expense calculations
- Balance updates
- Multi-step transactions (use MongoDB sessions)
- Authorization logic beyond simple checks

### File Organization
```
src/
  app.js                          # Minimal initialization
  config/db.js                    # Database connection
  controllers/                    # req/res handling only
    healthController.js           # Example: simple endpoint
  models/                         # Mongoose schemas
    userModel.js                  # Example: User model
  routes/                         # Route aggregation
    index.js                      # Map routes to controllers
  services/                       # Business logic (not yet created)
  middlewares/                    # Cross-cutting concerns (not yet created)
  utils/                          # Helpers (not yet created)
```

### Controller Pattern
Controllers export functions and handle **request/response only**:
```javascript
exports.health = (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
};
```

### Model Pattern
Use Mongoose with proper validation, unique constraints, and timestamps:
```javascript
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
```

### Service Layer (Future Implementation)
Services contain business logic and are called by controllers:
```javascript
// In services/expenseService.js
const addExpenseToGroup = async (groupId, expenseData) => {
  // Multi-step logic with transactions
};
```

## Key Development Patterns

| Pattern | Rule |
|---------|------|
| **Error Handling** | Implement centralized middleware (planned) with custom `AppError` class |
| **Transactions** | Use MongoDB sessions for multi-step operations (expense + balance updates) |
| **Validation** | Middleware-level validation (Zod planned) before reaching controllers |
| **Authentication** | JWT stateless (planned); check ownership at middleware level |
| **Config** | Always read from `.env` (see [.env.example](.env.example)); never hardcode |
| **Exit Blocking** | Users can't leave groups with outstanding balances (business rule) |
| **Balance Algorithm** | Minimal debt tracking for efficient settlement calculations |

## Environment Setup

Create `.env` from [.env.example](.env.example):
```
MONGO_URI=mongodb://localhost:27017/splitin
PORT=3000
```

## Common Tasks

### Add a New Endpoint
1. Create controller in `src/controllers/`
2. Add route in `src/routes/index.js`
3. Create service in `src/services/` (if business logic is needed)
4. Test with `GET/POST http://localhost:3000/endpoint`

### Add a New Model
1. Create schema in `src/models/`
2. Export Mongoose model: `module.exports = mongoose.model('ModelName', schema);`
3. Import in services and controllers as needed

### Run Development Server
```bash
npm run dev
```
Automatically restarts on file changes.

## AI Agent Behavior Guidelines

✅ **Do**:
- Check `untitled-plan-splitItPro.prompt.md` for full architectural context
- Keep business logic in `services/`, never in controllers
- Use middleware for auth, validation, error handling
- Create services for complex operations
- Use MongoDB sessions for transactions
- Follow the existing folder structure

❌ **Don't**:
- Mix request handling with business logic
- Hardcode configuration values
- Skip error handling for edge cases
- Create routes without corresponding controllers
- Bypass the middleware stack
- Add features not in the architecture plan without confirming first

## Language & Codebase Notes

- **Language**: JavaScript (Node.js)
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Development**: Nodemon for auto-reload
- **README**: Hebrew and English (see [README.md](README.md))

## Questions?

If implementing features not yet in the codebase:
1. Refer to [untitled-plan-splitItPro.prompt.md](untitled-plan-splitItPro.prompt.md) for design context
2. Follow established patterns (controllers → services → models)
3. Ask for clarification on architectural decisions
