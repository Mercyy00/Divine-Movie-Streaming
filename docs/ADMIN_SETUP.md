# Admin, Guest Tracking & Database Setup

## 1. Environment Variables
Set these variables in `.env` (never commit secrets or hardcode emails):

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=replace-with-strong-random-secret
ADMIN_EMAILS=your-admin-email@example.com
IP_HASH_SECRET=replace-with-random-secret-for-ip-hashing
RESEND_API_KEY=re_...
EMAIL_FROM="DIVINE <security@your-domain.com>"
```

## 2. Database Schema & Migrations
After configuring `DATABASE_URL` and `DIRECT_URL`:

```bash
npx prisma generate
npm run db:push
# Or, when managing SQL migrations locally:
npx prisma migrate dev --name guests_audit
```

Models added:
- `Guest` & `GuestWatchHistory`: tracks anonymous browser guests (`divine:guest-id`), coarse country, user-agent, salted hashed IP (`ipHash`), and watch progress. Automatically merges into `User` / `WatchHistory` upon sign-in or sign-up.
- `AdminAuditLog`: records every admin person view, CSV export, ban, unban, and delete with salted IP hash.

## 3. Single Verified Admin Security Model
- Credentials signups (`POST /api/auth/register`) always start as `USER` with `emailVerified = null` and send a verification email via Resend.
- `ADMIN` access is granted **only** when:
  1. `User.emailVerified` is set (via Google verified email or `/auth/verify?token=...` link).
  2. `User.email` matches `ADMIN_EMAILS` (case-insensitive).
  3. `User.bannedAt` is `null`.
- Every admin SSR page (`getServerSideProps`) and `/api/admin/*` route re-queries PostgreSQL rather than trusting JWT claims alone. Removing an email from `ADMIN_EMAILS` or banning the user revokes access immediately.

## 4. 90-Day Guest Retention Cleanup
Run manually or schedule daily via cron / Netlify Scheduled Functions:

```bash
node scripts/purge-guests.mjs
```

Example Netlify Scheduled Function (`netlify/functions/purge-guests.mjs`):

```js
export const config = { schedule: "@daily" };
```
