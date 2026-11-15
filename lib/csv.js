// Safe CSV serialization with formula-injection neutralization

const FORMULA_PREFIX_RE = /^[\s\u0000]*[=+\-@\t\r]/;

export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Prevent Excel/Sheets formula injection (CWE-1236)
  if (FORMULA_PREFIX_RE.test(str) || /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape double quotes and quote cell if needed
  if (/[",\r\n']/.test(str) || str.startsWith("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(sanitizeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(sanitizeCsvCell).join(","));
  }
  return lines.join("\r\n");
}
