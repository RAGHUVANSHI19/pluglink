# Database

PostgreSQL stores the application state. Prisma defines relational models, enum values and indexes in `backend/prisma/schema.prisma`. Versioned migrations also capture PostgreSQL-specific booking constraints. Apply them with `npm run db:migrate`.

| Data | Responsibilities |
| --- | --- |
| Users and sessions | Accounts, password hashes, session expiry, role and account status, recovery tokens. |
| Stations and hosts | Ownership, public listing details, charger specifications, weekly schedules, blocked time, verification declarations. |
| Booking and session | Owner and station references, charging window, lifecycle, pricing snapshots, measured energy when recorded, cancellation history. |
| Payment | Provider references, amount in integer paise, transaction status and idempotent webhook handling. |
| Review and favorites | A review tied to an eligible completed reservation and saved owner-station relationships. |
| Notifications, support and admin actions | Persisted activity, support requests and moderation history. |

Use timestamp instants for booking start and end. Asia/Kolkata defines the local calendar for station schedules. Price fields use integer paise and energy uses integer watt-hours. The backend computes estimated electricity cost from the requested watt-hours at the station's price, rounds to the nearest paise, and adds snapshotted fees. The application maintains estimated costs separately from session completion and final charges.

For repeatable Jaipur data, run `npm run db:seed` against a development database. The seed includes fictional stations, identifiable sample reviews and sessions, and three demo login roles.
