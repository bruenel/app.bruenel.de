import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  Plus,
  Trash2,
  GripVertical,
  LayoutGrid,
  Columns,
  Sparkles,
  Users,
  Search,
  Eye,
  X,
  FolderPlus,
  Wand2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Send,
  Edit3,
  ArrowUpRight,
  Clock,
  MapPin,
} from 'lucide-react';
import { fetchWithToken } from '../core/api';
import { TeamSplitModal } from './TeamSplitHelper';

/* =============================================================================
   CORE COMPLETION HELPER: TA, Flex, HÜP, Spleißen
============================================================================= */
export function getRemainingCoreWorks(addr, calcBuildingProgress) {
  const prog = calcBuildingProgress(addr);
  const taDone = prog.taCount > 0;
  const flexDone = Boolean(addr?.flexrohr);
  const huepDone = Boolean(addr?.huep_installiert);
  const spleissenDone = Boolean(addr?.spleissen_fertig);

  const remaining = [];
  if (!taDone) remaining.push('TA');
  if (!flexDone) remaining.push('Flex');
  if (!huepDone) remaining.push('HÜP');
  if (!spleissenDone) remaining.push('Spleißen');

  return {
    taDone,
    flexDone,
    huepDone,
    spleissenDone,
    remaining,
    remainingCount: remaining.length,
    isCompleted: remaining.length === 0,
    taCount: prog.taCount,
    totalWe: prog.totalWe,
    pct: prog.pct,
  };
}

export function isCoreArbeitCompleted(addr, calcBuildingProgress) {
  return getRemainingCoreWorks(addr, calcBuildingProgress).isCompleted;
}

/**
 * Classifies an address's Ausbau-Typ into Metalkanal vs Leerrohr/Kaminkanal (or other explicit types).
 */
export function classifyAusbauTyp(addr) {
  const raw = String(addr?.ausbau_typ || addr?.loesungsoption || 'Metalkanal').trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes('kamin') ||
    lower.includes('leerrohr') ||
    lower.includes('flex') ||
    (!lower.includes('metal') && Boolean(addr?.flexrohr) && !addr?.metalkanal_installiert)
  ) {
    return {
      key: 'kamin',
      label: 'Leerrohr / Kaminkanal',
      shortLabel: 'Leerrohr/Kamin',
      rawLabel: raw || 'Leerrohr-Kamin',
      bg: '#eff6ff',
      color: '#1d4ed8',
      border: '#93c5fd',
    };
  }

  if (lower.includes('fassade') || lower.includes('bestand')) {
    return {
      key: lower,
      label: raw,
      shortLabel: raw,
      rawLabel: raw,
      bg: '#f5f3ff',
      color: '#6d28d9',
      border: '#c4b5fd',
    };
  }

  return {
    key: 'metalkanal',
    label: 'Metalkanal',
    shortLabel: 'Metalkanal',
    rawLabel: raw || 'Metalkanal',
    bg: '#fff7ed',
    color: '#9a3412',
    border: '#fdba74',
  };
}

/**
 * Sums total units (WE) and installed TAs across a list of building addresses,
 * differentiated by Ausbau-Typ (Metalkanal vs Leerrohr/Kaminkanal & other types).
 */
export function sumUnitsForAddresses(list = [], calcBuildingProgress) {
  let totalWe = 0;
  let taCount = 0;
  const metalkanal = { key: 'metalkanal', label: 'Metalkanal', shortLabel: 'Metalkanal', count: 0, totalWe: 0, taCount: 0, bg: '#fff7ed', color: '#9a3412', border: '#fdba74' };
  const kamin = { key: 'kamin', label: 'Leerrohr / Kaminkanal', shortLabel: 'Leerrohr/Kamin', count: 0, totalWe: 0, taCount: 0, bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' };
  const otherMap = new Map();

  (list || []).forEach((addr) => {
    if (!addr) return;
    const prog = calcBuildingProgress(addr);
    const we = Number(prog?.totalWe || 0);
    const ta = Number(prog?.taCount || 0);
    totalWe += we;
    taCount += ta;

    const typ = classifyAusbauTyp(addr);
    if (typ.key === 'kamin') {
      kamin.count += 1;
      kamin.totalWe += we;
      kamin.taCount += ta;
    } else if (typ.key === 'metalkanal') {
      metalkanal.count += 1;
      metalkanal.totalWe += we;
      metalkanal.taCount += ta;
    } else {
      if (!otherMap.has(typ.key)) {
        otherMap.set(typ.key, { ...typ, count: 0, totalWe: 0, taCount: 0 });
      }
      const bucket = otherMap.get(typ.key);
      bucket.count += 1;
      bucket.totalWe += we;
      bucket.taCount += ta;
    }
  });

  const byType = [metalkanal, kamin, ...Array.from(otherMap.values())];

  return {
    count: (list || []).length,
    totalWe,
    taCount,
    metalkanal,
    kamin,
    byType,
  };
}

/**
 * Renders compact differentiated Ausbau-Typ unit sum badges (Metalkanal vs Leerrohr/Kaminkanal).
 */
export function AusbauTypSumBadges({ stats, compact = false, showZero = false }) {
  if (!stats) return null;
  const typesToShow = (stats.byType || []).filter((t) =>
    showZero ? t.key === 'metalkanal' || t.key === 'kamin' || t.count > 0 : t.count > 0
  );
  // If list is empty or no types have count > 0, show both 0 badges when showZero is true
  const finalTypes =
    typesToShow.length > 0
      ? typesToShow
      : [stats.metalkanal, stats.kamin].filter(Boolean);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {finalTypes.map((t) => (
        <span
          key={t.key}
          style={{
            fontSize: compact ? 9.5 : 10.5,
            fontWeight: 800,
            padding: compact ? '1px 6px' : '2px 7px',
            borderRadius: 999,
            background: t.bg,
            color: t.color,
            border: `1px solid ${t.border}`,
            whiteSpace: 'nowrap',
          }}
          title={`${t.label}: ${t.count} Objekte · Summe ${t.totalWe} WE · ${t.taCount} TA installiert`}
        >
          {compact ? t.shortLabel : t.label}: <strong>{t.totalWe} WE</strong> ({t.taCount} TA{!compact ? ` · ${t.count} Obj.` : ''})
        </span>
      ))}
    </div>
  );
}

/**
 * Classifies an object into its operational & billing stage:
 * - 'paid'               : Rechnung erhalten / bezahlt
 * - 'invoiced'           : Rechnung erstellt (abgerechnet, Zahlung ausstehend)
 * - 'completed_unbilled' : TA, Flex, HÜP & Spleißen komplett, noch nicht abgerechnet
 * - 'open'               : Offene Restarbeiten (TA / Flex / HÜP / Spleißen)
 */
export function getObjectBillingStage(addr, calcBuildingProgress) {
  if (addr?.rechnung_bezahlt) return 'paid';
  if (addr?.rechnung_erstellt) return 'invoiced';
  if (isCoreArbeitCompleted(addr, calcBuildingProgress)) return 'completed_unbilled';
  return 'open';
}

function formatDateDdMmYyyy(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '';
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function dateKeyYmd(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '';
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const GROUP_COLORS = [
  { id: 'orange', name: 'Orange', bg: '#fff7ed', border: '#fdba74', header: '#ffedd5', text: '#9a3412', accent: '#f97316' },
  { id: 'blue', name: 'Blau', bg: '#eff6ff', border: '#93c5fd', header: '#dbeafe', text: '#1e40af', accent: '#2563eb' },
  { id: 'emerald', name: 'Grün', bg: '#ecfdf5', border: '#6ee7b7', header: '#d1fae5', text: '#065f46', accent: '#10b981' },
  { id: 'purple', name: 'Violett', bg: '#f5f3ff', border: '#c4b5fd', header: '#ede9fe', text: '#5b21b6', accent: '#7c3aed' },
  { id: 'rose', name: 'Rot', bg: '#fff1f2', border: '#fda4af', header: '#ffe4e6', text: '#9f1239', accent: '#e11d48' },
  { id: 'slate', name: 'Grau', bg: '#f8fafc', border: '#cbd5e1', header: '#f1f5f9', text: '#334155', accent: '#475569' },
];

const getGroupColor = (colorId) => GROUP_COLORS.find((c) => c.id === colorId) || GROUP_COLORS[0];

const DE_MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const DE_WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* =============================================================================
   1. CALENDAR VIEW FOR OBJECTS & PROPERTIES
============================================================================= */
export function ObjectsCalendarView({
  addresses,
  fieldTeams,
  calcBuildingProgress,
  parseDdMmYyyyToDate,
  MinimalDatePicker,
  BUILDING_STATUS_OPTIONS,
  BUILDING_STATUS_PILL,
  onPatchBuilding,
  onUnitChange,
  onOpenDetail,
  showToast,
}) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [dateField, setDateField] = useState('ausbautermin'); // ausbautermin | restarbeit_termin | abgeschlossen_datum | all
  const [dragOverDay, setDragOverDay] = useState(null);
  const [quickEditId, setQuickEditId] = useState(null);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [unscheduledSearch, setUnscheduledSearch] = useState('');

  const quickEditAddr = useMemo(
    () => addresses.find((a) => a.id === quickEditId) || null,
    [addresses, quickEditId]
  );

  // Build calendar grid cells (Monday-first)
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Mon
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < startWeekday; i++) {
      const d = new Date(viewYear, viewMonth, 1 - (startWeekday - i));
      cells.push({ date: d, inMonth: false, key: dateKeyYmd(d) });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day);
      cells.push({ date: d, inMonth: true, key: dateKeyYmd(d) });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      cells.push({ date: next, inMonth: false, key: dateKeyYmd(next) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  // Map addresses onto calendar days
  const { eventsByDay, unscheduled } = useMemo(() => {
    const byDay = {};
    const noDate = [];

    addresses.forEach((addr) => {
      const entries = [];
      if (dateField === 'all') {
        if (addr.ausbautermin) entries.push({ field: 'ausbautermin', tag: 'Ausbau', val: addr.ausbautermin });
        if (addr.restarbeit_termin) entries.push({ field: 'restarbeit_termin', tag: 'Rest', val: addr.restarbeit_termin });
        if (addr.abgeschlossen_datum) entries.push({ field: 'abgeschlossen_datum', tag: 'Fertig', val: addr.abgeschlossen_datum });
      } else {
        if (addr[dateField]) {
          const tag = dateField === 'ausbautermin' ? 'Ausbau' : dateField === 'restarbeit_termin' ? 'Rest' : 'Fertig';
          entries.push({ field: dateField, tag, val: addr[dateField] });
        }
      }

      let placed = false;
      entries.forEach((en) => {
        const parsed = parseDdMmYyyyToDate(en.val);
        if (parsed) {
          const k = dateKeyYmd(parsed);
          if (!byDay[k]) byDay[k] = [];
          byDay[k].push({ addr, tag: en.tag, field: en.field });
          placed = true;
        }
      });

      if (!placed) {
        noDate.push(addr);
      }
    });

    return { eventsByDay: byDay, unscheduled: noDate };
  }, [addresses, dateField, parseDdMmYyyyToDate]);

  const filteredUnscheduled = useMemo(() => {
    const q = unscheduledSearch.trim().toLowerCase();
    if (!q) return unscheduled;
    return unscheduled.filter((a) =>
      `${a.strasse || ''} ${a.hausnummer || ''} ${a.ort || ''} ${a.plz || ''} ${a.team || ''} ${a.adress_id || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [unscheduled, unscheduledSearch]);

  const todayKey = dateKeyYmd(today);

  const handleDropOnDay = (e, dayDate) => {
    e.preventDefault();
    setDragOverDay(null);
    const addrId = e.dataTransfer.getData('text/plain');
    if (!addrId) return;
    const targetField = dateField === 'all' ? 'ausbautermin' : dateField;
    const formatted = formatDateDdMmYyyy(dayDate);
    onPatchBuilding(addrId, { [targetField]: formatted });
    const label = targetField === 'restarbeit_termin' ? 'Restarbeit Termin' : targetField === 'abgeschlossen_datum' ? 'Abgeschlossen Datum' : 'Ausbau Datum';
    showToast?.(`${label} auf ${formatted} geplant`);
  };

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
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Calendar Header Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn-secondary btn-sm" onClick={prevMonth} style={{ padding: '5px 8px' }}>
            <ChevronLeft size={15} />
          </button>
          <strong style={{ fontSize: 15, color: '#0f172a', minWidth: 155, textAlign: 'center' }}>
            {DE_MONTHS[viewMonth]} {viewYear}
          </strong>
          <button type="button" className="btn-secondary btn-sm" onClick={nextMonth} style={{ padding: '5px 8px' }}>
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setViewYear(today.getFullYear());
              setViewMonth(today.getMonth());
            }}
          >
            Heute
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Termine anzeigen:</span>
          {[
            { id: 'ausbautermin', label: 'Ausbau Datum' },
            { id: 'restarbeit_termin', label: 'Restarbeit Termin' },
            { id: 'abgeschlossen_datum', label: 'Abgeschlossen' },
            { id: 'all', label: 'Alle Termine' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDateField(opt.id)}
              style={{
                padding: '5px 10px',
                borderRadius: 7,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: dateField === opt.id ? '1px solid #FF6B00' : '1px solid #cbd5e1',
                background: dateField === opt.id ? '#fff7ed' : '#fff',
                color: dateField === opt.id ? '#c2410c' : '#334155',
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setShowUnscheduled((v) => !v)}
            style={{
              background: showUnscheduled ? '#f1f5f9' : '#fff',
              fontWeight: 700,
            }}
          >
            Ohne Termin ({unscheduled.length})
          </button>
        </div>
      </div>

      {/* Main Calendar + Unscheduled Sidebar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {showUnscheduled && (
          <div
            style={{
              width: 260,
              flexShrink: 0,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 10,
              maxHeight: 680,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Ohne Termin ({filteredUnscheduled.length})</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Auf Tag ziehen →</span>
            </div>
            <input
              placeholder="Suchen…"
              value={unscheduledSearch}
              onChange={(e) => setUnscheduledSearch(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 11.5, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
            />
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {filteredUnscheduled.length === 0 ? (
                <div style={{ fontSize: 11.5, color: '#64748b', padding: 10, textAlign: 'center' }}>
                  Alle Objekte sind terminiert.
                </div>
              ) : (() => {
                const openUnsch = filteredUnscheduled.filter((a) => !isCoreArbeitCompleted(a, calcBuildingProgress));
                const doneUnsch = filteredUnscheduled.filter((a) => isCoreArbeitCompleted(a, calcBuildingProgress));
                const renderUnschItem = (addr) => {
                  const core = getRemainingCoreWorks(addr, calcBuildingProgress);
                  return (
                    <div
                      key={addr.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', addr.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => setQuickEditId(addr.id)}
                      style={{
                        padding: '7px 9px',
                        borderRadius: 7,
                        background: core.isCompleted ? '#f0fdf4' : '#fff',
                        border: `1px solid ${core.isCompleted ? '#86efac' : '#e2e8f0'}`,
                        cursor: 'grab',
                        fontSize: 11.5,
                      }}
                      title="Auf einen Kalendertag ziehen zum Planen, oder klicken zum Bearbeiten"
                    >
                      <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {addr.strasse} {addr.hausnummer}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                        <span>{addr.ort || '—'}</span>
                        <span>{addr.team || 'Kein Team'}</span>
                      </div>
                      {core.remaining.length > 0 ? (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                          {core.remaining.map((r) => (
                            <span key={r} style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                            ✓ TA·Flex·HÜP·Spl komplett
                          </span>
                        </div>
                      )}
                    </div>
                  );
                };
                return (
                  <>
                    {openUnsch.map(renderUnschItem)}
                    {doneUnsch.length > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #86efac', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#15803d', padding: '0 2px' }}>
                          ✓ Abgeschlossen ({doneUnsch.length})
                        </div>
                        {doneUnsch.map(renderUnschItem)}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* 7-Column Calendar Grid */}
        <div style={{ flex: 1, minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
            {DE_WEEKDAYS.map((wd) => (
              <div key={wd} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#475569', textAlign: 'center', textTransform: 'uppercase' }}>
                {wd}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {calendarDays.map((cell) => {
              const items = eventsByDay[cell.key] || [];
              const isToday = cell.key === todayKey;
              const isDragTarget = dragOverDay === cell.key;
              return (
                <div
                  key={cell.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverDay !== cell.key) setDragOverDay(cell.key);
                  }}
                  onDragLeave={() => {
                    if (dragOverDay === cell.key) setDragOverDay(null);
                  }}
                  onDrop={(e) => handleDropOnDay(e, cell.date)}
                  style={{
                    minHeight: 112,
                    padding: '6px 6px',
                    borderRight: '1px solid #f1f5f9',
                    borderBottom: '1px solid #f1f5f9',
                    background: isDragTarget ? '#fff7ed' : cell.inMonth ? '#ffffff' : '#f8fafc',
                    outline: isDragTarget ? '2px dashed #FF6B00' : 'none',
                    outlineOffset: -2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: isToday ? 800 : 600,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        display: 'grid',
                        placeItems: 'center',
                        background: isToday ? '#FF6B00' : 'transparent',
                        color: isToday ? '#fff' : cell.inMonth ? '#0f172a' : '#94a3b8',
                      }}
                    >
                      {cell.date.getDate()}
                    </span>
                    {items.length > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                        {items.length}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 140, overflowY: 'auto' }}>
                    {items.map(({ addr, tag }, idx) => {
                      const core = getRemainingCoreWorks(addr, calcBuildingProgress);
                      const pill = BUILDING_STATUS_PILL?.[addr.building_status] || { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
                      return (
                        <div
                          key={`${addr.id}-${tag}-${idx}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', addr.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => setQuickEditId(addr.id)}
                          style={{
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: core.isCompleted ? '#ecfdf5' : '#fff',
                            border: `1px solid ${core.isCompleted ? '#86efac' : pill.border || '#cbd5e1'}`,
                            borderLeft: `3px solid ${core.isCompleted ? '#16a34a' : '#FF6B00'}`,
                            cursor: 'pointer',
                            fontSize: 10.5,
                          }}
                          title={`${addr.strasse} ${addr.hausnummer}, ${addr.ort} — Klicken zum Bearbeiten oder auf anderen Tag ziehen`}
                        >
                          <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {addr.strasse} {addr.hausnummer}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, fontSize: 9.5, color: '#64748b' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr.team || addr.ort || '—'}</span>
                            <span style={{ fontWeight: 700, color: core.isCompleted ? '#15803d' : '#dc2626', flexShrink: 0 }}>
                              {core.isCompleted ? '✓ Fertig' : `${core.remaining.length} offen`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Inline Quick-Edit Modal when clicking an object on the calendar */}
      {quickEditAddr && (
        <ObjectQuickEditModal
          addr={quickEditAddr}
          fieldTeams={fieldTeams}
          calcBuildingProgress={calcBuildingProgress}
          MinimalDatePicker={MinimalDatePicker}
          BUILDING_STATUS_OPTIONS={BUILDING_STATUS_OPTIONS}
          onPatchBuilding={onPatchBuilding}
          onUnitChange={onUnitChange}
          onOpenDetail={() => {
            const id = quickEditAddr.id;
            setQuickEditId(null);
            onOpenDetail(id);
          }}
          onClose={() => setQuickEditId(null)}
        />
      )}
    </div>
  );
}

/* =============================================================================
   2. KANBAN STATUS BOARD & COMPACT CARDS VIEW
============================================================================= */
export function ObjectsKanbanAndCardsView({
  addresses,
  fieldTeams,
  calcBuildingProgress,
  MinimalDatePicker,
  BUILDING_STATUS_OPTIONS,
  BUILDING_STATUS_PILL,
  onPatchBuilding,
  onUnitChange,
  onOpenDetail,
  showToast,
}) {
  const [subView, setSubView] = useState('kanban'); // kanban | grid
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [splitModalAddr, setSplitModalAddr] = useState(null);

  const handleDropOnStatus = (e, targetStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    const addrId = e.dataTransfer.getData('text/plain');
    if (!addrId) return;
    onPatchBuilding(addrId, { building_status: targetStatus });
    showToast?.(`Status geändert auf „${targetStatus}“`);
  };

  const renderCard = (addr) => {
    const core = getRemainingCoreWorks(addr, calcBuildingProgress);
    const pill = BUILDING_STATUS_PILL?.[addr.building_status || 'Ausbau terminiert'] || { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };

    return (
      <div
        key={addr.id}
        draggable={subView === 'kanban'}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', addr.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        style={{
          background: '#fff',
          border: `1px solid ${core.isCompleted ? '#86efac' : '#e2e8f0'}`,
          borderRadius: 10,
          padding: '10px 11px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          cursor: subView === 'kanban' ? 'grab' : 'default',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {addr.strasse} {addr.hausnummer}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {addr.plz} {addr.ort} · {addr.project_name || 'UGG'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenDetail(addr.id)}
            style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: '#475569' }}
            title="Vollständige Objekt-Details öffnen"
          >
            <ArrowUpRight size={13} />
          </button>
        </div>

        {/* 4 Core Completion Chips (Clickable In-Place) */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 5,
              background: core.taDone ? '#dcfce7' : '#fef2f2',
              color: core.taDone ? '#15803d' : '#dc2626',
              border: `1px solid ${core.taDone ? '#86efac' : '#fecaca'}`,
            }}
          >
            TA {core.taCount}/{core.totalWe}
          </span>
          {[
            { key: 'flexrohr', label: 'Flex', done: core.flexDone },
            { key: 'huep_installiert', label: 'HÜP', done: core.huepDone },
            { key: 'spleissen_fertig', label: 'Spleißen', done: core.spleissenDone },
          ].map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onPatchBuilding(addr.id, { [c.key]: !c.done })}
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 5,
                cursor: 'pointer',
                background: c.done ? '#dcfce7' : '#fef2f2',
                color: c.done ? '#15803d' : '#dc2626',
                border: `1px solid ${c.done ? '#86efac' : '#fecaca'}`,
              }}
            >
              {c.done ? '✓ ' : ''}{c.label}
            </button>
          ))}
        </div>

        {/* Billing Status Chips: Rechnung erstellt & Rechnung erhalten (Clickable In-Place) */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() =>
              onPatchBuilding(addr.id, {
                rechnung_erstellt: !addr.rechnung_erstellt,
                ...(addr.rechnung_erstellt ? { rechnung_bezahlt: false } : {}),
              })
            }
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 5,
              cursor: 'pointer',
              background: addr.rechnung_erstellt ? '#dbeafe' : '#f8fafc',
              color: addr.rechnung_erstellt ? '#1d4ed8' : '#64748b',
              border: `1px solid ${addr.rechnung_erstellt ? '#93c5fd' : '#cbd5e1'}`,
            }}
            title="Rechnung erstellt (abgerechnet) umschalten"
          >
            {addr.rechnung_erstellt ? '✓ ' : ''}RE erstellt
          </button>
          <button
            type="button"
            onClick={() =>
              onPatchBuilding(addr.id, {
                rechnung_bezahlt: !addr.rechnung_bezahlt,
                ...(!addr.rechnung_bezahlt ? { rechnung_erstellt: true } : {}),
              })
            }
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 5,
              cursor: 'pointer',
              background: addr.rechnung_bezahlt ? '#d1fae5' : '#f8fafc',
              color: addr.rechnung_bezahlt ? '#047857' : '#64748b',
              border: `1px solid ${addr.rechnung_bezahlt ? '#6ee7b7' : '#cbd5e1'}`,
            }}
            title="Rechnung erhalten / bezahlt umschalten"
          >
            {addr.rechnung_bezahlt ? '✓ ' : ''}RE erhalten
          </button>
        </div>

        {/* Quick Team + Split + Ausbau Datum */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 5, alignItems: 'center' }}>
          <select
            value={addr.team || ''}
            onChange={(e) => onPatchBuilding(addr.id, { team: e.target.value, team_allocations: {} })}
            style={{ padding: '4px 6px', fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', minWidth: 0 }}
          >
            <option value="">Kein Team</option>
            {addr.team && !fieldTeams.some((t) => t.name === addr.team) && (
              <option value={addr.team}>{addr.team}</option>
            )}
            {fieldTeams.map((t) => (
              <option key={t.name} value={t.name}>{t.name}{t.cost_center ? ` (${t.cost_center})` : ''}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSplitModalAddr(addr)}
            style={{
              padding: '4px 6px',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 6,
              cursor: 'pointer',
              border: addr.team_allocations?.mode ? '1px solid #FF6B00' : '1px solid #cbd5e1',
              background: addr.team_allocations?.mode ? '#fff7ed' : '#f8fafc',
              color: addr.team_allocations?.mode ? '#c2410c' : '#475569',
            }}
            title="Auf 2+ Teams aufteilen (% oder nach Arbeitsschritt)"
          >
            %
          </button>
          <MinimalDatePicker
            value={addr.ausbautermin || ''}
            onChange={(val) => onPatchBuilding(addr.id, { ausbautermin: val })}
            placeholder="Ausbau Datum"
            compact
          />
        </div>

        {subView === 'grid' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: pill.bg, color: pill.color, border: `1px solid ${pill.border || '#cbd5e1'}` }}>
              {addr.building_status || 'Ausbau terminiert'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{core.pct}%</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setSubView('kanban')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: subView === 'kanban' ? '1px solid #FF6B00' : '1px solid #cbd5e1',
              background: subView === 'kanban' ? '#fff7ed' : '#fff',
              color: subView === 'kanban' ? '#c2410c' : '#334155',
            }}
          >
            <Columns size={14} /> Status-Board (Drag & Drop)
          </button>
          <button
            type="button"
            onClick={() => setSubView('grid')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: subView === 'grid' ? '1px solid #FF6B00' : '1px solid #cbd5e1',
              background: subView === 'grid' ? '#fff7ed' : '#fff',
              color: subView === 'grid' ? '#c2410c' : '#334155',
            }}
          >
            <LayoutGrid size={14} /> Karten-Raster
          </button>
        </div>
        {(() => {
          const allStats = sumUnitsForAddresses(addresses, calcBuildingProgress);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700 }}>
                Gesamt: {allStats.count} Obj. · <strong>{allStats.totalWe} WE</strong> ({allStats.taCount} TA)
              </span>
              <AusbauTypSumBadges stats={allStats} showZero />
            </div>
          );
        })()}
      </div>

      {subView === 'kanban' ? (() => {
        const openBoardAddrs = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'open');
        const completedUnbilledAddrs = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'completed_unbilled');
        const invoicedAddrs = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'invoiced');
        const paidAddrs = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'paid');

        const readyStats = sumUnitsForAddresses(completedUnbilledAddrs, calcBuildingProgress);
        const invoicedStats = sumUnitsForAddresses(invoicedAddrs, calcBuildingProgress);
        const paidStats = sumUnitsForAddresses(paidAddrs, calcBuildingProgress);

        const handleDropBillingColumn = (e, stageKey) => {
          e.preventDefault();
          setDragOverStatus(null);
          const addrId = e.dataTransfer.getData('text/plain');
          if (!addrId) return;
          if (stageKey === '__INVOICED__') {
            onPatchBuilding(addrId, { rechnung_erstellt: true, rechnung_bezahlt: false });
            showToast?.('Als „Rechnung erstellt (Offen)“ markiert');
          } else if (stageKey === '__PAID__') {
            onPatchBuilding(addrId, { rechnung_erstellt: true, rechnung_bezahlt: true });
            showToast?.('Als „Rechnung erhalten / bezahlt“ markiert');
          }
        };

        return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BUILDING_STATUS_OPTIONS.length + 3}, minmax(245px, 1fr))`, gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {BUILDING_STATUS_OPTIONS.map((st) => {
            const colItems = openBoardAddrs.filter((a) => (a.building_status || 'Ausbau terminiert') === st);
            const colStats = sumUnitsForAddresses(colItems, calcBuildingProgress);
            const isOver = dragOverStatus === st;
            return (
              <div
                key={st}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStatus !== st) setDragOverStatus(st);
                }}
                onDragLeave={() => {
                  if (dragOverStatus === st) setDragOverStatus(null);
                }}
                onDrop={(e) => handleDropOnStatus(e, st)}
                style={{
                  background: isOver ? '#fff7ed' : '#f8fafc',
                  border: isOver ? '2px dashed #FF6B00' : '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 8,
                  minHeight: 420,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12, color: '#0f172a' }}>{st}</strong>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#e2e8f0', color: '#334155' }}>
                      {colItems.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#475569' }}>
                    Summe WE: <strong>{colStats.totalWe} WE</strong> ({colStats.taCount} TA)
                  </div>
                  {colItems.length > 0 && <AusbauTypSumBadges stats={colStats} compact />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 620, overflowY: 'auto' }}>
                  {colItems.map(renderCard)}
                </div>
              </div>
            );
          })}

          {/* Separated Column 1: Abgeschlossen — Bereit zur Abrechnung */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1.5px solid #86efac',
              borderRadius: 10,
              padding: 8,
              minHeight: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px', borderBottom: '1px solid #86efac' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 12, color: '#14532d' }}>✓ Fertig (Bereit f. RE)</strong>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                  {completedUnbilledAddrs.length}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d' }}>
                Summe WE: <strong>{readyStats.totalWe} WE</strong> ({readyStats.taCount} TA)
              </div>
              {completedUnbilledAddrs.length > 0 && <AusbauTypSumBadges stats={readyStats} compact />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 620, overflowY: 'auto' }}>
              {completedUnbilledAddrs.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: '#15803d', opacity: 0.75 }}>
                  Keine unberechneten fertigen Objekte.
                </div>
              ) : (
                completedUnbilledAddrs.map(renderCard)
              )}
            </div>
          </div>

          {/* Separated Column 2: Rechnung erstellt (Abgerechnet — Zahlung ausstehend) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverStatus !== '__INVOICED__') setDragOverStatus('__INVOICED__');
            }}
            onDragLeave={() => {
              if (dragOverStatus === '__INVOICED__') setDragOverStatus(null);
            }}
            onDrop={(e) => handleDropBillingColumn(e, '__INVOICED__')}
            style={{
              background: dragOverStatus === '__INVOICED__' ? '#dbeafe' : '#eff6ff',
              border: dragOverStatus === '__INVOICED__' ? '2px dashed #2563eb' : '1.5px solid #93c5fd',
              borderRadius: 10,
              padding: 8,
              minHeight: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px', borderBottom: '1px solid #93c5fd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 12, color: '#1e3a8a' }}>📄 Rechnung erstellt</strong>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                  {invoicedAddrs.length}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1d4ed8' }}>
                Summe WE: <strong>{invoicedStats.totalWe} WE</strong> ({invoicedStats.taCount} TA)
              </div>
              {invoicedAddrs.length > 0 && <AusbauTypSumBadges stats={invoicedStats} compact />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 620, overflowY: 'auto' }}>
              {invoicedAddrs.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: '#1d4ed8', opacity: 0.75 }}>
                  Hierher ziehen, um als „Rechnung erstellt“ zu markieren.
                </div>
              ) : (
                invoicedAddrs.map(renderCard)
              )}
            </div>
          </div>

          {/* Separated Column 3: Rechnung erhalten / bezahlt */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverStatus !== '__PAID__') setDragOverStatus('__PAID__');
            }}
            onDragLeave={() => {
              if (dragOverStatus === '__PAID__') setDragOverStatus(null);
            }}
            onDrop={(e) => handleDropBillingColumn(e, '__PAID__')}
            style={{
              background: dragOverStatus === '__PAID__' ? '#a7f3d0' : '#ecfdf5',
              border: dragOverStatus === '__PAID__' ? '2px dashed #059669' : '1.5px solid #6ee7b7',
              borderRadius: 10,
              padding: 8,
              minHeight: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px', borderBottom: '1px solid #6ee7b7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 12, color: '#065f46' }}>💰 Rechnung erhalten</strong>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#d1fae5', color: '#047857', border: '1px solid #6ee7b7' }}>
                  {paidAddrs.length}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#047857' }}>
                Summe WE: <strong>{paidStats.totalWe} WE</strong> ({paidStats.taCount} TA)
              </div>
              {paidAddrs.length > 0 && <AusbauTypSumBadges stats={paidStats} compact />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 620, overflowY: 'auto' }}>
              {paidAddrs.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: '#047857', opacity: 0.75 }}>
                  Hierher ziehen, um als „Rechnung erhalten / bezahlt“ zu markieren.
                </div>
              ) : (
                paidAddrs.map(renderCard)
              )}
            </div>
          </div>
        </div>
        );
      })() : (() => {
        const openGridAddrs = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'open');
        const completedUnbilledGrid = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'completed_unbilled');
        const invoicedGrid = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'invoiced');
        const paidGrid = addresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'paid');

        const openStats = sumUnitsForAddresses(openGridAddrs, calcBuildingProgress);
        const readyStats = sumUnitsForAddresses(completedUnbilledGrid, calcBuildingProgress);
        const invoicedStats = sumUnitsForAddresses(invoicedGrid, calcBuildingProgress);
        const paidStats = sumUnitsForAddresses(paidGrid, calcBuildingProgress);
        return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Offene Objekte — Restarbeiten ({openGridAddrs.length} Objekte)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1' }}>
                  Summe WE: {openStats.totalWe} WE ({openStats.taCount} TA)
                </span>
                <AusbauTypSumBadges stats={openStats} />
              </div>
            </div>
            {openGridAddrs.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', fontSize: 12, color: '#15803d', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: 8 }}>
                Alle gefilterten Objekte sind abgeschlossen oder bereits abgerechnet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {openGridAddrs.map(renderCard)}
              </div>
            )}
          </div>

          {completedUnbilledGrid.length > 0 && (
            <div style={{ padding: 12, borderRadius: 12, background: '#f0fdf4', border: '1.5px solid #86efac' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={15} style={{ color: '#15803d' }} />
                  <strong style={{ fontSize: 12.5, color: '#14532d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Abgeschlossen — Bereit zur Abrechnung ({completedUnbilledGrid.length} Objekte)
                  </strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                    Summe WE: {readyStats.totalWe} WE ({readyStats.taCount} TA)
                  </span>
                  <AusbauTypSumBadges stats={readyStats} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {completedUnbilledGrid.map(renderCard)}
              </div>
            </div>
          )}

          {invoicedGrid.length > 0 && (
            <div style={{ padding: 12, borderRadius: 12, background: '#eff6ff', border: '1.5px solid #93c5fd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <strong style={{ fontSize: 12.5, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📄 Rechnung erstellt — Zahlung ausstehend ({invoicedGrid.length} Objekte)
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                    Summe WE: {invoicedStats.totalWe} WE ({invoicedStats.taCount} TA)
                  </span>
                  <AusbauTypSumBadges stats={invoicedStats} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {invoicedGrid.map(renderCard)}
              </div>
            </div>
          )}

          {paidGrid.length > 0 && (
            <div style={{ padding: 12, borderRadius: 12, background: '#ecfdf5', border: '1.5px solid #6ee7b7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <strong style={{ fontSize: 12.5, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  💰 Rechnung erhalten / bezahlt ({paidGrid.length} Objekte)
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#d1fae5', color: '#047857', border: '1px solid #6ee7b7' }}>
                    Summe WE: {paidStats.totalWe} WE ({paidStats.taCount} TA)
                  </span>
                  <AusbauTypSumBadges stats={paidStats} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {paidGrid.map(renderCard)}
              </div>
            </div>
          )}
        </div>
        );
      })()}
      {splitModalAddr && (
        <TeamSplitModal
          addr={splitModalAddr}
          fieldTeams={fieldTeams}
          onSave={(teamLabel, alloc) => {
            onPatchBuilding(splitModalAddr.id, { team: teamLabel, team_allocations: alloc });
            showToast?.('Team-Aufteilung & Cost Center gespeichert');
          }}
          onClose={() => setSplitModalAddr(null)}
        />
      )}
    </div>
  );
}

/* =============================================================================
   3. SPECIAL VIEW: COMPLETION TRACKER & FREEFORM PLANNING WHITEBOARD
   - Left Sidebar: Remaining Objects (TA, Flex, HÜP, Spleißen not all complete)
   - Right Canvas: Freeform Whiteboard with Draggable/Resizable Named Groups
     and In-Place Editable Draggable Object Cards
============================================================================= */
const LOCAL_WB_KEY = 'bruenel_objects_whiteboard_v1';

export function ObjectsWhiteboardView({
  allAddresses,
  fieldTeams,
  calcBuildingProgress,
  dateValueForSort,
  MinimalDatePicker,
  BUILDING_STATUS_OPTIONS,
  onPatchBuilding,
  onUnitChange,
  onAddComment,
  onOpenDetail,
  showToast,
}) {
  // Separate objects by operational & billing stage
  const remainingObjects = useMemo(
    () => allAddresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'open'),
    [allAddresses, calcBuildingProgress]
  );
  const completedUnbilledObjects = useMemo(
    () => allAddresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'completed_unbilled'),
    [allAddresses, calcBuildingProgress]
  );
  const invoicedObjects = useMemo(
    () => allAddresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'invoiced'),
    [allAddresses, calcBuildingProgress]
  );
  const paidObjects = useMemo(
    () => allAddresses.filter((a) => getObjectBillingStage(a, calcBuildingProgress) === 'paid'),
    [allAddresses, calcBuildingProgress]
  );
  const completedCount = completedUnbilledObjects.length + invoicedObjects.length + paidObjects.length;

  const allById = useMemo(() => {
    const m = new Map();
    allAddresses.forEach((a) => m.set(a.id, a));
    return m;
  }, [allAddresses]);

  const [showCompletedSidebarGroup, setShowCompletedSidebarGroup] = useState(true);
  const [showInvoicedSidebarGroup, setShowInvoicedSidebarGroup] = useState(true);
  const [showPaidSidebarGroup, setShowPaidSidebarGroup] = useState(false);

  // Whiteboard persistent state: { groups: [...], cards: { [addrId]: { x, y, groupId } } }
  const [groups, setGroups] = useState([]);
  const [cards, setCards] = useState({});
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // saved | saving

  // UI state
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState('ALL'); // ALL | UNPLACED | TA | FLEX | HUEP | SPLEISSEN
  const [sidebarSort, setSidebarSort] = useState('ausbautermin');
  const [zoom, setZoom] = useState(1);
  const [expandedTaCardId, setExpandedTaCardId] = useState(null);
  const [expandedEditCardId, setExpandedEditCardId] = useState(null);
  const [cardNoteDrafts, setCardNoteDrafts] = useState({});
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [wbSplitModalAddr, setWbSplitModalAddr] = useState(null);

  // Multi-selection, Marquee box selection & Spacebar panning states
  const [selectedIds, setSelectedIds] = useState([]);
  const [marqueeBox, setMarqueeBox] = useState(null); // { startX, startY, curX, curY }
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [showSidebarWorkGroups, setShowSidebarWorkGroups] = useState(true);

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const saveTimerRef = useRef(null);

  // Spacebar listener for panning the whiteboard (ignores when typing in inputs/selects)
  useEffect(() => {
    const isInputTarget = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(el.isContentEditable);
    };
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !isInputTarget(e.target)) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
        setMarqueeBox(null);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    const onBlur = () => {
      setIsSpacePressed(false);
      setIsPanning(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const toggleSelectObject = useCallback((addrId, e) => {
    const isMultiKey = e && (e.metaKey || e.ctrlKey || e.shiftKey);
    setSelectedIds((prev) => {
      if (isMultiKey) {
        return prev.includes(addrId) ? prev.filter((id) => id !== addrId) : [...prev, addrId];
      }
      return prev.includes(addrId) && prev.length === 1 ? [] : [addrId];
    });
  }, []);

  // Alt + Mouse Scroll (and Ctrl + Scroll) to smoothly zoom in/out toward cursor
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handleWheel = (e) => {
      if (!e.altKey && !e.ctrlKey) return;
      e.preventDefault();
      const prevZoom = zoomRef.current;
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      const nextZoom = Math.min(1.75, Math.max(0.45, Number((prevZoom + step).toFixed(2))));
      if (nextZoom === prevZoom) return;

      const rect = vp.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const worldX = (vp.scrollLeft + cursorX) / prevZoom;
      const worldY = (vp.scrollTop + cursorY) / prevZoom;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);

      requestAnimationFrame(() => {
        vp.scrollLeft = Math.max(0, worldX * nextZoom - cursorX);
        vp.scrollTop = Math.max(0, worldY * nextZoom - cursorY);
      });
    };
    vp.addEventListener('wheel', handleWheel, { passive: false });
    return () => vp.removeEventListener('wheel', handleWheel);
  }, []);

  // Load saved whiteboard state from backend (with localStorage fallback)
  useEffect(() => {
    let active = true;
    const loadBoard = async () => {
      try {
        const res = await fetchWithToken('/api/v1/protocol/whiteboard?board_key=default');
        if (!active) return;
        if (res && (Array.isArray(res.groups) || (res.cards && typeof res.cards === 'object'))) {
          setGroups(Array.isArray(res.groups) ? res.groups : []);
          setCards(res.cards && typeof res.cards === 'object' ? res.cards : {});
          setBoardLoaded(true);
          return;
        }
      } catch {
        // fallback to localStorage
      }
      try {
        const raw = localStorage.getItem(LOCAL_WB_KEY);
        if (raw && active) {
          const parsed = JSON.parse(raw);
          setGroups(Array.isArray(parsed.groups) ? parsed.groups : []);
          setCards(parsed.cards && typeof parsed.cards === 'object' ? parsed.cards : {});
        }
      } catch {
        // ignore
      }
      if (active) setBoardLoaded(true);
    };
    loadBoard();
    return () => {
      active = false;
    };
  }, []);

  // Debounced persist to backend + localStorage
  const persistBoard = useCallback((nextGroups, nextCards) => {
    try {
      localStorage.setItem(LOCAL_WB_KEY, JSON.stringify({ groups: nextGroups, cards: nextCards }));
    } catch {
      // ignore storage quota
    }
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetchWithToken('/api/v1/protocol/whiteboard?board_key=default', {
          method: 'PUT',
          body: JSON.stringify({ groups: nextGroups, cards: nextCards }),
        });
      } catch {
        // localStorage already saved
      } finally {
        setSaveState('saved');
      }
    }, 500);
  }, []);

  const updateBoard = useCallback(
    (groupsUpdater, cardsUpdater) => {
      setGroups((prevG) => {
        const nextG = typeof groupsUpdater === 'function' ? groupsUpdater(prevG) : groupsUpdater;
        setCards((prevC) => {
          const nextC = typeof cardsUpdater === 'function' ? cardsUpdater(prevC) : cardsUpdater;
          persistBoard(nextG, nextC);
          return nextC;
        });
        return nextG;
      });
    },
    [persistBoard]
  );

  // Filtered & sorted left sidebar list
  const sidebarObjects = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    const list = remainingObjects.filter((addr) => {
      const core = getRemainingCoreWorks(addr, calcBuildingProgress);
      if (sidebarFilter === 'UNPLACED' && cards[addr.id]) return false;
      if (sidebarFilter === 'TA' && core.taDone) return false;
      if (sidebarFilter === 'FLEX' && core.flexDone) return false;
      if (sidebarFilter === 'HUEP' && core.huepDone) return false;
      if (sidebarFilter === 'SPLEISSEN' && core.spleissenDone) return false;
      if (q) {
        const hay = `${addr.strasse || ''} ${addr.hausnummer || ''} ${addr.ort || ''} ${addr.plz || ''} ${addr.team || ''} ${addr.adress_id || ''} ${addr.projektnummer || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const activeGroupIds = new Set(groups.map((g) => g.id));
    const isGrouped = (addr) => {
      const gid = cards[addr.id]?.groupId;
      return Boolean(gid && activeGroupIds.has(gid));
    };

    return [...list].sort((a, b) => {
      // Always bring NOT-GROUPED objects to the very top of the sidebar list
      const ga = isGrouped(a) ? 1 : 0;
      const gb = isGrouped(b) ? 1 : 0;
      if (ga !== gb) return ga - gb;

      if (sidebarSort === 'ausbautermin') {
        const da = dateValueForSort(a.ausbautermin);
        const db = dateValueForSort(b.ausbautermin);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      }
      if (sidebarSort === 'remaining_asc') {
        return (
          getRemainingCoreWorks(a, calcBuildingProgress).remainingCount -
          getRemainingCoreWorks(b, calcBuildingProgress).remainingCount
        );
      }
      if (sidebarSort === 'remaining_desc') {
        return (
          getRemainingCoreWorks(b, calcBuildingProgress).remainingCount -
          getRemainingCoreWorks(a, calcBuildingProgress).remainingCount
        );
      }
      if (sidebarSort === 'team') {
        return String(a.team || 'zzz').localeCompare(String(b.team || 'zzz'), 'de');
      }
      return String(a.strasse || '').localeCompare(String(b.strasse || ''), 'de');
    });
  }, [remainingObjects, sidebarSearch, sidebarFilter, sidebarSort, cards, groups, calcBuildingProgress, dateValueForSort]);

  // Sidebar draggable groups by remaining work combinations
  const sidebarRemainingGroups = useMemo(() => {
    const map = new Map();
    sidebarObjects.forEach((addr) => {
      const core = getRemainingCoreWorks(addr, calcBuildingProgress);
      const label =
        core.remaining.length === 1
          ? `Nur ${core.remaining[0]} offen`
          : `Offen: ${core.remaining.join(' + ')}`;
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(addr);
    });
    return Array.from(map.entries()).map(([label, items], idx) => ({
      label,
      items,
      color: GROUP_COLORS[idx % GROUP_COLORS.length].id,
    }));
  }, [sidebarObjects, calcBuildingProgress]);

  // Create a new group from currently selected objects (selectedIds)
  const handleCreateGroupFromSelection = () => {
    const validIds = selectedIds.filter((id) => allById.has(id));
    if (validIds.length === 0) {
      showToast?.('Bitte zuerst Objekte auswählen (Ziehen mit Maus oder Cmd/Ctrl + Klick).', 'error');
      return;
    }
    const firstAddr = allById.get(validIds[0]);
    const firstCore = firstAddr ? getRemainingCoreWorks(firstAddr, calcBuildingProgress) : null;
    const defaultTitle =
      firstCore && firstCore.remaining.length > 0
        ? `Offen: ${firstCore.remaining.join(' + ')} (${validIds.length})`
        : `Auswahl Gruppe (${validIds.length})`;

    // Position near existing selected cards if on board, else next grid slot
    const existingPositions = validIds.map((id) => cards[id]).filter(Boolean);
    const idx = groups.length;
    const gx =
      existingPositions.length > 0
        ? Math.max(20, Math.min(...existingPositions.map((p) => p.x)) - 12)
        : 36 + (idx % 3) * 385;
    const gy =
      existingPositions.length > 0
        ? Math.max(20, Math.min(...existingPositions.map((p) => p.y)) - 60)
        : 36 + Math.floor(idx / 3) * 360;

    const grpId = `grp_sel_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newGroup = {
      id: grpId,
      name: defaultTitle,
      color: GROUP_COLORS[idx % GROUP_COLORS.length].id,
      x: gx,
      y: gy,
      width: 365,
      height: Math.max(260, 110 + validIds.length * 138),
      team: '',
      plannedDate: '',
    };

    updateBoard(
      (prevG) => [...prevG, newGroup],
      (prevC) => {
        const nextC = { ...prevC };
        validIds.forEach((id, i) => {
          nextC[id] = {
            x: gx + 14,
            y: gy + 92 + i * 135,
            groupId: grpId,
          };
        });
        return nextC;
      }
    );
    setEditingGroupId(grpId);
    showToast?.(`${validIds.length} ausgewählte Objekte in neue Gruppe zusammengefasst`);
  };

  // Move all selected objects into an existing group
  const handleMoveSelectedToGroup = (targetGroupId) => {
    if (!targetGroupId) return;
    const targetGrp = groups.find((g) => g.id === targetGroupId);
    if (!targetGrp) return;
    const validIds = selectedIds.filter((id) => allById.has(id));
    if (validIds.length === 0) return;

    updateBoard(
      (prevG) => prevG,
      (prevC) => {
        const nextC = { ...prevC };
        validIds.forEach((id, i) => {
          nextC[id] = {
            x: targetGrp.x + 14,
            y: targetGrp.y + 92 + i * 135,
            groupId: targetGroupId,
          };
        });
        return nextC;
      }
    );
    showToast?.(`${validIds.length} Objekte in „${targetGrp.name}“ verschoben`);
  };

  // Create a new named Group / Zone
  const handleCreateGroup = (customName = null, colorId = null) => {
    const idx = groups.length;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const newGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: customName || `Restarbeiten Gruppe ${idx + 1}`,
      color: colorId || GROUP_COLORS[idx % GROUP_COLORS.length].id,
      x: 32 + col * 380,
      y: 32 + row * 340,
      width: 350,
      height: 310,
      team: '',
      plannedDate: '',
    };
    updateBoard((prev) => [...prev, newGroup], (prevC) => prevC);
    setEditingGroupId(newGroup.id);
  };

  // Auto-group all remaining objects by their exact remaining work combination + separated Abgeschlossen group
  const handleAutoGroupByRemaining = () => {
    if (allAddresses.length === 0) {
      showToast?.('Keine Objekte vorhanden.');
      return;
    }
    const buckets = new Map();
    remainingObjects.forEach((addr) => {
      const core = getRemainingCoreWorks(addr, calcBuildingProgress);
      const label =
        core.remaining.length === 1
          ? `Nur ${core.remaining[0]} offen`
          : `Offen: ${core.remaining.join(' + ')}`;
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(addr);
    });
    if (completedUnbilledObjects.length > 0) {
      buckets.set('✓ Fertig — Bereit f. RE', completedUnbilledObjects);
    }
    if (invoicedObjects.length > 0) {
      buckets.set('📄 Rechnung erstellt (Offen)', invoicedObjects);
    }
    if (paidObjects.length > 0) {
      buckets.set('💰 Rechnung erhalten / bezahlt', paidObjects);
    }

    const nextGroups = [];
    const nextCards = {};
    let idx = 0;
    buckets.forEach((items, label) => {
      const isDoneGroup = label.startsWith('✓ Fertig');
      const isInvoicedGroup = label.startsWith('📄 Rechnung erstellt');
      const isPaidGroup = label.startsWith('💰 Rechnung erhalten');
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const grpId = isPaidGroup
        ? `grp_paid_${Date.now()}`
        : isInvoicedGroup
        ? `grp_invoiced_${Date.now()}`
        : isDoneGroup
        ? `grp_completed_${Date.now()}`
        : `grp_auto_${idx}_${Date.now()}`;
      const gx = 28 + col * 390;
      const gy = 28 + row * 420;
      const neededHeight = Math.max(280, 110 + items.length * 142);

      nextGroups.push({
        id: grpId,
        name: label,
        color: isPaidGroup
          ? 'emerald'
          : isInvoicedGroup
          ? 'blue'
          : isDoneGroup
          ? 'purple'
          : GROUP_COLORS[idx % GROUP_COLORS.length].id,
        x: gx,
        y: gy,
        width: 365,
        height: Math.min(neededHeight, 680),
        team: '',
        plannedDate: '',
      });

      items.forEach((addr, itemIdx) => {
        nextCards[addr.id] = {
          x: gx + 14,
          y: gy + 92 + itemIdx * 135,
          groupId: grpId,
        };
      });
      idx += 1;
    });

    updateBoard(nextGroups, nextCards);
    showToast?.(`${allAddresses.length} Objekte in ${nextGroups.length} Gruppen (inkl. Abgeschlossen) sortiert`);
  };

  // Place all unplaced remaining objects onto canvas
  const handlePlaceAllOnBoard = () => {
    const unplaced = remainingObjects.filter((a) => !cards[a.id]);
    if (unplaced.length === 0) {
      showToast?.('Alle offenen Objekte sind bereits auf dem Whiteboard.');
      return;
    }
    const nextCards = { ...cards };
    unplaced.forEach((addr, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      nextCards[addr.id] = {
        x: 36 + col * 330,
        y: 36 + row * 190,
        groupId: null,
      };
    });
    updateBoard((prevG) => prevG, nextCards);
    showToast?.(`${unplaced.length} Objekte auf dem Whiteboard platziert`);
  };

  const handlePlaceSingleOnBoard = (addrId) => {
    const count = Object.keys(cards).length;
    const col = count % 3;
    const row = Math.floor(count / 3);
    updateBoard(
      (prevG) => prevG,
      (prevC) => ({
        ...prevC,
        [addrId]: { x: 40 + col * 330, y: 40 + row * 185, groupId: null },
      })
    );
  };

  const handleRemoveCardFromBoard = (addrId) => {
    updateBoard(
      (prevG) => prevG,
      (prevC) => {
        const copy = { ...prevC };
        delete copy[addrId];
        return copy;
      }
    );
  };

  const handleDeleteGroup = (groupId) => {
    updateBoard(
      (prevG) => prevG.filter((g) => g.id !== groupId),
      (prevC) => {
        const nextC = { ...prevC };
        Object.keys(nextC).forEach((cid) => {
          if (nextC[cid]?.groupId === groupId) {
            nextC[cid] = { ...nextC[cid], groupId: null };
          }
        });
        return nextC;
      }
    );
  };

  const handleApplyGroupPlanToObjects = async (group) => {
    const memberIds = Object.keys(cards).filter(
      (cid) => cards[cid]?.groupId === group.id && allById.has(cid)
    );
    if (memberIds.length === 0) {
      showToast?.('Keine Objekte in dieser Gruppe.', 'error');
      return;
    }
    const patch = {};
    if (group.team) patch.team = group.team;
    if (group.plannedDate) patch.restarbeit_termin = group.plannedDate;
    if (Object.keys(patch).length === 0) {
      showToast?.('Bitte zuerst Team oder Termin in der Gruppe auswählen.', 'error');
      return;
    }
    await Promise.all(memberIds.map((id) => onPatchBuilding(id, patch)));
    showToast?.(`Planung auf ${memberIds.length} Objekte in „${group.name}“ angewendet`);
  };

  // HTML5 Drop from Left Sidebar (Single Object, Multiple Selected Objects, or Entire Sidebar Group!) onto Canvas or Group
  const handleCanvasDrop = (e, targetGroupId = null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupId(null);
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const dropX = Math.max(12, Math.round((e.clientX - rect.left) / zoom - 150));
    const dropY = Math.max(12, Math.round((e.clientY - rect.top) / zoom - 30));

    let payload = null;
    if (rawData.startsWith('{')) {
      try {
        payload = JSON.parse(rawData);
      } catch {
        payload = null;
      }
    }

    // Case 1: Entire Group dragged from the Left Sidebar directly onto the Whiteboard!
    if (payload && payload.type === 'sidebar_group' && Array.isArray(payload.ids)) {
      const validIds = payload.ids.filter((id) => allById.has(id));
      if (validIds.length === 0) return;
      const grpId = `grp_sb_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const newGroup = {
        id: grpId,
        name: payload.title || `Gruppe (${validIds.length})`,
        color: payload.color || GROUP_COLORS[groups.length % GROUP_COLORS.length].id,
        x: dropX,
        y: dropY,
        width: 365,
        height: Math.max(260, 110 + validIds.length * 138),
        team: '',
        plannedDate: '',
      };
      updateBoard(
        (prevG) => [...prevG, newGroup],
        (prevC) => {
          const nextC = { ...prevC };
          validIds.forEach((id, i) => {
            nextC[id] = { x: dropX + 14, y: dropY + 92 + i * 135, groupId: grpId };
          });
          return nextC;
        }
      );
      showToast?.(`Gruppe „${newGroup.name}“ (${validIds.length} Objekte) auf dem Whiteboard platziert`);
      return;
    }

    // Detect if dropped inside an existing group
    let resolvedGroupId = targetGroupId;
    if (!resolvedGroupId) {
      const hit = groups.find(
        (g) => dropX + 100 >= g.x && dropX + 100 <= g.x + g.width && dropY + 25 >= g.y && dropY + 25 <= g.y + g.height
      );
      if (hit) resolvedGroupId = hit.id;
    }

    // Case 2: Multiple selected objects dragged together
    const idsToPlace =
      payload && payload.type === 'multi_addrs' && Array.isArray(payload.ids)
        ? payload.ids.filter((id) => allById.has(id))
        : allById.has(rawData)
        ? selectedIds.includes(rawData) && selectedIds.length > 1
          ? selectedIds.filter((id) => allById.has(id))
          : [rawData]
        : [];

    if (idsToPlace.length === 0) return;

    updateBoard(
      (prevG) => prevG,
      (prevC) => {
        const nextC = { ...prevC };
        idsToPlace.forEach((id, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          nextC[id] = {
            x: resolvedGroupId ? dropX : dropX + col * 326,
            y: resolvedGroupId ? dropY + i * 135 : dropY + row * 175,
            groupId: resolvedGroupId,
          };
        });
        return nextC;
      }
    );
    if (idsToPlace.length > 1) {
      showToast?.(
        resolvedGroupId
          ? `${idsToPlace.length} ausgewählte Objekte in Gruppe abgelegt`
          : `${idsToPlace.length} ausgewählte Objekte auf dem Whiteboard platziert`
      );
    }
  };

  // Pointer-based smooth dragging for FREEFORM CARDS on the canvas (supports multi-selected cards!)
  const startCardDrag = (e, addrId) => {
    if (e.button !== 0 || isSpacePressed) return;
    e.stopPropagation();

    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      toggleSelectObject(addrId, e);
      return;
    }

    const movingIds =
      selectedIds.includes(addrId) && selectedIds.length > 1
        ? selectedIds.filter((id) => cards[id])
        : [addrId];

    if (!selectedIds.includes(addrId)) {
      setSelectedIds([addrId]);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const origPositions = {};
    movingIds.forEach((id) => {
      origPositions[id] = { ...(cards[id] || { x: 40, y: 40, groupId: null }) };
    });

    let lastDx = 0;
    let lastDy = 0;

    const onMove = (ev) => {
      lastDx = Math.round((ev.clientX - startX) / zoom);
      lastDy = Math.round((ev.clientY - startY) / zoom);
      setCards((prev) => {
        const next = { ...prev };
        movingIds.forEach((id) => {
          const o = origPositions[id];
          next[id] = {
            ...prev[id],
            x: Math.max(8, o.x + lastDx),
            y: Math.max(8, o.y + lastDy),
          };
        });
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const primaryOrig = origPositions[addrId] || { x: 40, y: 40 };
      const centerX = Math.max(8, primaryOrig.x + lastDx) + 150;
      const centerY = Math.max(8, primaryOrig.y + lastDy) + 50;
      const hitGroup = groups.find(
        (g) => centerX >= g.x && centerX <= g.x + g.width && centerY >= g.y && centerY <= g.y + g.height
      );

      updateBoard(
        (prevG) => prevG,
        (prevC) => {
          const next = { ...prevC };
          movingIds.forEach((id) => {
            const o = origPositions[id];
            next[id] = {
              x: Math.max(8, o.x + lastDx),
              y: Math.max(8, o.y + lastDy),
              groupId: hitGroup ? hitGroup.id : null,
            };
          });
          return next;
        }
      );
      if (hitGroup && movingIds.length > 1) {
        showToast?.(`${movingIds.length} ausgewählte Objekte in „${hitGroup.name}“ abgelegt`);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Spacebar + Click-and-Drag Panning OR Mouse Marquee Box Selection on the Whiteboard Canvas
  const handleCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    const vp = viewportRef.current;
    const canvasEl = canvasRef.current;
    if (!vp || !canvasEl) return;

    // 1. Spacebar pressed -> Pan the whiteboard viewport anywhere!
    if (isSpacePressed) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = vp.scrollLeft;
      const origTop = vp.scrollTop;

      const onPanMove = (ev) => {
        vp.scrollLeft = Math.max(0, origLeft - (ev.clientX - startX));
        vp.scrollTop = Math.max(0, origTop - (ev.clientY - startY));
      };
      const onPanUp = () => {
        setIsPanning(false);
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
      };
      window.addEventListener('pointermove', onPanMove);
      window.addEventListener('pointerup', onPanUp);
      return;
    }

    // 2. Clicked on empty canvas background -> Draw Marquee Selection Box!
    if (e.target !== canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const startX = Math.round((e.clientX - rect.left) / zoom);
    const startY = Math.round((e.clientY - rect.top) / zoom);
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    const initialSelected = additive ? [...selectedIds] : [];

    if (!additive) {
      setSelectedIds([]);
    }
    setMarqueeBox({ startX, startY, curX: startX, curY: startY });

    const onSelectMove = (ev) => {
      const curX = Math.round((ev.clientX - rect.left) / zoom);
      const curY = Math.round((ev.clientY - rect.top) / zoom);
      setMarqueeBox({ startX, startY, curX, curY });

      const minX = Math.min(startX, curX);
      const maxX = Math.max(startX, curX);
      const minY = Math.min(startY, curY);
      const maxY = Math.max(startY, curY);

      if (maxX - minX < 5 && maxY - minY < 5) return;

      const hitIds = new Set(initialSelected);
      Object.entries(cards).forEach(([cid, pos]) => {
        if (!allById.has(cid) || !pos) return;
        let cardX = pos.x;
        let cardY = pos.y;
        if (pos.groupId) {
          const parentGrp = groups.find((g) => g.id === pos.groupId);
          if (parentGrp) {
            const members = Object.keys(cards).filter((k) => cards[k]?.groupId === parentGrp.id);
            const idxInGrp = Math.max(0, members.indexOf(cid));
            cardX = parentGrp.x + 12;
            cardY = parentGrp.y + 85 + idxInGrp * 125;
          }
        }
        const cardW = 312;
        const cardH = 115;
        const intersects = cardX < maxX && cardX + cardW > minX && cardY < maxY && cardY + cardH > minY;
        if (intersects) hitIds.add(cid);
      });
      setSelectedIds(Array.from(hitIds));
    };

    const onSelectUp = () => {
      setMarqueeBox(null);
      window.removeEventListener('pointermove', onSelectMove);
      window.removeEventListener('pointerup', onSelectUp);
    };

    window.addEventListener('pointermove', onSelectMove);
    window.addEventListener('pointerup', onSelectUp);
  };

  // Pointer-based smooth dragging for GROUPS (moves contained cards along with group!)
  const startGroupDrag = (e, groupId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origGroup = groups.find((g) => g.id === groupId);
    if (!origGroup) return;

    const origCardsSnapshot = { ...cards };
    let finalDx = 0;
    let finalDy = 0;

    const onMove = (ev) => {
      const dx = Math.round((ev.clientX - startX) / zoom);
      const dy = Math.round((ev.clientY - startY) / zoom);
      const clampedX = Math.max(8, origGroup.x + dx);
      const clampedY = Math.max(8, origGroup.y + dy);
      finalDx = clampedX - origGroup.x;
      finalDy = clampedY - origGroup.y;

      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, x: clampedX, y: clampedY } : g))
      );
      setCards((prev) => {
        const next = { ...prev };
        Object.keys(origCardsSnapshot).forEach((cid) => {
          if (origCardsSnapshot[cid]?.groupId === groupId) {
            next[cid] = {
              ...origCardsSnapshot[cid],
              x: Math.max(8, origCardsSnapshot[cid].x + finalDx),
              y: Math.max(8, origCardsSnapshot[cid].y + finalDy),
            };
          }
        });
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      updateBoard(
        (prevG) => prevG,
        (prevC) => prevC
      );
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Pointer-based resizing for GROUPS
  const startGroupResize = (e, groupId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origGroup = groups.find((g) => g.id === groupId);
    if (!origGroup) return;

    const onMove = (ev) => {
      const dx = Math.round((ev.clientX - startX) / zoom);
      const dy = Math.round((ev.clientY - startY) / zoom);
      const nextW = Math.max(300, origGroup.width + dx);
      const nextH = Math.max(180, origGroup.height + dy);
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, width: nextW, height: nextH } : g))
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      updateBoard(
        (prevG) => prevG,
        (prevC) => prevC
      );
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Handle toggling a core completion flag with instant completion toast
  const handleToggleCoreFlag = async (addr, flagKey, currentVal) => {
    const nextVal = !currentVal;
    const simulated = { ...addr, [flagKey]: nextVal };
    const willComplete = isCoreArbeitCompleted(simulated, calcBuildingProgress);
    await onPatchBuilding(addr.id, { [flagKey]: nextVal });
    if (willComplete) {
      showToast?.(`✓ ${addr.strasse} ${addr.hausnummer}: TA, Flex, HÜP & Spleißen komplett — in Abgeschlossen-Gruppe verschoben!`);
    }
  };

  const handleQuickMarkTaDone = async (addr) => {
    const units = Array.isArray(addr.units) ? addr.units : [];
    if (units.length === 0) {
      showToast?.('Bitte TA in den Objekt-Details hinzufügen (keine WE vorhanden).', 'error');
      return;
    }
    const firstNonTa = units.find((u) => !u.ta_installiert && u.we_ausbau_art !== 'TA Installation') || units[0];
    await onUnitChange(addr.id, firstNonTa.id, { we_ausbau_art: 'TA Installation', ta_installiert: true, reserve: false, ohne: false });
    const simulated = {
      ...addr,
      units: units.map((u) => (u.id === firstNonTa.id ? { ...u, we_ausbau_art: 'TA Installation', ta_installiert: true } : u)),
    };
    if (isCoreArbeitCompleted(simulated, calcBuildingProgress)) {
      showToast?.(`✓ ${addr.strasse} ${addr.hausnummer}: TA, Flex, HÜP & Spleißen komplett — in Abgeschlossen-Gruppe verschoben!`);
    }
  };

  // Cards currently on the whiteboard (both open & completed)
  const activeBoardCardEntries = useMemo(() => {
    return Object.entries(cards)
      .filter(([addrId]) => allById.has(addrId))
      .map(([addrId, pos]) => ({ addr: allById.get(addrId), pos }));
  }, [cards, allById]);

  // Separate freeform cards (not in a group) vs grouped cards
  const freeformCards = activeBoardCardEntries.filter((e) => !e.pos.groupId || !groups.some((g) => g.id === e.pos.groupId));

  // Render an In-Place Editable Whiteboard Object Card
  const renderWhiteboardCard = (addr, pos, isInsideGroup = false) => {
    const core = getRemainingCoreWorks(addr, calcBuildingProgress);
    const isTaExpanded = expandedTaCardId === addr.id;
    const isEditExpanded = expandedEditCardId === addr.id;
    const isSelected = selectedIds.includes(addr.id);
    const units = Array.isArray(addr.units) ? addr.units : [];

    return (
      <div
        key={addr.id}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            e.stopPropagation();
            toggleSelectObject(addr.id, e);
          }
        }}
        style={{
          position: isInsideGroup ? 'relative' : 'absolute',
          left: isInsideGroup ? undefined : pos.x,
          top: isInsideGroup ? undefined : pos.y,
          width: isInsideGroup ? '100%' : 312,
          background: isSelected ? '#eff6ff' : '#ffffff',
          border: isSelected
            ? '2px solid #2563eb'
            : `1.5px solid ${core.remainingCount === 1 ? '#fb923c' : '#cbd5e1'}`,
          borderRadius: 10,
          boxShadow: isSelected
            ? '0 0 0 3px rgba(37, 99, 235, 0.22), 0 8px 20px rgba(15, 23, 42, 0.12)'
            : '0 6px 18px rgba(15, 23, 42, 0.09)',
          zIndex: isEditExpanded || isTaExpanded ? 40 : isSelected ? 30 : 20,
          userSelect: 'none',
        }}
      >
        {/* Card Drag Handle Header */}
        <div
          onPointerDown={(e) => {
            if (!isInsideGroup) startCardDrag(e, addr.id);
          }}
          draggable={isInsideGroup}
          onDragStart={(e) => {
            if (isInsideGroup) {
              const dragPayload =
                selectedIds.includes(addr.id) && selectedIds.length > 1
                  ? JSON.stringify({ type: 'multi_addrs', ids: selectedIds })
                  : addr.id;
              e.dataTransfer.setData('text/plain', dragPayload);
              e.dataTransfer.effectAllowed = 'move';
            }
          }}
          style={{
            padding: '7px 9px',
            background: isSelected ? '#dbeafe' : '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            borderTopLeftRadius: 9,
            borderTopRightRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            cursor: 'grab',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <GripVertical size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>{addr.strasse} {addr.hausnummer}</span>
                {(() => {
                  const typ = classifyAusbauTyp(addr);
                  return (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: typ.bg,
                        color: typ.color,
                        border: `1px solid ${typ.border}`,
                        flexShrink: 0,
                      }}
                    >
                      {typ.shortLabel}
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {addr.ort || '—'} · {addr.ausbautermin ? `Ausbau: ${addr.ausbautermin}` : 'Kein Ausbau-Datum'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedEditCardId(isEditExpanded ? null : addr.id);
              }}
              style={{
                border: '1px solid #cbd5e1',
                background: isEditExpanded ? '#fff7ed' : '#fff',
                color: isEditExpanded ? '#c2410c' : '#475569',
                borderRadius: 5,
                padding: '3px 5px',
                cursor: 'pointer',
              }}
              title="Team, Termine & Status direkt bearbeiten"
            >
              <Edit3 size={11} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(addr.id);
              }}
              style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 5, padding: '3px 5px', cursor: 'pointer' }}
              title="Vollständige Objekt-Details öffnen"
            >
              <ArrowUpRight size={11} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveCardFromBoard(addr.id);
              }}
              style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 5, padding: '3px 5px', cursor: 'pointer' }}
              title="Vom Whiteboard zurück in die linke Liste legen"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        {/* 4 Core Completion Checkpoints (In-Place Interactive) */}
        <div style={{ padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            <button
              type="button"
              onClick={() => setExpandedTaCardId(isTaExpanded ? null : addr.id)}
              style={{
                padding: '4px 3px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
                border: `1px solid ${core.taDone ? '#86efac' : '#fca5a5'}`,
                background: core.taDone ? '#dcfce7' : '#fef2f2',
                color: core.taDone ? '#15803d' : '#dc2626',
              }}
              title="TA Status bearbeiten (klicken für WE-Liste)"
            >
              {core.taDone ? '✓ ' : ''}TA {core.taCount}/{core.totalWe}
            </button>
            {[
              { key: 'flexrohr', label: 'Flex', done: core.flexDone },
              { key: 'huep_installiert', label: 'HÜP', done: core.huepDone },
              { key: 'spleissen_fertig', label: 'Spleiß', done: core.spleissenDone },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggleCoreFlag(addr, item.key, item.done)}
                style={{
                  padding: '4px 3px',
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: `1px solid ${item.done ? '#86efac' : '#fca5a5'}`,
                  background: item.done ? '#dcfce7' : '#fef2f2',
                  color: item.done ? '#15803d' : '#dc2626',
                }}
                title={`${item.label} als ${item.done ? 'offen' : 'erledigt'} markieren`}
              >
                {item.done ? '✓ ' : ''}{item.label}
              </button>
            ))}
          </div>

          {/* Compact Meta Row: Team (with 2+ Teams Split button) & Restarbeit Termin */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10.5, color: '#475569' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setWbSplitModalAddr(addr);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontWeight: 700,
                border: addr.team_allocations?.mode ? '1px solid #fdba74' : '1px solid transparent',
                background: addr.team_allocations?.mode ? '#fff7ed' : 'transparent',
                color: addr.team_allocations?.mode ? '#c2410c' : '#475569',
                borderRadius: 5,
                padding: '1px 5px',
                cursor: 'pointer',
                maxWidth: 165,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title="Klicken, um Team zuzuweisen oder auf 2+ Teams (% / Arbeitsschritt) aufzuteilen"
            >
              <Users size={11} style={{ color: addr.team_allocations?.mode ? '#FF6B00' : '#64748b', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{addr.team || 'Kein Team'}</span>
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, color: addr.restarbeit_termin ? '#c2410c' : '#94a3b8', flexShrink: 0 }}>
              <Clock size={11} />
              {addr.restarbeit_termin ? `Rest: ${addr.restarbeit_termin}` : 'Kein Rest-Termin'}
            </span>
          </div>

          {/* Expandable Inline TA Unit Editor */}
          {isTaExpanded && (
            <div style={{ padding: 7, borderRadius: 7, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 10.5, color: '#0f172a' }}>Wohnungen (TA Status)</strong>
                {!core.taDone && units.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleQuickMarkTaDone(addr)}
                    style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, border: '1px solid #86efac', background: '#dcfce7', color: '#15803d', cursor: 'pointer' }}
                  >
                    +1 TA erledigt
                  </button>
                )}
              </div>
              {units.length === 0 ? (
                <div style={{ fontSize: 10.5, color: '#64748b' }}>Keine WE eingetragen.</div>
              ) : (
                <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {units.map((u, idx) => {
                    const isTa = u.ta_installiert || u.we_ausbau_art === 'TA Installation';
                    return (
                      <div key={u.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5 }}>
                        <span>{u.etage || `WE ${idx + 1}`} {u.unit_id ? `(${u.unit_id})` : ''}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUnitChange(addr.id, u.id, {
                              we_ausbau_art: isTa ? 'Ohne' : 'TA Installation',
                              ta_installiert: !isTa,
                              ohne: isTa,
                              reserve: false,
                            })
                          }
                          style={{
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: `1px solid ${isTa ? '#86efac' : '#cbd5e1'}`,
                            background: isTa ? '#dcfce7' : '#fff',
                            color: isTa ? '#15803d' : '#475569',
                          }}
                        >
                          {isTa ? '✓ TA' : 'Offen'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Expandable Full In-Place Planning & Editing Controls */}
          {isEditExpanded && (
            <div style={{ padding: 8, borderRadius: 7, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <label style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b' }}>Team zuweisen</label>
                    <button
                      type="button"
                      onClick={() => setWbSplitModalAddr(addr)}
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: 4,
                        border: '1px solid #fdba74',
                        background: '#fff7ed',
                        color: '#c2410c',
                        cursor: 'pointer',
                      }}
                      title="2+ Teams (% oder Aufgaben) zuweisen"
                    >
                      2+ Teams / %
                    </button>
                  </div>
                  <select
                    value={addr.team || ''}
                    onChange={(e) => onPatchBuilding(addr.id, { team: e.target.value, team_allocations: {} })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: 11, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Kein Team</option>
                    {addr.team && !fieldTeams.some((t) => t.name === addr.team) && (
                      <option value={addr.team}>{addr.team}</option>
                    )}
                    {fieldTeams.map((t) => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Status</label>
                  <select
                    value={addr.building_status || 'Ausbau terminiert'}
                    onChange={(e) => onPatchBuilding(addr.id, { building_status: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: 11, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    {BUILDING_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div>
                  <label style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Ausbau Datum</label>
                  <MinimalDatePicker
                    value={addr.ausbautermin || ''}
                    onChange={(val) => onPatchBuilding(addr.id, { ausbautermin: val })}
                    placeholder="TT.MM.JJJJ"
                    compact
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Restarbeit Termin</label>
                  <MinimalDatePicker
                    value={addr.restarbeit_termin || ''}
                    onChange={(val) => onPatchBuilding(addr.id, { restarbeit_termin: val })}
                    placeholder="TT.MM.JJJJ"
                    compact
                  />
                </div>
              </div>

              {/* Extra Flags + Billing Status (RE erstellt / RE erhalten) */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { key: 'metalkanal_installiert', label: 'Metalkanal' },
                  { key: 'upload_done', label: 'Fotos' },
                  { key: 'genehmigt', label: 'Genehmigt' },
                  { key: 'rechnung_erstellt', label: 'RE erstellt' },
                  { key: 'rechnung_bezahlt', label: 'RE erhalten' },
                ].map((f) => {
                  const on = Boolean(addr[f.key]);
                  const isRe = f.key === 'rechnung_erstellt';
                  const isPaid = f.key === 'rechnung_bezahlt';
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        if (isPaid) {
                          onPatchBuilding(addr.id, { rechnung_bezahlt: !on, ...(!on ? { rechnung_erstellt: true } : {}) });
                        } else if (isRe) {
                          onPatchBuilding(addr.id, { rechnung_erstellt: !on, ...(on ? { rechnung_bezahlt: false } : {}) });
                        } else {
                          onPatchBuilding(addr.id, { [f.key]: !on });
                        }
                      }}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 5,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${on ? (isRe ? '#93c5fd' : '#86efac') : '#cbd5e1'}`,
                        background: on ? (isRe ? '#dbeafe' : '#dcfce7') : '#fff',
                        color: on ? (isRe ? '#1d4ed8' : '#15803d') : '#475569',
                      }}
                    >
                      {on ? '✓ ' : ''}{f.label}
                    </button>
                  );
                })}
              </div>

              {/* Quick Inline Comment */}
              {onAddComment && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    placeholder="Kurze Notiz hinzufügen…"
                    value={cardNoteDrafts[addr.id] || ''}
                    onChange={(e) => setCardNoteDrafts((p) => ({ ...p, [addr.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (cardNoteDrafts[addr.id] || '').trim()) {
                        onAddComment(addr.id, cardNoteDrafts[addr.id].trim());
                        setCardNoteDrafts((p) => ({ ...p, [addr.id]: '' }));
                      }
                    }}
                    style={{ flex: 1, padding: '4px 6px', fontSize: 10.5, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                  />
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    style={{ padding: '4px 7px' }}
                    onClick={() => {
                      if ((cardNoteDrafts[addr.id] || '').trim()) {
                        onAddComment(addr.id, cardNoteDrafts[addr.id].trim());
                        setCardNoteDrafts((p) => ({ ...p, [addr.id]: '' }));
                      }
                    }}
                  >
                    <Send size={11} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 230px)', minHeight: 620, borderTop: '1px solid #e2e8f0', overflow: 'hidden' }}>
      {/* ===================================================================
          LEFT SIDEBAR: REMAINING OBJECTS (TA, Flex, HÜP, Spleißen incomplete)
         =================================================================== */}
      <div
        style={{
          width: 315,
          flexShrink: 0,
          background: '#f8fafc',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(() => {
            const remStats = sumUnitsForAddresses(remainingObjects, calcBuildingProgress);
            const compStats = sumUnitsForAddresses(
              [...completedUnbilledObjects, ...invoicedObjects, ...paidObjects],
              calcBuildingProgress
            );
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 12, color: '#0f172a' }}>
                    Offene ({remainingObjects.length} · {remStats.totalWe} WE / {remStats.taCount} TA)
                  </strong>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 7px', borderRadius: 999 }}>
                    ✓ {completedCount} ({compStats.totalWe} WE)
                  </span>
                </div>
                <AusbauTypSumBadges stats={remStats} compact showZero />
              </div>
            );
          })()}

          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: '#94a3b8' }} />
            <input
              placeholder="Straße, Ort, Team suchen…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              style={{ width: '100%', padding: '5px 8px 5px 26px', fontSize: 11.5, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
            />
          </div>

          {/* Quick Remaining Work Filters */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'Alle' },
              { id: 'UNPLACED', label: 'Nicht auf Board' },
              { id: 'TA', label: 'TA' },
              { id: 'FLEX', label: 'Flex' },
              { id: 'HUEP', label: 'HÜP' },
              { id: 'SPLEISSEN', label: 'Spleißen' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSidebarFilter(f.id)}
                style={{
                  padding: '2px 7px',
                  borderRadius: 5,
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: sidebarFilter === f.id ? '1px solid #FF6B00' : '1px solid #cbd5e1',
                  background: sidebarFilter === f.id ? '#fff7ed' : '#fff',
                  color: sidebarFilter === f.id ? '#c2410c' : '#475569',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            value={sidebarSort}
            onChange={(e) => setSidebarSort(e.target.value)}
            style={{ width: '100%', padding: '4px 7px', fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}
          >
            <option value="ausbautermin">Sort: Ausbau Datum</option>
            <option value="remaining_asc">Sort: Wenige Restarbeiten zuerst</option>
            <option value="remaining_desc">Sort: Viele Restarbeiten zuerst</option>
            <option value="strasse">Sort: Straße (A–Z)</option>
            <option value="team">Sort: Team</option>
          </select>
        </div>

        {/* Draggable Remaining Objects List + Draggable Sidebar Groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Multi-Selection Action Strip inside Sidebar */}
          {selectedIds.length > 0 && (
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'text/plain',
                  JSON.stringify({
                    type: 'sidebar_group',
                    title: `Auswahl Gruppe (${selectedIds.length})`,
                    color: 'blue',
                    ids: selectedIds,
                  })
                );
                e.dataTransfer.effectAllowed = 'move';
              }}
              style={{
                padding: '7px 9px',
                borderRadius: 8,
                background: '#dbeafe',
                border: '1.5px solid #2563eb',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                cursor: 'grab',
              }}
              title="Auf das Whiteboard ziehen, um alle ausgewählten Objekte als neue Gruppe abzulegen"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 11, color: '#1e3a8a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <GripVertical size={12} /> {selectedIds.length} ausgewählt (Als Gruppe ziehen)
                </strong>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  style={{ border: 'none', background: 'transparent', color: '#1e3a8a', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                onClick={handleCreateGroupFromSelection}
                style={{
                  padding: '4px 8px',
                  borderRadius: 5,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + Auswahl als Gruppe aufs Board
              </button>
            </div>
          )}

          {/* Draggable Remaining-Work Groups (Drag directly onto Whiteboard as a Group!) */}
          {sidebarRemainingGroups.length > 0 && (
            <div style={{ borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed', overflow: 'hidden', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowSidebarWorkGroups((v) => !v)}
                style={{
                  width: '100%',
                  padding: '6px 9px',
                  background: '#ffedd5',
                  border: 'none',
                  borderBottom: showSidebarWorkGroups ? '1px solid #fed7aa' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#9a3412',
                }}
              >
                <span>Restarbeit-Gruppen aufs Board ziehen ({sidebarRemainingGroups.length})</span>
                <span>{showSidebarWorkGroups ? '▲' : '▼'}</span>
              </button>
              {showSidebarWorkGroups && (
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sidebarRemainingGroups.map((sg) => {
                    const pal = getGroupColor(sg.color);
                    const sgStats = sumUnitsForAddresses(sg.items, calcBuildingProgress);
                    return (
                      <div
                        key={sg.label}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'text/plain',
                            JSON.stringify({
                              type: 'sidebar_group',
                              title: sg.label,
                              color: sg.color,
                              ids: sg.items.map((a) => a.id),
                            })
                          );
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 6,
                          background: '#ffffff',
                          border: `1px solid ${pal.border}`,
                          borderLeft: `3.5px solid ${pal.accent}`,
                          cursor: 'grab',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#0f172a',
                        }}
                        title="Diese gesamte Gruppe direkt auf das Whiteboard ziehen!"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <GripVertical size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                            {sg.label}
                          </span>
                          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: pal.header, color: pal.text, flexShrink: 0 }}>
                            {sg.items.length} Obj. · {sgStats.totalWe} WE ({sgStats.taCount} TA)
                          </span>
                        </div>
                        <AusbauTypSumBadges stats={sgStats} compact />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {sidebarObjects.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
              {remainingObjects.length === 0
                ? 'Alle Objekte haben TA, Flex, HÜP & Spleißen abgeschlossen!'
                : 'Keine passenden offenen Objekte gefunden.'}
            </div>
          ) : (() => {
            const activeGrpMap = new Map(groups.map((g) => [g.id, g]));
            const ungroupedSidebarObjs = sidebarObjects.filter((a) => !cards[a.id]?.groupId || !activeGrpMap.has(cards[a.id].groupId));
            const groupedSidebarObjs = sidebarObjects.filter((a) => cards[a.id]?.groupId && activeGrpMap.has(cards[a.id].groupId));

            const renderSidebarObjCard = (addr, isUngrouped) => {
              const core = getRemainingCoreWorks(addr, calcBuildingProgress);
              const isOnBoard = Boolean(cards[addr.id]);
              const isSelected = selectedIds.includes(addr.id);
              const parentGroup = cards[addr.id]?.groupId ? activeGrpMap.get(cards[addr.id].groupId) : null;
              return (
                <div
                  key={addr.id}
                  draggable
                  onClick={(e) => toggleSelectObject(addr.id, e)}
                  onDragStart={(e) => {
                    const dragPayload =
                      isSelected && selectedIds.length > 1
                        ? JSON.stringify({ type: 'multi_addrs', ids: selectedIds })
                        : addr.id;
                    e.dataTransfer.setData('text/plain', dragPayload);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  style={{
                    padding: '8px 9px',
                    borderRadius: 8,
                    background: isSelected
                      ? '#eff6ff'
                      : isUngrouped
                      ? '#fffaf5'
                      : '#f8fafc',
                    border: isSelected
                      ? '2px solid #2563eb'
                      : isUngrouped
                      ? '1.5px solid #fdba74'
                      : '1px solid #e2e8f0',
                    borderLeft: isSelected
                      ? '4px solid #2563eb'
                      : isUngrouped
                      ? '4px solid #FF6B00'
                      : '3px solid #cbd5e1',
                    boxShadow: isSelected
                      ? '0 0 0 2px rgba(37,99,235,0.18)'
                      : isUngrouped
                      ? '0 2px 6px rgba(255, 107, 0, 0.08)'
                      : 'none',
                    opacity: isUngrouped || isSelected ? 1 : 0.8,
                    cursor: 'grab',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                  title="Cmd/Ctrl + Klick für Mehrfachauswahl · Auf das Whiteboard ziehen oder + Board klicken"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: isUngrouped ? 900 : 600, fontSize: isUngrouped ? 12.5 : 11.5, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {addr.strasse} {addr.hausnummer}
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: isUngrouped ? 600 : 400, color: isUngrouped ? '#475569' : '#64748b' }}>
                        {addr.ort || '—'} {addr.ausbautermin ? `· ${addr.ausbautermin}` : ''}
                      </div>
                    </div>
                    {parentGroup ? (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: '#15803d',
                          background: '#dcfce7',
                          padding: '2px 6px',
                          borderRadius: 4,
                          maxWidth: 96,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                        title={`In Gruppe: ${parentGroup.name}`}
                      >
                        {parentGroup.name}
                      </span>
                    ) : isOnBoard ? (
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: '#c2410c', background: '#ffedd5', border: '1px solid #fdba74', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                        Ohne Gruppe
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handlePlaceSingleOnBoard(addr.id);
                        }}
                        style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, border: '1px solid #FF6B00', background: '#FF6B00', color: '#ffffff', cursor: 'pointer', flexShrink: 0 }}
                      >
                        + Board
                      </button>
                    )}
                  </div>

                  {/* Quick Remaining Work Badges + Ausbau-Typ & WE */}
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(() => {
                      const typ = classifyAusbauTyp(addr);
                      return (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: typ.bg,
                            color: typ.color,
                            border: `1px solid ${typ.border}`,
                          }}
                        >
                          {typ.shortLabel} ({core.taCount}/{core.totalWe} WE)
                        </span>
                      );
                    })()}
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.taDone ? '#dcfce7' : '#fef2f2', color: core.taDone ? '#15803d' : '#dc2626' }}>
                      {core.taDone ? '✓' : '✗'} TA
                    </span>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleToggleCoreFlag(addr, 'flexrohr', core.flexDone);
                      }}
                      style={{ border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.flexDone ? '#dcfce7' : '#fef2f2', color: core.flexDone ? '#15803d' : '#dc2626' }}
                    >
                      {core.flexDone ? '✓' : '✗'} Flex
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleToggleCoreFlag(addr, 'huep_installiert', core.huepDone);
                      }}
                      style={{ border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.huepDone ? '#dcfce7' : '#fef2f2', color: core.huepDone ? '#15803d' : '#dc2626' }}
                    >
                      {core.huepDone ? '✓' : '✗'} HÜP
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleToggleCoreFlag(addr, 'spleissen_fertig', core.spleissenDone);
                      }}
                      style={{ border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.spleissenDone ? '#dcfce7' : '#fef2f2', color: core.spleissenDone ? '#15803d' : '#dc2626' }}
                    >
                      {core.spleissenDone ? '✓' : '✗'} Spleiß
                    </button>
                  </div>
                </div>
              );
            };

            const ungrpStats = sumUnitsForAddresses(ungroupedSidebarObjs, calcBuildingProgress);
            const grpStats = sumUnitsForAddresses(groupedSidebarObjs, calcBuildingProgress);
            return (
              <>
                {ungroupedSidebarObjs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <strong style={{ fontSize: 10.5, fontWeight: 900, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          ● Nicht gruppiert ({ungroupedSidebarObjs.length})
                        </strong>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: '#c2410c', background: '#fff7ed', border: '1px solid #fdba74', padding: '1px 6px', borderRadius: 999 }}>
                          {ungrpStats.totalWe} WE ({ungrpStats.taCount} TA)
                        </span>
                      </div>
                      <AusbauTypSumBadges stats={ungrpStats} compact />
                    </div>
                    {ungroupedSidebarObjs.map((addr) => renderSidebarObjCard(addr, true))}
                  </div>
                )}

                {groupedSidebarObjs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: ungroupedSidebarObjs.length > 0 ? 6 : 0, paddingTop: ungroupedSidebarObjs.length > 0 ? 6 : 0, borderTop: ungroupedSidebarObjs.length > 0 ? '1px dashed #cbd5e1' : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Bereits gruppiert ({groupedSidebarObjs.length})
                        </span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 6px', borderRadius: 999 }}>
                          {grpStats.totalWe} WE ({grpStats.taCount} TA)
                        </span>
                      </div>
                      <AusbauTypSumBadges stats={grpStats} compact />
                    </div>
                    {groupedSidebarObjs.map((addr) => renderSidebarObjCard(addr, false))}
                  </div>
                )}
              </>
            );
          })()}

          {/* Separated Groups in Whiteboard Sidebar: Fertig (Bereit f. RE), Rechnung erstellt, Rechnung erhalten */}
          {[
            {
              key: 'ready',
              title: '✓ Fertig — Bereit f. RE',
              items: completedUnbilledObjects,
              open: showCompletedSidebarGroup,
              toggle: () => setShowCompletedSidebarGroup((v) => !v),
              bg: '#f0fdf4',
              headerBg: '#dcfce7',
              border: '#86efac',
              text: '#14532d',
              sub: '✓ TA · Flex · HÜP · Spl komplett',
            },
            {
              key: 'invoiced',
              title: '📄 Rechnung erstellt — Offen',
              items: invoicedObjects,
              open: showInvoicedSidebarGroup,
              toggle: () => setShowInvoicedSidebarGroup((v) => !v),
              bg: '#eff6ff',
              headerBg: '#dbeafe',
              border: '#93c5fd',
              text: '#1e3a8a',
              sub: '📄 Abgerechnet · Zahlung offen',
            },
            {
              key: 'paid',
              title: '💰 Rechnung erhalten / bezahlt',
              items: paidObjects,
              open: showPaidSidebarGroup,
              toggle: () => setShowPaidSidebarGroup((v) => !v),
              bg: '#ecfdf5',
              headerBg: '#d1fae5',
              border: '#6ee7b7',
              text: '#065f46',
              sub: '💰 Bezahlt / Erhalten',
            },
          ]
            .filter((g) => g.items.length > 0)
            .map((grp) => {
              const gStats = sumUnitsForAddresses(grp.items, calcBuildingProgress);
              return (
              <div key={grp.key} style={{ marginTop: 6, borderRadius: 8, border: `1px solid ${grp.border}`, background: grp.bg, overflow: 'hidden', flexShrink: 0 }}>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'text/plain',
                      JSON.stringify({
                        type: 'sidebar_group',
                        title: grp.title,
                        color: grp.key === 'invoiced' ? 'blue' : 'emerald',
                        ids: grp.items.map((a) => a.id),
                      })
                    );
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={grp.toggle}
                  style={{
                    width: '100%',
                    padding: '7px 9px',
                    background: grp.headerBg,
                    borderBottom: grp.open ? `1px solid ${grp.border}` : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    cursor: 'grab',
                    fontSize: 11,
                    fontWeight: 800,
                    color: grp.text,
                  }}
                  title="Ganze Gruppe direkt auf das Whiteboard ziehen oder klicken zum Auf-/Zuklappen"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <GripVertical size={12} />
                      <span>{grp.title} ({grp.items.length})</span>
                      <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 999, background: '#fff', border: `1px solid ${grp.border}` }}>
                        {gStats.totalWe} WE · {gStats.taCount} TA
                      </span>
                    </span>
                    <AusbauTypSumBadges stats={gStats} compact />
                  </div>
                  <span>{grp.open ? '▲' : '▼'}</span>
                </div>
                {grp.open && (
                  <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {grp.items.map((addr) => {
                      const isOnBoard = Boolean(cards[addr.id]);
                      return (
                        <div
                          key={addr.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', addr.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            background: '#ffffff',
                            border: `1px solid ${grp.border}`,
                            cursor: 'grab',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 11.5, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {addr.strasse} {addr.hausnummer}
                            </div>
                            <div style={{ fontSize: 10, color: grp.text, fontWeight: 600 }}>
                              {grp.sub} {addr.ort ? `· ${addr.ort}` : ''}
                            </div>
                          </div>
                          {isOnBoard ? (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: grp.text, background: grp.headerBg, padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}>
                              Board
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePlaceSingleOnBoard(addr.id)}
                              style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, border: `1px solid ${grp.border}`, background: grp.headerBg, color: grp.text, cursor: 'pointer', flexShrink: 0 }}
                            >
                              + Board
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
        </div>
      </div>

      {/* ===================================================================
          RIGHT SECTION: INTERACTIVE FREEFORM PLANNING WHITEBOARD
         =================================================================== */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f1f5f9' }}>
        {/* Whiteboard Top Action Bar */}
        <div
          style={{
            padding: '8px 12px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => handleCreateGroup()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <FolderPlus size={13} /> + Neue Gruppe
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleAutoGroupByRemaining}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderColor: '#fdba74', background: '#fff7ed', color: '#c2410c', fontWeight: 700 }}
              title="Erstellt automatisch Gruppen nach den exakten offenen Arbeiten (TA, Flex, HÜP, Spleißen)"
            >
              <Wand2 size={13} /> Auto-Gruppieren nach Restarbeit
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handlePlaceAllOnBoard}
            >
              Alle offenen aufs Board
            </button>

            {/* Overall Whiteboard Ausbau-Typ Sum (Metalkanal vs Leerrohr/Kaminkanal) */}
            {(() => {
              const boardAddrs = activeBoardCardEntries.map((e) => e.addr);
              const targetAddrs = boardAddrs.length > 0 ? boardAddrs : remainingObjects;
              const wbStats = sumUnitsForAddresses(targetAddrs, calcBuildingProgress);
              return (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#334155' }}>
                    {boardAddrs.length > 0 ? `Auf Board (${wbStats.count} Obj. · ${wbStats.totalWe} WE):` : `Offen (${wbStats.count} Obj. · ${wbStats.totalWe} WE):`}
                  </span>
                  <AusbauTypSumBadges stats={wbStats} compact showZero />
                </div>
              );
            })()}

            {/* Multi-Selection Actions in Whiteboard Toolbar */}
            {selectedIds.length > 0 && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 8,
                  background: '#eff6ff',
                  border: '1.5px solid #2563eb',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: '#1e3a8a' }}>
                  {selectedIds.length} ausgewählt
                </span>
                <button
                  type="button"
                  onClick={handleCreateGroupFromSelection}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Gruppe aus Auswahl
                </button>
                {groups.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleMoveSelectedToGroup(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    style={{ padding: '3px 6px', fontSize: 11, borderRadius: 6, border: '1px solid #93c5fd', background: '#fff', color: '#1e3a8a', fontWeight: 700 }}
                  >
                    <option value="" disabled>In Gruppe verschieben…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  style={{ border: 'none', background: 'transparent', color: '#1e3a8a', cursor: 'pointer', fontWeight: 800, fontSize: 11 }}
                  title="Auswahl aufheben (Esc)"
                >
                  ×
                </button>
              </div>
            )}

            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm('Whiteboard-Layout leeren? (Objekte bleiben in der linken Liste erhalten.)')) {
                  updateBoard([], {});
                  setSelectedIds([]);
                }
              }}
              title="Whiteboard leeren"
            >
              <RotateCcw size={12} /> Leeren
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                padding: '3px 8px',
                borderRadius: 6,
                background: isSpacePressed ? '#fef9c3' : '#f8fafc',
                border: `1px solid ${isSpacePressed ? '#eab308' : '#e2e8f0'}`,
                color: isSpacePressed ? '#a16207' : '#64748b',
                fontWeight: 600,
              }}
              title="Tastatur- & Maus-Steuerung auf dem Whiteboard"
            >
              {isSpacePressed
                ? '✋ Leertaste aktiv: Klicken & Ziehen zum Verschieben'
                : 'Maus ziehen: Auswahl · Cmd/Ctrl+Klick: Multi · Leertaste+Ziehen: Pan · Alt+Scroll: Zoom'}
            </span>
            <span style={{ fontSize: 11, color: saveState === 'saving' ? '#ea580c' : '#16a34a', fontWeight: 700 }}>
              {saveState === 'saving' ? 'Speichert…' : 'Gespeichert ✓'}
            </span>
            <button type="button" className="btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.1).toFixed(2))))} title="Herauszoomen (Alt + Mausrad)">
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              style={{ border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, minWidth: 42, textAlign: 'center', cursor: 'pointer', color: '#0f172a' }}
              title="Auf 100% zurücksetzen (Alt + Mausrad zum Zoomen)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => setZoom((z) => Math.min(1.75, Number((z + 0.1).toFixed(2))))} title="Hineinzoomen (Alt + Mausrad)">
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        {/* Scrollable Dot-Grid Whiteboard Canvas (Alt+Scroll: Zoom, Space+Drag: Pan, Drag: Marquee Selection) */}
        <div
          ref={viewportRef}
          onPointerDownCapture={(e) => {
            if (isSpacePressed) handleCanvasPointerDown(e);
          }}
          style={{
            flex: 1,
            overflow: 'auto',
            position: 'relative',
            cursor: isPanning ? 'grabbing' : isSpacePressed ? 'grab' : 'default',
          }}
        >
          <div
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleCanvasDrop(e, null)}
            style={{
              position: 'relative',
              width: 1850,
              height: 1350,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              backgroundImage: 'radial-gradient(#cbd5e1 1.25px, transparent 1.25px)',
              backgroundSize: '22px 22px',
              backgroundColor: '#f8fafc',
              cursor: isPanning ? 'grabbing' : isSpacePressed ? 'grab' : 'default',
            }}
          >
            {/* Live Marquee Selection Box */}
            {marqueeBox && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(marqueeBox.startX, marqueeBox.curX),
                  top: Math.min(marqueeBox.startY, marqueeBox.curY),
                  width: Math.abs(marqueeBox.curX - marqueeBox.startX),
                  height: Math.abs(marqueeBox.curY - marqueeBox.startY),
                  background: 'rgba(37, 99, 235, 0.12)',
                  border: '1.5px dashed #2563eb',
                  borderRadius: 6,
                  pointerEvents: 'none',
                  zIndex: 90,
                }}
              />
            )}
            {/* Empty State Hint */}
            {boardLoaded && groups.length === 0 && activeBoardCardEntries.length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: 60,
                  top: 60,
                  maxWidth: 460,
                  padding: '20px 24px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.92)',
                  border: '1.5px dashed #cbd5e1',
                  color: '#475569',
                }}
              >
                <strong style={{ fontSize: 14.5, color: '#0f172a', display: 'block', marginBottom: 6 }}>
                  Restarbeiten-Whiteboard & Planungsfläche
                </strong>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5 }}>
                  Ziehen Sie offene Objekte aus der linken Seitenleiste direkt auf das Whiteboard, erstellen Sie benannte Gruppen nach Restarbeiten (z. B. „Nur Spleißen“ oder „Flex + HÜP“), oder nutzen Sie <strong>Auto-Gruppieren nach Restarbeit</strong>.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-primary btn-sm" onClick={handleAutoGroupByRemaining}>
                    <Wand2 size={13} /> Auto-Gruppieren starten
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => handleCreateGroup('Nur Spleißen offen', 'orange')}>
                    + Erste Gruppe erstellen
                  </button>
                </div>
              </div>
            )}

            {/* Named Draggable & Resizable Groups (Zones) */}
            {groups.map((grp) => {
              const pal = getGroupColor(grp.color);
              const memberEntries = activeBoardCardEntries.filter((e) => e.pos.groupId === grp.id);
              const memberStats = sumUnitsForAddresses(
                memberEntries.map((e) => e.addr),
                calcBuildingProgress
              );
              const isDropTarget = dragOverGroupId === grp.id;

              return (
                <div
                  key={grp.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragOverGroupId !== grp.id) setDragOverGroupId(grp.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverGroupId === grp.id) setDragOverGroupId(null);
                  }}
                  onDrop={(e) => handleCanvasDrop(e, grp.id)}
                  style={{
                    position: 'absolute',
                    left: grp.x,
                    top: grp.y,
                    width: grp.width,
                    minHeight: grp.height,
                    background: pal.bg,
                    border: isDropTarget ? `2.5px dashed ${pal.accent}` : `1.5px solid ${pal.border}`,
                    borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 10,
                  }}
                >
                  {/* Group Header (Drag to move group) */}
                  <div
                    onPointerDown={(e) => startGroupDrag(e, grp.id)}
                    style={{
                      padding: '8px 10px',
                      background: pal.header,
                      borderBottom: `1px solid ${pal.border}`,
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      cursor: 'grab',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                        <GripVertical size={14} style={{ color: pal.text, flexShrink: 0 }} />
                        {editingGroupId === grp.id ? (
                          <input
                            autoFocus
                            value={grp.name}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGroups((prev) => prev.map((g) => (g.id === grp.id ? { ...g, name: val } : g)));
                            }}
                            onBlur={() => {
                              setEditingGroupId(null);
                              updateBoard((prevG) => prevG, (prevC) => prevC);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingGroupId(null);
                                updateBoard((prevG) => prevG, (prevC) => prevC);
                              }
                            }}
                            style={{ flex: 1, padding: '2px 6px', fontSize: 12.5, fontWeight: 800, borderRadius: 5, border: `1px solid ${pal.accent}`, background: '#fff', color: '#0f172a' }}
                          />
                        ) : (
                          <strong
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingGroupId(grp.id);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingGroupId(grp.id);
                            }}
                            style={{ fontSize: 12.5, fontWeight: 800, color: pal.text, cursor: 'text', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title="Klicken zum Umbenennen"
                          >
                            {grp.name}
                          </strong>
                        )}
                        <span
                          style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#fff', color: pal.text, border: `1px solid ${pal.border}`, flexShrink: 0 }}
                          title={`Objekte: ${memberEntries.length} · Summe Wohneinheiten: ${memberStats.totalWe} WE · Installierte TAs: ${memberStats.taCount} TA`}
                        >
                          {memberEntries.length} Obj. · {memberStats.totalWe} WE ({memberStats.taCount} TA)
                        </span>
                      </div>

                      {/* Color dots + Delete Group */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
                        {GROUP_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              updateBoard(
                                (prev) => prev.map((g) => (g.id === grp.id ? { ...g, color: c.id } : g)),
                                (prevC) => prevC
                              )
                            }
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: 999,
                              border: grp.color === c.id ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.2)',
                              background: c.accent,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            title={`Farbe: ${c.name}`}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(grp.id)}
                          style={{ border: 'none', background: 'transparent', color: pal.text, cursor: 'pointer', padding: 2 }}
                          title="Gruppe entfernen (Objekte bleiben erhalten)"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Differentiated Ausbau-Typ Sum inside Whiteboard Group (Metalkanal vs Leerrohr/Kaminkanal) */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}
                    >
                      <AusbauTypSumBadges stats={memberStats} compact showZero />
                    </div>

                    {/* Group Bulk Assignment & Planning Bar */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
                    >
                      <select
                        value={grp.team || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateBoard(
                            (prev) => prev.map((g) => (g.id === grp.id ? { ...g, team: val } : g)),
                            (prevC) => prevC
                          );
                        }}
                        style={{ flex: 1, minWidth: 105, padding: '3px 5px', fontSize: 10.5, borderRadius: 5, border: `1px solid ${pal.border}`, background: '#fff' }}
                      >
                        <option value="">Team planen…</option>
                        {fieldTeams.map((t) => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <div style={{ width: 112 }}>
                        <MinimalDatePicker
                          value={grp.plannedDate || ''}
                          onChange={(val) =>
                            updateBoard(
                              (prev) => prev.map((g) => (g.id === grp.id ? { ...g, plannedDate: val } : g)),
                              (prevC) => prevC
                            )
                          }
                          placeholder="Termin…"
                          compact
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyGroupPlanToObjects(grp)}
                        style={{
                          padding: '3px 7px',
                          borderRadius: 5,
                          fontSize: 10.5,
                          fontWeight: 700,
                          border: 'none',
                          background: pal.accent,
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                        title="Ausgewähltes Team & Termin auf alle Objekte in dieser Gruppe anwenden"
                      >
                        Anwenden
                      </button>
                    </div>
                  </div>

                  {/* Group Body (Cards inside this Group) */}
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {memberEntries.length === 0 ? (
                      <div style={{ padding: 18, textAlign: 'center', fontSize: 11.5, color: pal.text, opacity: 0.75, border: `1px dashed ${pal.border}`, borderRadius: 8 }}>
                        Objekte hierher ziehen
                      </div>
                    ) : (
                      memberEntries.map(({ addr, pos }) => renderWhiteboardCard(addr, pos, true))
                    )}
                  </div>

                  {/* Resize Handle */}
                  <div
                    onPointerDown={(e) => startGroupResize(e, grp.id)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: 16,
                      height: 16,
                      cursor: 'nwse-resize',
                      borderBottomRightRadius: 10,
                      background: `linear-gradient(135deg, transparent 50%, ${pal.border} 50%)`,
                    }}
                    title="Größe ändern"
                  />
                </div>
              );
            })}

            {/* Freeform Draggable Object Cards (not attached to a group) */}
            {freeformCards.map(({ addr, pos }) => renderWhiteboardCard(addr, pos, false))}
          </div>
        </div>
      </div>

      {wbSplitModalAddr && (
        <TeamSplitModal
          addr={wbSplitModalAddr}
          fieldTeams={fieldTeams}
          onSave={(teamLabel, alloc) => {
            onPatchBuilding(wbSplitModalAddr.id, { team: teamLabel, team_allocations: alloc });
            showToast?.('Team-Aufteilung & Cost Center gespeichert');
          }}
          onClose={() => setWbSplitModalAddr(null)}
        />
      )}
    </div>
  );
}

/* =============================================================================
   INLINE QUICK-EDIT MODAL (USED BY CALENDAR VIEW)
============================================================================= */
function ObjectQuickEditModal({
  addr,
  fieldTeams,
  calcBuildingProgress,
  MinimalDatePicker,
  BUILDING_STATUS_OPTIONS,
  onPatchBuilding,
  onUnitChange,
  onOpenDetail,
  onClose,
}) {
  const [showSplitModal, setShowSplitModal] = useState(false);
  const core = getRemainingCoreWorks(addr, calcBuildingProgress);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9995,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <strong style={{ fontSize: 15, color: '#0f172a' }}>
              {addr.strasse} {addr.hausnummer}
            </strong>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {addr.plz} {addr.ort} · {addr.project_name || 'UGG'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Core 4 Toggles */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
            Arbeit Abschluss-Check (TA, Flex, HÜP, Spleißen)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <div
              style={{
                padding: '6px 6px',
                borderRadius: 7,
                textAlign: 'center',
                fontSize: 11.5,
                fontWeight: 700,
                background: core.taDone ? '#dcfce7' : '#fef2f2',
                color: core.taDone ? '#15803d' : '#dc2626',
                border: `1px solid ${core.taDone ? '#86efac' : '#fecaca'}`,
              }}
            >
              TA {core.taCount}/{core.totalWe}
            </div>
            {[
              { key: 'flexrohr', label: 'Flex', done: core.flexDone },
              { key: 'huep_installiert', label: 'HÜP', done: core.huepDone },
              { key: 'spleissen_fertig', label: 'Spleißen', done: core.spleissenDone },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onPatchBuilding(addr.id, { [c.key]: !c.done })}
                style={{
                  padding: '6px 6px',
                  borderRadius: 7,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: c.done ? '#dcfce7' : '#fef2f2',
                  color: c.done ? '#15803d' : '#dc2626',
                  border: `1px solid ${c.done ? '#86efac' : '#fecaca'}`,
                }}
              >
                {c.done ? '✓ ' : ''}{c.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Ausbau Team</label>
              <button
                type="button"
                onClick={() => setShowSplitModal(true)}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 5,
                  border: '1px solid #fdba74',
                  background: '#fff7ed',
                  color: '#c2410c',
                  cursor: 'pointer',
                }}
              >
                2+ Teams / % &amp; Tasks
              </button>
            </div>
            <select
              value={addr.team || ''}
              onChange={(e) => onPatchBuilding(addr.id, { team: e.target.value, team_allocations: {} })}
              style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              <option value="">Kein Team</option>
              {addr.team && !fieldTeams.some((t) => t.name === addr.team) && (
                <option value={addr.team}>{addr.team}</option>
              )}
              {fieldTeams.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Status</label>
            <select
              value={addr.building_status || 'Ausbau terminiert'}
              onChange={(e) => onPatchBuilding(addr.id, { building_status: e.target.value })}
              style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              {BUILDING_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Ausbau Datum</label>
            <MinimalDatePicker
              value={addr.ausbautermin || ''}
              onChange={(val) => onPatchBuilding(addr.id, { ausbautermin: val })}
              placeholder="TT.MM.JJJJ"
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Restarbeit Termin</label>
            <MinimalDatePicker
              value={addr.restarbeit_termin || ''}
              onChange={(val) => onPatchBuilding(addr.id, { restarbeit_termin: val })}
              placeholder="TT.MM.JJJJ"
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Schließen
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={onOpenDetail}>
            Vollständige Akte öffnen →
          </button>
        </div>
      </div>

      {showSplitModal && (
        <TeamSplitModal
          addr={addr}
          fieldTeams={fieldTeams}
          onSave={(teamLabel, alloc) => {
            onPatchBuilding(addr.id, { team: teamLabel, team_allocations: alloc });
          }}
          onClose={() => setShowSplitModal(false)}
        />
      )}
    </div>
  );
}
