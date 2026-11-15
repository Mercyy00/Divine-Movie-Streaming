#!/usr/bin/env node
/**
 * Retention cleanup script: deletes guest records inactive for more than 90 days.
 * Usage:
 *   node scripts/purge-guests.mjs          # deletes unclaimed guests inactive > 90 days
 *   node scripts/purge-guests.mjs --all    # deletes all guests inactive > 90 days
 */
import { PrismaClient } from "@prisma/client";

const DAYS = Number(process.env.GUEST_RETENTION_DAYS || 90);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set; skipping guest purge.");
    return;
  }

  const prisma = new PrismaClient();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const includeLinked = process.argv.includes("--all");

  try {
    const where = includeLinked
      ? { lastSeenAt: { lt: cutoff } }
      : { userId: null, lastSeenAt: { lt: cutoff } };

    const result = await prisma.guest.deleteMany({ where });
    console.log(`Purged ${result.count} guest record(s) inactive before ${cutoff.toISOString()}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Guest purge failed:", err);
  process.exit(1);
});
