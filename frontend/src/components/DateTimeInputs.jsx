import React, { useState, useEffect, useRef } from 'react';

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

export const DateInput = ({ value, onChange, required, disabled, style, className, placeholder, type, ...rest }) => {
  const [text, setText] = useState(isoToDisplay(value));
  const pickerRef = useRef(null);

  useEffect(() => {
    // Sync when parent value changes (but don't clobber partially typed input)
    if (displayToIso(text) !== (value || null)) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleText = (e) => {
    const masked = maskDate(e.target.value);
    setText(masked);
    if (masked === '') onChange?.({ target: { value: '' } });
    else {
      const iso = displayToIso(masked);
      if (iso) onChange?.({ target: { value: iso } });
    }
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try { el.showPicker ? el.showPicker() : el.click(); } catch { el.click(); }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
        style={{ ...style, width: '100%', paddingRight: 34 }}
        value={text}
        onChange={handleText}
        onBlur={() => setText(isoToDisplay(value))}
        pattern="\d{2}\.\d{2}\.\d{4}"
        title="TT.MM.JJJJ"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        aria-label="Kalender öffnen"
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: 2, boxShadow: 'none', minWidth: 0 }}
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        onChange={(e) => onChange?.({ target: { value: e.target.value } })}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', padding: 0, border: 0 }}
      />
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
