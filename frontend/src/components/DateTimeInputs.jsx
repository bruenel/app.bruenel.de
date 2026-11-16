import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Locale-independent date / time inputs.
 *
 * Native <input type="date|time"> renders according to the browser/OS locale
 * (e.g. 05/14/1992 or 08:00 AM) and cannot be styled. These components always
 * show DD.MM.YYYY and 24h HH:mm, while the value exposed to the app stays
 * ISO (YYYY-MM-DD / HH:mm) so API payloads and existing handlers don't change.
 * onChange receives an event-like object: { target: { value } }.
 */

const isoToDisplay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

const displayToIso = (disp) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(disp);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
};

const maskDate = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += '.' + digits.slice(2, 4);
  if (digits.length > 4) out += '.' + digits.slice(4, 8);
  return out;
};

const getLocalTodayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export const DateInput = ({ value, onChange, required, disabled, style, className, placeholder, type, ...rest }) => {
  const [text, setText] = useState(isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const todayIso = getLocalTodayIso();
  const [viewYm, setViewYm] = useState(() => {
    const base = /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value : todayIso;
    const [y, m] = base.split('-').map(Number);
    return { y, m };
  });
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    // Sync when parent value changes (but don't clobber partially typed input)
    if (displayToIso(text) !== (value || null)) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev) => {
      if (
        wrapperRef.current?.contains(ev.target) ||
        popoverRef.current?.contains(ev.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleText = (e) => {
    const masked = maskDate(e.target.value);
    setText(masked);
    if (masked === '') onChange?.({ target: { value: '' } });
    else {
      const iso = displayToIso(masked);
      if (iso) onChange?.({ target: { value: iso } });
    }
  };

  const openCalendar = () => {
    if (disabled) return;
    const base = /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value : todayIso;
    const [y, m] = base.split('-').map(Number);
    setViewYm({ y, m });
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const popW = 280;
      const popH = 315;
      const top = rect.bottom + popH > window.innerHeight && rect.top > popH
        ? rect.top - popH - 6
        : rect.bottom + 6;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8);
      setPos({ top, left });
    }
    setOpen(true);
  };

  const shiftMonth = (delta) => {
    setViewYm(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };

  const selectIso = (iso) => {
    onChange?.({ target: { value: iso } });
    setText(isoToDisplay(iso));
    setOpen(false);
  };

  const firstDay = new Date(viewYm.y, viewYm.m - 1, 1);
  const daysInMonth = new Date(viewYm.y, viewYm.m, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let yr = currentYear + 15; yr >= 1940; yr -= 1) years.push(yr);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder || 'TT.MM.JJJJ'}
        maxLength={10}
        required={required}
        disabled={disabled}
        className={className}
        style={{ ...style, width: '100%', paddingRight: 34, cursor: disabled ? 'not-allowed' : 'pointer' }}
        value={text}
        onClick={openCalendar}
        onFocus={openCalendar}
        onChange={handleText}
        onBlur={() => setText(isoToDisplay(value))}
        pattern="\d{2}\.\d{2}\.\d{4}"
        title="TT.MM.JJJJ"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        disabled={disabled}
        aria-label="Kalender öffnen"
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: open ? '#FF6B00' : '#64748b',
          display: 'grid',
          placeItems: 'center',
          padding: 2,
          boxShadow: 'none',
          minWidth: 0,
        }}
      >
        <Calendar size={15} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 280,
            zIndex: 10100,
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.22)',
            padding: 12,
            animation: 'hrModalIn 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
            fontFamily: 'inherit',
          }}
        >
          {/* Month / Year Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
            >
              <ChevronLeft size={14} />
            </button>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, justifyContent: 'center' }}>
              <select
                value={viewYm.m}
                onChange={(e) => setViewYm((prev) => ({ ...prev, m: Number(e.target.value) }))}
                style={{ padding: '4px 6px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', width: 'auto' }}
              >
                {MONTHS_DE.map((name, idx) => (
                  <option key={name} value={idx + 1}>{name}</option>
                ))}
              </select>
              <select
                value={viewYm.y}
                onChange={(e) => setViewYm((prev) => ({ ...prev, y: Number(e.target.value) }))}
                style={{ padding: '4px 6px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', width: 'auto' }}
              >
                {years.map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Weekday Labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
              <div key={d} style={{ padding: '3px 0' }}>{d}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const iso = `${viewYm.y}-${String(viewYm.m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = value === iso;
              const isToday = todayIso === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectIso(iso)}
                  style={{
                    height: 32,
                    borderRadius: 7,
                    border: isToday && !isSelected ? '1.5px solid #FF6B00' : '1px solid transparent',
                    background: isSelected ? '#FF6B00' : isToday ? '#fff7ed' : 'transparent',
                    color: isSelected ? '#ffffff' : isToday ? '#c2410c' : '#0f172a',
                    fontSize: 12,
                    fontWeight: isSelected || isToday ? 800 : 500,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'grid',
                    placeItems: 'center',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = isToday ? '#ffedd5' : '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = isToday ? '#fff7ed' : 'transparent';
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer: Today + Clear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              onClick={() => selectIso(todayIso)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #fed7aa',
                background: '#fff7ed',
                color: '#c2410c',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Heute ({isoToDisplay(todayIso)})
            </button>
            {value && (
              <button
                type="button"
                onClick={() => selectIso('')}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#64748b',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Löschen
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const maskTime = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

const validTime = (s) => {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
};

export const TimeInput = ({ value, onChange, required, disabled, style, className, placeholder, type, ...rest }) => {
  const [text, setText] = useState(value || '');

  useEffect(() => {
    if ((value || '') !== text && (validTime(text) || text === '')) setText(value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleText = (e) => {
    const masked = maskTime(e.target.value);
    setText(masked);
    if (masked === '') onChange?.({ target: { value: '' } });
    else if (validTime(masked)) onChange?.({ target: { value: masked } });
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder || 'HH:MM'}
      maxLength={5}
      required={required}
      disabled={disabled}
      className={className}
      style={style}
      value={text}
      onChange={handleText}
      onBlur={() => setText(value || '')}
      pattern="([01]\d|2[0-3]):[0-5]\d"
      title="HH:MM (24h)"
    />
  );
};
