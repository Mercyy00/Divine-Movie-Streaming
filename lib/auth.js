import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit, getClientIp } from "./api-guard";
import {
  isConfiguredAdminEmail,
  resolveEffectiveUserRole,
  slugifyUsernameBase,
} from "./adminAuth";

export { isConfiguredAdminEmail, resolveEffectiveUserRole };

async function generateUniqueUsername(seedText) {
  const base = slugifyUsernameBase(seedText);
  const existingBase = await prisma.user.findUnique({
    where: { username: base },
    select: { id: true },
  });
  if (!existingBase) return base;

  for (let i = 0; i < 8; i++) {
    const suffix = Math.floor(100 + Math.random() * 9000);
    const candidate = `${base.slice(0, 14)}_${suffix}`;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base.slice(0, 10)}_${Date.now().toString(36).slice(-5)}`;
}

const providers = [
  CredentialsProvider({
    name: "credentials",
    credentials: { email: {}, password: {} },
    async authorize(credentials, req) {
      const email = String(credentials?.email || "").trim().toLowerCase();
      const password = String(credentials?.password || "");
      if (!email || !password) return null;

      const clientIp = getClientIp(req);
      const rateLimitKey = `login_throttle:${email}:${clientIp}`;

      const { success } = await checkRateLimit(rateLimitKey, { limit: 5, windowMs: 60000 });
      if (!success) {
        throw new Error("Too many login attempts. Please wait 1 minute before trying again.");
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;
      if (user.bannedAt) throw new Error("AccountBanned");

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      // Single-admin rule: ADMIN only when emailVerified is set AND email matches ADMIN_EMAILS
      const effectiveRole = resolveEffectiveUserRole(user);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        username: user.username,
        emailVerified: user.emailVerified,
        role: effectiveRole,
        tokenVersion: user.tokenVersion || 0,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.email?.split("@")[0] || "DIVINE User",
          email: profile.email?.toLowerCase() || null,
          image: profile.picture || null,
          emailVerified: profile.email_verified === true ? new Date() : null,
        };
      },
    })
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET || "divine-local-dev-secret",
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers,
  pages: { signIn: "/auth/signin", error: "/auth/error" },
  events: {
    async createUser({ user }) {
      if (!process.env.DATABASE_URL || !user?.id) return;
      try {
        const patch = {};
        if (!user.username) {
          patch.username = await generateUniqueUsername(user.name || user.email?.split("@")[0]);
        }
        if (!user.emailVerified) {
          patch.emailVerified = new Date();
        }
        if (Object.keys(patch).length > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: patch,
          });
        }
      } catch (err) {
        console.warn("Could not assign default fields on createUser:", err?.message);
      }
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!process.env.DATABASE_URL) return true;

      if (account?.provider === "google") {
        // Require Google to explicitly confirm email_verified === true
        if (profile?.email_verified !== true || !profile?.email) {
          return "/auth/error?error=EmailNotVerified";
        }
        const normalizedEmail = String(profile.email).trim().toLowerCase();

        try {
          const existing = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (existing) {
            if (existing.bannedAt) {
              return "/auth/error?error=AccountBanned";
            }

            const patch = {};
            if (!existing.emailVerified) patch.emailVerified = new Date();
            if (!existing.name && profile.name) patch.name = profile.name;
            if (!existing.image && profile.picture) patch.image = profile.picture;
            if (!existing.username) {
              patch.username = await generateUniqueUsername(profile.name || normalizedEmail.split("@")[0]);
            }
            if (Object.keys(patch).length > 0) {
              await prisma.user.update({ where: { id: existing.id }, data: patch });
            }
            user.id = existing.id;
          }
        } catch (err) {
          console.error("Google signIn check failed:", err?.message || err);
          return "/auth/error?error=OAuthCallback";
        }
      }

      if (user?.bannedAt) {
        return "/auth/error?error=AccountBanned";
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username || null;
        token.email = user.email ? String(user.email).toLowerCase() : token.email || null;
        token.tokenVersion = user.tokenVersion || 0;
        token.emailVerified = Boolean(user.emailVerified);
        token.role = resolveEffectiveUserRole(user);
      }

      if (token?.id && process.env.DATABASE_URL) {
        // Re-read DB state on every request so removing from ADMIN_EMAILS or banning takes effect immediately
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: {
              id: true,
              email: true,
              username: true,
              emailVerified: true,
              tokenVersion: true,
              bannedAt: true,
              role: true,
            },
          });

          if (!dbUser || dbUser.bannedAt || (dbUser.tokenVersion ?? 0) > (token.tokenVersion || 0)) {
            return null;
          }

          token.email = dbUser.email || token.email;
          token.username = dbUser.username || token.username || null;
          token.emailVerified = Boolean(dbUser.emailVerified);
          token.role = resolveEffectiveUserRole(dbUser);
        } catch {
          // If DB is temporarily unreachable, fail safe for admin privileges
          token.role = "USER";
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id;
        session.user.username = token.username || null;
        session.user.emailVerified = Boolean(token.emailVerified);
        session.user.role = token.role || "USER";
      }
      return session;
    },
  },
};
