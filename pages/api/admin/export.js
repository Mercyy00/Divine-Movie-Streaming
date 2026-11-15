import { requireAdmin } from "../../../lib/session";
import { applyApiGuard } from "../../../lib/api-guard";
import { parseAdminListQuery, filterSortPaginatePeople } from "../../../lib/adminData";
import { buildCsv } from "../../../lib/csv";
import { logAdminAction } from "../../../lib/adminAudit";
import { loadUnifiedPeople } from "./people";

const MAX_EXPORT_ROWS = 10000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 10, windowMs: 60000, prefix: "admin_export" }))) {
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const people = await loadUnifiedPeople();
    const filters = {
      ...parseAdminListQuery(req.query),
      page: 1,
      pageSize: MAX_EXPORT_ROWS,
    };

    // filterSortPaginatePeople clamps pageSize at 100, so filter+sort directly for export up to 10,000
    const batch = filterSortPaginatePeople(people, { ...filters, pageSize: 100 });
    // Actually export up to MAX_EXPORT_ROWS matching filters cleanly:
    const matched = [];
    for (let p = 1; p <= batch.totalPages && matched.length < MAX_EXPORT_ROWS; p++) {
      const slice = filterSortPaginatePeople(people, { ...filters, page: p, pageSize: 100 });
      matched.push(...slice.items);
    }
    const exportRows = matched.slice(0, MAX_EXPORT_ROWS);

    await logAdminAction(req, {
      adminId: admin.id,
      action: "EXPORT_CSV",
      targetType: "people",
      targetId: `rows:${exportRows.length}`,
    });

    const headers = [
      "ID",
      "Type",
      "Name",
      "Username",
      "Email",
      "SignInMethod",
      "Country",
      "CreatedOrFirstSeen",
      "LastActive",
      "TitlesWatched",
      "Status",
    ];

    const csv = buildCsv(
      headers,
      exportRows.map((p) => [
        p.id,
        p.personType,
        p.displayName,
        p.username || "",
        p.email || "",
        p.signInMethod,
        p.country || "",
        p.createdAt,
        p.lastActiveAt,
        p.titlesWatched,
        p.status,
      ])
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="divine-people-export.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error("Admin CSV export error:", err);
    return res.status(500).json({ error: "Could not export CSV" });
  }
}
