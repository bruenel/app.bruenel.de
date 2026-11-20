import React, { useState, useMemo } from 'react';
import { Users, Percent, Layers, Plus, Trash2, X, Check } from 'lucide-react';

export const DEFAULT_STEP_WEIGHTS = {
  ta: 40,
  flex: 20,
  huep: 20,
  spleissen: 20,
};

export const WORK_STEP_DEFS = [
  { key: 'ta', label: 'TA Installation', defaultWeight: 40 },
  { key: 'flex', label: 'Flexrohr / Kanal', defaultWeight: 20 },
  { key: 'huep', label: 'HÜP installiert', defaultWeight: 20 },
  { key: 'spleissen', label: 'Spleißen fertig', defaultWeight: 20 },
];

/**
 * Resolves a team name to its Cost Center using fieldTeams.
 */
export function resolveTeamCostCenter(teamName, fieldTeams = []) {
  const clean = String(teamName || '').trim();
  if (!clean) return 'Nicht zugewiesen';
  const match = (fieldTeams || []).find(
    (t) => String(t?.name || '').trim().toLowerCase() === clean.toLowerCase()
  );
  if (match && String(match.cost_center || '').trim()) {
    return String(match.cost_center).trim();
  }
  return 'Allgemein / Intern';
}

/**
 * Returns normalized team & cost-center percentage shares for an object.
 * Output: Array<{ team: string, cost_center: string, percent: number, fraction: number, steps?: string[] }>
 * Always sums to 100% (fraction sums to 1.0).
 */
export function getObjectTeamShares(addr, fieldTeams = []) {
  const alloc = addr?.team_allocations;
  if (alloc && typeof alloc === 'object') {
    if (alloc.mode === 'steps' && alloc.steps && typeof alloc.steps === 'object') {
      const weights = { ...DEFAULT_STEP_WEIGHTS, ...(alloc.step_weights || {}) };
      const teamAcc = new Map();
      let totalAssignedWeight = 0;

      WORK_STEP_DEFS.forEach((st) => {
        const tName = String(alloc.steps[st.key] || '').trim();
        const w = Math.max(0, Number(weights[st.key] ?? st.defaultWeight));
        if (tName && w > 0) {
          totalAssignedWeight += w;
          if (!teamAcc.has(tName)) {
            teamAcc.set(tName, { team: tName, weight: 0, steps: [] });
          }
          const entry = teamAcc.get(tName);
          entry.weight += w;
          entry.steps.push(st.label);
        }
      });

      if (totalAssignedWeight > 0 && teamAcc.size > 0) {
        return Array.from(teamAcc.values()).map((entry) => {
          const pct = Number(((entry.weight / totalAssignedWeight) * 100).toFixed(1));
          return {
            team: entry.team,
            cost_center: resolveTeamCostCenter(entry.team, fieldTeams),
            percent: pct,
            fraction: entry.weight / totalAssignedWeight,
            steps: entry.steps,
          };
        });
      }
    }

    if (Array.isArray(alloc.splits) && alloc.splits.length > 0) {
      const valid = alloc.splits.filter((s) => String(s?.team || '').trim() && Number(s?.percent) > 0);
      const sumPct = valid.reduce((acc, s) => acc + Number(s.percent || 0), 0);
      if (valid.length > 0 && sumPct > 0) {
        return valid.map((s) => {
          const tName = String(s.team).trim();
          const pct = Number(((Number(s.percent) / sumPct) * 100).toFixed(1));
          return {
            team: tName,
            cost_center: String(s.cost_center || '').trim() || resolveTeamCostCenter(tName, fieldTeams),
            percent: pct,
            fraction: Number(s.percent) / sumPct,
          };
        });
      }
    }
  }

  // Default: single team from addr.team (100%)
  const singleTeam = String(addr?.team || '').trim();
  return [
    {
      team: singleTeam || 'Nicht zugewiesen',
      cost_center: resolveTeamCostCenter(singleTeam, fieldTeams),
      percent: 100,
      fraction: 1,
    },
  ];
}

export function formatTeamSummaryLabel(alloc, fallbackTeam = '') {
  const shares = getObjectTeamShares({ team: fallbackTeam, team_allocations: alloc }, []);
  if (shares.length === 0) return fallbackTeam || '';
  if (shares.length === 1) {
    return shares[0].team === 'Nicht zugewiesen' ? '' : shares[0].team;
  }
  return shares.map((s) => `${s.team} (${Math.round(s.percent)}%)`).join(' + ');
}

/* =============================================================================
   MODAL: MULTI-TEAM ASSIGNMENT & COST-SPLIT EDITOR
   Supports:
   1. Percentage Split (2+ Teams with exact % + quick 50/50, 60/40, 70/30 presets)
   2. Per Working Step (TA, Flex, HÜP, Spleißen assigned to specific teams)
============================================================================= */
export function TeamSplitModal({ addr, fieldTeams = [], onSave, onClose }) {
  const existing = addr?.team_allocations && typeof addr.team_allocations === 'object' ? addr.team_allocations : {};

  const [mode, setMode] = useState(existing.mode === 'steps' ? 'steps' : 'percentage');

  const [splits, setSplits] = useState(() => {
    if (Array.isArray(existing.splits) && existing.splits.length >= 2) {
      return existing.splits.map((s) => ({ team: s.team || '', percent: Number(s.percent || 0) }));
    }
    const primary = String(addr?.team || '').split('(')[0].trim();
    const secondDefault = fieldTeams.find((t) => t.name !== primary)?.name || '';
    return [
      { team: primary || fieldTeams[0]?.name || '', percent: 50 },
      { team: secondDefault, percent: 50 },
    ];
  });

  const [steps, setSteps] = useState(() => {
    const primary = String(addr?.team || '').split('(')[0].trim();
    return {
      ta: existing.steps?.ta || primary || '',
      flex: existing.steps?.flex || primary || '',
      huep: existing.steps?.huep || primary || '',
      spleissen: existing.steps?.spleissen || primary || '',
    };
  });

  const [stepWeights, setStepWeights] = useState(() => ({
    ...DEFAULT_STEP_WEIGHTS,
    ...(existing.step_weights || {}),
  }));

  const totalPct = useMemo(
    () => splits.reduce((acc, s) => acc + Number(s.percent || 0), 0),
    [splits]
  );

  const previewShares = useMemo(() => {
    const draftAlloc =
      mode === 'steps'
        ? { mode: 'steps', steps, step_weights: stepWeights }
        : { mode: 'percentage', splits };
    return getObjectTeamShares({ team: addr?.team, team_allocations: draftAlloc }, fieldTeams);
  }, [mode, splits, steps, stepWeights, addr?.team, fieldTeams]);

  const handleSave = () => {
    if (mode === 'percentage') {
      const valid = splits.filter((s) => String(s.team || '').trim() && Number(s.percent) > 0);
      if (valid.length === 0) {
        onSave('', {});
        onClose();
        return;
      }
      const alloc = {
        mode: 'percentage',
        splits: valid.map((s) => ({
          team: s.team,
          cost_center: resolveTeamCostCenter(s.team, fieldTeams),
          percent: Number(s.percent),
        })),
      };
      onSave(formatTeamSummaryLabel(alloc, addr?.team), alloc);
      onClose();
    } else {
      const alloc = {
        mode: 'steps',
        steps,
        step_weights: stepWeights,
      };
      onSave(formatTeamSummaryLabel(alloc, addr?.team), alloc);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(15, 23, 42, 0.55)',
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
          maxWidth: 560,
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 14.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} style={{ color: '#FF6B00' }} /> Team-Aufteilung &amp; Cost Center Split
            </strong>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>
              {addr?.strasse} {addr?.hausnummer}, {addr?.ort}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Mode Switcher */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setMode('percentage')}
              style={{
                padding: '9px 12px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: mode === 'percentage' ? '1.5px solid #FF6B00' : '1px solid #cbd5e1',
                background: mode === 'percentage' ? '#fff7ed' : '#f8fafc',
                color: mode === 'percentage' ? '#c2410c' : '#334155',
              }}
            >
              <Percent size={14} /> Prozent-Aufteilung (%)
            </button>
            <button
              type="button"
              onClick={() => setMode('steps')}
              style={{
                padding: '9px 12px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: mode === 'steps' ? '1.5px solid #FF6B00' : '1px solid #cbd5e1',
                background: mode === 'steps' ? '#fff7ed' : '#f8fafc',
                color: mode === 'steps' ? '#c2410c' : '#334155',
              }}
            >
              <Layers size={14} /> Nach Arbeitsschritt (TA/Flex/HÜP/Spl)
            </button>
          </div>

          {/* MODE 1: PERCENTAGE SPLIT */}
          {mode === 'percentage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
                  Teams &amp; Anteil (%) festlegen
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    [50, 50],
                    [60, 40],
                    [70, 30],
                  ].map(([a, b]) => (
                    <button
                      key={`${a}-${b}`}
                      type="button"
                      onClick={() =>
                        setSplits((prev) => [
                          { team: prev[0]?.team || '', percent: a },
                          { team: prev[1]?.team || '', percent: b },
                        ])
                      }
                      style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#334155' }}
                    >
                      {a}/{b}%
                    </button>
                  ))}
                </div>
              </div>

              {splits.map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 30px', gap: 8, alignItems: 'center' }}>
                  <select
                    value={row.team}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, team: val } : r)));
                    }}
                    style={{ padding: '7px 9px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Team auswählen…</option>
                    {fieldTeams.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}{t.cost_center ? ` (KST: ${t.cost_center})` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={row.percent}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, percent: Number.isNaN(val) ? 0 : val } : r)));
                      }}
                      style={{ width: '100%', padding: '7px 22px 7px 8px', fontSize: 12, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}
                    />
                    <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#64748b', fontWeight: 700 }}>%</span>
                  </div>
                  <button
                    type="button"
                    disabled={splits.length <= 1}
                    onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: '6px', cursor: splits.length <= 1 ? 'not-allowed' : 'pointer', opacity: splits.length <= 1 ? 0.4 : 1 }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setSplits((prev) => [...prev, { team: '', percent: Math.max(0, 100 - totalPct) }])}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus size={12} /> Weiteres Team hinzufügen
                </button>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: Math.abs(totalPct - 100) < 0.1 ? '#15803d' : '#dc2626',
                  }}
                >
                  Summe: {totalPct}% {Math.abs(totalPct - 100) < 0.1 ? '✓' : '(wird automatisch auf 100% normiert)'}
                </span>
              </div>
            </div>
          )}

          {/* MODE 2: PER WORKING STEP */}
          {mode === 'steps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: '#475569' }}>
                Weisen Sie jeden Arbeitsschritt einem Team zu. Die Kosten/Umsätze werden automatisch nach Gewichtung pro Cost Center aufgeteilt:
              </span>
              {WORK_STEP_DEFS.map((st) => (
                <div key={st.key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 75px', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: 12, color: '#0f172a' }}>{st.label}</strong>
                  <select
                    value={steps[st.key] || ''}
                    onChange={(e) => setSteps((prev) => ({ ...prev, [st.key]: e.target.value }))}
                    style={{ padding: '6px 8px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Team wählen…</option>
                    {fieldTeams.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}{t.cost_center ? ` (KST: ${t.cost_center})` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={stepWeights[st.key]}
                      onChange={(e) => setStepWeights((prev) => ({ ...prev, [st.key]: Number(e.target.value) || 0 }))}
                      style={{ width: '100%', padding: '6px 20px 6px 6px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}
                      title="Gewichtung (%)"
                    />
                    <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#64748b' }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Live Cost Center Split Preview */}
          <div style={{ padding: '10px 12px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
              Ergebnis — Kostenstellen &amp; Team-Aufteilung
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {previewShares.map((sh) => (
                <span
                  key={sh.team}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 9px',
                    borderRadius: 7,
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                  }}
                >
                  {sh.team}: <strong style={{ color: '#FF6B00' }}>{sh.percent}%</strong>{' '}
                  <span style={{ fontSize: 10.5, color: '#64748b' }}>(KST: {sh.cost_center})</span>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
              onClick={() => {
                const firstTeam = splits[0]?.team || '';
                onSave(firstTeam, {});
                onClose();
              }}
            >
              Aufteilung entfernen (1 Team)
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                Abbrechen
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={handleSave}>
                <Check size={14} /> Speichern
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
