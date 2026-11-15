import { useMemo, useState } from "react";
import Layout from "./Layout";
import { PageHead, Chips, Select, TitleGrid, Empty } from "./Page";

const SORTS = [
  { value: "rating", label: "Top rated" },
  { value: "new", label: "Newest" },
  { value: "az", label: "A to Z" },
];

export default function Catalog({ pageTitle, sub, items, extraTools }) {
  const [genre, setGenre] = useState("all");
  const [sort, setSort] = useState("rating");

  const genres = useMemo(() => {
    const set = new Set((items || []).flatMap((t) => t.genres || []));
    return [{ value: "all", label: "All" }, ...[...set].sort().map((g) => ({ value: g, label: g }))];
  }, [items]);

  const shown = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    const list =
      genre === "all"
        ? [...safeItems]
        : safeItems.filter((t) => Array.isArray(t.genres) && t.genres.includes(genre));
    if (sort === "rating") list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    if (sort === "new") {
      list.sort(
        (a, b) =>
          (Number(b.year) || 0) - (Number(a.year) || 0) ||
          (Number(b.rating) || 0) - (Number(a.rating) || 0)
      );
    }
    if (sort === "az") list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    return list;
  }, [items, genre, sort]);

  return (
    <Layout title={pageTitle} description={sub}>
      <div className="pageInner">
        <PageHead title={pageTitle} sub={sub}>
          {extraTools}
          <Select id="sort" label="Sort" value={sort} onChange={setSort} options={SORTS} />
        </PageHead>
        <div style={{ marginBottom: 28 }}>
          <Chips label="Genre" options={genres} value={genre} onChange={setGenre} />
        </div>
        {shown.length ? (
          <TitleGrid items={shown} />
        ) : (
          <Empty
            title="Nothing here yet"
            text="No titles match this filter. Try another genre."
            actionLabel={genre !== "all" || sort !== "rating" ? "Reset filters" : undefined}
            onAction={
              genre !== "all" || sort !== "rating"
                ? () => {
                    setGenre("all");
                    setSort("rating");
                  }
                : undefined
            }
          />
        )}
      </div>
    </Layout>
  );
}
