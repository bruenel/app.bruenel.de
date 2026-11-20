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
              ) : (
                filteredUnscheduled.map((addr) => {
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
                        background: '#fff',
                        border: '1px solid #e2e8f0',
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
                      {core.remaining.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                          {core.remaining.map((r) => (
                            <span key={r} style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
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

        {/* Quick Team + Ausbau Datum */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'center' }}>
          <select
            value={addr.team || ''}
            onChange={(e) => onPatchBuilding(addr.id, { team: e.target.value })}
            style={{ padding: '4px 6px', fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
          >
            <option value="">Kein Team</option>
            {fieldTeams.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
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
        <span style={{ fontSize: 11.5, color: '#64748b' }}>
          {subView === 'kanban' ? 'Karten zwischen Spalten ziehen, um den Status direkt zu ändern.' : `${addresses.length} Objekte`}
        </span>
      </div>

      {subView === 'kanban' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BUILDING_STATUS_OPTIONS.length}, minmax(240px, 1fr))`, gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {BUILDING_STATUS_OPTIONS.map((st) => {
            const colItems = addresses.filter((a) => (a.building_status || 'Ausbau terminiert') === st);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>
                  <strong style={{ fontSize: 12, color: '#0f172a' }}>{st}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#e2e8f0', color: '#334155' }}>
                    {colItems.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 620, overflowY: 'auto' }}>
                  {colItems.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {addresses.map(renderCard)}
        </div>
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
  // Only show remaining (incomplete) objects in the Whiteboard tracker
  const remainingObjects = useMemo(
    () => allAddresses.filter((a) => !isCoreArbeitCompleted(a, calcBuildingProgress)),
    [allAddresses, calcBuildingProgress]
  );
  const completedCount = allAddresses.length - remainingObjects.length;

  const remainingById = useMemo(() => {
    const m = new Map();
    remainingObjects.forEach((a) => m.set(a.id, a));
    return m;
  }, [remainingObjects]);

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

  const canvasRef = useRef(null);
  const saveTimerRef = useRef(null);

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

    return [...list].sort((a, b) => {
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
  }, [remainingObjects, sidebarSearch, sidebarFilter, sidebarSort, cards, calcBuildingProgress, dateValueForSort]);

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

  // Auto-group all remaining objects by their exact remaining work combination
  const handleAutoGroupByRemaining = () => {
    if (remainingObjects.length === 0) {
      showToast?.('Keine offenen Objekte vorhanden.');
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

    const nextGroups = [];
    const nextCards = {};
    let idx = 0;
    buckets.forEach((items, label) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const grpId = `grp_auto_${idx}_${Date.now()}`;
      const gx = 28 + col * 390;
      const gy = 28 + row * 420;
      const neededHeight = Math.max(280, 110 + items.length * 142);

      nextGroups.push({
        id: grpId,
        name: label,
        color: GROUP_COLORS[idx % GROUP_COLORS.length].id,
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
    showToast?.(`${remainingObjects.length} offene Objekte in ${nextGroups.length} Restarbeit-Gruppen sortiert`);
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
      (cid) => cards[cid]?.groupId === group.id && remainingById.has(cid)
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

  // HTML5 Drop from Left Sidebar onto Canvas or directly into a Group
  const handleCanvasDrop = (e, targetGroupId = null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupId(null);
    const addrId = e.dataTransfer.getData('text/plain');
    if (!addrId || !remainingById.has(addrId)) return;

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const dropX = Math.max(12, Math.round((e.clientX - rect.left) / zoom - 150));
    const dropY = Math.max(12, Math.round((e.clientY - rect.top) / zoom - 30));

    // Detect if dropped inside a group even if dropped on canvas
    let resolvedGroupId = targetGroupId;
    if (!resolvedGroupId) {
      const hit = groups.find(
        (g) => dropX + 100 >= g.x && dropX + 100 <= g.x + g.width && dropY + 25 >= g.y && dropY + 25 <= g.y + g.height
      );
      if (hit) resolvedGroupId = hit.id;
    }

    updateBoard(
      (prevG) => prevG,
      (prevC) => ({
        ...prevC,
        [addrId]: { x: dropX, y: dropY, groupId: resolvedGroupId },
      })
    );
  };

  // Pointer-based smooth dragging for FREEFORM CARDS on the canvas
  const startCardDrag = (e, addrId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = cards[addrId] || { x: 40, y: 40, groupId: null };
    let latestX = orig.x;
    let latestY = orig.y;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      latestX = Math.max(8, Math.round(orig.x + dx));
      latestY = Math.max(8, Math.round(orig.y + dy));
      setCards((prev) => ({
        ...prev,
        [addrId]: { ...prev[addrId], x: latestX, y: latestY },
      }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Snap groupId based on card center
      const centerX = latestX + 150;
      const centerY = latestY + 50;
      const hitGroup = groups.find(
        (g) => centerX >= g.x && centerX <= g.x + g.width && centerY >= g.y && centerY <= g.y + g.height
      );
      updateBoard(
        (prevG) => prevG,
        (prevC) => ({
          ...prevC,
          [addrId]: { x: latestX, y: latestY, groupId: hitGroup ? hitGroup.id : null },
        })
      );
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      showToast?.(`✓ ${addr.strasse} ${addr.hausnummer}: TA, Flex, HÜP & Spleißen komplett — aus offener Liste entfernt!`);
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
      showToast?.(`✓ ${addr.strasse} ${addr.hausnummer}: TA, Flex, HÜP & Spleißen komplett — aus offener Liste entfernt!`);
    }
  };

  // Cards currently on the whiteboard (only those still incomplete)
  const activeBoardCardEntries = useMemo(() => {
    return Object.entries(cards)
      .filter(([addrId]) => remainingById.has(addrId))
      .map(([addrId, pos]) => ({ addr: remainingById.get(addrId), pos }));
  }, [cards, remainingById]);

  // Separate freeform cards (not in a group) vs grouped cards
  const freeformCards = activeBoardCardEntries.filter((e) => !e.pos.groupId || !groups.some((g) => g.id === e.pos.groupId));

  // Render an In-Place Editable Whiteboard Object Card
  const renderWhiteboardCard = (addr, pos, isInsideGroup = false) => {
    const core = getRemainingCoreWorks(addr, calcBuildingProgress);
    const isTaExpanded = expandedTaCardId === addr.id;
    const isEditExpanded = expandedEditCardId === addr.id;
    const units = Array.isArray(addr.units) ? addr.units : [];

    return (
      <div
        key={addr.id}
        style={{
          position: isInsideGroup ? 'relative' : 'absolute',
          left: isInsideGroup ? undefined : pos.x,
          top: isInsideGroup ? undefined : pos.y,
          width: isInsideGroup ? '100%' : 312,
          background: '#ffffff',
          border: `1.5px solid ${core.remainingCount === 1 ? '#fb923c' : '#cbd5e1'}`,
          borderRadius: 10,
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.09)',
          zIndex: isEditExpanded || isTaExpanded ? 40 : 20,
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
              e.dataTransfer.setData('text/plain', addr.id);
              e.dataTransfer.effectAllowed = 'move';
            }
          }}
          style={{
            padding: '7px 9px',
            background: '#f8fafc',
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
              <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {addr.strasse} {addr.hausnummer}
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

          {/* Compact Meta Row: Team & Restarbeit Termin */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10.5, color: '#475569' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
              <Users size={11} style={{ color: '#64748b' }} />
              {addr.team || 'Kein Team'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, color: addr.restarbeit_termin ? '#c2410c' : '#94a3b8' }}>
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
                  <label style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Team zuweisen</label>
                  <select
                    value={addr.team || ''}
                    onChange={(e) => onPatchBuilding(addr.id, { team: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: 11, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Kein Team</option>
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

              {/* Extra Flags */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { key: 'metalkanal_installiert', label: 'Metalkanal' },
                  { key: 'upload_done', label: 'Fotos' },
                  { key: 'genehmigt', label: 'Genehmigt' },
                ].map((f) => {
                  const on = Boolean(addr[f.key]);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => onPatchBuilding(addr.id, { [f.key]: !on })}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 5,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${on ? '#86efac' : '#cbd5e1'}`,
                        background: on ? '#dcfce7' : '#fff',
                        color: on ? '#15803d' : '#475569',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 12.5, color: '#0f172a' }}>
              Offene Objekte ({remainingObjects.length})
            </strong>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 7px', borderRadius: 999 }}>
              ✓ {completedCount} komplett
            </span>
          </div>

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

        {/* Draggable Remaining Objects List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sidebarObjects.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
              {remainingObjects.length === 0
                ? 'Alle Objekte haben TA, Flex, HÜP & Spleißen abgeschlossen!'
                : 'Keine passenden offenen Objekte gefunden.'}
            </div>
          ) : (
            sidebarObjects.map((addr) => {
              const core = getRemainingCoreWorks(addr, calcBuildingProgress);
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
                    padding: '8px 9px',
                    borderRadius: 8,
                    background: isOnBoard ? '#f0fdf4' : '#ffffff',
                    border: `1px solid ${isOnBoard ? '#86efac' : '#e2e8f0'}`,
                    cursor: 'grab',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                  title="Auf das Whiteboard rechts ziehen oder + Board klicken"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {addr.strasse} {addr.hausnummer}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#64748b' }}>
                        {addr.ort || '—'} {addr.ausbautermin ? `· ${addr.ausbautermin}` : ''}
                      </div>
                    </div>
                    {isOnBoard ? (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                        Auf Board
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePlaceSingleOnBoard(addr.id)}
                        style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, border: '1px solid #fdba74', background: '#fff7ed', color: '#c2410c', cursor: 'pointer', flexShrink: 0 }}
                      >
                        + Board
                      </button>
                    )}
                  </div>

                  {/* Quick Remaining Work Badges */}
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.taDone ? '#dcfce7' : '#fef2f2', color: core.taDone ? '#15803d' : '#dc2626' }}>
                      {core.taDone ? '✓' : '✗'} TA
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleCoreFlag(addr, 'flexrohr', core.flexDone)}
                      style={{ border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.flexDone ? '#dcfce7' : '#fef2f2', color: core.flexDone ? '#15803d' : '#dc2626' }}
                    >
                      {core.flexDone ? '✓' : '✗'} Flex
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCoreFlag(addr, 'huep_installiert', core.huepDone)}
                      style={{ border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.huepDone ? '#dcfce7' : '#fef2f2', color: core.huepDone ? '#15803d' : '#dc2626' }}
                    >
                      {core.huepDone ? '✓' : '✗'} HÜP
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCoreFlag(addr, 'spleissen_fertig', core.spleissenDone)}
                      style={{ border: 'none', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: core.spleissenDone ? '#dcfce7' : '#fef2f2', color: core.spleissenDone ? '#15803d' : '#dc2626' }}
                    >
                      {core.spleissenDone ? '✓' : '✗'} Spleiß
                    </button>
                  </div>
                </div>
              );
            })
          )}
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
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm('Whiteboard-Layout leeren? (Objekte bleiben in der linken Liste erhalten.)')) {
                  updateBoard([], {});
                }
              }}
              title="Whiteboard leeren"
            >
              <RotateCcw size={12} /> Leeren
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: saveState === 'saving' ? '#ea580c' : '#16a34a', fontWeight: 700 }}>
              {saveState === 'saving' ? 'Speichert…' : 'Gespeichert ✓'}
            </span>
            <button type="button" className="btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(2))))}>
              <ZoomOut size={13} />
            </button>
            <span style={{ fontSize: 11, fontWeight: 700, minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}>
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        {/* Scrollable Dot-Grid Whiteboard Canvas */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div
            ref={canvasRef}
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
            }}
          >
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
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#fff', color: pal.text, border: `1px solid ${pal.border}`, flexShrink: 0 }}>
                          {memberEntries.length}
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
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Ausbau Team</label>
            <select
              value={addr.team || ''}
              onChange={(e) => onPatchBuilding(addr.id, { team: e.target.value })}
              style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              <option value="">Kein Team</option>
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
    </div>
  );
}
