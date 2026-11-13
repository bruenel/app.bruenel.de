import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Plus,
  Trash2,
  Download,
  FileSpreadsheet,
  Search,
  Sparkles,
  Building2,
  MapPin,
  Layers,
  ShieldCheck,
  RefreshCw,
  Edit3,
  X,
  Star,
  Eye,
  MessageSquare,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  Send,
  Users,
} from 'lucide-react';
import { API_URL, fetchWithToken, getToken } from '../core/api';

export const AUSBAU_TYP_OPTIONS = [
  'Metalkanal',
  'Leerrohr-Kamin',
  'Kabelkanal',
  'Fassade',
  'Bestand',
];

export const BUILDING_STATUS_OPTIONS = [
  'Ausbau terminiert',
  'Offen',
  'In Bearbeitung',
  'Restarbeiten',
  'Abgeschlossen',
];

export const WE_AUSBAU_ART_OPTIONS = [
  'TA Installation',
  'Reserve',
  'Ohne',
];

const BUILDING_STATUS_PILL = {
  'Ausbau terminiert': {
    background: '#f3e8ff',
    color: '#6b21a8',
    border: '1px solid #d8b4fe',
  },
  Offen: {
    background: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
  },
  'In Bearbeitung': {
    background: '#dbeafe',
    color: '#1d4ed8',
    border: '1px solid #93c5fd',
  },
  Restarbeiten: {
    background: '#ffedd5',
    color: '#c2410c',
    border: '1px solid #fdba74',
  },
  Abgeschlossen: {
    background: '#dcfce7',
    color: '#15803d',
    border: '1px solid #86efac',
  },
};

/* =============================================================================
   SMART GEMEINDE / CITY NORMALIZER & MERGER (e.g. "gps + Lorch" -> "Lorch")
============================================================================= */
const PLZ_TO_CITY = {
  '73547': 'Lorch',
  '73525': 'Schwäbisch Gmünd',
  '73527': 'Schwäbisch Gmünd',
  '73529': 'Schwäbisch Gmünd',
  '73553': 'Alfdorf',
  '73563': 'Mögglingen',
  '73574': 'Iggingen',
  '73577': 'Ruppertshofen',
  '73571': 'Göggingen',
  '73565': 'Spraitbach',
  '73568': 'Durlangen',
  '73575': 'Leinzell',
  '73566': 'Bartholomä',
  '73560': 'Böbingen an der Rems',
  '73557': 'Mutlangen',
  '73540': 'Heubach',
  '73614': 'Schorndorf',
  '73642': 'Welzheim',
  '73655': 'Plüderhausen',
  '73650': 'Winterbach',
  '73630': 'Remshalden',
};

const CANONICAL_CITY_MATCHERS = [
  ['lorch', 'Lorch'],
  ['gmünd', 'Schwäbisch Gmünd'],
  ['gmuend', 'Schwäbisch Gmünd'],
  ['alfdorf', 'Alfdorf'],
  ['mögglingen', 'Mögglingen'],
  ['moegglingen', 'Mögglingen'],
  ['iggingen', 'Iggingen'],
  ['ruppertshofen', 'Ruppertshofen'],
  ['göggingen', 'Göggingen'],
  ['goeggingen', 'Göggingen'],
  ['spraitbach', 'Spraitbach'],
  ['durlangen', 'Durlangen'],
  ['leinzell', 'Leinzell'],
  ['bartholom', 'Bartholomä'],
  ['böbingen', 'Böbingen an der Rems'],
  ['boebingen', 'Böbingen an der Rems'],
  ['mutlangen', 'Mutlangen'],
  ['heubach', 'Heubach'],
  ['schorndorf', 'Schorndorf'],
  ['welzheim', 'Welzheim'],
  ['plüderhausen', 'Plüderhausen'],
  ['pluederhausen', 'Plüderhausen'],
  ['winterbach', 'Winterbach'],
  ['remshalden', 'Remshalden'],
];

export function normalizeGemeinde(rawOrt, rawPlz = '') {
  const plzClean = String(rawPlz || '').replace(/\D/g, '').slice(0, 5);
  let s = String(rawOrt || '').trim();
  const sLower = s.toLowerCase();

  for (const [needle, canonical] of CANONICAL_CITY_MATCHERS) {
    if (sLower.includes(needle)) return canonical;
  }
  if (plzClean && PLZ_TO_CITY[plzClean]) {
    return PLZ_TO_CITY[plzClean];
  }

  s = s.replace(
    /\b(gps|koordinaten|standort|objekt[-\s]*adresse|gemeinde|ort|plz|stra[ßs]e|str\.|hausnummer|hnr\.?|nr\.?|we)\b/gi,
    ' '
  );
  s = s.replace(/[0-9+*:;/|\\()[\]{}<>_.,!?-]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  const cleanedLower = s.toLowerCase();
  for (const [needle, canonical] of CANONICAL_CITY_MATCHERS) {
    if (cleanedLower.includes(needle)) return canonical;
  }

  if (!s) {
    return PLZ_TO_CITY[plzClean] || '';
  }

  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/* =============================================================================
   DATE HELPERS — STRICT DD.MM.YYYY FORMAT & MODERN MINIMAL CALENDAR
============================================================================= */
export function toDdMmYyyy(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (!str) return '';
  // ISO YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const dd = String(Number(iso[3])).padStart(2, '0');
    const mm = String(Number(iso[2])).padStart(2, '0');
    return `${dd}.${mm}.${iso[1]}`;
  }
  // German DD.MM.YYYY (strip trailing time if any)
  const de = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (de) {
    const dd = String(Number(de[1])).padStart(2, '0');
    const mm = String(Number(de[2])).padStart(2, '0');
    let yyyy = de[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${dd}.${mm}.${yyyy}`;
  }
  return str;
}

export function parseDdMmYyyyToDate(val) {
  const formatted = toDdMmYyyy(val);
  const m = formatted.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTH_NAMES_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
const WEEKDAYS_SHORT_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * Modern Minimal Light-Mode Calendar Picker (`DD.MM.YYYY`)
 */
export const MinimalDatePicker = ({ value, onChange, placeholder = 'TT.MM.JJJJ', compact = false }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const displayVal = toDdMmYyyy(value);
  const parsedDate = parseDdMmYyyyToDate(displayVal);

  const [viewYear, setViewYear] = useState(() => (parsedDate ? parsedDate.getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (parsedDate ? parsedDate.getMonth() : new Date().getMonth()));

  useEffect(() => {
    const d = parseDdMmYyyyToDate(value);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const daysGrid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d += 1) {
      const dd = String(d).padStart(2, '0');
      const mm = String(viewMonth + 1).padStart(2, '0');
      const formatted = `${dd}.${mm}.${viewYear}`;
      cells.push({ day: d, formatted });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const todayFormatted = useMemo(() => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  }, []);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: compact ? '5px 8px' : '7px 10px',
          fontSize: compact ? 11.5 : 12.5,
          fontWeight: displayVal ? 600 : 400,
          color: displayVal ? '#0f172a' : '#94a3b8',
          background: '#ffffff',
          border: open ? '1px solid #FF6B00' : '1px solid #e2e8f0',
          borderRadius: 8,
          cursor: 'pointer',
          boxShadow: open ? '0 0 0 2px rgba(255,107,0,0.15)' : 'none',
          transition: 'all 140ms ease',
          textAlign: 'left',
        }}
      >
        <span style={{ fontFamily: displayVal ? 'monospace' : 'inherit' }}>
          {displayVal || placeholder}
        </span>
        <Calendar size={compact ? 12 : 14} style={{ color: displayVal ? '#FF6B00' : '#94a3b8', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 150,
            width: 248,
            padding: 12,
            borderRadius: 12,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 14px 36px rgba(15, 23, 42, 0.14)',
            userSelect: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <button
              type="button"
              onClick={prevMonth}
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
              {MONTH_NAMES_DE[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Weekday Headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
              marginBottom: 4,
              textAlign: 'center',
            }}
          >
            {WEEKDAYS_SHORT_DE.map((wd) => (
              <div
                key={wd}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#94a3b8',
                  padding: '2px 0',
                }}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
            }}
          >
            {daysGrid.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} style={{ height: 28 }} />;
              const isSelected = cell.formatted === displayVal;
              const isToday = cell.formatted === todayFormatted;
              return (
                <button
                  key={cell.formatted}
                  type="button"
                  onClick={() => {
                    onChange(cell.formatted);
                    setOpen(false);
                  }}
                  style={{
                    height: 28,
                    borderRadius: 6,
                    border: isToday && !isSelected ? '1px solid #FF6B00' : 'none',
                    background: isSelected ? '#FF6B00' : 'transparent',
                    color: isSelected ? '#ffffff' : isToday ? '#FF6B00' : '#1e293b',
                    fontSize: 11.5,
                    fontWeight: isSelected || isToday ? 700 : 500,
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Footer: Heute & Löschen */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              Löschen
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayFormatted);
                setOpen(false);
              }}
              style={{
                border: 'none',
                background: 'rgba(255, 107, 0, 0.1)',
                color: '#FF6B00',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 5,
                cursor: 'pointer',
                padding: '3px 8px',
              }}
            >
              Heute ({todayFormatted})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Extracts YYYY-MM from DD.MM.YYYY or YYYY-MM-DD for the Month filter */
function extractYearMonths(addr) {
  const candidates = [
    addr.ausbautermin,
    addr.abgeschlossen_datum,
    addr.restarbeit_termin,
    addr.created_at ? String(addr.created_at).slice(0, 10) : '',
  ];
  const months = new Set();
  candidates.forEach((raw) => {
    if (!raw) return;
    const str = String(raw).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) months.add(`${isoMatch[1]}-${isoMatch[2]}`);
    const deMatch = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (deMatch) {
      const mm = deMatch[2].padStart(2, '0');
      let yyyy = deMatch[3];
      if (yyyy.length === 2) yyyy = `20${yyyy}`;
      months.add(`${yyyy}-${mm}`);
    }
  });
  return Array.from(months);
}

/**
 * Calculates the building completion percentage & Percent Line data
 */
export function calcBuildingProgress(addr) {
  const units = addr?.units || [];
  const totalWe = Math.max(Number(addr?.total_we || 0), units.length, 1);
  const bStatus = addr?.building_status || 'Ausbau terminiert';

  const checkFlags = [
    Boolean(addr?.flexrohr),
    Boolean(addr?.huep_installiert),
    Boolean(addr?.spleissen_fertig),
    Boolean(addr?.upload_done),
    Boolean(addr?.genehmigt),
    Boolean(addr?.rechnung_erstellt),
    Boolean(addr?.rechnung_bezahlt),
  ];
  const doneChecks = checkFlags.filter(Boolean).length;

  let pct = Math.round((doneChecks / checkFlags.length) * 100);
  if (bStatus === 'Abgeschlossen') {
    pct = 100;
  } else if (bStatus === 'Restarbeiten' && pct < 65) {
    pct = 65;
  } else if (bStatus === 'In Bearbeitung' && pct < 30) {
    pct = 30;
  }

  return {
    pct,
    totalWe,
    doneChecks,
    totalChecks: checkFlags.length,
  };
}

/** Visual Percent Line Bar */
export const PercentLine = ({ addr, compact = false }) => {
  const { pct, totalWe } = calcBuildingProgress(addr);
  const barColor =
    pct >= 100
      ? '#16a34a'
      : pct >= 65
      ? '#f59e0b'
      : pct >= 25
      ? '#2563eb'
      : '#FF6B00';

  return (
    <div style={{ minWidth: compact ? 95 : 120, width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: compact ? 10.5 : 11,
          fontWeight: 700,
          marginBottom: 3,
          color: pct >= 100 ? '#15803d' : '#334155',
        }}
      >
        <span>{pct}%</span>
        <span style={{ color: '#64748b', fontWeight: 600 }}>{totalWe} WE</span>
      </div>
      <div
        style={{
          width: '100%',
          height: compact ? 6 : 7,
          borderRadius: 999,
          background: '#e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(4, pct)}%`,
            height: '100%',
            borderRadius: 999,
            background: barColor,
            transition: 'width 260ms ease, background-color 260ms ease',
          }}
        />
      </div>
    </div>
  );
};

/* =============================================================================
   CLIENT-SIDE CSV (UTF-8 BOM FOR EXCEL) FALLBACK HELPER
============================================================================= */
function exportAddressesToCsv(addresses, filename = 'UGG_Ausbau_Tracking.csv') {
  const headers = [
    'Ausbau-Typ',
    'Status',
    'Fortschritt (%)',
    'Ausbau Datum',
    'Abgeschlossen Datum',
    'Restarbeit Termin',
    'Ausbau Team',
    'Adress ID2',
    'WE Nummer',
    'PLZ',
    'Ort',
    'Straße',
    'Etage',
    'Wohnung',
    'TA Installation',
    'Reserve',
    'Ohne',
    'Flexrohr',
    'HÜP installiert',
    'Spleißen fertig',
    'Fotos Uploaded',
    'Genehmigt',
    'Rechnung erstellt',
    'Rechnung bezahlt',
  ];

  const rows = [];
  addresses.forEach((addr) => {
    const units = addr.units && addr.units.length > 0 ? addr.units : [null];
    const { pct } = calcBuildingProgress(addr);
    const normOrt = normalizeGemeinde(addr.ort, addr.plz);
    units.forEach((u) => {
      const weArt = u
        ? u.we_ausbau_art ||
          (u.ta_installiert ? 'TA Installation' : u.reserve ? 'Reserve' : 'Ohne')
        : 'Ohne';
      rows.push([
        addr.ausbau_typ || 'Metalkanal',
        addr.building_status || 'Ausbau terminiert',
        `${pct}%`,
        toDdMmYyyy(addr.ausbautermin),
        toDdMmYyyy(addr.abgeschlossen_datum),
        toDdMmYyyy(addr.restarbeit_termin),
        addr.team || '',
        addr.adress_id || '',
        addr.projektnummer || '',
        addr.plz || '',
        normOrt,
        `${addr.strasse || ''} ${addr.hausnummer || ''}`.trim(),
        u ? u.etage : '-',
        u ? u.unit_id : '-',
        weArt === 'TA Installation' ? 'Ja' : 'Nein',
        weArt === 'Reserve' ? 'Ja' : 'Nein',
        weArt === 'Ohne' ? 'Ja' : 'Nein',
        addr.flexrohr ? 'Ja' : 'Nein',
        addr.huep_installiert ? 'Ja' : 'Nein',
        addr.spleissen_fertig ? 'Ja' : 'Nein',
        addr.upload_done ? 'Ja' : 'Nein',
        addr.genehmigt ? 'Ja' : 'Nein',
        addr.rechnung_erstellt ? 'Ja' : 'Nein',
        addr.rechnung_bezahlt ? 'Ja' : 'Nein',
      ]);
    });
  });

  const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* =============================================================================
   WHOLE-BUILDING CHECKLIST ITEMS DEFINITION ("Fotos Uploaded" instead of "Upload")
============================================================================= */
export const BUILDING_CHECK_ITEMS = [
  { key: 'flexrohr', label: 'Flexrohr', short: 'Flex', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  { key: 'huep_installiert', label: 'HÜP installiert', short: 'HÜP', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  { key: 'spleissen_fertig', label: 'Spleißen fertig', short: 'Spl', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  { key: 'upload_done', label: 'Fotos Uploaded', short: 'Fotos', color: '#ea580c', bg: 'rgba(234,88,12,0.09)' },
  { key: 'genehmigt', label: 'Genehmigt', short: 'Gen', color: '#ea580c', bg: 'rgba(234,88,12,0.09)' },
  { key: 'rechnung_erstellt', label: 'Rechnung erstellt', short: 'RE', color: '#0284c7', bg: 'rgba(2,132,199,0.09)' },
  { key: 'rechnung_bezahlt', label: 'Rechnung bezahlt', short: 'Bez', color: '#16a34a', bg: 'rgba(22,163,74,0.09)' },
];

/* =============================================================================
   COMPONENT 1: COMPACT MINIMAL INLINE UPLOAD BAR (Inside Import / Overview Header)
============================================================================= */
export const CompactProtocolUploadBar = ({ onExtracted, onLoadSample, uploading, setUploading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const processPdfFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('Bitte eine gültige .pdf Datei wählen.');
      return;
    }

    setErrorMsg('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const parsedData = await fetchWithToken('/api/v1/protocol/upload', {
        method: 'POST',
        body: formData,
      });

      setUploading(false);
      onExtracted(parsedData, file.name);
    } catch (err) {
      setUploading(false);
      setErrorMsg(err.message || 'PDF-Extraktion fehlgeschlagen.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processPdfFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 8,
          border: dragActive ? '1.5px dashed #FF6B00' : '1px dashed #cbd5e1',
          background: dragActive ? 'rgba(255, 107, 0, 0.06)' : '#f8fafc',
          cursor: uploading ? 'wait' : 'pointer',
          fontSize: 12,
          color: '#1e293b',
          transition: 'all 150ms ease',
        }}
        title="UGG Hausbegehungsprotokoll PDF hierher ziehen oder klicken"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) {
              processPdfFile(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />
        <Upload size={14} style={{ color: '#FF6B00', flexShrink: 0 }} />
        <span style={{ fontWeight: 600 }}>
          {uploading ? 'KI liest PDF…' : 'PDF-Protokoll Import (Drag & Drop)'}
        </span>
      </div>

      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={onLoadSample}
        disabled={uploading}
        style={{ padding: '6px 10px', fontSize: 11.5 }}
        title="Muster-Protokoll zum Testen laden"
      >
        <Sparkles size={13} style={{ color: '#FF6B00' }} />
        <span>Muster</span>
      </button>

      {errorMsg && (
        <span style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>{errorMsg}</span>
      )}
    </div>
  );
};

/* =============================================================================
   COMPONENT 2: VERIFICATION & BUILDING EDIT MODAL (Light Minimal Design)
============================================================================= */
export const ProtocolVerificationModal = ({
  initialData,
  sourceFileName,
  fieldTeams = [],
  isEditMode = false,
  editAddressId = null,
  onClose,
  onSaved,
}) => {
  const normInitialOrt = normalizeGemeinde(initialData?.ort, initialData?.plz);
  const defaultTeam =
    initialData?.team ||
    (fieldTeams.length > 0 ? fieldTeams[0].name : normInitialOrt ? `Techno(${normInitialOrt})` : 'Techno(Lorch)');

  const [form, setForm] = useState(() => ({
    adress_id: initialData?.adress_id || '',
    projektnummer: initialData?.projektnummer || '',
    team: defaultTeam,
    building_status: initialData?.building_status || 'Ausbau terminiert',
    is_priority: Boolean(initialData?.is_priority),
    ausbau_typ: initialData?.ausbau_typ || initialData?.loesungsoption || 'Metalkanal',
    ausbautermin: toDdMmYyyy(initialData?.ausbautermin),
    abgeschlossen_datum: toDdMmYyyy(initialData?.abgeschlossen_datum),
    restarbeit_termin: toDdMmYyyy(initialData?.restarbeit_termin),
    plz: initialData?.plz || '',
    ort: normInitialOrt || initialData?.ort || '',
    strasse: initialData?.strasse || '',
    hausnummer: initialData?.hausnummer || '',
    total_we: Number(initialData?.total_we || initialData?.units?.length || 1),
    // Whole-building checkboxes — Note: upload_done ("Fotos Uploaded") is FALSE by default on PDF import!
    flexrohr: Boolean(initialData?.flexrohr),
    huep_installiert: Boolean(initialData?.huep_installiert),
    spleissen_fertig: Boolean(initialData?.spleissen_fertig),
    upload_done: isEditMode ? Boolean(initialData?.upload_done) : false,
    genehmigt: Boolean(initialData?.genehmigt),
    rechnung_erstellt: Boolean(initialData?.rechnung_erstellt),
    rechnung_bezahlt: Boolean(initialData?.rechnung_bezahlt),
    pdf_filename: initialData?.pdf_filename || sourceFileName || null,
    pdf_base64: initialData?.pdf_base64 || null,
    units:
      initialData?.units && initialData.units.length > 0
        ? initialData.units.map((u) => {
            const art =
              u.we_ausbau_art ||
              (u.reserve ? 'Reserve' : u.ohne ? 'Ohne' : 'TA Installation');
            return {
              etage: u.etage || 'EG',
              unit_id: u.unit_id || '001',
              status: u.status || 'Offen',
              we_ausbau_art: art,
              ta_installiert: art === 'TA Installation',
              reserve: art === 'Reserve',
              ohne: art === 'Ohne',
            };
          })
        : [
            {
              etage: 'EG',
              unit_id: '001',
              status: 'Offen',
              we_ausbau_art: 'TA Installation',
              ta_installiert: true,
              reserve: false,
              ohne: false,
            },
          ],
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictDetected, setConflictDetected] = useState(false);

  const teamChoices = useMemo(() => {
    const names = new Set();
    fieldTeams.forEach((t) => {
      if (t?.name) names.add(t.name);
    });
    if (form.team) names.add(form.team);
    if (names.size === 0) names.add('Techno(Lorch)');
    return Array.from(names);
  }, [fieldTeams, form.team]);

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'plz' || key === 'ort') {
        const mergedOrt = normalizeGemeinde(
          key === 'ort' ? value : prev.ort,
          key === 'plz' ? value : prev.plz
        );
        if (key === 'plz' && mergedOrt && !prev.ort) {
          next.ort = mergedOrt;
        }
      }
      if (key === 'building_status' && value === 'Abgeschlossen' && !prev.abgeschlossen_datum) {
        const now = new Date();
        next.abgeschlossen_datum = `${String(now.getDate()).padStart(2, '0')}.${String(
          now.getMonth() + 1
        ).padStart(2, '0')}.${now.getFullYear()}`;
      }
      return next;
    });
  };

  const updateUnitRow = (idx, key, value) => {
    setForm((prev) => {
      const nextUnits = prev.units.map((u, i) => {
        if (i !== idx) return u;
        if (key === 'we_ausbau_art') {
          return {
            ...u,
            we_ausbau_art: value,
            ta_installiert: value === 'TA Installation',
            reserve: value === 'Reserve',
            ohne: value === 'Ohne',
          };
        }
        return { ...u, [key]: value };
      });
      return { ...prev, units: nextUnits };
    });
  };

  const addUnitRow = () => {
    setForm((prev) => {
      const nextIdx = prev.units.length + 1;
      const nextUnit = {
        etage: nextIdx === 1 ? 'EG' : `OG${nextIdx - 1}`,
        unit_id: String(nextIdx).padStart(3, '0'),
        status: 'Offen',
        we_ausbau_art: 'TA Installation',
        ta_installiert: true,
        reserve: false,
        ohne: false,
      };
      const nextUnits = [...prev.units, nextUnit];
      return {
        ...prev,
        units: nextUnits,
        total_we: Math.max(Number(prev.total_we || 1), nextUnits.length),
      };
    });
  };

  const removeUnitRow = (idx) => {
    setForm((prev) => {
      if (prev.units.length <= 1) return prev;
      const nextUnits = prev.units.filter((_, i) => i !== idx);
      return {
        ...prev,
        units: nextUnits,
        total_we: nextUnits.length,
      };
    });
  };

  const handleConfirmSave = async (overwrite = false) => {
    setError('');
    if (!form.projektnummer.trim()) {
      setError('Bitte geben Sie eine gültige WE-Nummer / UGG-Projektnummer ein.');
      return;
    }
    if (!form.plz.trim() || !form.ort.trim() || !form.strasse.trim() || !form.hausnummer.trim()) {
      setError('Bitte vervollständigen Sie die Objekt-Adresse (PLZ, Ort, Straße, Hausnummer).');
      return;
    }

    setSaving(true);
    try {
      const cleanOrt = normalizeGemeinde(form.ort, form.plz) || form.ort.trim();
      const payload = {
        ...form,
        ort: cleanOrt,
        ausbautermin: toDdMmYyyy(form.ausbautermin),
        abgeschlossen_datum: toDdMmYyyy(form.abgeschlossen_datum),
        restarbeit_termin: toDdMmYyyy(form.restarbeit_termin),
        loesungsoption: form.ausbau_typ,
        total_we: Math.max(1, Number(form.total_we) || form.units.length),
      };

      let savedRecord;
      if (isEditMode && editAddressId) {
        savedRecord = await fetchWithToken(`/api/v1/protocol/addresses/${editAddressId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        const query = overwrite ? '?overwrite=true' : '';
        savedRecord = await fetchWithToken(`/api/v1/protocol/confirm${query}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setSaving(false);
      onSaved(savedRecord);
    } catch (err) {
      setSaving(false);
      const msg = err.message || 'Speichern fehlgeschlagen.';
      setError(msg);
      if (msg.toLowerCase().includes('existiert bereits')) {
        setConflictDetected(true);
      }
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 12,
        overflowY: 'auto',
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-panel"
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: 16,
          padding: 0,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
        }}
      >
        {/* Clean Light Header */}
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(255, 107, 0, 0.12)',
                color: '#FF6B00',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {isEditMode ? 'Gebäude bearbeiten' : 'Protokoll-Import prüfen & speichern'}
                </h3>
                {form.pdf_filename && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: '#dcfce7',
                      color: '#15803d',
                      fontWeight: 600,
                    }}
                  >
                    PDF: {form.pdf_filename}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm"
            style={{ padding: 6 }}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Identifikation, Ausbau-Typ, Team & Termine */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label>Adress-ID</label>
              <input
                value={form.adress_id}
                onChange={(e) => updateField('adress_id', e.target.value)}
                placeholder="ABW007413530"
                style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', padding: '7px 10px' }}
              />
            </div>

            <div>
              <label>WE Nummer / Projekt-Nr. *</label>
              <input
                value={form.projektnummer}
                onChange={(e) => updateField('projektnummer', e.target.value)}
                placeholder="N4E241593436"
                style={{ fontFamily: 'monospace', fontWeight: 600, padding: '7px 10px' }}
              />
            </div>

            <div>
              <label>Ausbau-Typ *</label>
              <select
                value={form.ausbau_typ}
                onChange={(e) => updateField('ausbau_typ', e.target.value)}
                style={{ fontWeight: 600, padding: '7px 10px' }}
              >
                {AUSBAU_TYP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Ausbau Team (Projects & Objects)</label>
              <select
                value={form.team}
                onChange={(e) => updateField('team', e.target.value)}
                style={{ fontWeight: 600, padding: '7px 10px' }}
              >
                {teamChoices.map((tName) => (
                  <option key={tName} value={tName}>
                    {tName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Gebäude-Status</label>
              <select
                value={form.building_status}
                onChange={(e) => updateField('building_status', e.target.value)}
                style={{ fontWeight: 600, padding: '7px 10px' }}
              >
                {BUILDING_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Ausbau Datum (TT.MM.JJJJ)</label>
              <MinimalDatePicker
                value={form.ausbautermin}
                onChange={(val) => updateField('ausbautermin', val)}
              />
            </div>

            <div>
              <label>Abgeschlossen Datum</label>
              <MinimalDatePicker
                value={form.abgeschlossen_datum}
                onChange={(val) => updateField('abgeschlossen_datum', val)}
              />
            </div>

            <div>
              <label>Restarbeit Termin</label>
              <MinimalDatePicker
                value={form.restarbeit_termin}
                onChange={(val) => updateField('restarbeit_termin', val)}
              />
            </div>
          </div>

          {/* 2. Objekt-Adresse (mit automatischer Gemeinde-Normalisierung) */}
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: '90px 1fr 1.2fr 80px 75px',
              gap: 10,
              alignItems: 'end',
            }}
            className="protocol-form-grid-2"
          >
            <div>
              <label>PLZ *</label>
              <input
                value={form.plz}
                onChange={(e) => updateField('plz', e.target.value)}
                placeholder="73547"
                style={{ padding: '7px 10px' }}
              />
            </div>
            <div>
              <label>Gemeinde / Ort *</label>
              <input
                value={form.ort}
                onChange={(e) => updateField('ort', e.target.value)}
                onBlur={() => updateField('ort', normalizeGemeinde(form.ort, form.plz))}
                placeholder="Lorch"
                style={{ padding: '7px 10px', fontWeight: 600 }}
              />
            </div>
            <div>
              <label>Straße *</label>
              <input
                value={form.strasse}
                onChange={(e) => updateField('strasse', e.target.value)}
                placeholder="Zollgasse"
                style={{ padding: '7px 10px' }}
              />
            </div>
            <div>
              <label>Hausnr. *</label>
              <input
                value={form.hausnummer}
                onChange={(e) => updateField('hausnummer', e.target.value)}
                placeholder="2"
                style={{ padding: '7px 10px' }}
              />
            </div>
            <div>
              <label>WE *</label>
              <input
                type="number"
                min={1}
                value={form.total_we}
                onChange={(e) => updateField('total_we', Number(e.target.value))}
                style={{ padding: '7px 10px' }}
              />
            </div>
          </div>

          {/* 3. Gebäude-Checkliste (inkl. "Fotos Uploaded" - standardmäßig NICHT aktiviert) */}
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
              Gebäude-Checkliste (Gilt für das gesamte Gebäude)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
                gap: 8,
              }}
            >
              {BUILDING_CHECK_ITEMS.map((item) => {
                const checked = Boolean(form[item.key]);
                return (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '7px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: checked ? item.bg : '#ffffff',
                      border: checked ? `1.5px solid ${item.color}` : '1px solid #e2e8f0',
                      color: checked ? item.color : '#334155',
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => updateField(item.key, e.target.checked)}
                      style={{ width: 15, height: 15, cursor: 'pointer' }}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 4. Wohnungen im Gebäude — OHNE WE-Status, nur TA Installation / Reserve / Ohne */}
          {!isEditMode && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                  Wohnungen im Gebäude ({form.units.length} WE)
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={addUnitRow}
                  style={{ padding: '4px 10px', fontSize: 11.5 }}
                >
                  <Plus size={13} />
                  <span>Wohnung hinzufügen</span>
                </button>
              </div>

              <div
                style={{
                  maxHeight: 210,
                  overflowY: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                }}
              >
                <table className="no-min-width" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#334155', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '7px 10px' }}>Etage</th>
                      <th style={{ padding: '7px 10px' }}>Wohnung</th>
                      <th style={{ padding: '7px 10px', textAlign: 'center' }}>TA Installation</th>
                      <th style={{ padding: '7px 10px', textAlign: 'center' }}>Reserve</th>
                      <th style={{ padding: '7px 10px', textAlign: 'center' }}>Ohne</th>
                      <th style={{ padding: '7px 10px', width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.units.map((u, idx) => {
                      const art =
                        u.we_ausbau_art ||
                        (u.reserve ? 'Reserve' : u.ohne ? 'Ohne' : 'TA Installation');
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '5px 8px' }}>
                            <input
                              value={u.etage}
                              onChange={(e) => updateUnitRow(idx, 'etage', e.target.value)}
                              style={{ padding: '5px 8px', fontSize: 12 }}
                            />
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <input
                              value={u.unit_id}
                              onChange={(e) => updateUnitRow(idx, 'unit_id', e.target.value)}
                              style={{ padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}
                            />
                          </td>
                          {['TA Installation', 'Reserve', 'Ohne'].map((optionArt) => (
                            <td key={optionArt} style={{ padding: '5px 8px', textAlign: 'center' }}>
                              <input
                                type="radio"
                                name={`modal-we-art-${idx}`}
                                checked={art === optionArt}
                                onChange={() => updateUnitRow(idx, 'we_ausbau_art', optionArt)}
                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </td>
                          ))}
                          <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              onClick={() => removeUnitRow(idx)}
                              disabled={form.units.length <= 1}
                              style={{ color: '#dc2626', padding: 4 }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: 12.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
              {conflictDetected && (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => handleConfirmSave(true)}
                  disabled={saving}
                >
                  Bestehendes Gebäude aktualisieren
                </button>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
              paddingTop: 10,
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => handleConfirmSave(false)}
              disabled={saving}
              style={{ padding: '8px 16px', fontWeight: 600 }}
            >
              <CheckCircle2 size={15} />
              <span>{saving ? 'Speichert…' : 'Speichern & Synchronisieren'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   COMPONENT 3: COMPACT MINIMAL BUILDING DETAIL VIEW (Full-Width Comments at Bottom)
============================================================================= */
export const BuildingDetailView = ({
  building,
  fieldTeams = [],
  user,
  onBack,
  onPatchBuilding,
  onUnitChange,
  onAddUnit,
  onDeleteUnit,
  onAddComment,
  onDeleteComment,
  onUploadPdf,
  onEditModal,
  onDeleteBuilding,
  onExportSingleExcel,
}) => {
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [newUnit, setNewUnit] = useState({
    etage: `OG${building.units?.length || 1}`,
    unit_id: String((building.units?.length || 0) + 1).padStart(3, '0'),
    we_ausbau_art: 'TA Installation',
  });
  const pdfInputRef = useRef(null);

  const units = building.units || [];
  const comments = building.comments || [];
  const normOrt = normalizeGemeinde(building.ort, building.plz) || building.ort;
  const pdfViewUrl = `${API_URL}/api/v1/protocol/addresses/${building.id}/pdf?download=false`;
  const pdfDownloadUrl = `${API_URL}/api/v1/protocol/addresses/${building.id}/pdf?download=true`;

  const teamOptions = useMemo(() => {
    const set = new Set();
    fieldTeams.forEach((t) => {
      if (t?.name) set.add(t.name);
    });
    if (building.team) set.add(building.team);
    if (set.size === 0) set.add('Techno(Lorch)');
    return Array.from(set);
  }, [fieldTeams, building.team]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await onAddComment(building.id, commentText.trim(), user?.email || 'Brünel Team');
      setCommentText('');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* 1. Compact Light Mode Header Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '12px 16px',
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onBack}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            <ArrowLeft size={14} />
            <span>Zurück</span>
          </button>

          <button
            type="button"
            onClick={() => onPatchBuilding(building.id, { is_priority: !building.is_priority })}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              color: building.is_priority ? '#eab308' : '#cbd5e1',
            }}
            title="Priorität"
          >
            <Star size={18} fill={building.is_priority ? '#eab308' : 'none'} />
          </button>

          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
            }}
          >
            {building.adress_id || 'ABW—'}
          </span>

          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11.5,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              background: '#fff7ed',
              color: '#c2410c',
              border: '1px solid #fed7aa',
            }}
          >
            {building.projektnummer}
          </span>

          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
            {building.strasse} {building.hausnummer}, {building.plz} {normOrt}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 130 }}>
            <PercentLine addr={building} compact />
          </div>

          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={async (e) => {
              if (e.target.files?.[0]) {
                setUploadingPdf(true);
                try {
                  await onUploadPdf(building.id, e.target.files[0]);
                } finally {
                  setUploadingPdf(false);
                }
                e.target.value = '';
              }
            }}
          />

          {building.has_pdf ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowPdfPreview((p) => !p)}
                style={{ padding: '5px 10px', fontSize: 11.5 }}
              >
                <Eye size={13} />
                <span>{showPdfPreview ? 'PDF schließen' : 'PDF'}</span>
              </button>
              <a
                href={pdfDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary btn-sm"
                style={{ padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', color: '#15803d' }}
              >
                <Download size={13} />
                <span>PDF</span>
              </a>
            </>
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={uploadingPdf}
              onClick={() => pdfInputRef.current?.click()}
              style={{ padding: '5px 10px', fontSize: 11.5 }}
            >
              <Upload size={13} />
              <span>{uploadingPdf ? 'Lädt…' : 'PDF anhängen'}</span>
            </button>
          )}

          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onExportSingleExcel(building)}
            style={{ padding: '5px 10px', fontSize: 11.5, color: '#15803d', borderColor: '#86efac' }}
          >
            <FileSpreadsheet size={13} />
            <span>Excel</span>
          </button>

          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onEditModal(building)}
            style={{ padding: '5px 10px', fontSize: 11.5 }}
          >
            <Edit3 size={13} />
            <span>Bearbeiten</span>
          </button>

          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() => onDeleteBuilding(building)}
            style={{ padding: '5px 8px' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Inline PDF Viewer when toggled */}
      {showPdfPreview && building.has_pdf && (
        <div className="glass-panel" style={{ padding: 14, borderRadius: 12, background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Original-PDF: {building.pdf_filename || 'UGG_Protokoll.pdf'}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => pdfInputRef.current?.click()}
              >
                <Upload size={13} /> PDF ersetzen
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowPdfPreview(false)}>
                Schließen
              </button>
            </div>
          </div>
          <iframe
            src={pdfViewUrl}
            title="UGG Hausbegehungsprotokoll PDF"
            style={{ width: '100%', height: 480, border: '1px solid #e2e8f0', borderRadius: 8 }}
          />
        </div>
      )}

      {/* 2. Compact Building Parameters & Gebäude-Checkliste in One Minimal Card */}
      <div
        className="glass-panel"
        style={{
          padding: 14,
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ fontSize: 11 }}>Ausbau-Typ</label>
            <select
              value={building.ausbau_typ || 'Metalkanal'}
              onChange={(e) => onPatchBuilding(building.id, { ausbau_typ: e.target.value })}
              style={{ padding: '6px 10px', fontSize: 12.5, fontWeight: 600 }}
            >
              {AUSBAU_TYP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11 }}>Ausbau Team (Field Teams)</label>
            <select
              value={building.team || ''}
              onChange={(e) => onPatchBuilding(building.id, { team: e.target.value })}
              style={{ padding: '6px 10px', fontSize: 12.5, fontWeight: 600 }}
            >
              <option value="">— Team wählen —</option>
              {teamOptions.map((tName) => (
                <option key={tName} value={tName}>
                  {tName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11 }}>Status</label>
            <select
              value={building.building_status || 'Ausbau terminiert'}
              onChange={(e) => onPatchBuilding(building.id, { building_status: e.target.value })}
              style={{
                padding: '6px 10px',
                fontSize: 12.5,
                fontWeight: 700,
                ...(BUILDING_STATUS_PILL[building.building_status] || {}),
              }}
            >
              {BUILDING_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11 }}>Ausbau Datum</label>
            <MinimalDatePicker
              value={building.ausbautermin}
              onChange={(val) => onPatchBuilding(building.id, { ausbautermin: val })}
              compact
            />
          </div>

          <div>
            <label style={{ fontSize: 11 }}>Abgeschlossen Datum</label>
            <MinimalDatePicker
              value={building.abgeschlossen_datum}
              onChange={(val) => onPatchBuilding(building.id, { abgeschlossen_datum: val })}
              compact
            />
          </div>

          <div>
            <label style={{ fontSize: 11 }}>Restarbeit Termin</label>
            <MinimalDatePicker
              value={building.restarbeit_termin}
              onChange={(val) => onPatchBuilding(building.id, { restarbeit_termin: val })}
              compact
            />
          </div>
        </div>

        {/* Gebäude-Checkliste row */}
        <div style={{ paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
            Gebäude-Checkliste
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BUILDING_CHECK_ITEMS.map((item) => {
              const active = Boolean(building[item.key]);
              return (
                <label
                  key={item.key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 11px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: active ? item.bg : '#f8fafc',
                    border: active ? `1.5px solid ${item.color}` : '1px solid #e2e8f0',
                    color: active ? item.color : '#334155',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => onPatchBuilding(building.id, { [item.key]: e.target.checked })}
                    style={{ width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Compact Wohnungen im Gebäude (NO WE-Status!) */}
      <div
        className="glass-panel"
        style={{
          padding: 14,
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} style={{ color: '#FF6B00' }} />
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              Wohnungen im Gebäude ({units.length} WE)
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <input
              placeholder="Etage (z.B. OG1)"
              value={newUnit.etage}
              onChange={(e) => setNewUnit((p) => ({ ...p, etage: e.target.value }))}
              style={{ width: 95, padding: '5px 8px', fontSize: 12 }}
            />
            <input
              placeholder="WE (z.B. 005)"
              value={newUnit.unit_id}
              onChange={(e) => setNewUnit((p) => ({ ...p, unit_id: e.target.value }))}
              style={{ width: 95, padding: '5px 8px', fontSize: 12, fontFamily: 'monospace' }}
            />
            <select
              value={newUnit.we_ausbau_art}
              onChange={(e) => setNewUnit((p) => ({ ...p, we_ausbau_art: e.target.value }))}
              style={{ width: 135, padding: '5px 8px', fontSize: 12 }}
            >
              {WE_AUSBAU_ART_OPTIONS.map((art) => (
                <option key={art} value={art}>
                  {art}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary btn-sm"
              style={{ padding: '5px 10px', fontSize: 12 }}
              onClick={async () => {
                await onAddUnit(building.id, {
                  etage: newUnit.etage || 'EG',
                  unit_id: newUnit.unit_id || '001',
                  we_ausbau_art: newUnit.we_ausbau_art,
                  ta_installiert: newUnit.we_ausbau_art === 'TA Installation',
                  reserve: newUnit.we_ausbau_art === 'Reserve',
                  ohne: newUnit.we_ausbau_art === 'Ohne',
                  status: 'Offen',
                });
                setNewUnit({
                  etage: `OG${units.length + 1}`,
                  unit_id: String(units.length + 2).padStart(3, '0'),
                  we_ausbau_art: 'TA Installation',
                });
              }}
            >
              <Plus size={13} />
              <span>WE</span>
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
          <table className="no-min-width" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Etage</th>
                <th style={{ padding: '8px 12px' }}>Wohnung</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>TA Installation</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Reserve</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Ohne</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const currentArt =
                  u.we_ausbau_art ||
                  (u.reserve ? 'Reserve' : u.ohne ? 'Ohne' : 'TA Installation');
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>{u.etage}</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>
                      WE-{u.unit_id}
                    </td>
                    {['TA Installation', 'Reserve', 'Ohne'].map((optArt) => {
                      const active = currentArt === optArt;
                      const activeColor =
                        optArt === 'TA Installation'
                          ? '#dc2626'
                          : optArt === 'Reserve'
                          ? '#d97706'
                          : '#475569';
                      return (
                        <td key={optArt} style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() =>
                              onUnitChange(building.id, u.id, {
                                we_ausbau_art: optArt,
                                ta_installiert: optArt === 'TA Installation',
                                reserve: optArt === 'Reserve',
                                ohne: optArt === 'Ohne',
                              })
                            }
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: 11.5,
                              border: active ? `1.5px solid ${activeColor}` : '1px solid #e2e8f0',
                              background: active ? `${activeColor}14` : '#ffffff',
                              color: active ? activeColor : '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {active && <Check size={12} />}
                            <span>{optArt}</span>
                          </button>
                        </td>
                      );
                    })}
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => onDeleteUnit(building.id, u.id)}
                        style={{ color: '#dc2626', padding: 4 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. FULL-LENGTH COMMENT & UPDATES SECTION AT THE END OF THE PAGE */}
      <div
        className="glass-panel"
        style={{
          width: '100%',
          padding: 16,
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MessageSquare size={16} style={{ color: '#FF6B00' }} />
          <strong style={{ fontSize: 14, color: '#0f172a' }}>
            Kommentare & Bau-Updates ({comments.length})
          </strong>
        </div>

        <form onSubmit={handleSubmitComment} style={{ display: 'flex', gap: 8, marginBottom: 12, width: '100%' }}>
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Kommentar, Notiz oder Bau-Update für dieses Gebäude schreiben…"
            style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
          />
          <button
            type="submit"
            className="btn-primary btn-sm"
            disabled={submittingComment || !commentText.trim()}
            style={{ padding: '8px 16px' }}
          >
            <Send size={14} />
            <span>Senden</span>
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {comments.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b', padding: '4px 0' }}>
              Noch keine Kommentare für dieses Gebäude vorhanden.
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                    <strong style={{ color: '#0f172a' }}>{c.author || 'Brünel Team'}</strong> • {c.created_at}
                  </div>
                  <div style={{ fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{c.text}</div>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => onDeleteComment(building.id, c.id)}
                  style={{ color: '#dc2626', padding: 4 }}
                  title="Kommentar löschen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   MAIN MODULE CONTAINER: ProtocolExtractorModule (Light Mode, Full Width)
============================================================================= */
export function ProtocolExtractorModule({ user }) {
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [fieldTeams, setFieldTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [toast, setToast] = useState(null);

  // Modals
  const [verificationModal, setVerificationModal] = useState(null);
  const [quickCommentBuilding, setQuickCommentBuilding] = useState(null);
  const [quickCommentText, setQuickCommentText] = useState('');
  const [quickPdfBuilding, setQuickPdfBuilding] = useState(null);

  // Filters
  const [globalSearch, setGlobalSearch] = useState('');
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [ausbauTypFilter, setAusbauTypFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [ortFilter, setOrtFilter] = useState('ALL');
  const [buildingFlagFilter, setBuildingFlagFilter] = useState('ALL');

  // Column-specific inline filters
  const [colAdressId, setColAdressId] = useState('');
  const [colGemeinde, setColGemeinde] = useState('');
  const [colStrasse, setColStrasse] = useState('');
  const [colHausVon, setColHausVon] = useState('');
  const [colHausBis, setColHausBis] = useState('');
  const [colDateSearch, setColDateSearch] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAddressesAndTeams = useCallback(async () => {
    setLoading(true);
    try {
      const [addrData, teamsData, projTeamsData] = await Promise.all([
        fetchWithToken('/api/v1/protocol/addresses').catch(() => []),
        fetchWithToken('/api/v1/protocol/teams').catch(() => []),
        fetchWithToken('/api/v1/teams').catch(() => []),
      ]);
      setAddresses(Array.isArray(addrData) ? addrData : []);

      // Merge teams from /api/v1/teams and /api/v1/protocol/teams
      const mergedTeamsMap = new Map();
      [...(Array.isArray(projTeamsData) ? projTeamsData : []), ...(Array.isArray(teamsData) ? teamsData : [])].forEach(
        (t) => {
          if (t && t.name) {
            mergedTeamsMap.set(t.name.trim(), t);
          }
        }
      );
      setFieldTeams(Array.from(mergedTeamsMap.values()));
    } catch (err) {
      console.error('Failed to load protocol data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddressesAndTeams();
  }, [loadAddressesAndTeams]);

  const resetAllFilters = () => {
    setGlobalSearch('');
    setOnlyPriority(false);
    setMonthFilter('ALL');
    setAusbauTypFilter('ALL');
    setStatusFilter('ALL');
    setTeamFilter('ALL');
    setOrtFilter('ALL');
    setBuildingFlagFilter('ALL');
    setColAdressId('');
    setColGemeinde('');
    setColStrasse('');
    setColHausVon('');
    setColHausBis('');
    setColDateSearch('');
  };

  // Deduplicated options for Team, Normalized City (Gemeinde), and Month dropdowns
  const filterOptions = useMemo(() => {
    const teamsSet = new Set();
    const cityMap = new Map(); // lowercase -> canonical City Name
    const months = new Set();

    fieldTeams.forEach((t) => {
      if (t?.name) teamsSet.add(t.name.trim());
    });

    addresses.forEach((a) => {
      if (a.team) teamsSet.add(a.team.trim());
      const canonicalCity = normalizeGemeinde(a.ort, a.plz);
      if (canonicalCity) {
        const key = canonicalCity.toLowerCase();
        if (!cityMap.has(key)) {
          cityMap.set(key, canonicalCity);
        }
      }
      extractYearMonths(a).forEach((m) => months.add(m));
    });

    for (let m = 1; m <= 12; m += 1) {
      months.add(`2026-${String(m).padStart(2, '0')}`);
    }

    return {
      teams: Array.from(teamsSet).sort(),
      orte: Array.from(cityMap.values()).sort(),
      months: Array.from(months).sort(),
    };
  }, [addresses, fieldTeams]);

  // Filtered buildings
  const filteredAddresses = useMemo(() => {
    return addresses.filter((addr) => {
      const canonicalCity = normalizeGemeinde(addr.ort, addr.plz);

      if (onlyPriority && !addr.is_priority) return false;
      if (ausbauTypFilter !== 'ALL' && (addr.ausbau_typ || 'Metalkanal') !== ausbauTypFilter) {
        return false;
      }
      if (
        statusFilter !== 'ALL' &&
        (addr.building_status || 'Ausbau terminiert') !== statusFilter
      ) {
        return false;
      }
      if (teamFilter !== 'ALL' && (addr.team || '') !== teamFilter) return false;
      if (ortFilter !== 'ALL' && canonicalCity.toLowerCase() !== ortFilter.toLowerCase()) {
        return false;
      }

      if (monthFilter !== 'ALL') {
        const addrMonths = extractYearMonths(addr);
        if (!addrMonths.includes(monthFilter)) return false;
      }

      if (buildingFlagFilter !== 'ALL') {
        if (buildingFlagFilter === 'HAS_PDF' && !addr.has_pdf) return false;
        if (buildingFlagFilter === 'FLEXROHR_YES' && !addr.flexrohr) return false;
        if (buildingFlagFilter === 'FLEXROHR_NO' && addr.flexrohr) return false;
        if (buildingFlagFilter === 'HUEP_YES' && !addr.huep_installiert) return false;
        if (buildingFlagFilter === 'HUEP_NO' && addr.huep_installiert) return false;
        if (buildingFlagFilter === 'SPLEISSEN_YES' && !addr.spleissen_fertig) return false;
        if (buildingFlagFilter === 'SPLEISSEN_NO' && addr.spleissen_fertig) return false;
        if (buildingFlagFilter === 'UPLOAD_YES' && !addr.upload_done) return false;
        if (buildingFlagFilter === 'UPLOAD_NO' && addr.upload_done) return false;
        if (buildingFlagFilter === 'GENEHMIGT_YES' && !addr.genehmigt) return false;
        if (buildingFlagFilter === 'RECHNUNG_ERSTELLT_YES' && !addr.rechnung_erstellt) return false;
        if (buildingFlagFilter === 'RECHNUNG_BEZAHLT_YES' && !addr.rechnung_bezahlt) return false;
        if (buildingFlagFilter === 'RECHNUNG_OFFEN' && addr.rechnung_bezahlt) return false;
      }

      if (colAdressId.trim()) {
        const q = colAdressId.trim().toLowerCase();
        if (
          !(addr.adress_id || '').toLowerCase().includes(q) &&
          !(addr.projektnummer || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (colGemeinde.trim()) {
        const q = colGemeinde.trim().toLowerCase();
        if (
          !canonicalCity.toLowerCase().includes(q) &&
          !(addr.plz || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (colStrasse.trim()) {
        const q = colStrasse.trim().toLowerCase();
        if (!(addr.strasse || '').toLowerCase().includes(q)) return false;
      }
      if (colHausVon.trim() || colHausBis.trim()) {
        const num = parseInt(String(addr.hausnummer || '').replace(/\D/g, ''), 10);
        if (!Number.isNaN(num)) {
          if (colHausVon.trim() && num < parseInt(colHausVon.trim(), 10)) return false;
          if (colHausBis.trim() && num > parseInt(colHausBis.trim(), 10)) return false;
        }
      }
      if (colDateSearch.trim()) {
        const q = colDateSearch.trim().toLowerCase();
        const combinedDates = `${toDdMmYyyy(addr.ausbautermin)} ${toDdMmYyyy(
          addr.abgeschlossen_datum
        )} ${toDdMmYyyy(addr.restarbeit_termin)}`.toLowerCase();
        if (!combinedDates.includes(q)) return false;
      }

      if (globalSearch.trim()) {
        const q = globalSearch.trim().toLowerCase();
        const hay = [
          addr.adress_id,
          addr.projektnummer,
          addr.plz,
          canonicalCity,
          addr.strasse,
          addr.hausnummer,
          addr.team,
          addr.ausbau_typ,
          addr.building_status,
          toDdMmYyyy(addr.ausbautermin),
          toDdMmYyyy(addr.abgeschlossen_datum),
          toDdMmYyyy(addr.restarbeit_termin),
          ...(addr.comments || []).map((c) => c.text),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    addresses,
    onlyPriority,
    ausbauTypFilter,
    statusFilter,
    teamFilter,
    ortFilter,
    monthFilter,
    buildingFlagFilter,
    colAdressId,
    colGemeinde,
    colStrasse,
    colHausVon,
    colHausBis,
    colDateSearch,
    globalSearch,
  ]);

  const handleLoadSampleProtocol = async () => {
    setUploading(true);
    try {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const sampleProjekt =
        addresses.length === 0 ? 'N4E241593436' : `N4E24${randomSuffix}`;
      const sampleAdrId =
        addresses.length === 0 ? 'ABW007413530' : `ABW00${randomSuffix}`;
      const pdfRes = await fetch(
        `${API_URL}/api/v1/protocol/sample-pdf?projektnummer=${encodeURIComponent(
          sampleProjekt
        )}&adress_id=${encodeURIComponent(sampleAdrId)}`
      );
      const pdfBlob = await pdfRes.blob();
      const sampleFile = new File(
        [pdfBlob],
        `UGG_Hausbegehungsprotokoll_${sampleAdrId}.pdf`,
        { type: 'application/pdf' }
      );

      const formData = new FormData();
      formData.append('file', sampleFile);

      const extracted = await fetchWithToken('/api/v1/protocol/upload', {
        method: 'POST',
        body: formData,
      });

      setUploading(false);
      setVerificationModal({
        data: extracted,
        fileName: sampleFile.name,
        isEditMode: false,
      });
    } catch (err) {
      setUploading(false);
      showToast(err.message || 'Fehler beim Laden des Muster-Protokolls', 'error');
    }
  };

  const handlePatchBuilding = async (addressId, patch) => {
    setAddresses((prev) =>
      prev.map((a) => (a.id === addressId ? { ...a, ...patch } : a))
    );
    try {
      const updated = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
    } catch (err) {
      showToast(err.message || 'Gebäude-Update fehlgeschlagen', 'error');
      loadAddressesAndTeams();
    }
  };

  const handleUnitChange = async (addressId, unitId, patch) => {
    setAddresses((prev) =>
      prev.map((addr) => {
        if (addr.id !== addressId) return addr;
        return {
          ...addr,
          units: (addr.units || []).map((u) => (u.id === unitId ? { ...u, ...patch } : u)),
        };
      })
    );

    try {
      const updatedUnit = await fetchWithToken(`/api/v1/protocol/units/${unitId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setAddresses((prev) =>
        prev.map((addr) => {
          if (addr.id !== addressId) return addr;
          return {
            ...addr,
            units: (addr.units || []).map((u) => (u.id === unitId ? updatedUnit : u)),
          };
        })
      );
    } catch (err) {
      showToast(err.message || 'Wohnung-Update fehlgeschlagen', 'error');
      loadAddressesAndTeams();
    }
  };

  const handleAddUnit = async (addressId, unitPayload) => {
    try {
      const created = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}/units`, {
        method: 'POST',
        body: JSON.stringify(unitPayload),
      });
      setAddresses((prev) =>
        prev.map((addr) => {
          if (addr.id !== addressId) return addr;
          const nextUnits = [...(addr.units || []), created];
          return {
            ...addr,
            units: nextUnits,
            total_we: Math.max(addr.total_we || 1, nextUnits.length),
          };
        })
      );
      showToast(`Wohnung WE-${created.unit_id} hinzugefügt`);
    } catch (err) {
      showToast(err.message || 'Fehler beim Hinzufügen der Wohnung', 'error');
    }
  };

  const handleDeleteUnit = async (addressId, unitId) => {
    try {
      await fetchWithToken(`/api/v1/protocol/units/${unitId}`, { method: 'DELETE' });
      setAddresses((prev) =>
        prev.map((addr) => {
          if (addr.id !== addressId) return addr;
          return {
            ...addr,
            units: (addr.units || []).filter((u) => u.id !== unitId),
          };
        })
      );
      showToast('Wohnung gelöscht');
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

  const handleAddComment = async (addressId, text, author) => {
    try {
      const updated = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text, author }),
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      showToast('Kommentar gespeichert');
    } catch (err) {
      showToast(err.message || 'Kommentar konnte nicht gespeichert werden', 'error');
    }
  };

  const handleDeleteComment = async (addressId, commentId) => {
    try {
      const updated = await fetchWithToken(
        `/api/v1/protocol/addresses/${addressId}/comments/${commentId}`,
        { method: 'DELETE' }
      );
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      showToast('Kommentar gelöscht');
    } catch (err) {
      showToast(err.message || 'Kommentar konnte nicht gelöscht werden', 'error');
    }
  };

  const handleUploadBuildingPdf = async (addressId, file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}/pdf`, {
        method: 'POST',
        body: fd,
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      showToast(`PDF "${file.name}" am Gebäude gespeichert!`);
    } catch (err) {
      showToast(err.message || 'PDF-Upload fehlgeschlagen', 'error');
    }
  };

  const handleDeleteAddress = async (addr) => {
    if (
      !window.confirm(
        `Gebäude "${addr.adress_id || addr.projektnummer}" (${addr.strasse} ${addr.hausnummer}, ${addr.ort}) wirklich löschen?`
      )
    ) {
      return;
    }
    try {
      await fetchWithToken(`/api/v1/protocol/addresses/${addr.id}`, { method: 'DELETE' });
      setAddresses((prev) => prev.filter((a) => a.id !== addr.id));
      if (selectedBuildingId === addr.id) {
        setSelectedBuildingId(null);
      }
      showToast(`Gebäude ${addr.adress_id || addr.projektnummer} gelöscht`);
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

  const handleDownloadExcelWorkbook = async (singleAddress = null) => {
    setExportingExcel(true);
    try {
      const token = getToken();
      const query = singleAddress ? `?address_id=${encodeURIComponent(singleAddress.id)}` : '';
      const res = await fetch(`${API_URL}/api/v1/protocol/export/excel${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export fehlgeschlagen (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.download = singleAddress
        ? `UGG_Gebaeude_${singleAddress.adress_id || singleAddress.projektnummer}_${dateStamp}.xlsx`
        : `UGG_Ausbau_Tracking_${dateStamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Excel (.xlsx) heruntergeladen');
    } catch (err) {
      exportAddressesToCsv(
        singleAddress ? [singleAddress] : filteredAddresses,
        singleAddress
          ? `UGG_Gebaeude_${singleAddress.adress_id || singleAddress.projektnummer}.csv`
          : 'UGG_Ausbau_Tracking.csv'
      );
      showToast('CSV für Excel heruntergeladen');
    } finally {
      setExportingExcel(false);
    }
  };

  const selectedBuilding = useMemo(
    () => addresses.find((a) => a.id === selectedBuildingId) || null,
    [addresses, selectedBuildingId]
  );

  if (selectedBuilding) {
    return (
      <>
        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 120,
              padding: '10px 16px',
              borderRadius: 10,
              background: toast.type === 'error' ? '#dc2626' : '#0f172a',
              color: '#fff',
              borderLeft: '4px solid #FF6B00',
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={15} style={{ color: '#FF6B00' }} />
            <span>{toast.msg}</span>
          </div>
        )}

        <BuildingDetailView
          building={selectedBuilding}
          fieldTeams={fieldTeams}
          user={user}
          onBack={() => setSelectedBuildingId(null)}
          onPatchBuilding={handlePatchBuilding}
          onUnitChange={handleUnitChange}
          onAddUnit={handleAddUnit}
          onDeleteUnit={handleDeleteUnit}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onUploadPdf={handleUploadBuildingPdf}
          onEditModal={(b) =>
            setVerificationModal({
              data: b,
              fileName: b.pdf_filename || b.projektnummer,
              isEditMode: true,
              editAddressId: b.id,
            })
          }
          onDeleteBuilding={handleDeleteAddress}
          onExportSingleExcel={(b) => handleDownloadExcelWorkbook(b)}
        />

        {verificationModal && (
          <ProtocolVerificationModal
            initialData={verificationModal.data}
            sourceFileName={verificationModal.fileName}
            fieldTeams={fieldTeams}
            isEditMode={verificationModal.isEditMode}
            editAddressId={verificationModal.editAddressId}
            onClose={() => setVerificationModal(null)}
            onSaved={(savedAddr) => {
              setVerificationModal(null);
              setAddresses((prev) =>
                prev.map((a) => (a.id === savedAddr.id ? savedAddr : a))
              );
              showToast('Gebäudedaten aktualisiert & synchronisiert!');
            }}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 120,
            padding: '10px 16px',
            borderRadius: 10,
            background: toast.type === 'error' ? '#dc2626' : '#0f172a',
            color: '#fff',
            borderLeft: '4px solid #FF6B00',
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={15} style={{ color: '#FF6B00' }} />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Minimal Single-Row Header + Compact Inline AI PDF Import + Excel Button */}
      <div
        className="glass-panel protocol-header-bar"
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            UGG Protokoll & AI Ausbau-Manager
          </h3>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(255, 107, 0, 0.1)',
              color: '#FF6B00',
            }}
          >
            {filteredAddresses.length} / {addresses.length} Gebäude
          </span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => navigate('/projects/tasks')}
            style={{ fontSize: 11.5, padding: '4px 8px', color: '#475569' }}
            title="Synchronisiert mit Task Calendar & Field Teams"
          >
            <Calendar size={13} />
            <span>Task Calendar</span>
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => navigate('/projects/teams')}
            style={{ fontSize: 11.5, padding: '4px 8px', color: '#475569' }}
            title="Field Teams in Projects & Objects verwalten"
          >
            <Users size={13} />
            <span>Field Teams ({fieldTeams.length})</span>
          </button>
        </div>

        {/* Right: Minimal Inline PDF Import & Excel Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CompactProtocolUploadBar
            uploading={uploading}
            setUploading={setUploading}
            onLoadSample={handleLoadSampleProtocol}
            onExtracted={(extractedData, fileName) => {
              setVerificationModal({
                data: extractedData,
                fileName,
                isEditMode: false,
              });
            }}
          />

          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => handleDownloadExcelWorkbook(null)}
            disabled={exportingExcel || addresses.length === 0}
            style={{
              background: '#16a34a',
              borderColor: '#16a34a',
              padding: '6px 12px',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FileSpreadsheet size={14} />
            <span>{exportingExcel ? 'Export…' : 'Excel'}</span>
          </button>
        </div>
      </div>

      {/* LIGHT MODE FULL-WIDTH FILTER BAR & OVERVIEW LIST */}
      <div
        className="glass-panel"
        style={{
          padding: 0,
          borderRadius: 12,
          overflow: 'visible',
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
        }}
      >
        {/* Top Filter Toolbar (Light Mode) */}
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            background: '#f8fafc',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
          }}
        >
          <div
            className="protocol-filter-toolbar"
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}
          >
            {/* Global Search */}
            <div
              className="protocol-filter-search"
              style={{ position: 'relative', minWidth: 190, flex: '1 1 200px', maxWidth: 270 }}
            >
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                }}
              />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Suchen (Adress-ID, WE-Nr, Straße, Team)…"
                style={{
                  padding: '6px 10px 6px 28px',
                  fontSize: 12,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  borderRadius: 7,
                }}
              />
            </div>

            {/* ★ Priority Filter */}
            <button
              type="button"
              onClick={() => setOnlyPriority((p) => !p)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: onlyPriority ? '#fef9c3' : '#ffffff',
                border: onlyPriority ? '1px solid #eab308' : '1px solid #cbd5e1',
                color: onlyPriority ? '#a16207' : '#334155',
              }}
            >
              <Star size={13} fill={onlyPriority ? '#eab308' : 'none'} />
              <span>Priorität</span>
            </button>

            {/* Month Filter */}
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 130,
                padding: '6px 9px',
                fontSize: 12,
                background: monthFilter !== 'ALL' ? '#fff7ed' : '#ffffff',
                border: monthFilter !== 'ALL' ? '1px solid #FF6B00' : '1px solid #cbd5e1',
                color: '#0f172a',
                borderRadius: 7,
              }}
            >
              <option value="ALL">Monat: Alle</option>
              {filterOptions.months.map((m) => (
                <option key={m} value={m}>
                  Monat: {m}
                </option>
              ))}
            </select>

            {/* Normalized Single-City Gemeinde Filter */}
            <select
              value={ortFilter}
              onChange={(e) => setOrtFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 135,
                padding: '6px 9px',
                fontSize: 12,
                background: ortFilter !== 'ALL' ? '#fff7ed' : '#ffffff',
                border: ortFilter !== 'ALL' ? '1px solid #FF6B00' : '1px solid #cbd5e1',
                color: '#0f172a',
                borderRadius: 7,
              }}
            >
              <option value="ALL">Gemeinde: Alle</option>
              {filterOptions.orte.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            {/* Ausbau-Typ Filter */}
            <select
              value={ausbauTypFilter}
              onChange={(e) => setAusbauTypFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 135,
                padding: '6px 9px',
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                borderRadius: 7,
              }}
            >
              <option value="ALL">Ausbau-Typ: Alle</option>
              {AUSBAU_TYP_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 135,
                padding: '6px 9px',
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                borderRadius: 7,
              }}
            >
              <option value="ALL">Status: Alle</option>
              {BUILDING_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Teams Filter (from Projects & Objects) */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 135,
                padding: '6px 9px',
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                borderRadius: 7,
              }}
            >
              <option value="ALL">Team: Alle</option>
              {filterOptions.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Building Checklist Filter */}
            <select
              value={buildingFlagFilter}
              onChange={(e) => setBuildingFlagFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 150,
                padding: '6px 9px',
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                borderRadius: 7,
              }}
            >
              <option value="ALL">Checkliste: Alle</option>
              <option value="FLEXROHR_YES">Flexrohr: Ja</option>
              <option value="HUEP_YES">HÜP installiert: Ja</option>
              <option value="SPLEISSEN_YES">Spleißen fertig: Ja</option>
              <option value="UPLOAD_YES">Fotos Uploaded: Ja</option>
              <option value="UPLOAD_NO">Fotos Uploaded: Nein</option>
              <option value="GENEHMIGT_YES">Genehmigt: Ja</option>
              <option value="RECHNUNG_ERSTELLT_YES">Rechnung erstellt</option>
              <option value="RECHNUNG_BEZAHLT_YES">Rechnung bezahlt</option>
              <option value="RECHNUNG_OFFEN">Rechnung offen</option>
              <option value="HAS_PDF">Mit Protokoll-PDF</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={resetAllFilters}
              className="btn-secondary btn-sm"
              style={{ padding: '6px 10px', fontSize: 11.5 }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={loadAddressesAndTeams}
              className="btn-secondary btn-sm"
              style={{ padding: '6px 8px' }}
              title="Aktualisieren"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* DESKTOP OVERVIEW TABLE (Light Mode, No Email / No Eigentümer) */}
        <div className="protocol-desktop-table">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  textTransform: 'uppercase',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <th style={{ padding: '9px 8px', width: 32, textAlign: 'center' }}>★</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Adress-ID / WE-Nr</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Gemeinde</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Straße</th>
                <th style={{ padding: '9px 8px', textAlign: 'center' }}>Haus</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', minWidth: 125 }}>Fortschritt (%)</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Ausbau-Typ</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Team</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', minWidth: 135 }}>Ausbau Datum</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', minWidth: 135 }}>Abgeschlossen</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', minWidth: 135 }}>Restarbeit</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Gebäude-Checkliste</th>
                <th style={{ padding: '9px 12px', textAlign: 'right' }}>Aktionen</th>
              </tr>

              {/* Inline Column Filters Row (Light Mode) */}
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '5px 6px' }} />
                <th style={{ padding: '5px 8px' }}>
                  <input
                    value={colAdressId}
                    onChange={(e) => setColAdressId(e.target.value)}
                    placeholder="ABW / N4E…"
                    style={{ padding: '4px 7px', fontSize: 11, borderRadius: 5 }}
                  />
                </th>
                <th style={{ padding: '5px 8px' }}>
                  <input
                    value={colGemeinde}
                    onChange={(e) => setColGemeinde(e.target.value)}
                    placeholder="Ort / PLZ…"
                    style={{ padding: '4px 7px', fontSize: 11, borderRadius: 5 }}
                  />
                </th>
                <th style={{ padding: '5px 8px' }}>
                  <input
                    value={colStrasse}
                    onChange={(e) => setColStrasse(e.target.value)}
                    placeholder="Straße…"
                    style={{ padding: '4px 7px', fontSize: 11, borderRadius: 5 }}
                  />
                </th>
                <th style={{ padding: '5px 6px' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <input
                      value={colHausVon}
                      onChange={(e) => setColHausVon(e.target.value)}
                      placeholder="Von"
                      style={{ width: 42, padding: '4px 5px', fontSize: 11, borderRadius: 5 }}
                    />
                    <input
                      value={colHausBis}
                      onChange={(e) => setColHausBis(e.target.value)}
                      placeholder="Bis"
                      style={{ width: 42, padding: '4px 5px', fontSize: 11, borderRadius: 5 }}
                    />
                  </div>
                </th>
                <th style={{ padding: '5px 8px' }} />
                <th style={{ padding: '5px 8px' }} />
                <th style={{ padding: '5px 8px' }} />
                <th style={{ padding: '5px 8px' }} />
                <th colSpan={3} style={{ padding: '5px 8px' }}>
                  <input
                    value={colDateSearch}
                    onChange={(e) => setColDateSearch(e.target.value)}
                    placeholder="Datum filtern (TT.MM.JJJJ)…"
                    style={{ padding: '4px 7px', fontSize: 11, borderRadius: 5 }}
                  />
                </th>
                <th colSpan={2} style={{ padding: '5px 8px' }} />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                    Lade Gebäude-Übersicht…
                  </td>
                </tr>
              ) : filteredAddresses.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                    Keine Gebäude gefunden. Ziehen Sie oben ein PDF in den Import oder klicken Sie auf{' '}
                    <strong style={{ color: '#FF6B00' }}>„Muster“</strong>.
                  </td>
                </tr>
              ) : (
                filteredAddresses.map((addr) => {
                  const commentsCount = (addr.comments || []).length;
                  const bStatus = addr.building_status || 'Ausbau terminiert';
                  const canonicalCity = normalizeGemeinde(addr.ort, addr.plz) || addr.ort;
                  const pillStyle = BUILDING_STATUS_PILL[bStatus] || BUILDING_STATUS_PILL.Offen;

                  return (
                    <tr
                      key={addr.id}
                      onClick={() => setSelectedBuildingId(addr.id)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        transition: 'background 140ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* ★ Priority */}
                      <td
                        style={{ padding: '9px 8px', textAlign: 'center' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePatchBuilding(addr.id, { is_priority: !addr.is_priority });
                        }}
                      >
                        <Star
                          size={15}
                          style={{ color: addr.is_priority ? '#eab308' : '#cbd5e1' }}
                          fill={addr.is_priority ? '#eab308' : 'none'}
                        />
                      </td>

                      {/* Adress-ID & WE-Nr */}
                      <td style={{ padding: '9px 10px' }}>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#1d4ed8',
                            fontSize: 12,
                          }}
                        >
                          {addr.adress_id || 'ABW—'}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace' }}>
                          {addr.projektnummer}
                        </div>
                      </td>

                      {/* Normalized Single-City Gemeinde */}
                      <td style={{ padding: '9px 10px', fontWeight: 600, color: '#0f172a' }}>
                        <div>{canonicalCity}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 400 }}>{addr.plz}</div>
                      </td>

                      {/* Straße */}
                      <td style={{ padding: '9px 10px', color: '#0f172a', fontWeight: 500 }}>
                        {addr.strasse}
                      </td>

                      {/* Haus */}
                      <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                        {addr.hausnummer}
                      </td>

                      {/* Percent Line (Completion %) */}
                      <td style={{ padding: '9px 10px' }}>
                        <PercentLine addr={addr} compact />
                      </td>

                      {/* Ausbau-Typ */}
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={addr.ausbau_typ || 'Metalkanal'}
                          onChange={(e) =>
                            handlePatchBuilding(addr.id, { ausbau_typ: e.target.value })
                          }
                          style={{
                            padding: '4px 7px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: '#eff6ff',
                            color: '#1e40af',
                            border: '1px solid #bfdbfe',
                            width: 'auto',
                          }}
                        >
                          {AUSBAU_TYP_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Team (Selective from Projects & Objects Field Teams) */}
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={addr.team || ''}
                          onChange={(e) => handlePatchBuilding(addr.id, { team: e.target.value })}
                          style={{
                            padding: '4px 7px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: '#f8fafc',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            width: 'auto',
                            minWidth: 120,
                          }}
                        >
                          <option value="">— Team —</option>
                          {filterOptions.teams.map((tName) => (
                            <option key={tName} value={tName}>
                              {tName}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={bStatus}
                          onChange={(e) =>
                            handlePatchBuilding(addr.id, { building_status: e.target.value })
                          }
                          style={{
                            padding: '4px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            width: 'auto',
                            ...pillStyle,
                          }}
                        >
                          {BUILDING_STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Ausbau Datum (Modern Minimal Calendar DD.MM.YYYY) */}
                      <td style={{ padding: '9px 8px' }} onClick={(e) => e.stopPropagation()}>
                        <MinimalDatePicker
                          value={addr.ausbautermin}
                          onChange={(val) => handlePatchBuilding(addr.id, { ausbautermin: val })}
                          compact
                        />
                      </td>

                      {/* Abgeschlossen Datum (Modern Minimal Calendar DD.MM.YYYY) */}
                      <td style={{ padding: '9px 8px' }} onClick={(e) => e.stopPropagation()}>
                        <MinimalDatePicker
                          value={addr.abgeschlossen_datum}
                          onChange={(val) =>
                            handlePatchBuilding(addr.id, { abgeschlossen_datum: val })
                          }
                          compact
                        />
                      </td>

                      {/* Restarbeit Termin (Modern Minimal Calendar DD.MM.YYYY) */}
                      <td style={{ padding: '9px 8px' }} onClick={(e) => e.stopPropagation()}>
                        <MinimalDatePicker
                          value={addr.restarbeit_termin}
                          onChange={(val) =>
                            handlePatchBuilding(addr.id, { restarbeit_termin: val })
                          }
                          compact
                        />
                      </td>

                      {/* Whole-Building Checks Mini Badges ("Fotos" instead of "Upl") */}
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 215 }}>
                          {BUILDING_CHECK_ITEMS.map((b) => {
                            const on = Boolean(addr[b.key]);
                            return (
                              <button
                                key={b.key}
                                type="button"
                                onClick={() =>
                                  handlePatchBuilding(addr.id, { [b.key]: !on })
                                }
                                title={`${b.label}: ${on ? 'Ja' : 'Nein'}`}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  borderRadius: 5,
                                  cursor: 'pointer',
                                  border: on ? `1px solid ${b.color}` : '1px solid #cbd5e1',
                                  background: on ? b.bg : '#ffffff',
                                  color: on ? b.color : '#64748b',
                                }}
                              >
                                {b.short}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Aktionen */}
                      <td
                        style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedBuildingId(addr.id)}
                            title="Gebäude öffnen"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setQuickCommentBuilding(addr);
                              setQuickCommentText('');
                            }}
                            title="Kommentare & Updates"
                            style={{
                              position: 'relative',
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <MessageSquare size={13} />
                            {commentsCount > 0 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: -5,
                                  right: -5,
                                  minWidth: 15,
                                  height: 15,
                                  padding: '0 3px',
                                  borderRadius: 999,
                                  background: '#FF6B00',
                                  color: '#fff',
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                              >
                                {commentsCount}
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setQuickPdfBuilding(addr)}
                            title={
                              addr.has_pdf
                                ? `PDF ansehen / herunterladen (${addr.pdf_filename || 'PDF'})`
                                : 'PDF für dieses Gebäude hochladen'
                            }
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: addr.has_pdf ? '#dcfce7' : '#f8fafc',
                              border: addr.has_pdf ? '1px solid #86efac' : '1px solid #cbd5e1',
                              color: addr.has_pdf ? '#15803d' : '#64748b',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <FileText size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE RESPONSIVE BUILDING CARDS (Light Mode) */}
        <div className="protocol-mobile-cards">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
              Lade Gebäude-Übersicht…
            </div>
          ) : filteredAddresses.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
              Keine Gebäude für die aktuellen Filter gefunden.
            </div>
          ) : (
            filteredAddresses.map((addr) => {
              const commentsCount = (addr.comments || []).length;
              const bStatus = addr.building_status || 'Ausbau terminiert';
              const canonicalCity = normalizeGemeinde(addr.ort, addr.plz) || addr.ort;
              const pillStyle = BUILDING_STATUS_PILL[bStatus] || BUILDING_STATUS_PILL.Offen;

              return (
                <div
                  key={addr.id}
                  onClick={() => setSelectedBuildingId(addr.id)}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 12,
                          color: '#1d4ed8',
                          background: '#eff6ff',
                          padding: '2px 7px',
                          borderRadius: 5,
                        }}
                      >
                        {addr.adress_id || addr.projektnummer}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {addr.ausbau_typ || 'Metalkanal'}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 700,
                        ...pillStyle,
                      }}
                    >
                      {bStatus}
                    </span>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                    {addr.strasse} {addr.hausnummer}, {addr.plz} {canonicalCity}
                  </div>

                  <PercentLine addr={addr} compact />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 6,
                      fontSize: 11,
                      color: '#475569',
                      background: '#f8fafc',
                      padding: '6px 8px',
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Ausbau</div>
                      <strong>{toDdMmYyyy(addr.ausbautermin) || '—'}</strong>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Fertig</div>
                      <strong>{toDdMmYyyy(addr.abgeschlossen_datum) || '—'}</strong>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Restarbeit</div>
                      <strong>{toDdMmYyyy(addr.restarbeit_termin) || '—'}</strong>
                    </div>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>
                      Team: {addr.team || '—'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setQuickCommentBuilding(addr)}
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >
                        <MessageSquare size={12} /> ({commentsCount})
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => setSelectedBuildingId(addr.id)}
                        style={{ padding: '4px 10px', fontSize: 11 }}
                      >
                        Öffnen
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Quick Comments Modal */}
      {quickCommentBuilding && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onMouseDown={(e) => e.target === e.currentTarget && setQuickCommentBuilding(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: 'min(520px, 100%)',
              borderRadius: 14,
              padding: 18,
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>
                  Kommentare — {quickCommentBuilding.adress_id || quickCommentBuilding.projektnummer}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12 }}>
                  {quickCommentBuilding.strasse} {quickCommentBuilding.hausnummer},{' '}
                  {normalizeGemeinde(quickCommentBuilding.ort, quickCommentBuilding.plz)}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setQuickCommentBuilding(null)}>
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickCommentText.trim()) return;
                await handleAddComment(
                  quickCommentBuilding.id,
                  quickCommentText.trim(),
                  user?.email || 'Brünel Team'
                );
                setQuickCommentText('');
                const refreshed = await fetchWithToken(
                  `/api/v1/protocol/addresses/${quickCommentBuilding.id}`
                );
                setQuickCommentBuilding(refreshed);
              }}
              style={{ display: 'flex', gap: 8, marginBottom: 12 }}
            >
              <input
                autoFocus
                value={quickCommentText}
                onChange={(e) => setQuickCommentText(e.target.value)}
                placeholder="Neuen Kommentar oder Update eingeben…"
              />
              <button type="submit" className="btn-primary btn-sm">
                Speichern
              </button>
            </form>

            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(quickCommentBuilding.comments || []).length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>Noch keine Kommentare vorhanden.</div>
              ) : (
                (quickCommentBuilding.comments || []).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      <strong>{c.author}</strong> • {c.created_at}
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>{c.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick PDF Preview & Download Modal */}
      {quickPdfBuilding && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onMouseDown={(e) => e.target === e.currentTarget && setQuickPdfBuilding(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: 'min(820px, 100%)',
              borderRadius: 14,
              padding: 18,
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>
                  UGG Hausbegehungsprotokoll PDF — {quickPdfBuilding.adress_id || quickPdfBuilding.projektnummer}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12 }}>
                  {quickPdfBuilding.strasse} {quickPdfBuilding.hausnummer},{' '}
                  {normalizeGemeinde(quickPdfBuilding.ort, quickPdfBuilding.plz)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {quickPdfBuilding.has_pdf && (
                  <a
                    href={`${API_URL}/api/v1/protocol/addresses/${quickPdfBuilding.id}/pdf?download=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={14} />
                    <span>PDF Herunterladen</span>
                  </a>
                )}
                <button type="button" className="btn-secondary btn-sm" onClick={() => setQuickPdfBuilding(null)}>
                  <X size={15} />
                </button>
              </div>
            </div>

            {quickPdfBuilding.has_pdf ? (
              <iframe
                src={`${API_URL}/api/v1/protocol/addresses/${quickPdfBuilding.id}/pdf?download=false`}
                title="Stored Protocol PDF"
                style={{
                  width: '100%',
                  height: 500,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                }}
              />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', background: '#f8fafc', borderRadius: 10 }}>
                <p style={{ marginBottom: 12 }}>Für dieses Gebäude wurde noch keine PDF-Datei hinterlegt.</p>
                <label className="btn-primary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <Upload size={14} />
                  <span>PDF-Datei auswählen & speichern</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      if (e.target.files?.[0]) {
                        await handleUploadBuildingPdf(quickPdfBuilding.id, e.target.files[0]);
                        const refreshed = await fetchWithToken(
                          `/api/v1/protocol/addresses/${quickPdfBuilding.id}`
                        );
                        setQuickPdfBuilding(refreshed);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verification & Edit Modal */}
      {verificationModal && (
        <ProtocolVerificationModal
          initialData={verificationModal.data}
          sourceFileName={verificationModal.fileName}
          fieldTeams={fieldTeams}
          isEditMode={verificationModal.isEditMode}
          editAddressId={verificationModal.editAddressId}
          onClose={() => setVerificationModal(null)}
          onSaved={(savedAddr) => {
            setVerificationModal(null);
            setAddresses((prev) => {
              const exists = prev.some((a) => a.id === savedAddr.id);
              if (exists) {
                return prev.map((a) => (a.id === savedAddr.id ? savedAddr : a));
              }
              return [savedAddr, ...prev];
            });
            showToast(
              `Gebäude ${savedAddr.adress_id || savedAddr.projektnummer} gespeichert & mit Projects/Calendar synchronisiert!`
            );
          }}
        />
      )}
    </div>
  );
}

export default ProtocolExtractorModule;
