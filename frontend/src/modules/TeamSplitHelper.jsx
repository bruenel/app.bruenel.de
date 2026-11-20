import React, { useState, useMemo } from 'react';
import { Users, Percent, Layers, Hash, Plus, Trash2, X, Check, Euro, CheckCircle2 } from 'lucide-react';

export const DEFAULT_STEP_WEIGHTS = {
  ta: 40,
  metalkanal: 15,
  flex: 15,
  huep: 10,
  spleissen: 15,
  fotos: 5,
};

export const WORK_STEP_DEFS = [
  { key: 'ta', shortLabel: 'TA', label: 'TA Installation (Wohnungen)', defaultWeight: 40 },
  { key: 'metalkanal', shortLabel: 'Metalkanal', label: 'Metalkanal / Kabelkanal', defaultWeight: 15 },
  { key: 'flex', shortLabel: 'Flexrohr', label: 'Flexrohr / Leerrohr-Kamin', defaultWeight: 15 },
  { key: 'huep', shortLabel: 'HÜP', label: 'HÜP installiert', defaultWeight: 10 },
  { key: 'spleissen', shortLabel: 'Spleißen', label: 'Spleißen & Messung', defaultWeight: 15 },
  { key: 'fotos', shortLabel: 'Fotos/Doku', label: 'Fotos & Dokumentation', defaultWeight: 5 },
];

export const WORK_STEP_LABEL_MAP = WORK_STEP_DEFS.reduce((acc, s) => {
  acc[s.key] = s.shortLabel;
  acc[s.label] = s.shortLabel;
  return acc;
}, {});

/**
 * Checks if a given step key is completed on an address record.
 */
export function isStepDoneOnAddress(addr, stepKey) {
  if (!addr) return false;
  const units = Array.isArray(addr.we_units) ? addr.we_units : [];
  const taCount = units.filter((u) => String(u?.ta_status || '').trim() === 'TA installiert').length;
  switch (stepKey) {
    case 'ta':
      return taCount > 0;
    case 'metalkanal':
      return Boolean(addr.metalkanal_installiert);
    case 'flex':
      return Boolean(addr.flexrohr);
    case 'huep':
      return Boolean(addr.huep_installiert);
    case 'spleissen':
      return Boolean(addr.spleissen_fertig);
    case 'fotos':
      return Boolean(addr.upload_done);
    default:
      return false;
  }
}

/**
 * Resolves a team name to its Cost Center using fieldTeams.
 */
export function resolveTeamCostCenter(teamName, fieldTeams = []) {
  const clean = String(teamName || '').trim();
  if (!clean || clean === 'Nicht zugewiesen') return 'Nicht zugewiesen';
  const match = (fieldTeams || []).find(
    (t) => String(t?.name || '').trim().toLowerCase() === clean.toLowerCase()
  );
  if (match && String(match.cost_center || '').trim()) {
    return String(match.cost_center).trim();
  }
  return 'Allgemein / Intern';
}

/**
 * Resolves a team's default cost per TA (if configured on fieldTeams or teamRatesMap).
 */
export function resolveTeamCostPerTa(teamName, fieldTeams = [], defaultCostPerTa = 65, teamRatesMap = {}) {
  const clean = String(teamName || '').trim();
  if (clean && teamRatesMap && Number(teamRatesMap[clean]) >= 0 && teamRatesMap[clean] !== '' && teamRatesMap[clean] !== null && teamRatesMap[clean] !== undefined) {
    return Number(teamRatesMap[clean]);
  }
  const match = (fieldTeams || []).find(
    (t) => String(t?.name || '').trim().toLowerCase() === clean.toLowerCase()
  );
  if (match && Number(match.cost_rate_per_ta) > 0) {
    return Number(match.cost_rate_per_ta);
  }
  return Number(defaultCostPerTa || 65);
}

/**
 * Helper to compute quick building TA & revenue numbers inside TeamSplitModal or share calculations.
 */
export function estimateBuildingRevenueSnapshot(addr, rates = { metalkanalRate: 162.5, flexKaminRate: 122.5, estimatedCostPerTa: 65 }) {
  const units = Array.isArray(addr?.we_units) ? addr.we_units : [];
  const totalWe = Math.max(Number(addr?.anzahl_we || 0), units.length, 1);
  const taCount = units.filter((u) => String(u?.ta_status || '').trim() === 'TA installiert').length;

  const rawTyp = String(addr?.ausbau_typ || addr?.loesungsoption || 'Metalkanal').trim().toLowerCase();
  const isFlexKamin =
    rawTyp.includes('kamin') ||
    rawTyp.includes('leerrohr') ||
    rawTyp.includes('flex') ||
    (!rawTyp.includes('metal') && Boolean(addr?.flexrohr) && !addr?.metalkanal_installiert);

  const ratePerTa = isFlexKamin ? Number(rates.flexKaminRate || 122.5) : Number(rates.metalkanalRate || 162.5);
  const categoryLabel = isFlexKamin ? 'Flexrohr / Kaminkanal' : 'Metalkabelkanal';
  const installedRev = Number((taCount * ratePerTa).toFixed(2));
  const potentialRev = Number((totalWe * ratePerTa).toFixed(2));
  const effectiveRev = taCount > 0 ? installedRev : potentialRev;

  return {
    taCount,
    totalWe,
    isFlexKamin,
    ratePerTa,
    categoryLabel,
    installedRev,
    potentialRev,
    effectiveRev,
  };
}

/**
 * Returns normalized team & cost-center percentage shares for an object.
 * Supports:
 *  - mode === 'steps' (task-by-task assignment + custom tasks)
 *  - mode === 'ta_units' (split by number of TAs installed per team)
 *  - mode === 'percentage' (percentage split + optional task tags & custom cost per team)
 *  - single team fallback from addr.team (100%)
 *
 * Output: Array<{
 *   team: string,
 *   cost_center: string,
 *   percent: number,
 *   fraction: number,
 *   steps: string[],
 *   taskKeys: string[],
 *   taAllocated?: number,
 *   customCostEur?: number | null,
 *   costRatePerTa?: number | null,
 *   mode: string
 * }>
 * Always sums to 100% (fraction sums to 1.0).
 */
export function getObjectTeamShares(addr, fieldTeams = []) {
  const alloc = addr?.team_allocations;
  if (alloc && typeof alloc === 'object') {
    // 1. TASK / WORKING STEPS MODE
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
            teamAcc.set(tName, { team: tName, weight: 0, steps: [], taskKeys: [] });
          }
          const entry = teamAcc.get(tName);
          entry.weight += w;
          entry.steps.push(st.shortLabel);
          entry.taskKeys.push(st.key);
        }
      });

      // Include custom tasks if present
      if (Array.isArray(alloc.custom_tasks)) {
        alloc.custom_tasks.forEach((ct, idx) => {
          const tName = String(ct?.team || '').trim();
          const w = Math.max(0, Number(ct?.weight || 0));
          const lbl = String(ct?.label || `Aufgabe ${idx + 1}`).trim();
          if (tName && w > 0) {
            totalAssignedWeight += w;
            if (!teamAcc.has(tName)) {
              teamAcc.set(tName, { team: tName, weight: 0, steps: [], taskKeys: [] });
            }
            const entry = teamAcc.get(tName);
            entry.weight += w;
            entry.steps.push(lbl);
            entry.taskKeys.push(`custom_${idx}`);
          }
        });
      }

      if (totalAssignedWeight > 0 && teamAcc.size > 0) {
        return Array.from(teamAcc.values()).map((entry) => {
          const fraction = entry.weight / totalAssignedWeight;
          const pct = Number((fraction * 100).toFixed(1));
          const customCostMap = alloc.team_custom_costs || {};
          return {
            team: entry.team,
            cost_center: resolveTeamCostCenter(entry.team, fieldTeams),
            percent: pct,
            fraction,
            steps: entry.steps,
            taskKeys: entry.taskKeys,
            customCostEur:
              customCostMap[entry.team] !== undefined && customCostMap[entry.team] !== ''
                ? Number(customCostMap[entry.team])
                : null,
            mode: 'steps',
          };
        });
      }
    }

    // 2. TA-COUNT / UNITS SPLIT MODE
    if (alloc.mode === 'ta_units' && Array.isArray(alloc.ta_splits) && alloc.ta_splits.length > 0) {
      const valid = alloc.ta_splits.filter((s) => String(s?.team || '').trim() && Number(s?.ta_count) > 0);
      const sumTa = valid.reduce((acc, s) => acc + Number(s.ta_count || 0), 0);
      if (valid.length > 0 && sumTa > 0) {
        return valid.map((s) => {
          const tName = String(s.team).trim();
          const taCnt = Number(s.ta_count || 0);
          const fraction = taCnt / sumTa;
          const pct = Number((fraction * 100).toFixed(1));
          const rawTasks = Array.isArray(s.tasks) ? s.tasks : [];
          return {
            team: tName,
            cost_center: String(s.cost_center || '').trim() || resolveTeamCostCenter(tName, fieldTeams),
            percent: pct,
            fraction,
            taAllocated: taCnt,
            steps: [`${taCnt} TA`, ...rawTasks.map((k) => WORK_STEP_LABEL_MAP[k] || k)],
            taskKeys: rawTasks,
            customCostEur:
              s.custom_cost_eur !== undefined && s.custom_cost_eur !== '' && s.custom_cost_eur !== null
                ? Number(s.custom_cost_eur)
                : null,
            mode: 'ta_units',
          };
        });
      }
    }

    // 3. PERCENTAGE SPLIT MODE (WITH OPTIONAL TASK TAGS & CUSTOM COST)
    if (Array.isArray(alloc.splits) && alloc.splits.length > 0) {
      const valid = alloc.splits.filter((s) => String(s?.team || '').trim() && Number(s?.percent) > 0);
      const sumPct = valid.reduce((acc, s) => acc + Number(s.percent || 0), 0);
      if (valid.length > 0 && sumPct > 0) {
        return valid.map((s) => {
          const tName = String(s.team).trim();
          const fraction = Number(s.percent) / sumPct;
          const pct = Number((fraction * 100).toFixed(1));
          const rawTasks = Array.isArray(s.tasks) ? s.tasks : [];
          return {
            team: tName,
            cost_center: String(s.cost_center || '').trim() || resolveTeamCostCenter(tName, fieldTeams),
            percent: pct,
            fraction,
            steps: rawTasks.map((k) => WORK_STEP_LABEL_MAP[k] || k),
            taskKeys: rawTasks,
            customCostEur:
              s.custom_cost_eur !== undefined && s.custom_cost_eur !== '' && s.custom_cost_eur !== null
                ? Number(s.custom_cost_eur)
                : null,
            costRatePerTa:
              s.cost_rate_per_ta !== undefined && s.cost_rate_per_ta !== '' && s.cost_rate_per_ta !== null
                ? Number(s.cost_rate_per_ta)
                : null,
            mode: 'percentage',
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
      steps: [],
      taskKeys: [],
      customCostEur: null,
      mode: 'single',
    },
  ];
}

/**
 * Computes the exact Cost (€) for a specific team share on an object.
 */
export function calcTeamShareCost(share, totalObjectTaCount, fieldTeams = [], defaultCostPerTa = 65, teamRatesMap = {}) {
  if (share?.customCostEur !== null && share?.customCostEur !== undefined && !Number.isNaN(Number(share.customCostEur))) {
    return Number(Number(share.customCostEur).toFixed(2));
  }
  const rate =
    share?.costRatePerTa !== null && share?.costRatePerTa !== undefined && !Number.isNaN(Number(share.costRatePerTa))
      ? Number(share.costRatePerTa)
      : resolveTeamCostPerTa(share?.team, fieldTeams, defaultCostPerTa, teamRatesMap);
  const effectiveTa =
    share?.mode === 'ta_units' && Number(share?.taAllocated) > 0
      ? Number(share.taAllocated)
      : Number(totalObjectTaCount || 0) * Number(share?.fraction || 0);
  return Number((effectiveTa * rate).toFixed(2));
}

export function formatTeamSummaryLabel(alloc, fallbackTeam = '') {
  const shares = getObjectTeamShares({ team: fallbackTeam, team_allocations: alloc }, []);
  if (shares.length === 0) return fallbackTeam || '';
  if (shares.length === 1) {
    const sh = shares[0];
    if (sh.team === 'Nicht zugewiesen') return '';
    if (sh.steps && sh.steps.length > 0 && alloc?.mode) {
      return `${sh.team} (${sh.steps.join('/')})`;
    }
    return sh.team;
  }
  return shares
    .map((s) => {
      const taskHint = s.steps && s.steps.length > 0 ? ` [${s.steps.slice(0, 3).join('·')}]` : '';
      return `${s.team} (${Math.round(s.percent)}%${taskHint})`;
    })
    .join(' + ');
}

/* =============================================================================
   MODAL: MULTI-TEAM ASSIGNMENT, TASK DIVISION & INCOME/COST SPLIT EDITOR
   Supports:
   1. Percentage & Tasks Split (2+ Teams with exact %, task tags & optional team cost)
   2. Per Task / Working Step (TA, Metalkanal, Flexrohr, HÜP, Spleißen, Fotos + Custom Tasks)
   3. Per TA Count / Wohnungen (e.g. Team A: 4 TA, Team B: 2 TA)
============================================================================= */
export function TeamSplitModal({ addr, fieldTeams = [], rates, onSave, onClose }) {
  const existing = addr?.team_allocations && typeof addr.team_allocations === 'object' ? addr.team_allocations : {};

  const revSnap = useMemo(() => estimateBuildingRevenueSnapshot(addr, rates), [addr, rates]);

  const [mode, setMode] = useState(() => {
    if (existing.mode === 'steps') return 'steps';
    if (existing.mode === 'ta_units') return 'ta_units';
    return 'percentage';
  });

  // 1. Percentage + Task Tags state
  const [splits, setSplits] = useState(() => {
    if (Array.isArray(existing.splits) && existing.splits.length >= 1) {
      return existing.splits.map((s) => ({
        team: s.team || '',
        percent: Number(s.percent || 0),
        tasks: Array.isArray(s.tasks) ? s.tasks : [],
        custom_cost_eur: s.custom_cost_eur !== undefined && s.custom_cost_eur !== null ? s.custom_cost_eur : '',
      }));
    }
    const primary = String(addr?.team || '').split('(')[0].split('+')[0].trim();
    const secondDefault = fieldTeams.find((t) => t.name !== primary)?.name || '';
    return [
      { team: primary || fieldTeams[0]?.name || '', percent: 50, tasks: ['ta', 'metalkanal', 'flex'], custom_cost_eur: '' },
      { team: secondDefault, percent: 50, tasks: ['huep', 'spleissen', 'fotos'], custom_cost_eur: '' },
    ];
  });

  // 2. Per-Step / Task state
  const [steps, setSteps] = useState(() => {
    const primary = String(addr?.team || '').split('(')[0].split('+')[0].trim();
    const init = {};
    WORK_STEP_DEFS.forEach((st) => {
      init[st.key] = existing.steps?.[st.key] ?? primary ?? '';
    });
    return init;
  });

  const [stepWeights, setStepWeights] = useState(() => ({
    ...DEFAULT_STEP_WEIGHTS,
    ...(existing.step_weights || {}),
  }));

  const [customTasks, setCustomTasks] = useState(() =>
    Array.isArray(existing.custom_tasks) ? existing.custom_tasks : []
  );

  // 3. Per-TA Unit count state
  const [taSplits, setTaSplits] = useState(() => {
    if (Array.isArray(existing.ta_splits) && existing.ta_splits.length >= 1) {
      return existing.ta_splits.map((s) => ({
        team: s.team || '',
        ta_count: Number(s.ta_count || 0),
        tasks: Array.isArray(s.tasks) ? s.tasks : ['ta'],
        custom_cost_eur: s.custom_cost_eur !== undefined && s.custom_cost_eur !== null ? s.custom_cost_eur : '',
      }));
    }
    const primary = String(addr?.team || '').split('(')[0].split('+')[0].trim();
    const secondDefault = fieldTeams.find((t) => t.name !== primary)?.name || '';
    const baseTa = Math.max(2, revSnap.taCount || revSnap.totalWe || 2);
    const halfA = Math.ceil(baseTa / 2);
    const halfB = Math.max(1, baseTa - halfA);
    return [
      { team: primary || fieldTeams[0]?.name || '', ta_count: halfA, tasks: ['ta'], custom_cost_eur: '' },
      { team: secondDefault, ta_count: halfB, tasks: ['ta'], custom_cost_eur: '' },
    ];
  });

  const totalPct = useMemo(
    () => splits.reduce((acc, s) => acc + Number(s.percent || 0), 0),
    [splits]
  );

  const totalStepWeight = useMemo(() => {
    const std = WORK_STEP_DEFS.reduce(
      (acc, st) => acc + (steps[st.key] ? Number(stepWeights[st.key] || 0) : 0),
      0
    );
    const cust = customTasks.reduce(
      (acc, ct) => acc + (ct.team ? Number(ct.weight || 0) : 0),
      0
    );
    return std + cust;
  }, [steps, stepWeights, customTasks]);

  const draftAlloc = useMemo(() => {
    if (mode === 'steps') {
      return {
        mode: 'steps',
        steps,
        step_weights: stepWeights,
        custom_tasks: customTasks,
      };
    }
    if (mode === 'ta_units') {
      return {
        mode: 'ta_units',
        ta_splits: taSplits,
      };
    }
    return {
      mode: 'percentage',
      splits,
    };
  }, [mode, splits, steps, stepWeights, customTasks, taSplits]);

  const previewShares = useMemo(() => {
    return getObjectTeamShares({ team: addr?.team, team_allocations: draftAlloc }, fieldTeams);
  }, [draftAlloc, addr?.team, fieldTeams]);

  const toggleSplitTask = (rowIdx, taskKey) => {
    setSplits((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const curr = Array.isArray(row.tasks) ? row.tasks : [];
        const next = curr.includes(taskKey) ? curr.filter((k) => k !== taskKey) : [...curr, taskKey];
        return { ...row, tasks: next };
      })
    );
  };

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
          tasks: Array.isArray(s.tasks) ? s.tasks : [],
          custom_cost_eur: s.custom_cost_eur !== '' && s.custom_cost_eur !== null ? Number(s.custom_cost_eur) : null,
        })),
      };
      onSave(formatTeamSummaryLabel(alloc, addr?.team), alloc);
      onClose();
    } else if (mode === 'ta_units') {
      const valid = taSplits.filter((s) => String(s.team || '').trim() && Number(s.ta_count) > 0);
      if (valid.length === 0) {
        onSave('', {});
        onClose();
        return;
      }
      const alloc = {
        mode: 'ta_units',
        ta_splits: valid.map((s) => ({
          team: s.team,
          cost_center: resolveTeamCostCenter(s.team, fieldTeams),
          ta_count: Number(s.ta_count),
          tasks: Array.isArray(s.tasks) ? s.tasks : ['ta'],
          custom_cost_eur: s.custom_cost_eur !== '' && s.custom_cost_eur !== null ? Number(s.custom_cost_eur) : null,
        })),
      };
      onSave(formatTeamSummaryLabel(alloc, addr?.team), alloc);
      onClose();
    } else {
      const alloc = {
        mode: 'steps',
        steps,
        step_weights: stepWeights,
        custom_tasks: customTasks.filter((ct) => String(ct.label || '').trim() && String(ct.team || '').trim()),
      };
      onSave(formatTeamSummaryLabel(alloc, addr?.team), alloc);
      onClose();
    }
  };

  const fmtEur = (n) =>
    Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  // Ensure any team already assigned on the address appears in the dropdown even if not yet in fieldTeams
  const teamOptions = useMemo(() => {
    const map = new Map();
    (fieldTeams || []).forEach((t) => {
      if (t?.name) map.set(t.name, t);
    });
    splits.forEach((s) => {
      if (s.team && !map.has(s.team)) map.set(s.team, { name: s.team, cost_center: '' });
    });
    Object.values(steps).forEach((tName) => {
      if (tName && !map.has(tName)) map.set(tName, { name: tName, cost_center: '' });
    });
    return Array.from(map.values());
  }, [fieldTeams, splits, steps]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(15, 23, 42, 0.58)',
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
          maxWidth: 740,
          maxHeight: '92vh',
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.32)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Users size={16} style={{ color: '#FF6B00' }} /> Multi-Team Zuweisung · Aufgaben-, Erlös- &amp; Kosten-Aufteilung
            </strong>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
              <strong>{addr?.strasse} {addr?.hausnummer}</strong>, {addr?.ort} · {revSnap.categoryLabel} (<strong>{fmtEur(revSnap.ratePerTa)}/TA</strong>) ·{' '}
              <strong>{revSnap.taCount}/{revSnap.totalWe} TA</strong> · Aktueller Erlös: <strong style={{ color: '#0f172a' }}>{fmtEur(revSnap.effectiveRev)}</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {/* 3-Mode Switcher */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { id: 'percentage', label: 'Prozent & Aufgaben (%)', icon: Percent },
              { id: 'steps', label: 'Nach Aufgaben / Tasks', icon: Layers },
              { id: 'ta_units', label: 'Nach TA-Anzahl (Wohnungen)', icon: Hash },
            ].map((m) => {
              const IconComp = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 9,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    border: active ? '1.5px solid #FF6B00' : '1px solid #cbd5e1',
                    background: active ? '#fff7ed' : '#f8fafc',
                    color: active ? '#c2410c' : '#334155',
                  }}
                >
                  <IconComp size={13.5} /> {m.label}
                </button>
              );
            })}
          </div>

          {/* =================================================================
              MODE 1: PERCENTAGE & TASK TAGS SPLIT
             ================================================================= */}
          {mode === 'percentage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
                  Teams, Prozent-Anteil (%), erledigte Aufgaben &amp; optionale Team-Kosten festlegen:
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[
                    { label: '50 / 50%', vals: [50, 50] },
                    { label: '60 / 40%', vals: [60, 40] },
                    { label: '70 / 30%', vals: [70, 30] },
                    { label: '80 / 20%', vals: [80, 20] },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setSplits((prev) => [
                          { ...(prev[0] || { team: '', tasks: [] }), percent: preset.vals[0] },
                          { ...(prev[1] || { team: '', tasks: [] }), percent: preset.vals[1] },
                          ...prev.slice(2).map((r) => ({ ...r, percent: 0 })),
                        ])
                      }
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10.5,
                        fontWeight: 700,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        color: '#334155',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                  {splits.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const eq = Number((100 / splits.length).toFixed(1));
                        setSplits((prev) => prev.map((r) => ({ ...r, percent: eq })));
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10.5,
                        fontWeight: 700,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        color: '#334155',
                      }}
                    >
                      Gleichmäßig ({splits.length} Teams)
                    </button>
                  )}
                </div>
              </div>

              {splits.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 95px 135px 32px', gap: 8, alignItems: 'center' }}>
                    <select
                      value={row.team}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, team: val } : r)));
                      }}
                      style={{ padding: '7px 9px', fontSize: 12, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="">Team auswählen…</option>
                      {teamOptions.map((t) => (
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
                        step="0.5"
                        value={row.percent}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, percent: Number.isNaN(val) ? 0 : val } : r)));
                        }}
                        style={{ width: '100%', padding: '7px 22px 7px 8px', fontSize: 12, fontWeight: 800, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                        title="Anteil in Prozent (%)"
                      />
                      <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#64748b', fontWeight: 700 }}>%</span>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        placeholder="Auto-Kosten €"
                        value={row.custom_cost_eur ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, custom_cost_eur: val } : r)));
                        }}
                        style={{ width: '100%', padding: '7px 22px 7px 8px', fontSize: 11.5, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                        title="Optionale feste Auszahlung / Sub-Kosten (€) für dieses Team bei diesem Objekt"
                      />
                      <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>€</span>
                    </div>

                    <button
                      type="button"
                      disabled={splits.length <= 1}
                      onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#dc2626',
                        borderRadius: 6,
                        padding: '6px',
                        cursor: splits.length <= 1 ? 'not-allowed' : 'pointer',
                        opacity: splits.length <= 1 ? 0.4 : 1,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Clickable Task Pills for this Team */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', marginRight: 2 }}>
                      Aufgaben dieses Teams:
                    </span>
                    {WORK_STEP_DEFS.map((st) => {
                      const active = Array.isArray(row.tasks) && row.tasks.includes(st.key);
                      return (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => toggleSplitTask(idx, st.key)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 10.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: active ? '1px solid #FF6B00' : '1px solid #cbd5e1',
                            background: active ? '#fff7ed' : '#ffffff',
                            color: active ? '#c2410c' : '#64748b',
                          }}
                        >
                          {active ? '✓ ' : '+ '}{st.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setSplits((prev) => [
                      ...prev,
                      { team: '', percent: Math.max(0, Number((100 - totalPct).toFixed(1))), tasks: [], custom_cost_eur: '' },
                    ])
                  }
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus size={12} /> Weiteres Team hinzufügen
                </button>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: Math.abs(totalPct - 100) < 0.2 ? '#15803d' : '#d97706',
                  }}
                >
                  Summe: {Number(totalPct.toFixed(1))}% {Math.abs(totalPct - 100) < 0.2 ? '✓' : '(wird automatisch auf 100% normiert)'}
                </span>
              </div>
            </div>
          )}

          {/* =================================================================
              MODE 2: PER TASK / WORKING STEP
             ================================================================= */}
          {mode === 'steps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>
                  Weisen Sie jede Aufgabe einem Team zu. Erlöse &amp; Kosten werden nach Aufgaben-Gewichtung (%) pro Team &amp; Cost Center aufgeteilt:
                </span>
                <button
                  type="button"
                  onClick={() => setStepWeights({ ...DEFAULT_STEP_WEIGHTS })}
                  style={{ padding: '2px 8px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#475569' }}
                >
                  Standard-Gewichtung (40/15/15/10/15/5%)
                </button>
              </div>

              {WORK_STEP_DEFS.map((st) => {
                const doneOnAddr = isStepDoneOnAddress(addr, st.key);
                return (
                  <div
                    key={st.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '175px 95px 1fr 80px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <strong style={{ fontSize: 12, color: '#0f172a' }}>{st.label}</strong>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        textAlign: 'center',
                        background: doneOnAddr ? '#dcfce7' : '#f1f5f9',
                        color: doneOnAddr ? '#15803d' : '#64748b',
                        border: `1px solid ${doneOnAddr ? '#86efac' : '#cbd5e1'}`,
                      }}
                    >
                      {doneOnAddr ? '✓ Erledigt' : 'Offen'}
                    </span>
                    <select
                      value={steps[st.key] || ''}
                      onChange={(e) => setSteps((prev) => ({ ...prev, [st.key]: e.target.value }))}
                      style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="">Kein Team / Nicht relevant (0%)</option>
                      {teamOptions.map((t) => (
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
                        value={stepWeights[st.key] ?? st.defaultWeight}
                        onChange={(e) =>
                          setStepWeights((prev) => ({ ...prev, [st.key]: Number(e.target.value) || 0 }))
                        }
                        style={{ width: '100%', padding: '6px 20px 6px 6px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                        title="Gewichtung (%)"
                      />
                      <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#64748b' }}>%</span>
                    </div>
                  </div>
                );
              })}

              {/* Custom Tasks */}
              {customTasks.map((ct, idx) => (
                <div
                  key={`cust-${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '175px 1fr 80px 30px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                  }}
                >
                  <input
                    value={ct.label || ''}
                    onChange={(e) =>
                      setCustomTasks((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                      )
                    }
                    placeholder="Eigene Aufgabe…"
                    style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                  />
                  <select
                    value={ct.team || ''}
                    onChange={(e) =>
                      setCustomTasks((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, team: e.target.value } : item))
                      )
                    }
                    style={{ padding: '6px 8px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Team wählen…</option>
                    {teamOptions.map((t) => (
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
                      value={ct.weight || 10}
                      onChange={(e) =>
                        setCustomTasks((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, weight: Number(e.target.value) || 0 } : item))
                        )
                      }
                      style={{ width: '100%', padding: '6px 20px 6px 6px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                    />
                    <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#64748b' }}>%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomTasks((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: 5, cursor: 'pointer' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setCustomTasks((prev) => [...prev, { label: '', team: teamOptions[0]?.name || '', weight: 10 }])
                  }
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus size={12} /> Eigene Aufgabe hinzufügen
                </button>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
                  Aktive Gewichtung: {totalStepWeight}% (wird auf 100% normiert)
                </span>
              </div>
            </div>
          )}

          {/* =================================================================
              MODE 3: PER TA-COUNT / WOHNUNGEN SPLIT
             ================================================================= */}
          {mode === 'ta_units' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>
                Teilen Sie das Objekt nach Anzahl der installierten TAs (Wohnungen) pro Team auf (Tarif: <strong>{fmtEur(revSnap.ratePerTa)} / TA</strong>):
              </span>
              {taSplits.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 140px 32px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <select
                    value={row.team}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTaSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, team: val } : r)));
                    }}
                    style={{ padding: '7px 9px', fontSize: 12, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Team auswählen…</option>
                    {teamOptions.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}{t.cost_center ? ` (KST: ${t.cost_center})` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={row.ta_count}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTaSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, ta_count: Number.isNaN(val) ? 0 : val } : r)));
                      }}
                      style={{ width: '100%', padding: '7px 32px 7px 8px', fontSize: 12, fontWeight: 800, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                    />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>TA</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      placeholder="Auto-Kosten €"
                      value={row.custom_cost_eur ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTaSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, custom_cost_eur: val } : r)));
                      }}
                      style={{ width: '100%', padding: '7px 22px 7px 8px', fontSize: 11.5, borderRadius: 7, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                    />
                    <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>€</span>
                  </div>
                  <button
                    type="button"
                    disabled={taSplits.length <= 1}
                    onClick={() => setTaSplits((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: 6, cursor: taSplits.length <= 1 ? 'not-allowed' : 'pointer', opacity: taSplits.length <= 1 ? 0.4 : 1 }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setTaSplits((prev) => [...prev, { team: '', ta_count: 1, tasks: ['ta'], custom_cost_eur: '' }])}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus size={12} /> Weiteres Team hinzufügen
                </button>
              </div>
            </div>
          )}

          {/* =================================================================
              LIVE INCOME (ERLÖS) & COST (KOSTEN) PREVIEW TABLE BY TEAM
             ================================================================= */}
          <div style={{ padding: '12px 14px', borderRadius: 11, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Euro size={13} style={{ color: '#FF6B00' }} /> Live Erlös- &amp; Kosten-Aufteilung pro Team (Cost Management Vorschau)
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Basis: {revSnap.taCount > 0 ? `${revSnap.taCount} installierte TA (${fmtEur(revSnap.installedRev)})` : `${revSnap.totalWe} geplante WE (${fmtEur(revSnap.potentialRev)})`}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="no-min-width" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', color: '#475569', textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase' }}>
                    <th style={{ padding: '5px 6px' }}>Team &amp; Cost Center</th>
                    <th style={{ padding: '5px 6px' }}>Aufgaben / Tasks</th>
                    <th style={{ padding: '5px 6px', textAlign: 'right' }}>Anteil</th>
                    <th style={{ padding: '5px 6px', textAlign: 'right' }}>Erlös-Anteil (€)</th>
                    <th style={{ padding: '5px 6px', textAlign: 'right' }}>Team-Kosten (€)</th>
                    <th style={{ padding: '5px 6px', textAlign: 'right' }}>Marge / DB (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewShares.map((sh) => {
                    const baseTaForPreview = revSnap.taCount > 0 ? revSnap.taCount : revSnap.totalWe;
                    const teamIncome = Number((revSnap.effectiveRev * sh.fraction).toFixed(2));
                    const teamCost = calcTeamShareCost(
                      sh,
                      baseTaForPreview,
                      fieldTeams,
                      rates?.estimatedCostPerTa ?? 65
                    );
                    const teamProfit = Number((teamIncome - teamCost).toFixed(2));
                    return (
                      <tr key={sh.team} style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                        <td style={{ padding: '6px 6px', fontWeight: 700, color: '#0f172a' }}>
                          {sh.team}{' '}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>
                            KST: {sh.cost_center}
                          </span>
                        </td>
                        <td style={{ padding: '6px 6px', color: '#475569' }}>
                          {sh.steps && sh.steps.length > 0 ? (
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {sh.steps.map((lbl, i) => (
                                <span
                                  key={i}
                                  style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#334155' }}
                                >
                                  {lbl}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 10.5 }}>Gesamtarbeit</span>
                          )}
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 800, color: '#FF6B00' }}>
                          {sh.percent}%
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                          {fmtEur(teamIncome)}
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#c2410c' }}>
                          {fmtEur(teamCost)}
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: teamProfit >= 0 ? '#15803d' : '#dc2626' }}>
                          {fmtEur(teamProfit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
              onClick={() => {
                const firstTeam = splits[0]?.team || Object.values(steps).find(Boolean) || '';
                onSave(firstTeam, {});
                onClose();
              }}
            >
              Aufteilung entfernen (Nur 1 Team)
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                Abbrechen
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={handleSave}>
                <Check size={14} /> Aufteilung speichern
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
