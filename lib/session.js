import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { resolveEffectiveUserRole } from "./adminAuth";

// Returns the signed-in user (revalidated against DB when available) or sends 401.
export async function requireUser(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }

  if (process.env.DATABASE_URL) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          username: true,
          emailVerified: true,
          bannedAt: true,
          role: true,
        },
      });
      if (!dbUser || dbUser.bannedAt) {
        res.status(401).json({ error: "Session invalidated" });
        return null;
      }
      return {
        ...session.user,
        email: dbUser.email,
        username: dbUser.username,
        emailVerified: Boolean(dbUser.emailVerified),
        role: resolveEffectiveUserRole(dbUser),
      };
    } catch {
      res.status(503).json({ error: "Database unavailable" });
      return null;
    }
  }

  return session.user;
}

// Re-checks ADMIN status strictly from PostgreSQL + verified email + ADMIN_EMAILS on every API request.
export async function requireAdmin(req, res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: "Database not configured" });
    return null;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    res.status(403).json({ error: "Access denied. Administrator privileges required." });
    return null;
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        emailVerified: true,
        bannedAt: true,
        role: true,
      },
    });

    const effectiveRole = resolveEffectiveUserRole(dbUser);
    if (!dbUser || dbUser.bannedAt || effectiveRole !== "ADMIN") {
      res.status(403).json({ error: "Access denied. Administrator privileges required." });
      return null;
    }

    return {
      ...dbUser,
      role: "ADMIN",
    };
  } catch {
    res.status(503).json({ error: "Database unavailable" });
    return null;
  }
}

// Shared SSR helper for /admin/* pages: checks DATABASE_URL and re-reads User from DB.
export async function getAdminPageProps(context) {
  const dbConfigured = Boolean(process.env.DATABASE_URL);
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!dbConfigured) {
    if (!session || session.user?.role !== "ADMIN") {
      context.res.statusCode = 403;
    }
    return {
      authorized: false,
      dbConfigured: false,
      signedInEmail: session?.user?.email || null,
      currentRole: session?.user?.role || null,
      emailVerified: Boolean(session?.user?.emailVerified),
      adminUser: null,
    };
  }

  if (!session?.user?.id) {
    context.res.statusCode = 403;
    return {
      authorized: false,
      dbConfigured: true,
      signedInEmail: null,
      currentRole: null,
      emailVerified: false,
      adminUser: null,
    };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        emailVerified: true,
        bannedAt: true,
      },
    });

    const effectiveRole = resolveEffectiveUserRole(dbUser);
    if (!dbUser || dbUser.bannedAt || effectiveRole !== "ADMIN") {
      context.res.statusCode = 403;
      return {
        authorized: false,
        dbConfigured: true,
        signedInEmail: dbUser?.email || session.user?.email || null,
        currentRole: effectiveRole,
        emailVerified: Boolean(dbUser?.emailVerified),
        adminUser: null,
      };
    }

    return {
      authorized: true,
      dbConfigured: true,
      signedInEmail: dbUser.email,
      currentRole: "ADMIN",
      emailVerified: true,
      adminUser: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name || dbUser.username || "Admin",
      },
    };
  } catch {
    context.res.statusCode = 503;
    return {
      authorized: false,
      dbConfigured: false,
      signedInEmail: session?.user?.email || null,
      currentRole: session?.user?.role || null,
      emailVerified: false,
      adminUser: null,
    };
  }
}
