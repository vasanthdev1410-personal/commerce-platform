# Production readiness checklist

- Run Node.js 24 or newer and install from the lockfile.
- Provision a production PostgreSQL database, enable automated backups, test restores, and retain an encrypted off-site copy appropriate to the business recovery objective.
- Back up environment secrets in an access-controlled secrets manager; never commit `.env` files.
- Serve the API and web application over HTTPS and set `WEB_ORIGIN` to the exact production web origin.
- Generate a unique JWT secret of at least 32 characters and configure access/refresh lifetimes.
- Configure production ImageKit keys and account for ImageKit availability and asset-retention requirements in recovery planning.
- Configure Razorpay production credentials and webhook secret only when live payments are intentionally enabled. Do not reuse test credentials or enable live mode during deployment preparation.
- Configure seller/tax identity from reviewed business data; tax rates remain database-managed.
- Run `pnpm db:validate`, `pnpm db:generate`, and `prisma migrate deploy` before starting the new API release. Never reset a production database.
- Monitor API error rate, latency, health/readiness, payment webhooks, background reservation release, database capacity, and backup success.
- Restrict environment-secret and database access to the minimum required operators and workloads, with an auditable rotation process.
