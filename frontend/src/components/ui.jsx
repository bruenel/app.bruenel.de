import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';

/**
 * Universal in-app Delete Confirmation Modal (`confirmDelete`).
 * Always asks the user if they are sure before deleting any employee, document, or important item,
 * and requires explicit user approval ("Ja, endgültig löschen") before proceeding.
 *
 * Accepts either a string message or an options object:
 *   await confirmDelete('Sind Sie sicher, dass Sie ... löschen möchten?')
 *   await confirmDelete({ title, message, itemName, confirmText, cancelText })
 */
export const confirmDelete = (optionsOrMessage) => {
  if (typeof document === 'undefined') {
    const msg = typeof optionsOrMessage === 'string' ? optionsOrMessage : (optionsOrMessage?.message || 'Sind Sie sicher?');
    return Promise.resolve(window.confirm(msg));
  }

  const opts = typeof optionsOrMessage === 'string'
    ? { message: optionsOrMessage }
    : (optionsOrMessage || {});

  const title = opts.title || 'Löschvorgang bestätigen';
  const message = opts.message || 'Sind Sie sicher, dass Sie diesen Eintrag unwiderruflich löschen möchten?';
  const itemName = opts.itemName || null;
  const confirmText = opts.confirmText || 'Ja, endgültig löschen';
  const cancelText = opts.cancelText || 'Abbrechen';

  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.setAttribute('data-confirm-delete-modal', 'true');
    document.body.appendChild(container);
    const root = createRoot(container);

    let settled = false;
    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKeyDown);
      try {
        root.unmount();
      } catch (_) {
        // ignore unmount race
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    root.render(
      <div
        onClick={() => cleanup(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '460px',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #fecaca',
            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.28)',
            overflow: 'hidden',
            fontFamily: 'inherit',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px',
              background: '#fef2f2',
              borderBottom: '1px solid #fee2e2',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#991b1b' }}>
                  {title}
                </h3>
                <div style={{ fontSize: '0.74rem', color: '#b91c1c', fontWeight: 600 }}>
                  Sicherheitsabfrage vor dem Löschen
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => cleanup(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
              }}
              title="Schließen"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 22px' }}>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.55, color: '#1e293b', fontWeight: 500, whiteSpace: 'pre-line' }}>
              {message}
            </p>
            {itemName && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  wordBreak: 'break-word',
                }}
              >
                {itemName}
              </div>
            )}
            <div
              style={{
                marginTop: '14px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                fontSize: '0.78rem',
                color: '#9a3412',
                lineHeight: 1.45,
              }}
            >
              <strong>Hinweis:</strong> Bitte bestätigen Sie die Löschung. Erst nach Ihrer Freigabe wird dieser Eintrag gelöscht.
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '14px 20px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <button
              type="button"
              onClick={() => cleanup(false)}
              style={{
                padding: '9px 16px',
                borderRadius: '9px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => cleanup(true)}
              style={{
                padding: '9px 18px',
                borderRadius: '9px',
                border: '1px solid #dc2626',
                background: '#dc2626',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
              }}
            >
              <Trash2 size={15} /> {confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  });
};

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
