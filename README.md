# AgencyOS v1

Internal operations platform for an editing agency.

## Stack

- Next.js 16 (App Router + Route Handlers)
- TypeScript
- PostgreSQL + Prisma 7
- Auth.js (credentials) + Prisma adapter
- Argon2id password hashing (`@node-rs/argon2`)
- AES-256-GCM field encryption
- Cloudflare R2 signed URLs (AWS S3 SDK)

## Implemented v1 scope

- Auth: login/logout, password reset, session revocation
- RBAC roles: `OWNER`, `ADMIN`, `EDITOR`
- Users, clients, projects, tasks, assignments
- Submissions + QA review flow
- Finance: auto-calc earnings + owner approval flow
- Learning resources + progress
- In-app notifications
- Audit logs on critical events
- AI assistant endpoint (text-only, no sensitive context)

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy environment variables

```bash
cp .env.example .env
```

3. Generate Prisma client

```bash
npm run prisma:generate
```

4. Run migrations (when DB is available)

```bash
npm run prisma:migrate
```

5. Seed initial data

```bash
npm run prisma:seed
```

6. Start app

```bash
npm run dev
```

## Environment variables

See `.env.example` for full list.

Required groups:

- Auth: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- DB: `DATABASE_URL`
- Encryption: `APP_ENCRYPTION_KEY_B64`, `APP_ENCRYPTION_KEY_VERSION`
- Storage: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

## Security decisions implemented

- Passwords are hashed with Argon2id.
- Phone and private notes are encrypted with AES-256-GCM at field level.
- Email remains plaintext/indexable for v1 operations.
- Session cookies are `HttpOnly`, `Secure` (prod), `SameSite=Lax`.
- Login rate limiting + temporary lock on repeated failed attempts.
- Signed URLs for file upload/download with short expiry.
- Audit logs recorded for auth, ops, finance, and review events.

## DB and audit append-only policy

Prisma schema is in `prisma/schema.prisma`.

To enforce append-only audit logs at database level, run:

```sql
\i prisma/sql/audit_append_only.sql
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

All three currently pass.
