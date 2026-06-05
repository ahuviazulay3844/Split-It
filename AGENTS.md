# SplitIn Architecture Rules

## Mandatory Layer Architecture

```
Routes → Controllers → Services → Models
```

## FORBIDDEN

- ❌ Business logic in controllers
- ❌ Direct database queries in controllers
- ❌ Hardcoded config values (use `process.env`)
- ❌ Async operations without try/catch
- ❌ Bypass middleware stack
- ❌ Synchronous code in services

## REQUIRED

### Controllers
- Must handle request/response only
- Must delegate all logic to services
- Must pass `process.env` or validated input to services
- Must catch service errors and pass to error middleware

### Services
- Must use `async/await` with try/catch
- Must never access `req`/`res`
- Must use MongoDB transactions for multi-document operations
- Must return data only (no HTTP response)

### Models
- Must validate with Mongoose schema or Zod
- Must include unique constraints where applicable
- Must use `createdAt`/`updatedAt` timestamps

### Middleware
- Must validate request data with Zod before controller
- Must implement centralized error handling
- Must check auth/ownership before controller execution

### Configuration
- Must read from `process.env`
- Must never hardcode URLs, ports, secrets

## Reference
See [untitled-plan-splitItPro.prompt.md](untitled-plan-splitItPro.prompt.md) for full design.
