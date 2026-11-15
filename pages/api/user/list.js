import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { applyApiGuard } from "../../../lib/api-guard";

export default async function handler(req, res) {
  const guarded = await applyApiGuard(req, res, { cacheSeconds: 0, prefix: "custom_list_api" });
  if (!guarded) return;

  const { id } = req.query;

  if (req.method === "GET") {
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "List ID is required" });
    }
    try {
      const list = await prisma.customList.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, name: true, username: true, image: true },
          },
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              titleId: true,
              titleData: true,
              position: true,
            },
          },
        },
      });

      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }

      const session = await getServerSession(req, res, authOptions);
      const isOwner = session?.user?.id === list.userId;

      if (!list.isPublic && !isOwner) {
        return res.status(403).json({ error: "This list is private" });
      }

      return res.status(200).json({
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        updatedAt: list.updatedAt,
        user: list.user,
        items: list.items.map((i) => i.titleData || { id: i.titleId }),
      });
    } catch (err) {
      console.error("List lookup error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "POST") {
    const { id: clientId, name, description, isPublic, items } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim().slice(0, 48) : "";
    if (!cleanName) {
      return res.status(400).json({ error: "List name is required" });
    }
    try {
      const created = await prisma.customList.create({
        data: {
          ...(typeof clientId === "string" && clientId.trim() ? { id: clientId.trim().slice(0, 64) } : {}),
          userId: session.user.id,
          name: cleanName,
          description: typeof description === "string" ? description.trim().slice(0, 200) : null,
          isPublic: typeof isPublic === "boolean" ? isPublic : true,
          items: Array.isArray(items) && items.length
            ? {
                create: items.slice(0, 200).map((it, idx) => {
                  const titleId = typeof it === "object" ? String(it.id || "") : String(it || "");
                  return {
                    titleId: titleId.slice(0, 120),
                    titleData: typeof it === "object" ? it : { id: titleId },
                    position: idx,
                  };
                }).filter((x) => x.titleId),
              }
            : undefined,
        },
      });
      return res.status(201).json({ ok: true, list: created });
    } catch (err) {
      console.error("Create custom list error:", err);
      return res.status(500).json({ error: "Could not save list" });
    }
  }

  if (req.method === "PUT") {
    const targetId = typeof id === "string" ? id : req.body?.id;
    if (!targetId) {
      return res.status(400).json({ error: "List ID is required" });
    }
    try {
      const existing = await prisma.customList.findUnique({ where: { id: targetId } });
      if (!existing) {
        return res.status(404).json({ error: "List not found" });
      }
      if (existing.userId !== session.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { name, description, isPublic, items } = req.body || {};
      const ops = [
        prisma.customList.update({
          where: { id: targetId },
          data: {
            ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 48) } : {}),
            ...(typeof description === "string" ? { description: description.trim().slice(0, 200) } : {}),
            ...(typeof isPublic === "boolean" ? { isPublic } : {}),
          },
        }),
      ];

      if (Array.isArray(items)) {
        const rows = items
          .slice(0, 200)
          .map((it, idx) => {
            const titleId = typeof it === "object" ? String(it.id || "") : String(it || "");
            return {
              listId: targetId,
              titleId: titleId.slice(0, 120),
              titleData: typeof it === "object" ? it : { id: titleId },
              position: idx,
            };
          })
          .filter((r) => r.titleId);

        ops.push(prisma.customListItem.deleteMany({ where: { listId: targetId } }));
        if (rows.length) {
          ops.push(prisma.customListItem.createMany({ data: rows, skipDuplicates: true }));
        }
      }

      await prisma.$transaction(ops);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Update custom list error:", err);
      return res.status(500).json({ error: "Could not update list" });
    }
  }

  if (req.method === "DELETE") {
    const targetId = typeof id === "string" ? id : req.body?.id;
    if (!targetId) {
      return res.status(400).json({ error: "List ID is required" });
    }
    try {
      const existing = await prisma.customList.findUnique({ where: { id: targetId } });
      if (!existing) {
        return res.status(404).json({ error: "List not found" });
      }
      if (existing.userId !== session.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await prisma.customList.delete({ where: { id: targetId } });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Delete custom list error:", err);
      return res.status(500).json({ error: "Could not delete list" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
