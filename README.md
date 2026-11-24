# PlugLink

PlugLink is a community EV charging marketplace for Jaipur, Rajasthan. EV owners can reserve a nearby private charger, and hosts can earn from available capacity in their home charging setup. Administrators review listings and oversee marketplace activity.

Public charging coverage can leave EV drivers without a convenient option, while residential chargers often sit idle. PlugLink makes approved residential chargers discoverable and reservable during host-selected hours, with upfront INR pricing and a booking record for both parties.

## Run locally

Use Node.js 22.12 or newer (with npm), PostgreSQL 16 or newer, and VS Code or another editor. Docker Desktop is optional if PostgreSQL is already installed. On Windows 11, run these commands from the project folder in PowerShell.

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d --wait postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In Bash, replace `Copy-Item .env.example .env` with `cp .env.example .env`. If you run PostgreSQL yourself, create a development database and set `DATABASE_URL` in `.env` before running migrations. The Compose example uses database, username and password `pluglink`, on `127.0.0.1:5432`.

Open [http://localhost:5173](http://localhost:5173). The API runs on [http://localhost:3001/api/health](http://localhost:3001/api/health). Vite proxies browser API requests to Express so the two services share an origin in development.

### Demo accounts

Each development account uses `PlugLinkDemo2026!` by default. Set `DEMO_PASSWORD` before seeding to override it. Sample stations, sessions, addresses and reviews are fictional. Use these accounts with local development data.

| Role | Email |
| --- | --- |
| EV owner | `owner@pluglink.test` |
| Charging host | `host@pluglink.test` |
| Administrator | `admin@pluglink.test` |

### Try a complete workflow

1. Sign in as the EV owner. Find a charger, select a future Jaipur time slot, review the estimated cost, and confirm the reservation. Complete the labeled demo payment from My Bookings.
2. Sign in as the charging host. Open the reservation, start a demo session, and complete it with a recorded manual energy reading. The earnings dashboard reflects completed sessions.
3. Sign back in as the owner, open the completed session, and submit a rating and review.
4. To demonstrate approvals, create a separate station as the host and submit it for review. Sign in as the administrator and approve the pending listing. Search for the new station on Find Chargers.

Owners and hosts can sign up from the website. Admin accounts are provisioned separately. The local password reset response shows a development reset link when email delivery is unavailable.

## Features

- Search and filter approved chargers with list and Leaflet/OpenStreetMap views. See station details, sample labels, reviews, estimated pricing, and available times in Asia/Kolkata.
- Reserve an available slot through a backend transaction. Manage bookings, cancellations, payments, notifications and post-session reviews.
- Create and edit host listings, manage charging hours and date blocks, submit compliance declarations, manage sessions, and view earnings.
- Review host applications, approve and suspend stations, manage users, inspect bookings and payment activity, and moderate reported reviews from the admin panel.
- Persist support requests, profile changes, sessions, favorite stations and all marketplace workflow state in PostgreSQL.

## Technology and project layout

- `frontend/` contains the React, Vite, TypeScript and Tailwind application. React Router handles navigation, TanStack Query handles server state, and Leaflet provides maps.
- `backend/src/` contains the Express API, Prisma-backed domain routes, session authentication and payment integration.
- `backend/prisma/` contains the PostgreSQL schema, versioned migrations and the repeatable local seed.
- `backend/tests/` and `e2e/` contain Vitest/Supertest and Playwright tests.
- `docs/` contains the architecture, API, database and deployment guides.

The browser uses same-origin REST requests. Express authenticates the session cookie, authorizes the requested action and validates the request before reading or writing PostgreSQL via Prisma. Payment secrets and transaction handling stay on the server. See the technical guides for details. [Architecture](docs/architecture.md) · [API](docs/api.md) · [Database](docs/database.md) · [Deployment](docs/deployment.md)

## Checks and tests

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Set `TEST_DATABASE_URL` to a separate migrated PostgreSQL database to include API integration tests. Apply migrations and seed fixtures using that database URL. Keep it active while Playwright starts the test server, then restore your development environment. Use the configured default demo administrator or set `DEMO_PASSWORD` for the fixtures and test runner consistently.

```powershell
docker compose exec postgres createdb -U pluglink pluglink_test
$env:TEST_DATABASE_URL = 'postgresql://pluglink:pluglink@127.0.0.1:5432/pluglink_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run db:migrate
npm run db:seed
npm test
npx playwright install chromium
npm run test:e2e
Remove-Item Env:DATABASE_URL
```

Playwright starts Vite and Express from `npm run dev` unless a local server is already available. It creates synthetic test accounts and listings. Use a disposable seeded database or a fresh local copy. To reuse a manually started application, set `PLAYWRIGHT_BASE_URL` to its URL. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system Chromium binary.

## Deployment and limitations

The production build supports a same-origin deployment on a Node.js host with managed PostgreSQL. Set the canonical HTTPS origin and database connection string, run migrations, build the frontend and backend, then start Express. See the full environment and hosting notes. [Deployment](docs/deployment.md)

- Razorpay requires test credentials and a registered webhook secret. The local demo payment flow is available without these credentials.
- Payment review flags captured payments that differ from final charges or belong to inactive reservations. Admins can record an auditable decision. Moving money or issuing a refund still requires the billing provider.
- Host identity verification uses a labeled local simulation where configured. An accredited provider and an approved consent flow are needed before genuine Aadhaar verification. Raw Aadhaar numbers and CCTV recordings are outside the application.
- Hosts can record manual demo meter readings. Real meter telemetry and automated payouts require additional integrations.
- Notifications are in-app. Account recovery can use Resend when configured. Booking and station messages are delivered through the in-app inbox.
- The bundled privacy, terms, host rules and safety content are drafts for legal review.

Before a public launch, prioritize legal and safety review, production identity and email delivery, provider-backed metering and payouts, and monitoring for the booking and payment services.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Migration cannot reach PostgreSQL | Run `docker compose ps`, check that port 5432 is free, and verify `DATABASE_URL`. |
| Prisma client is missing | Run `npm run db:generate` after dependency installation or schema changes. |
| Requests fail in the browser | Verify Express is on port 3001, open the Vite URL, and align `APP_ORIGIN` with the browser hostname and port. |
| Demo accounts are unavailable | Run `npm run db:seed` with the development database and your expected `DEMO_PASSWORD`. |
| Browser tests cannot find Chromium | Run `npx playwright install chromium` or supply the system Chromium path. |
| Maps are unavailable | Check connectivity to the OpenStreetMap tile service. The charger list remains available. |
