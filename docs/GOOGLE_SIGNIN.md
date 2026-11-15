# Google Sign-In Setup (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)

DIVINE uses NextAuth v4 (`lib/auth.js`) with `GoogleProvider` and `PrismaAdapter` for both `/auth/signin` and `/auth/signup`.

## 1. Create OAuth Credentials in Google Cloud Console
1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project.
2. Go to **APIs & Services > OAuth consent screen**:
   - Choose **External** (or Internal for Google Workspace).
   - Fill in App Name (`DIVINE`), User Support Email, and Developer Contact Email.
   - Add scopes `openid`, `email`, and `profile`.
3. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins:
     - `http://localhost:3000` (local dev)
     - `https://your-domain.com` (production)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://your-domain.com/api/auth/callback/google`
4. Copy the generated **Client ID** and **Client Secret**.

## 2. Configure Environment Variables
Add these to `.env` (local) and your hosting provider (e.g. Netlify Site Environment Variables):

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_GOOGLE_ENABLED=1
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-random-32-byte-secret
```

## 3. Verified Email & Account Linking Behavior
- First-time Google sign-ins create a `User` row with `emailVerified` populated, copy `name` and `image`, and assign a unique lowercase `username`.
- If a user already registered with email+password, Google sign-in links the Google `Account` **only** when Google reports `email_verified === true`.
- Banned accounts (`bannedAt != null`) are blocked across both Google and email+password sign-in.
