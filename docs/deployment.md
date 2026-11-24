# Deployment

For a public-facing environment, use a Node.js service with a managed PostgreSQL database and a single canonical HTTPS origin for both the API and frontend. A Node.js service on Render is one possible host. A separate Vercel frontend requires a correctly configured same-origin API proxy or a deliberately tested cookie and origin setup.

## Build and start

```bash
npm ci
npm run db:generate
npm run build
npm run db:migrate
npm start
```

Set `NODE_ENV=production` at runtime, use the host-provided `PORT`, and set `APP_ORIGIN` to the exact public origin, such as `https://pluglink.example`. Supply an encrypted PostgreSQL connection string in `DATABASE_URL` when the provider requires TLS. Use a least-privilege application database account and apply migrations as a controlled release step. Check readiness at `/api/health`.

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
| `TEST_DATABASE_URL` | Separate PostgreSQL connection for API integration tests. |

If you enable local filesystem uploads on a host, give the service persistent storage before accepting user uploads. Use an appropriately configured object store or equivalent when running multiple instances. Retain database backups and confirm that secret or application logs exclude session tokens, passwords, payment secrets and private verification details.

## Razorpay test checkout

Use provider-issued test keys beginning with `rzp_test_`. Set the provider's capture policy to capture test payments automatically, then register `https://<your-origin>/api/payments/webhook` with a shared webhook signing secret. Subscribe to `payment.captured`, `payment.failed`, and `order.paid`. Complete a sandbox checkout and confirm that the resulting order, payment, and booking agree in PlugLink.

## Release dependencies

Provision an administrator through a secure operator workflow. Development seed credentials and simulated identity or payment actions belong in isolated local environments. Validate Razorpay test checkout and signed webhooks with provider-issued credentials, configure an authorized identity provider and email delivery, and have qualified reviewers approve the draft legal and safety guidance before a public release.
