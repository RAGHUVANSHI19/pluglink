# Deployment

For a public-facing environment, use a managed PostgreSQL database and a single canonical HTTPS origin for both the API and frontend. The application supports a Node.js service, a container release, and Vercel.

## Build and start

```bash
npm ci
npm run db:generate
npm run build
npm run db:migrate
npm start
```

Set `NODE_ENV=production` at runtime, use the host-provided `PORT`, and set `APP_ORIGIN` to the exact public origin, such as `https://pluglink.example`. Supply an encrypted PostgreSQL connection string in `DATABASE_URL` when the provider requires TLS. Use a least-privilege application database account and apply migrations as a controlled release step. Check readiness at `/api/health`.

## Container release

The Dockerfile builds a non-root runtime image for Express and the built React app. Its release stage contains Prisma and the migrations. Give the runtime a PostgreSQL connection and persistent storage for uploaded photos. Configure an HTTPS reverse proxy for the app's loopback port.

Create a protected production environment file or use your host's environment settings. Set `DATABASE_URL` and the exact HTTPS `APP_ORIGIN`. Set `MIGRATION_DATABASE_URL` if the deployment uses a separate migration role. That role needs permission to apply the schema and create the `btree_gist` extension. Keep application and migration credentials in the secret manager.

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --build
docker compose --env-file .env.production -f compose.production.yml ps
```

The application waits for the migration job and exposes its readiness check at `/api/health`. The Compose file binds only to host loopback so the reverse proxy owns public traffic. The upload volume persists separately from the app image.

### Create an administrator

Run the operator-only command against the migrated database and pass the new password through standard input from the secret manager. In Bash, the following prompts without echoing the password.

```bash
read -r -s pluglink_admin_password
printf '%s\n' "$pluglink_admin_password" | docker compose --env-file .env.production -f compose.production.yml exec -T app \
  node backend/dist/provision-admin.js --email admin@example.com --name 'PlugLink Admin' --phone '+911234567890'
unset pluglink_admin_password
```

For a native Node.js deployment, use `npm run admin:provision --` with the same flags and password input. Rerunning for the same active administrator preserves the account and password. Email addresses already held by owner or host accounts need a separate administrator address.

## Vercel

Import the repository with its root directory selected. The checked-in `vercel.json` builds the React site and packages the Express API as one Node.js function. Vercel serves the React assets directly, including deep links such as `/chargers`. Requests to `/api` and `/uploads` reach the same-origin function.

1. Connect a PostgreSQL 16 or newer database and add a pooled `DATABASE_URL` to the project environment. Use a separate database or branch for Preview deployments. The migration role needs permission to enable `btree_gist`.
2. Apply the migrations as a release step. Run `npm run db:migrate` with `DATABASE_URL` set to the provider's direct migration connection. Use the pooled URL for the running application. Builds package the application without applying migrations.
3. Expose Vercel's system environment variables or set `APP_ORIGIN` to the exact HTTPS URL visitors will use. Set an explicit origin when assigning a custom domain. Set `TRUST_PROXY` according to the hosting network's trusted forwarding hops.
4. Connect a private Vercel Blob store to enable station photo uploads. Use the project's `BLOB_READ_WRITE_TOKEN`. The API accepts validated JPEG, PNG, and WebP images up to 4 MiB and serves them on same-origin image URLs.
5. Deploy, then check the homepage, direct navigation to a station or dashboard, and `/api/health`. Create the first administrator with the operator command above against the migrated database.

Set production integrations, such as Razorpay sandbox and password recovery mail, on the Vercel project. The in-app inbox computes due reminders when opened, so the serverless function does not run a background timer.

For an authenticated CLI deployment, connect the project and run:

```bash
npm ci
npm run build:vercel
vercel deploy --prebuilt
```

For a production prebuilt deployment, pull the production project settings first and use `vercel deploy --prebuilt --prod`. Keep the local `.vercel` directory and all credential files out of Git.

## Environment settings

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| `TRUST_PROXY` | Number of trusted reverse-proxy hops documented by the Node.js host. Defaults to zero. |
| `PORT` | Express listening port. Local default is `3001`. |
| `APP_ORIGIN` | Canonical web origin for origin validation. |
| `DEMO_PASSWORD` | Local seed account password override. |
| `AUTH_ALLOW_DEMO_RESET` | Controls the local reset-link response in development. |
| `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` | Razorpay test-mode checkout. Keep the secret server-side. |
| `RAZORPAY_WEBHOOK_SECRET` | Shared webhook signing secret. Configure the endpoint and subscribed events in the Razorpay dashboard. |
| `RESEND_API_KEY` and `RESET_FROM_EMAIL` | Optional email provider credentials and verified sender for password recovery. |
| `CANCELLATION_CUTOFF_MINUTES` | Minimum lead time for a user or host to cancel a future booking. |
| `UPLOAD_DIR` | Optional location for server-managed uploads. |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob store credential for hosted station photos. |
| `TEST_DATABASE_URL` | Separate PostgreSQL connection for API integration tests. |

If you enable local filesystem uploads on a host, give the service persistent storage before accepting user uploads. Use an appropriately configured object store or equivalent when running multiple instances. Retain database backups and confirm that secret or application logs exclude session tokens, passwords, payment secrets and private verification details.

## Razorpay test checkout

Use provider-issued test keys beginning with `rzp_test_`. Set the provider's capture policy to capture test payments automatically, then register `https://<your-origin>/api/payments/webhook` with a shared webhook signing secret. Subscribe to `payment.captured`, `payment.failed`, and `order.paid`. Complete a sandbox checkout and confirm that the resulting order, payment, and booking agree in PlugLink.

## Payment review

Administrators use **Payment review** to see captured payments that differ from final charges and payments on cancelled or expired reservations. Recording an outcome preserves the operator note and audit entry. The original checkout receipt remains the payment of record. Process any adjustment or refund in the applicable billing system and record a non-sensitive reference in the review.

## Release dependencies

Development seed credentials and simulated identity or payment actions belong in isolated local environments. Validate Razorpay test checkout and signed webhooks with provider-issued credentials, configure an authorized identity provider and email delivery, and have qualified reviewers approve the draft legal and safety guidance before a public release.
