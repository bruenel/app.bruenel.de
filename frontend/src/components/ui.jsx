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

export const downloadCsv = (rows, filename) => {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.join(';'), ...rows.map((r) => keys.map((k) => esc(r[k])).join(';'))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
