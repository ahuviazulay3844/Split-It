# SplitIt INIT

## Structure

```text
SplitIt/
├── server/   # Express + MongoDB API
└── client/   # Angular application
```

## Server

```bash
cd server
npm install
npm run dev
```

The server listens on `http://localhost:3000` and exposes:

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/users/search`
- `POST /api/groups`
- `GET /api/dashboard`
- `POST /api/expenses`
- `GET /api/groups/:groupId/balance`
- `GET /api/groups/:groupId/overview`

## Client

```bash
cd client
npm install
npm start
```

The client listens on `http://localhost:4200`.

During development, `client/proxy.conf.json` forwards:

- `/health` -> `http://localhost:3000/health`
- `/api/*` -> `http://localhost:3000/api/*`

## Root Scripts

```bash
npm run install:all
npm run server
npm run client
npm run build:client
```

## Angular Architecture

```text
client/src/app/
├── core/
│   ├── config/
│   ├── interceptors/
│   ├── models/
│   └── services/
├── features/
│   ├── auth/
│   ├── balances/
│   ├── dashboard/
│   ├── expenses/
│   ├── groups/
│   └── health/
├── layouts/
└── shared/
    ├── components/
    ├── directives/
    └── pipes/
```

## Connection Check

Open the Angular app at `http://localhost:4200`. The first screen calls `/health`; if the Express server is running, it shows `Connected`.
