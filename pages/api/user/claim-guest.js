import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { requireUser } from "../../../lib/session";
import { applyApiGuard } from "../../../lib/api-guard";
import { isSameOriginRequest } from "../../../lib/adminAuth";
import { mergeGuestIntoUserWatchHistory } from "../../../lib/guestSync";

const schema = z.object({
  guestId: z.string().regex(/^[a-zA-Z0-9_-]{12,64}$/, "Invalid guestId"),
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req).ok) return res.status(403).json({ error: "Invalid request origin" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 20, windowMs: 60000, prefix: "claim_guest" }))) {
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid guestId" });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ ok: true, merged: 0 });
  }

  const { guestId } = parsed.data;

  try {
    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: { watchHistory: true },
    });

    if (!guest) {
      return res.status(200).json({ ok: true, merged: 0 });
    }

    // Do not hijack a guest record already linked to a different user
    if (guest.userId && guest.userId !== user.id) {
      return res.status(200).json({ ok: true, merged: 0 });
    }

    const existingUserHistory = await prisma.watchHistory.findMany({
      where: { userId: user.id },
      select: {
        titleId: true,
        season: true,
        episode: true,
        watchedAt: true,
      },
    });

    const rowsToUpsert = mergeGuestIntoUserWatchHistory(
      user.id,
      guest.watchHistory || [],
      existingUserHistory
    );

    const ops = [
      prisma.guest.update({
        where: { id: guest.id },
        data: { userId: user.id, lastSeenAt: new Date() },
      }),
      ...rowsToUpsert.map((row) =>
        prisma.watchHistory.upsert({
          where: {
            userId_titleId_season_episode: {
              userId: row.userId,
              titleId: row.titleId,
              season: row.season,
              episode: row.episode,
            },
          },
          create: row,
          update: {
            titleData: row.titleData,
            progress: row.progress,
            timeLeft: row.timeLeft,
            watchedAt: row.watchedAt,
          },
        })
      ),
    ];

    await prisma.$transaction(ops);
    return res.status(200).json({ ok: true, merged: rowsToUpsert.length });
  } catch (err) {
    console.error("claim-guest error:", err?.code || err?.message);
    return res.status(500).json({ error: "Could not merge guest history" });
  }
}
