---
name: splitit-feature
description: Add a new backend feature to the SplitIt Express/MongoDB project following its layered architecture (Model → Service → Controller → Route) with JWT auth, Zod validation, centralized error handling, and MongoDB transactions for atomic multi-document writes. Use when adding or modifying any backend endpoint, model, service, controller, route, validator, or middleware in this project.
---

# SplitIt Feature Architecture

Build every backend feature in strict layers. Never skip or merge layers.

```
Route → (auth) → (validate) → Controller → Service → Model
```

## Hard rules

- ❌ No business logic or DB queries in controllers. Controllers only read `req`, call a service, send the response, and `next(err)` on failure.
- ❌ Services never touch `req`/`res`. They take plain args and return data (or throw).
- ❌ No hardcoded config. Read from `process.env`.
- ✅ Every multi-document write that must be all-or-nothing uses a MongoDB transaction.
- ✅ Every model has `{ timestamps: true }`, required fields, and unique indexes where applicable.
- ✅ Every protected route uses `authMiddleware`; every body-taking route uses `validate(schema)`.
- ✅ Never return `password` or other secrets from a service (`.select()` safe fields only).
-✅ Atomic Balances: When updating group balances, always calculate the new balance within the same transaction as the expense creation. Never update balances in a separate request.
## File layout & naming

| Layer | Path | Naming |
|-------|------|--------|
| Model | `src/models/` | `Thing.model.js`, exports `mongoose.model('Thing', schema, 'Thing')` |
| Validator | `src/validators/` | `thing.validators.js`, exports named Zod schemas |
| Service | `src/services/` | `thing.service.js`, exports named async functions |
| Controller | `src/controllers/` | `thing.controller.js`, thin handlers |
| Route | `src/routes/` | `thing.routes.js`, then mount in `src/routes/index.js` |

## Workflow

Copy and track:

```
- [ ] 1. Model: schema + timestamps + indexes
- [ ] 2. Validator: Zod schema for the request body
- [ ] 3. Service: business logic, transactions, safe field selection
- [ ] 4. Controller: thin handler delegating to service
- [ ] 5. Route: wire authMiddleware + validate + controller
- [ ] 6. Mount route in src/routes/index.js under /api/<resource>
- [ ] 7. ReadLints on edited files
```

## Layer templates

### Service (with transaction)

For atomic multi-document operations, follow this exact pattern:

```js
const mongoose = require('mongoose');

const doThing = async (args) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // every write call must pass { session }
    const [doc] = await Model.create([data], { session });
    await Other.updateMany(filter, update, { session });
    await session.commitTransaction();
    return doc;
  } catch (err) {
    await session.abortTransaction();
    throw err;          // let the controller forward to errorHandler
  } finally {
    session.endSession();
  }
};
```

Throw errors with a `status` for client faults:

```js
const err = new Error('One or more selected users do not exist');
err.status = 400;
throw err;
```

### Controller

```js
const { doThing } = require('../services/thing.service');

const handle = async (req, res, next) => {
  try {
    const result = await doThing(req.validatedBody, req.user._id);
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { handle };
```

### Route

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { thingSchema } = require('../validators/thing.validators');
const { handle } = require('../controllers/thing.controller');

router.post('/', authMiddleware, validate(thingSchema), handle);

module.exports = router;
```

## Existing infrastructure to reuse (do not recreate)

- `src/middleware/auth.middleware.js` — verifies `Authorization: Bearer <token>`, sets `req.user`.
- `src/middleware/validate.middleware.js` — `validate(schema)`, populates `req.validatedBody`.
- `src/middleware/errorHandler.js` — centralized handler, must stay registered LAST in `app.js`.

## Conventions

- Response shape: success → `{ status: 'success', data }`; error is handled centrally as `{ status: 'error', message }`.
- Env vars live in `.env`; document new ones in `.env.example`.
- Always run `ReadLints` on edited files before finishing.
