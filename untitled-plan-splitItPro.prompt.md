# SPLIT-IT PRO: Comprehensive Architecture & Implementation Plan

**Project**: Split-IT Pro - Group Expense Management System (Real-time, Node.js/MongoDB)  
**Architecture Level**: Senior Full-Stack  
**Status**: Planning Phase  
**Last Updated**: June 2, 2026

---

## 📋 Executive Summary

Build a production-grade group expense management system with:
- **RESTful API** (Node.js/Express/MongoDB)
- **JWT-based authentication** (stateless)
- **Equal split algorithm** with minimal debt tracking
- **Exit blocking mechanism** (users can't leave with outstanding balances)
- **ACID transactions** for data consistency
- **React + TypeScript frontend**
- **Docker containerization**
- **Centralized error handling** with custom AppError class
- **Zod schema validation**

---

## 🏗️ System Architecture

### Core Principles
1. **Separation of Concerns**: Controllers → Services → Data Access (Mongoose)
2. **Security-First**: Middleware-based Auth, Ownership, Group Permissions at route level
3. **Error Handling**: Centralized error middleware with consistent response format
4. **Transaction Safety**: MongoDB sessions for multi-step operations (expense + balance updates)
5. **Real-time Consistency**: Immediate balance recalculation on every transaction

---

## 📁 Folder Structure (Recommended)

```
SplitIt/
├── backend/
│   ├── src/
│   │   ├── config/               # Configuration files
│   │   │   ├── database.ts       # MongoDB connection
│   │   │   ├── env.ts           # Environment variables validation
│   │   │   └── constants.ts     # App constants
│   │   │
│   │   ├── models/              # Mongoose schemas & models
│   │   │   ├── User.ts
│   │   │   ├── Group.ts
│   │   │   ├── GroupMember.ts
│   │   │   ├── Expense.ts
│   │   │   ├── Payment.ts
│   │   │   └── Category.ts
│   │   │
│   │   ├── services/            # Business logic & calculations
│   │   │   ├── AuthService.ts           # JWT generation, password hashing
│   │   │   ├── GroupService.ts          # Group CRUD, member management
│   │   │   ├── ExpenseService.ts        # Expense creation, balance calculation
│   │   │   ├── SettlementService.ts     # Payment tracking, minimal split logic
│   │   │   ├── BalanceService.ts        # Real-time balance computation
│   │   │   └── ExitValidationService.ts # Exit eligibility check
│   │   │
│   │   ├── controllers/         # Request handling only
│   │   │   ├── authController.ts
│   │   │   ├── userController.ts
│   │   │   ├── groupController.ts
│   │   │   ├── expenseController.ts
│   │   │   ├── paymentController.ts
│   │   │   └── categoryController.ts
│   │   │
│   │   ├── routes/              # Route definitions
│   │   │   ├── authRoutes.ts
│   │   │   ├── userRoutes.ts
│   │   │   ├── groupRoutes.ts
│   │   │   ├── expenseRoutes.ts
│   │   │   ├── paymentRoutes.ts
│   │   │   └── index.ts         # Route aggregation
│   │   │
│   │   ├── middleware/          # Express middleware
│   │   │   ├── authMiddleware.ts        # JWT verification
│   │   │   ├── errorHandler.ts         # Global error handling
│   │   │   ├── ownershipMiddleware.ts  # Resource ownership check
│   │   │   ├── groupPermissionsMiddleware.ts # Group member validation
│   │   │   └── validationMiddleware.ts # Zod schema validation
│   │   │
│   │   ├── utils/
│   │   │   ├── AppError.ts             # Custom error class
│   │   │   ├── asyncHandler.ts         # Async/await wrapper
│   │   │   ├── jwt.ts                  # JWT utilities
│   │   │   ├── logger.ts               # Logging utility
│   │   │   └── validators.ts           # Zod schemas
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts                # TypeScript interfaces & types
│   │   │   └── express.d.ts            # Express type extensions
│   │   │
│   │   └── app.ts              # Express app setup
│   │
│   ├── server.ts              # Entry point
│   ├── .env.example           # Environment template
│   ├── .env                   # Environment (git-ignored)
│   ├── tsconfig.json
│   ├── package.json
│   └── Dockerfile
│
├── frontend/                  # React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/          # API client calls
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── store/             # State management (Context/Redux)
│   │   └── App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker-compose.yml         # MongoDB + Backend + Frontend
├── .gitignore
├── README.md
└── PLAN.md                    # (this file)
```

---

## 🔐 Database Schema & Indexes

### Collections

#### **Users**
```
{
  _id: ObjectId,
  firstName: String (required, min 2),
  familyName: String (required, min 2),
  email: String (required, unique),
  password: String (hashed bcrypt, min 8),
  phone: String (optional, unique if provided),
  role: Enum ["admin", "user"] (default: "user"),
  bankName: String (optional),
  accountNumber: String (optional, encrypted),
  bankBranch: String (optional),
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- email (unique)
- phone (unique, sparse)
```

#### **Groups**
```
{
  _id: ObjectId,
  groupCode: String (unique, auto-generated 6-char code),
  groupName: String (required, max 100),
  adminId: ObjectId (ref: User, required),
  description: String (optional, max 500),
  totalExpenses: Number (default: 0, cached),
  avgPerPerson: Number (default: 0, calculated),
  memberCount: Number (default: 0),
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- groupCode (unique)
- adminId
- createdAt
```

#### **GroupMembers**
```
{
  _id: ObjectId,
  groupId: ObjectId (ref: Group, required),
  userId: ObjectId (ref: User, required),
  personalCode: String (unique within group, auto-generated),
  roleInGroup: Enum ["admin", "member"] (default: "member"),
  balance: Number (default: 0, signed: positive = owes, negative = owed),
  isGet: Boolean (default: false, member has received payments),
  isPaid: Boolean (default: false, member has paid their share),
  status: Enum ["active", "pending", "exited"] (default: "active"),
  joinDate: Date,
  exitDate: Date (null if active),
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- { groupId, userId } (unique, compound)
- groupId
- status
```

#### **Expenses**
```
{
  _id: ObjectId,
  groupId: ObjectId (ref: Group, required),
  payerId: ObjectId (ref: User, required),
  amount: Number (required, min: 0.01),
  description: String (required, max 200),
  categoryId: ObjectId (ref: Category),
  splitType: Enum ["equal", "custom"] (default: "equal"),
  customSplit: { userId: ObjectId, percentage: Number }[] (optional),
  isSettled: Boolean (default: false),
  date: Date (default: now),
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- groupId
- payerId
- { groupId, date }
- isSettled
```

#### **Payments**
```
{
  _id: ObjectId,
  groupId: ObjectId (ref: Group, required),
  fromUserId: ObjectId (ref: User, required),
  toUserId: ObjectId (ref: User, required),
  amount: Number (required, min: 0.01),
  description: String (optional, max 200),
  isConfirmed: Boolean (default: false),
  confirmDate: Date (null until confirmed),
  date: Date (default: now),
  createdAt: Date,
  updatedAt: Date
}

Indexes:
- { groupId, fromUserId, toUserId }
- { groupId, isConfirmed }
- groupId
```

#### **Category**
```
{
  _id: ObjectId,
  name: String (required, unique),
  icon: String (emoji or icon code),
  description: String (optional),
  createdAt: Date
}

Indexes:
- name (unique)
```

---

## 🛣️ API Routes & Security Middleware

### Auth Routes (`/api/auth`)
- `POST /register` — Public | Zod validation | Hash password | Create user
- `POST /login` — Public | Validate credentials | Return JWT + refresh token
- `POST /refresh` — Public | Validate refresh token | Return new JWT
- `POST /logout` — **[Auth]** | Invalidate token (optional, if using token blacklist)

### User Routes (`/api/users`)
- `GET /:id` — **[Auth]** | Get user profile
- `PUT /:id` — **[Auth]** | **[Ownership]** | Update user (email, phone, bank details)
- `GET /:id/groups` — **[Auth]** | **[Ownership]** | List user's groups

### Group Routes (`/api/groups`)
- `POST /` — **[Auth]** | Create new group (user = admin)
- `GET /` — **[Auth]** | List all user's groups
- `GET /:groupId` — **[Auth]** | **[GroupPermissions]** | Get group details + member list + balance sheet
- `PUT /:groupId` — **[Auth]** | **[Ownership(adminId)]** | Update group name/description
- `DELETE /:groupId` — **[Auth]** | **[Ownership(adminId)]** | Soft-delete group (isActive = false)
- `POST /:groupId/members` — **[Auth]** | **[Ownership(adminId)]** | Invite user (by email or link)
- `PUT /:groupId/members/:memberId` — **[Auth]** | **[Ownership(adminId)]** | Update member role
- `DELETE /:groupId/members/:memberId` — **[Auth]** | **[GroupPermissions]** | **[ExitValidation]** | Leave/remove member
- `GET /:groupId/settlement` — **[Auth]** | **[GroupPermissions]** | Get minimal payment settlement (algorithm)

### Expense Routes (`/api/expenses`)
- `POST /:groupId` — **[Auth]** | **[GroupPermissions]** | Create expense | Update balances (Transaction)
- `GET /:groupId` — **[Auth]** | **[GroupPermissions]** | List all expenses in group
- `GET /:groupId/:expenseId` — **[Auth]** | **[GroupPermissions]** | Get expense details
- `PUT /:groupId/:expenseId` — **[Auth]** | **[Ownership(payerId)]** | Edit expense | Recalculate balances (Transaction)
- `DELETE /:groupId/:expenseId` — **[Auth]** | **[Ownership(payerId)]** | Delete expense | Reverse balance changes (Transaction)

### Payment Routes (`/api/payments`)
- `POST /:groupId` — **[Auth]** | **[GroupPermissions]** | Record payment between members | Update balances (Transaction)
- `GET /:groupId` — **[Auth]** | **[GroupPermissions]** | List all payments in group
- `PUT /:groupId/:paymentId/confirm` — **[Auth]** | **[Ownership(toUserId)]** | Confirm payment received

### Category Routes (`/api/categories`)
- `GET /` — Public | Get all categories
- `POST /` — **[Auth]** | **[Admin-only]** | Create category

---

## 🔑 Middleware Implementation Map

### `authMiddleware.ts`
- Extracts JWT from Authorization header (Bearer token)
- Verifies token signature & expiration
- Attaches decoded user to `req.user`
- Returns 401 if invalid/missing

**Usage**: Apply to all protected routes

### `ownershipMiddleware.ts`
- Checks if `req.user._id` matches resource owner (e.g., userId, adminId, payerId)
- Parameterized: `checkOwnership("userId")`, `checkOwnership("adminId")`
- Returns 403 if not owner

**Usage**: Routes that modify user-specific or admin-specific resources

### `groupPermissionsMiddleware.ts`
- Verifies `req.user` is active member of group (status = "active")
- Checks `GroupMembers` collection for { groupId, userId }
- Returns 403 if not member or status = "exited"

**Usage**: Routes within a group context

### `validationMiddleware.ts`
- Validates `req.body`, `req.params`, `req.query` against Zod schema
- Returns 400 with field-level errors if invalid

**Usage**: Applied to controllers or route handlers

### `errorHandler.ts`
- Global Express error middleware
- Catches all thrown errors (including async)
- Converts to AppError if needed
- Returns consistent JSON response: `{ success: false, error: { code, message, details }, statusCode }`

**Usage**: Mount last in app.ts

---

## 🧠 Service Layer Architecture (Business Logic)

### **AuthService**
- `generateTokens(userId)` — Generate JWT & refresh token
- `validatePassword(plain, hashed)` — Bcrypt comparison
- `hashPassword(plain)` — Bcrypt hash (salt rounds: 10)
- `registerUser(data)` — Create user + hash password

### **GroupService**
- `createGroup(adminId, groupName)` — Create group + add admin as member
- `getGroupDetails(groupId)` — Fetch group + member list + balance sheet
- `updateGroup(groupId, updates)` — Update group metadata
- `inviteMember(groupId, email)` — Send invite or auto-add user
- `addMember(groupId, userId, role)` — Add user to GroupMembers
- `removeMember(groupId, userId, session)` — **Uses transaction** | Validate exit + remove

### **ExpenseService**
- `createExpense(groupId, payerId, amount, description, splitType, session)` — **Uses transaction**
  - Create Expense doc
  - Calculate split per member
  - Update GroupMembers balances
  - Update Groups totalExpenses, avgPerPerson
- `updateExpense(expenseId, updates, session)` — **Uses transaction** | Reverse old split + apply new split
- `deleteExpense(expenseId, session)` — **Uses transaction** | Reverse balance changes
- `listExpenses(groupId, filters)` — Query with pagination

### **SettlementService** (Minimal Split Algorithm)
- `calculateMinimalPayments(groupId)` — **Core Algorithm**
  - Input: GroupMembers with balance array
  - Output: Array of payment instructions { from, to, amount }
  - Algorithm: Greedy matching (debtors ↔ creditors)
  - Minimize number of transactions

### **BalanceService**
- `getGroupBalance(groupId)` — Fetch all members' current balances
- `getMemberBalance(groupId, userId)` — Get one member's balance
- `recalculateBalances(groupId)` — Recompute all balances from scratch (reconciliation)

### **ExitValidationService**
- `canMemberExit(groupId, userId)` — Check if balance = 0
  - Returns: `{ canExit: boolean, balance: number, reason?: string }`
- `validateExitEligibility(groupId, userId)` — Throw error if cannot exit

---

## 🛡️ Error Handling Strategy

### Custom AppError Class
```typescript
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
```

### Error Codes & Status Codes
- `AUTH_INVALID_CREDENTIALS` (401)
- `AUTH_TOKEN_EXPIRED` (401)
- `FORBIDDEN_NOT_OWNER` (403)
- `FORBIDDEN_NOT_GROUP_MEMBER` (403)
- `FORBIDDEN_CANNOT_EXIT_WITH_BALANCE` (403)
- `VALIDATION_ERROR` (400)
- `RESOURCE_NOT_FOUND` (404)
- `DUPLICATE_EMAIL` (409)
- `TRANSACTION_FAILED` (500)
- `INTERNAL_SERVER_ERROR` (500)

### Async Wrapper
All controller methods wrapped in `asyncHandler()` to catch promises & pass to error middleware.

---

## 💾 Transaction Strategy (MongoDB Sessions)

### When Transactions Are Critical
1. **Creating Expense**: Insert Expense + update all GroupMembers balances + update Group totals
2. **Updating Expense**: Delete old split effects + insert new split effects
3. **Deleting Expense**: Reverse all balance changes
4. **Recording Payment**: Update both members' balances + create Payment doc
5. **Member Exit**: Validate eligibility + mark member exited + update balances

### Implementation Pattern
```typescript
// In ExpenseService.createExpense(groupId, payerId, amount, ..., session)
try {
  const expense = await Expense.create([{ ... }], { session });
  
  const members = await GroupMember.find({ groupId });
  const perPersonAmount = amount / members.length;
  
  await GroupMember.updateMany(
    { groupId, userId: { $ne: payerId } },
    { $inc: { balance: perPersonAmount } },
    { session }
  );
  
  await Group.findByIdAndUpdate(
    groupId,
    { 
      $inc: { totalExpenses: amount },
      $set: { avgPerPerson: totalExpenses / memberCount }
    },
    { session }
  );
  
  return expense;
} catch (error) {
  // MongoDB auto-rollsback within session scope
  throw new AppError("Transaction failed", 500, "TRANSACTION_FAILED");
}
```

---

## ✅ Validation Schemas (Zod)

### Auth Schemas
- `registerSchema` — { firstName, familyName, email, password (min 8), phone? }
- `loginSchema` — { email, password }

### Group Schemas
- `createGroupSchema` — { groupName, description? }
- `updateGroupSchema` — { groupName?, description? }
- `addMemberSchema` — { email or userId, role? }

### Expense Schemas
- `createExpenseSchema` — { amount (min 0.01), description, categoryId?, splitType, customSplit? }
- `updateExpenseSchema` — Partial createExpenseSchema

### Payment Schemas
- `createPaymentSchema` — { toUserId, amount (min 0.01), description? }
- `confirmPaymentSchema` — {}

---

## 🚀 Sprint-Based Implementation Roadmap

### **Phase 1: Foundation & Authentication (Sprint 1-2)**
- [ ] Initialize Node.js project, install dependencies, configure TypeScript
- [ ] Set up MongoDB connection + Mongoose schemas
- [ ] Create User model + database indexes
- [ ] Implement AuthService (hash, generate JWT, refresh tokens)
- [ ] Create authController + auth routes (register, login, refresh)
- [ ] Set up Zod validation for auth endpoints
- [ ] Implement auth middleware + JWT verification
- [ ] Test: Manual auth flow (register → login → validate token)
- [ ] Deploy: Database & authentication verified on staging

### **Phase 2: Group Management & Memberships (Sprint 3-4)**
- [ ] Create Group model + GroupMember model
- [ ] Implement GroupService (create group, add members, list members)
- [ ] Create groupController + group routes
- [ ] Implement ownershipMiddleware + groupPermissionsMiddleware
- [ ] Add group invite logic (send email or link-based)
- [ ] Implement ExitValidationService + exit blocking logic
- [ ] Create exit/leave endpoint with validation
- [ ] Test: Create group → invite members → verify permissions → try exit with balance
- [ ] Deploy: Group management flow tested

### **Phase 3: Expense Tracking & Balance Calculations (Sprint 5-6)**
- [ ] Create Expense model + Category model
- [ ] Implement SettlementService (minimal split algorithm, greedy matching)
- [ ] Implement ExpenseService (create, update, delete with transactions)
- [ ] Create expenseController + expense routes
- [ ] Implement balance recalculation logic (BalanceService)
- [ ] Add transaction support to expense operations
- [ ] Create expense list + detail endpoints with pagination
- [ ] Test: Add expense → verify balance updates → edit expense → verify recalculation
- [ ] Deploy: Expense logic verified

### **Phase 4: Payments & Settlement (Sprint 7-8)**n- [ ] Create Payment model
- [ ] Implement payment recording endpoints (POST payment)
- [ ] Add payment confirmation flow (sender records, receiver confirms)
- [ ] Implement settlement endpoint (GET /:groupId/settlement → minimal payment plan)
- [ ] Add transaction support to payment operations
- [ ] Create payment list + history endpoints
- [ ] Test: Record payment → confirm → verify balance zeroed out → run settlement algorithm
- [ ] Deploy: Payment flow tested

### **Phase 5: Error Handling & Data Consistency (Sprint 9)**
- [ ] Create custom AppError class
- [ ] Implement global error middleware
- [ ] Wrap all controllers in asyncHandler()
- [ ] Add error codes + consistent response format
- [ ] Implement transaction rollback scenarios
- [ ] Add validation error response formatting
- [ ] Test: Trigger various errors (validation, ownership, transaction) → verify response format
- [ ] Deploy: Error handling verified

### **Phase 6: Security Hardening (Sprint 10)**
- [ ] Add rate limiting (express-rate-limit) to auth endpoints
- [ ] Implement CORS configuration
- [ ] Add input sanitization (sanitize-html, xss prevention)
- [ ] Implement request logging (Morgan)
- [ ] Add helmet.js for security headers
- [ ] Set up environment variable validation
- [ ] Test: Security checks (rate limit, XSS, CORS, headers)
- [ ] Deploy: Security measures verified

### **Phase 7: Performance & Monitoring (Sprint 11)**
- [ ] Add database query indexing verification
- [ ] Implement caching layer for group balance (Redis optional)
- [ ] Add request/response logging (Winston or Pino)
- [ ] Implement performance monitoring (response times)
- [ ] Add healthcheck endpoint
- [ ] Test: Load testing, response times, index utilization
- [ ] Deploy: Performance validated

### **Phase 8: Frontend Setup & Integration (Sprint 12-13)**
- [ ] Initialize React + TypeScript project
- [ ] Set up API client (Axios with interceptors for JWT)
- [ ] Create authentication pages (Register, Login)
- [ ] Create group management pages (Create, List, Invite)
- [ ] Create expense entry + list pages
- [ ] Create balance sheet + settlement view
- [ ] Implement error boundary + error UI
- [ ] Test: E2E auth flow → create group → add expenses → view settlement
- [ ] Deploy: Frontend + Backend integrated

### **Phase 9: Docker & Containerization (Sprint 14)**
- [ ] Create Dockerfile for backend (multi-stage, optimized)
- [ ] Create Dockerfile for frontend
- [ ] Create docker-compose.yml (MongoDB + Backend + Frontend)
- [ ] Set up volumes for development
- [ ] Add environment configuration in compose
- [ ] Test: Build images, spin up containers, verify connectivity
- [ ] Deploy: Docker setup verified

### **Phase 10: Documentation & Final Testing (Sprint 15)**
- [ ] Write API documentation (OpenAPI/Swagger)
- [ ] Document installation & setup instructions
- [ ] Create deployment guide
- [ ] Add inline code comments for complex logic
- [ ] Perform full end-to-end testing
- [ ] Verify all edge cases (balance rounding, currency, large groups)
- [ ] Prepare for production deployment

---

## 🔒 Security Measures Checklist

- [ ] Password hashing (bcrypt, salt rounds 10)
- [ ] JWT signature verification + expiration
- [ ] Refresh token rotation
- [ ] CORS configured (frontend origin only)
- [ ] Helmet.js security headers
- [ ] Rate limiting on auth endpoints
- [ ] Input validation (Zod) on all endpoints
- [ ] SQL/NoSQL injection prevention (use Mongoose, parameterized queries)
- [ ] XSS prevention (sanitize user input)
- [ ] CSRF tokens (if using cookies)
- [ ] Ownership checks before modification
- [ ] Group permission checks for all group operations
- [ ] Environment variables for sensitive data (DB, JWT secret, API keys)
- [ ] HTTPS enforced in production
- [ ] Secure cookie flags (HttpOnly, Secure, SameSite)
- [ ] Request logging + monitoring
- [ ] Error messages don't leak sensitive info (generic 500 responses)

---

## 📊 Data Consistency & Transaction Guarantees

### Atomicity Requirements
- **Expense Creation**: All balance updates must succeed or all fail
- **Expense Deletion**: All reversals must succeed or all fail
- **Payment Recording**: Both member balances must update together
- **Member Exit**: Validation + status change must be atomic

### Concurrency Handling
- MongoDB sessions ensure read-your-write consistency
- Indexes on (groupId, userId) prevent race conditions in GroupMembers
- Use `$inc` operator for atomic balance increments

### Data Reconciliation
- `BalanceService.recalculateBalances()` function to verify consistency
- Manual trigger: `GET /:groupId/reconcile` (admin-only) to recompute from scratch

---

## 🚢 Deployment Strategy

### Local Development (Docker Compose)
```yaml
services:
  mongodb:
    image: mongo:6
    ports: [27017:27017]
  backend:
    build: ./backend
    ports: [5000:5000]
    depends_on: [mongodb]
    env_file: .env
  frontend:
    build: ./frontend
    ports: [3000:3000]
    depends_on: [backend]
```

### Production Deployment (Recommended: Railway or Render)
1. Set environment variables on platform
2. Connect MongoDB Atlas (managed database)
3. Deploy backend container
4. Deploy frontend container
5. Set up GitHub Actions CI/CD for automated deployment

---

## 📝 Key Decisions & Assumptions

| Decision | Rationale |
|----------|-----------|
| RESTful API | Standard, easy to test, front-end agnostic |
| JWT (stateless) | Scalable, no session store needed, mobile-friendly |
| Zod validation | Type-safe, explicit schemas, excellent error messages |
| MongoDB sessions | ACID guarantees for complex transactions |
| Equal split | Simple, fair, covers 80% of use cases |
| Exit blocking | Prevents unresolved debts, ensures accountability |
| Docker | Consistent dev/prod environment, easy deployment |

---

## 🎯 Success Criteria

1. **All Sprints Completed**: 100% of checklist marked with ✓
2. **Full E2E Flow**: User registers → creates group → adds members → logs expenses → views settlement → confirms payments
3. **Error Handling**: No unhandled promises, all errors caught + formatted
4. **Transaction Safety**: Test failure scenario in expense creation → verify rollback
5. **Exit Validation**: User cannot exit with balance ≠ 0
6. **Settlement Algorithm**: Minimizes payments (greedy algorithm verified)
7. **Performance**: API response <300ms for typical requests
8. **Security**: No hardcoded secrets, rate limiting active, validation on all inputs
9. **Docker**: Builds & runs without errors
10. **Frontend**: Full integration with backend, error UI displays properly

---

## 📚 Technologies Summary

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Language** | TypeScript |
| **Database** | MongoDB (Atlas or local) |
| **ORM** | Mongoose |
| **Auth** | JWT (jsonwebtoken) |
| **Validation** | Zod |
| **Password** | bcryptjs |
| **Frontend** | React 18 + TypeScript |
| **HTTP Client** | Axios |
| **Containerization** | Docker + Docker Compose |
| **Error Handling** | Custom AppError + centralized middleware |
| **Logging** | Winston or Pino |
| **Security** | helmet.js, express-rate-limit, cors |

---

## ⚡ Next Steps (Post-Planning)

1. **Generate Boilerplate**: Project structure files created
2. **Implement Phase 1**: Auth system (Foundation)
3. **Iterative Phases**: Follow sprint roadmap sequentially
4. **Testing**: Unit tests for services, integration tests for APIs
5. **Code Review**: Verify separation of concerns, error handling
6. **Deployment**: Stage → production with rollback plan

---

**Document Version**: 1.0  
**Last Review**: June 2, 2026  
**Status**: ✅ Ready for Implementation
