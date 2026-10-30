import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Consistent page header: title, description, right-aligned actions. */
export const PageHead = ({ title, desc, children }) => (
  <div className="page-head">
    <div>
      <h2>{title}</h2>
      {desc && <p>{desc}</p>}
    </div>
    {children && <div className="page-actions">{children}</div>}
  </div>
);

/** Route-driven segmented tabs. items: [{id,label,count}] */
export const SubTabs = ({ items, active, base }) => {
  const navigate = useNavigate();
  return (
    <div className="subtabs">
      {items.map((t) => (
        <button key={t.id} className={`subtab ${active === t.id ? 'active' : ''}`} onClick={() => navigate(`${base}/${t.id}`)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
};

/** Run `fn` when the top-bar "Create" menu or palette sent `action` via router state. */
export const useQuickAction = (name, fn) => {
  const loc = useLocation();
  useEffect(() => {
    if (loc.state?.action === name) fn();
    // eslint-disable-next-line
  }, [loc.state]);
};

export const Empty = ({ children = 'Nothing here yet.' }) => (
  <div style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)' }}>
    <p>{children}</p>
  </div>
);

/**
 * Download a rich, flat CSV.
 * Accepts either raw rows (any shape) or a {rows, columns} descriptor.
 * - columns: optional array of { key, label, fn } to control output columns + display names + transform.
 * - All nested objects are JSON-stringified automatically; primitives are quoted as-is.
 */
export const downloadCsv = (rowsOrDescriptor, filename) => {
  let rows, columns;
  if (rowsOrDescriptor && rowsOrDescriptor.rows && rowsOrDescriptor.columns) {
    ({ rows, columns } = rowsOrDescriptor);
  } else {
    rows = rowsOrDescriptor;
    columns = null;
  }
  if (!rows || rows.length === 0) return;

  const esc = (v) => {
    if (v === null || v === undefined) return '""';
    if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
    return `"${String(v).replace(/"/g, '""')}"`;
  };

  let header, dataRows;
  if (columns && columns.length > 0) {
    header = columns.map((c) => esc(c.label || c.key)).join(';');
    dataRows = rows.map((r) =>
      columns.map((c) => esc(c.fn ? c.fn(r) : r[c.key])).join(';')
    );
  } else {
    // Auto-flatten: include all keys, and for object values flatten one level deep
    const allKeys = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => allKeys.add(k)));
    const keys = Array.from(allKeys);
    header = keys.map((k) => esc(k)).join(';');
    dataRows = rows.map((r) =>
      keys.map((k) => esc(r[k])).join(';')
    );
  }

  // UTF-8 BOM so Excel opens it correctly
  const bom = '\uFEFF';
  const csv = bom + [header, ...dataRows].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
