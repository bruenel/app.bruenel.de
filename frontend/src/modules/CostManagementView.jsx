import React, { useState, useMemo } from 'react';
import {
  Receipt,
  TrendingUp,
  Building2,
  Layers,
  Columns,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronDown,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  X,
  ArrowUpRight,
  Settings,
  RefreshCw,
  Wallet,
  Users,
} from 'lucide-react';
import { isCoreArbeitCompleted, getObjectBillingStage } from './ObjectsViewsBoard';
import { getObjectTeamShares, calcTeamShareCost, TeamSplitModal } from './TeamSplitHelper';

const RATES_STORAGE_KEY = 'bruenel_cost_mgmt_rates_v1';

export const DEFAULT_TA_RATES = {
  metalkanalRate: 162.5,
  flexKaminRate: 122.5,
  estimatedCostPerTa: 65.0,
  teamCostRates: {},
};

export function loadSavedTaRates() {
  try {
    const raw = localStorage.getItem(RATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        metalkanalRate: Number(parsed.metalkanalRate) > 0 ? Number(parsed.metalkanalRate) : 162.5,
        flexKaminRate: Number(parsed.flexKaminRate) > 0 ? Number(parsed.flexKaminRate) : 122.5,
        estimatedCostPerTa: Number(parsed.estimatedCostPerTa) >= 0 ? Number(parsed.estimatedCostPerTa) : 65.0,
        teamCostRates: parsed.teamCostRates && typeof parsed.teamCostRates === 'object' ? parsed.teamCostRates : {},
      };
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_TA_RATES };
}

/**
 * Determines whether an object uses the Metalkabelkanal rate (162,50 € / TA)
 * or the Flexrohr / Kaminkanal rate (122,50 € / TA), and computes its revenue & cost metrics.
 */
export function calcObjectFinancials(addr, calcBuildingProgress, rates = DEFAULT_TA_RATES, fieldTeams = []) {
  const prog = calcBuildingProgress(addr);
  const rawTyp = String(addr?.ausbau_typ || addr?.loesungsoption || 'Metalkanal').trim();
  const lowerTyp = rawTyp.toLowerCase();

  const isFlexKamin =
    lowerTyp.includes('kamin') ||
    lowerTyp.includes('leerrohr') ||
    lowerTyp.includes('flex') ||
    (!lowerTyp.includes('metal') && Boolean(addr?.flexrohr) && !addr?.metalkanal_installiert);

  const categoryKey = isFlexKamin ? 'flex_kamin' : 'metalkanal';
  const categoryLabel = isFlexKamin ? 'Flexrohr / Kaminkanal' : 'Metalkabelkanal';
  const ratePerTa = isFlexKamin ? Number(rates.flexKaminRate || 122.5) : Number(rates.metalkanalRate || 162.5);
  const costPerTa = Number(rates.estimatedCostPerTa || 0);

  const taCount = prog.taCount;
  const totalWe = prog.totalWe;

  // Installed TA revenue (exact current progression)
  const installedTaRevenue = Number((taCount * ratePerTa).toFixed(2));
  // Max potential if 100% of WE get a TA
  const maxWePotentialRevenue = Number((totalWe * ratePerTa).toFixed(2));
  // Effective planned/estimated amount (uses installed TAs if > 0, otherwise planned WE potential for scheduled buildings)
  const effectiveEstimatedRevenue = taCount > 0 ? installedTaRevenue : maxWePotentialRevenue;

  // Compute exact object cost by summing all team share costs (respects custom team costs & per-team rates)
  const shares = getObjectTeamShares(addr, fieldTeams);
  const estimatedCost = Number(
    shares
      .reduce(
        (acc, sh) =>
          acc +
          calcTeamShareCost(
            sh,
            taCount,
            fieldTeams,
            costPerTa,
            rates.teamCostRates || {}
          ),
        0
      )
      .toFixed(2)
  );
  const estimatedProfit = Number((installedTaRevenue - estimatedCost).toFixed(2));

  // Detailed 5-stage classification synced with Objects & Properties
  const billingStage = getObjectBillingStage(addr, calcBuildingProgress);
  const bStatus = addr?.building_status || 'Ausbau terminiert';
  let stage = billingStage; // 'open' | 'completed_unbilled' | 'invoiced' | 'paid'
  if (billingStage === 'open' && bStatus === 'Ausbau terminiert') {
    stage = 'planned';
  }

  return {
    categoryKey,
    categoryLabel,
    ratePerTa,
    taCount,
    totalWe,
    reserveCount: prog.reserveCount,
    ohneCount: prog.ohneCount,
    pct: prog.pct,
    installedTaRevenue,
    maxWePotentialRevenue,
    effectiveEstimatedRevenue,
    estimatedCost,
    estimatedProfit,
    stage,
    billingStage,
  };
}

export function formatEur(val) {
  const num = Number(val || 0);
  return (
    num.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €'
  );
}

/* =============================================================================
   MAIN COST MANAGEMENT COMPONENT
   Includes:
   1. Overview & Projekt-Kalkulation (Animated BI Dashboard + Team & Cost Center Breakdown)
   2. Teams & Kostenstellen (Detailed Per-Team Income, Cost, Margin & Object/Task Drilldown)
   3. Objekt-Kalkulation (Per-Building Revenue, Cost, Team Splits & Progression Table)
   4. Finanz-Pipeline (Stage Board: Geplant -> Offen -> Bereit f. RE -> RE erstellt -> RE erhalten)
   5. Abrechnung (Rechnungen erstellen & verwalten)
============================================================================= */
export function CostManagementView({
  addresses,
  invoices,
  projects,
  fieldTeams,
  loading,
  calcBuildingProgress,
  normalizeGemeinde,
  onRefresh,
  onPatchBuilding,
  onOpenBuilding,
  renderAbrechnungInvoicesView,
  onQuickCreateInvoiceForAddresses,
}) {
  const [subView, setSubView] = useState('overview'); // overview | teams | objects | pipeline | abrechnung
  const [activeDrawer, setActiveDrawer] = useState(null); // null | 'filter' | 'sort' | 'rates'
  const [rates, setRates] = useState(() => loadSavedTaRates());
  const [teamSplitTargetAddr, setTeamSplitTargetAddr] = useState(null);
  const [expandedTeamDetails, setExpandedTeamDetails] = useState({});

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [costCenterFilter, setCostCenterFilter] = useState('ALL');
  const [ortFilter, setOrtFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // ALL | metalkanal | flex_kamin
  const [stageFilter, setStageFilter] = useState('ALL'); // ALL | planned | open | completed_unbilled | invoiced | paid
  const [teamFilter, setTeamFilter] = useState('ALL');

  // Sorting for objects calculation table
  const [sortBy, setSortBy] = useState('installed_revenue');
  const [sortDir, setSortDir] = useState('desc');

  const updateRate = (key, value) => {
    const num = Number(value);
    setRates((prev) => {
      const next = { ...prev, [key]: Number.isNaN(num) ? 0 : num };
      try {
        localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const updateTeamCostRate = (teamName, value) => {
    setRates((prev) => {
      const nextTeamRates = { ...(prev.teamCostRates || {}) };
      if (value === '' || value === null || value === undefined) {
        delete nextTeamRates[teamName];
      } else {
        const num = Number(value);
        nextTeamRates[teamName] = Number.isNaN(num) ? 0 : num;
      }
      const next = { ...prev, teamCostRates: nextTeamRates };
      try {
        localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Available filter options
  const filterOptions = useMemo(() => {
    const projSet = new Set(['UGG']);
    const ortSet = new Set();
    const teamSet = new Set();
    const ccSet = new Set();

    (projects || []).forEach((p) => p?.name && projSet.add(p.name.trim()));
    (fieldTeams || []).forEach((t) => {
      if (t?.name) teamSet.add(t.name.trim());
      if (t?.cost_center) ccSet.add(String(t.cost_center).trim());
    });
    (addresses || []).forEach((a) => {
      if (a?.project_name) projSet.add(a.project_name.trim());
      const city = normalizeGemeinde ? normalizeGemeinde(a.ort, a.plz) : a.ort;
      if (city) ortSet.add(city);
      getObjectTeamShares(a, fieldTeams).forEach((sh) => {
        if (sh.cost_center) ccSet.add(sh.cost_center);
        if (sh.team && sh.team !== 'Nicht zugewiesen') teamSet.add(sh.team);
      });
    });

    return {
      projects: Array.from(projSet).sort(),
      orte: Array.from(ortSet).sort(),
      teams: Array.from(teamSet).sort(),
      costCenters: Array.from(ccSet).sort(),
    };
  }, [projects, addresses, fieldTeams, normalizeGemeinde]);

  // Enrich & filter all building objects with live financial calculation + Team & Cost Center shares
  const enrichedObjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (addresses || [])
      .map((addr) => {
        const baseFin = calcObjectFinancials(addr, calcBuildingProgress, rates, fieldTeams);
        const rawShares = getObjectTeamShares(addr, fieldTeams);
        const city = (normalizeGemeinde ? normalizeGemeinde(addr.ort, addr.plz) : addr.ort) || addr.ort || '—';

        // Compute exact Euro income, cost, and profit for every team share on this object
        const shares = rawShares.map((sh) => {
          const incomeInstalled = Number((baseFin.installedTaRevenue * sh.fraction).toFixed(2));
          const incomePotential = Number((baseFin.maxWePotentialRevenue * sh.fraction).toFixed(2));
          const incomeEffective = Number((baseFin.effectiveEstimatedRevenue * sh.fraction).toFixed(2));
          const costEur = calcTeamShareCost(
            sh,
            baseFin.taCount,
            fieldTeams,
            rates.estimatedCostPerTa,
            rates.teamCostRates || {}
          );
          const profitEur = Number((incomeInstalled - costEur).toFixed(2));
          const taShare =
            sh.mode === 'ta_units' && Number(sh.taAllocated) > 0
              ? Number(sh.taAllocated)
              : Number((baseFin.taCount * sh.fraction).toFixed(2));
          return {
            ...sh,
            taShare,
            incomeInstalled,
            incomePotential,
            incomeEffective,
            costEur,
            profitEur,
          };
        });

        // Compute proportional share fraction if filtering by a specific Cost Center or Team
        let activeShares = shares;
        if (costCenterFilter !== 'ALL') {
          activeShares = activeShares.filter((sh) => sh.cost_center === costCenterFilter);
        }
        if (teamFilter !== 'ALL') {
          activeShares = activeShares.filter((sh) => sh.team === teamFilter);
        }

        const activeFraction =
          costCenterFilter === 'ALL' && teamFilter === 'ALL'
            ? 1
            : activeShares.reduce((acc, sh) => acc + sh.fraction, 0);

        const activeCost = activeShares.reduce((acc, sh) => acc + sh.costEur, 0);
        const activeInstalledRev = Number((baseFin.installedTaRevenue * activeFraction).toFixed(2));

        const fin =
          activeFraction < 0.999 && activeFraction > 0
            ? {
                ...baseFin,
                taCount: Number((baseFin.taCount * activeFraction).toFixed(1)),
                installedTaRevenue: activeInstalledRev,
                maxWePotentialRevenue: Number((baseFin.maxWePotentialRevenue * activeFraction).toFixed(2)),
                effectiveEstimatedRevenue: Number((baseFin.effectiveEstimatedRevenue * activeFraction).toFixed(2)),
                estimatedCost: Number(activeCost.toFixed(2)),
                estimatedProfit: Number((activeInstalledRev - activeCost).toFixed(2)),
                sharePercent: Number((activeFraction * 100).toFixed(1)),
              }
            : { ...baseFin, sharePercent: 100 };

        return { addr, fin, baseFin, shares, activeFraction, city };
      })
      .filter(({ addr, fin, shares, activeFraction, city }) => {
        const proj = addr.project_name || 'UGG';
        if (projectFilter !== 'ALL' && proj !== projectFilter) return false;
        if (ortFilter !== 'ALL' && city.toLowerCase() !== ortFilter.toLowerCase()) return false;
        if (categoryFilter !== 'ALL' && fin.categoryKey !== categoryFilter) return false;
        if (stageFilter !== 'ALL' && fin.stage !== stageFilter) return false;
        if (costCenterFilter !== 'ALL' && activeFraction <= 0) return false;
        if (teamFilter !== 'ALL' && activeFraction <= 0) return false;
        if (q) {
          const shareText = shares.map((s) => `${s.team} ${s.cost_center} ${(s.steps || []).join(' ')}`).join(' ');
          const hay = `${addr.strasse || ''} ${addr.hausnummer || ''} ${city} ${addr.plz || ''} ${addr.adress_id || ''} ${addr.projektnummer || ''} ${proj} ${addr.team || ''} ${shareText} ${fin.categoryLabel}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === 'installed_revenue') return (a.fin.installedTaRevenue - b.fin.installedTaRevenue) * dir;
      if (sortBy === 'potential_revenue') return (a.fin.maxWePotentialRevenue - b.fin.maxWePotentialRevenue) * dir;
      if (sortBy === 'estimated_cost') return (a.fin.estimatedCost - b.fin.estimatedCost) * dir;
      if (sortBy === 'estimated_profit') return (a.fin.estimatedProfit - b.fin.estimatedProfit) * dir;
      if (sortBy === 'ta_count') return (a.fin.taCount - b.fin.taCount) * dir;
      if (sortBy === 'total_we') return (a.fin.totalWe - b.fin.totalWe) * dir;
      if (sortBy === 'rate') return (a.fin.ratePerTa - b.fin.ratePerTa) * dir;
      if (sortBy === 'ort') return a.city.localeCompare(b.city, 'de') * dir;
      if (sortBy === 'project') return String(a.addr.project_name || 'UGG').localeCompare(String(b.addr.project_name || 'UGG'), 'de') * dir;
      return `${a.addr.strasse || ''} ${a.addr.hausnummer || ''}`.localeCompare(`${b.addr.strasse || ''} ${b.addr.hausnummer || ''}`, 'de', { numeric: true }) * dir;
    });
  }, [addresses, fieldTeams, calcBuildingProgress, rates, normalizeGemeinde, search, projectFilter, costCenterFilter, ortFilter, categoryFilter, stageFilter, teamFilter, sortBy, sortDir]);

  // Aggregate financial KPIs across filtered objects (including per-Team and per-Cost Center Income, Cost & Profit)
  const summary = useMemo(() => {
    const initBucket = () => ({ count: 0, taCount: 0, totalWe: 0, installedRev: 0, potentialRev: 0, effectiveRev: 0, cost: 0, profit: 0 });
    const stages = {
      planned: initBucket(),
      open: initBucket(),
      completed_unbilled: initBucket(),
      invoiced: initBucket(),
      paid: initBucket(),
    };
    const categories = {
      metalkanal: initBucket(),
      flex_kamin: initBucket(),
    };
    const byProject = new Map();
    const byOrt = new Map();
    const byCostCenter = new Map();
    const byTeam = new Map();

    let totalInstalledRev = 0;
    let totalPotentialRev = 0;
    let totalEffectiveRev = 0;
    let totalEstimatedCost = 0;
    let totalEstimatedProfit = 0;
    let totalTa = 0;
    let totalWe = 0;

    enrichedObjects.forEach(({ addr, fin, baseFin, shares, city }) => {
      const stBucket = stages[fin.stage] || stages.open;
      stBucket.count += 1;
      stBucket.taCount += fin.taCount;
      stBucket.totalWe += fin.totalWe;
      stBucket.installedRev += fin.installedTaRevenue;
      stBucket.potentialRev += fin.maxWePotentialRevenue;
      stBucket.effectiveRev += fin.effectiveEstimatedRevenue;
      stBucket.cost += fin.estimatedCost;
      stBucket.profit += fin.estimatedProfit;

      const catBucket = categories[fin.categoryKey] || categories.metalkanal;
      catBucket.count += 1;
      catBucket.taCount += fin.taCount;
      catBucket.totalWe += fin.totalWe;
      catBucket.installedRev += fin.installedTaRevenue;
      catBucket.potentialRev += fin.maxWePotentialRevenue;
      catBucket.effectiveRev += fin.effectiveEstimatedRevenue;

      totalInstalledRev += fin.installedTaRevenue;
      totalPotentialRev += fin.maxWePotentialRevenue;
      totalEffectiveRev += fin.effectiveEstimatedRevenue;
      totalEstimatedCost += fin.estimatedCost;
      totalEstimatedProfit += fin.estimatedProfit;
      totalTa += fin.taCount;
      totalWe += fin.totalWe;

      // Per-project aggregation
      const pName = addr.project_name || 'UGG';
      if (!byProject.has(pName)) {
        byProject.set(pName, {
          name: pName,
          count: 0,
          taCount: 0,
          totalWe: 0,
          metalkanalCount: 0,
          metalkanalTa: 0,
          metalkanalRev: 0,
          flexKaminCount: 0,
          flexKaminTa: 0,
          flexKaminRev: 0,
          plannedRev: 0,
          openRev: 0,
          readyRev: 0,
          invoicedRev: 0,
          paidRev: 0,
          totalInstalledRev: 0,
          totalPotentialRev: 0,
          totalCost: 0,
          totalProfit: 0,
        });
      }
      const p = byProject.get(pName);
      p.count += 1;
      p.taCount += fin.taCount;
      p.totalWe += fin.totalWe;
      p.totalInstalledRev += fin.installedTaRevenue;
      p.totalPotentialRev += fin.maxWePotentialRevenue;
      p.totalCost += fin.estimatedCost;
      p.totalProfit += fin.estimatedProfit;
      if (fin.categoryKey === 'flex_kamin') {
        p.flexKaminCount += 1;
        p.flexKaminTa += fin.taCount;
        p.flexKaminRev += fin.installedTaRevenue;
      } else {
        p.metalkanalCount += 1;
        p.metalkanalTa += fin.taCount;
        p.metalkanalRev += fin.installedTaRevenue;
      }
      if (fin.stage === 'planned') p.plannedRev += fin.effectiveEstimatedRevenue;
      else if (fin.stage === 'open') p.openRev += fin.installedTaRevenue;
      else if (fin.stage === 'completed_unbilled') p.readyRev += fin.installedTaRevenue;
      else if (fin.stage === 'invoiced') p.invoicedRev += fin.installedTaRevenue;
      else if (fin.stage === 'paid') p.paidRev += fin.installedTaRevenue;

      // Per-Gemeinde aggregation
      if (!byOrt.has(city)) {
        byOrt.set(city, { name: city, count: 0, taCount: 0, totalWe: 0, installedRev: 0, invoicedOrPaidRev: 0 });
      }
      const o = byOrt.get(city);
      o.count += 1;
      o.taCount += fin.taCount;
      o.totalWe += fin.totalWe;
      o.installedRev += fin.installedTaRevenue;
      if (fin.stage === 'invoiced' || fin.stage === 'paid') {
        o.invoicedOrPaidRev += fin.installedTaRevenue;
      }

      // Per-Cost Center & Per-Team proportional aggregation (splits shared 2+ team objects accurately!)
      (shares || []).forEach((sh) => {
        const ccName = sh.cost_center || 'Allgemein / Intern';
        const tName = sh.team || 'Nicht zugewiesen';

        if (costCenterFilter !== 'ALL' && ccName !== costCenterFilter) return;
        if (teamFilter !== 'ALL' && tName !== teamFilter) return;

        // 1. Cost Center bucket
        if (!byCostCenter.has(ccName)) {
          byCostCenter.set(ccName, {
            name: ccName,
            fullObjects: 0,
            splitObjects: 0,
            taShare: 0,
            teams: new Set(),
            plannedRev: 0,
            openRev: 0,
            readyRev: 0,
            invoicedRev: 0,
            paidRev: 0,
            totalInstalledRev: 0,
            totalPotentialRev: 0,
            totalCost: 0,
            totalProfit: 0,
          });
        }
        const cc = byCostCenter.get(ccName);
        if (sh.fraction >= 0.999) cc.fullObjects += 1;
        else cc.splitObjects += 1;
        cc.taShare += sh.taShare;
        if (tName && tName !== 'Nicht zugewiesen') cc.teams.add(tName);

        cc.totalInstalledRev += sh.incomeInstalled;
        cc.totalPotentialRev += sh.incomePotential;
        cc.totalCost += sh.costEur;
        cc.totalProfit += sh.profitEur;
        if (baseFin.stage === 'planned') cc.plannedRev += sh.incomeEffective;
        else if (baseFin.stage === 'open') cc.openRev += sh.incomeInstalled;
        else if (baseFin.stage === 'completed_unbilled') cc.readyRev += sh.incomeInstalled;
        else if (baseFin.stage === 'invoiced') cc.invoicedRev += sh.incomeInstalled;
        else if (baseFin.stage === 'paid') cc.paidRev += sh.incomeInstalled;

        // 2. Per-Team bucket
        if (!byTeam.has(tName)) {
          byTeam.set(tName, {
            name: tName,
            cost_center: ccName,
            fullObjects: 0,
            splitObjects: 0,
            taShare: 0,
            plannedRev: 0,
            openRev: 0,
            readyRev: 0,
            invoicedRev: 0,
            paidRev: 0,
            totalInstalledRev: 0,
            totalPotentialRev: 0,
            totalEffectiveRev: 0,
            totalCost: 0,
            totalProfit: 0,
            tasksCounter: {},
            objectsBreakdown: [],
          });
        }
        const tm = byTeam.get(tName);
        if (sh.fraction >= 0.999) tm.fullObjects += 1;
        else tm.splitObjects += 1;
        tm.taShare += sh.taShare;
        tm.totalInstalledRev += sh.incomeInstalled;
        tm.totalPotentialRev += sh.incomePotential;
        tm.totalEffectiveRev += sh.incomeEffective;
        tm.totalCost += sh.costEur;
        tm.totalProfit += sh.profitEur;

        if (baseFin.stage === 'planned') tm.plannedRev += sh.incomeEffective;
        else if (baseFin.stage === 'open') tm.openRev += sh.incomeInstalled;
        else if (baseFin.stage === 'completed_unbilled') tm.readyRev += sh.incomeInstalled;
        else if (baseFin.stage === 'invoiced') tm.invoicedRev += sh.incomeInstalled;
        else if (baseFin.stage === 'paid') tm.paidRev += sh.incomeInstalled;

        (sh.steps || []).forEach((stLbl) => {
          tm.tasksCounter[stLbl] = (tm.tasksCounter[stLbl] || 0) + 1;
        });

        tm.objectsBreakdown.push({
          addr,
          city,
          stage: baseFin.stage,
          categoryLabel: baseFin.categoryLabel,
          ratePerTa: baseFin.ratePerTa,
          percent: sh.percent,
          steps: sh.steps || [],
          taShare: sh.taShare,
          totalObjectTa: baseFin.taCount,
          totalObjectWe: baseFin.totalWe,
          incomeInstalled: sh.incomeInstalled,
          incomePotential: sh.incomePotential,
          incomeEffective: sh.incomeEffective,
          costEur: sh.costEur,
          profitEur: sh.profitEur,
          isSplit: shares.length > 1 || sh.fraction < 0.999,
        });
      });
    });

    return {
      stages,
      categories,
      totalInstalledRev,
      totalPotentialRev,
      totalEffectiveRev,
      totalEstimatedCost,
      totalEstimatedProfit,
      totalTa: Number(totalTa.toFixed(1)),
      totalWe,
      projectsList: Array.from(byProject.values()).sort((a, b) => b.totalInstalledRev - a.totalInstalledRev),
      orteList: Array.from(byOrt.values()).sort((a, b) => b.installedRev - a.installedRev),
      costCentersList: Array.from(byCostCenter.values())
        .map((c) => ({
          ...c,
          taShare: Number(c.taShare.toFixed(1)),
          teamsList: Array.from(c.teams),
        }))
        .sort((a, b) => b.totalInstalledRev - a.totalInstalledRev),
      teamsList: Array.from(byTeam.values())
        .map((t) => ({
          ...t,
          taShare: Number(t.taShare.toFixed(1)),
        }))
        .sort((a, b) => b.totalInstalledRev - a.totalInstalledRev || b.totalPotentialRev - a.totalPotentialRev),
    };
  }, [enrichedObjects, costCenterFilter, teamFilter]);

  const activeFilterCount = [
    projectFilter !== 'ALL',
    costCenterFilter !== 'ALL',
    ortFilter !== 'ALL',
    categoryFilter !== 'ALL',
    stageFilter !== 'ALL',
    teamFilter !== 'ALL',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearch('');
    setProjectFilter('ALL');
    setCostCenterFilter('ALL');
    setOrtFilter('ALL');
    setCategoryFilter('ALL');
    setStageFilter('ALL');
    setTeamFilter('ALL');
  };

  const stageLabelMap = {
    planned: { label: '📅 Geplant (Terminiert)', bg: '#f8fafc', color: '#334155', border: '#cbd5e1' },
    open: { label: '🔧 Offen / In Bau', bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
    completed_unbilled: { label: '✓ Fertig (Bereit f. RE)', bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
    invoiced: { label: '📄 Rechnung erstellt', bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
    paid: { label: '💰 Rechnung erhalten', bg: '#ecfdf5', color: '#047857', border: '#6ee7b7' },
  };

  const selectStyle = (isActive) => ({
    width: '100%',
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: isActive ? 700 : 500,
    background: isActive ? '#fff7ed' : '#ffffff',
    border: `1px solid ${isActive ? '#FF6B00' : '#cbd5e1'}`,
    color: isActive ? '#9a3412' : '#0f172a',
    borderRadius: 8,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* =====================================================================
          1. TOP HEADER BAR: COST MANAGEMENT TITLE + TARIF BADGES + "+ RECHNUNG"
         ===================================================================== */}
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
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'rgba(255, 107, 0, 0.12)',
              color: '#FF6B00',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Wallet size={19} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Cost Management · Projekt-, Team- &amp; Kostenstellen-Kalkulation
            </h3>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>
              Live synchronisiert mit Objects &amp; Properties · Erlöse &amp; Kosten automatisch pro Team (%, Aufgaben &amp; TA) aufgeteilt
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              background: '#fff7ed',
              border: '1px solid #fdba74',
              fontSize: 11.5,
              fontWeight: 700,
              color: '#9a3412',
            }}
          >
            Metalkabelkanal: {formatEur(rates.metalkanalRate)} / TA
          </span>
          <span
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              background: '#eff6ff',
              border: '1px solid #93c5fd',
              fontSize: 11.5,
              fontWeight: 700,
              color: '#1e40af',
            }}
          >
            Flexrohr / Kaminkanal: {formatEur(rates.flexKaminRate)} / TA
          </span>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              setSubView('abrechnung');
              onQuickCreateInvoiceForAddresses?.();
            }}
            style={{
              padding: '7px 13px',
              fontSize: 12,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={14} />
            <span>+ Rechnung erstellen (Abrechnung)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. CLEAN ANIMATED VIEW / SEARCH / FILTER / SORT / TARIFE BAR
         ===================================================================== */}
      <div className="glass-panel" style={{ padding: 0, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          {/* Segmented Sub-View Switcher */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 4,
              borderRadius: 10,
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
            }}
          >
            {[
              { id: 'overview', label: 'Overview & Kalkulation', icon: TrendingUp },
              { id: 'teams', label: `Teams & Kostenstellen (${summary.teamsList.length})`, icon: Users },
              { id: 'objects', label: `Objekt-Kalkulation (${enrichedObjects.length})`, icon: Building2 },
              { id: 'pipeline', label: 'Finanz-Pipeline (Board)', icon: Columns },
              { id: 'abrechnung', label: `Abrechnung & Rechnungen (${invoices.length})`, icon: Receipt },
            ].map((v) => {
              const IconComp = v.icon;
              const active = subView === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSubView(v.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    background: active ? '#ffffff' : 'transparent',
                    color: active ? '#FF6B00' : '#475569',
                    boxShadow: active ? '0 1px 4px rgba(15, 23, 42, 0.1)' : 'none',
                  }}
                >
                  <IconComp size={14} />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search + Animated Drawer Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '1 1 300px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 190px', maxWidth: 260 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Projekt, Team, Straße, Ort, ID…"
                style={{
                  width: '100%',
                  padding: '7px 26px 7px 30px',
                  fontSize: 12,
                  background: '#f8fafc',
                  border: `1px solid ${search ? '#FF6B00' : '#cbd5e1'}`,
                  borderRadius: 8,
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveDrawer((p) => (p === 'filter' ? null : 'filter'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: activeDrawer === 'filter' || activeFilterCount > 0 ? '1px solid #FF6B00' : '1px solid #cbd5e1',
                background: activeDrawer === 'filter' ? '#FF6B00' : activeFilterCount > 0 ? '#fff7ed' : '#ffffff',
                color: activeDrawer === 'filter' ? '#ffffff' : activeFilterCount > 0 ? '#c2410c' : '#334155',
              }}
            >
              <SlidersHorizontal size={13} />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: activeDrawer === 'filter' ? 'rgba(255,255,255,0.24)' : '#FF6B00', color: '#fff' }}>
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={13} style={{ transition: 'transform 0.2s ease', transform: activeDrawer === 'filter' ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            <button
              type="button"
              onClick={() => setActiveDrawer((p) => (p === 'rates' ? null : 'rates'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: activeDrawer === 'rates' ? '1px solid #0f172a' : '1px solid #cbd5e1',
                background: activeDrawer === 'rates' ? '#0f172a' : '#ffffff',
                color: activeDrawer === 'rates' ? '#ffffff' : '#334155',
              }}
              title="TA-Vergütungssätze & Team-Kostensätze (€/TA) anpassen"
            >
              <Settings size={13} />
              <span>Tarife &amp; Team-Kosten (€/TA)</span>
              <ChevronDown size={13} style={{ transition: 'transform 0.2s ease', transform: activeDrawer === 'rates' ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            <button type="button" className="btn-secondary btn-sm" style={{ padding: '7px 9px' }} onClick={onRefresh} title="Aktualisieren">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* ANIMATED FILTER DRAWER */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: activeDrawer === 'filter' ? '1fr' : '0fr',
            opacity: activeDrawer === 'filter' ? 1 : 0,
            transition: 'grid-template-rows 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
            background: '#f8fafc',
            borderBottom: activeDrawer === 'filter' ? '1px solid #e2e8f0' : 'none',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Projekt</label>
                <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={selectStyle(projectFilter !== 'ALL')}>
                  <option value="ALL">Alle Projekte</option>
                  {filterOptions.projects.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Cost Center / Kostenstelle</label>
                <select value={costCenterFilter} onChange={(e) => setCostCenterFilter(e.target.value)} style={selectStyle(costCenterFilter !== 'ALL')}>
                  <option value="ALL">Alle Cost Center</option>
                  {filterOptions.costCenters.map((cc) => (
                    <option key={cc} value={cc}>KST: {cc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ausbau Team</label>
                <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={selectStyle(teamFilter !== 'ALL')}>
                  <option value="ALL">Alle Teams</option>
                  {filterOptions.teams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Gemeinde / Ort</label>
                <select value={ortFilter} onChange={(e) => setOrtFilter(e.target.value)} style={selectStyle(ortFilter !== 'ALL')}>
                  <option value="ALL">Alle Gemeinden</option>
                  {filterOptions.orte.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ausbau-Tarif</label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={selectStyle(categoryFilter !== 'ALL')}>
                  <option value="ALL">Alle Tarife</option>
                  <option value="metalkanal">Metalkabelkanal ({formatEur(rates.metalkanalRate)}/TA)</option>
                  <option value="flex_kamin">Flexrohr / Kaminkanal ({formatEur(rates.flexKaminRate)}/TA)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Abrechnungs-Phase</label>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={selectStyle(stageFilter !== 'ALL')}>
                  <option value="ALL">Alle Phasen</option>
                  <option value="planned">📅 Geplant (Terminiert)</option>
                  <option value="open">🔧 Offen / In Bau</option>
                  <option value="completed_unbilled">✓ Fertig (Bereit f. RE)</option>
                  <option value="invoiced">📄 Rechnung erstellt (Offen)</option>
                  <option value="paid">💰 Rechnung erhalten (Bezahlt)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn-secondary btn-sm"
                  style={{ padding: '7px 12px', fontSize: 11.5, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                >
                  Filter zurücksetzen
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ANIMATED RATES & PER-TEAM COST CONFIGURATION DRAWER */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: activeDrawer === 'rates' ? '1fr' : '0fr',
            opacity: activeDrawer === 'rates' ? 1 : 0,
            transition: 'grid-template-rows 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
            background: '#f8fafc',
            borderBottom: activeDrawer === 'rates' ? '1px solid #e2e8f0' : 'none',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                    UGG Metalkabelkanal Erlös (€ pro installierter TA)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={rates.metalkanalRate}
                    onChange={(e) => updateRate('metalkanalRate', e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                    UGG Flexrohr / Kaminkanal Erlös (€ pro installierter TA)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={rates.flexKaminRate}
                    onChange={(e) => updateRate('flexKaminRate', e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                    Standard Eigen-/Sub-Kosten (€ pro TA für alle Teams)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={rates.estimatedCostPerTa}
                    onChange={(e) => updateRate('estimatedCostPerTa', e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setRates({ ...DEFAULT_TA_RATES });
                      localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(DEFAULT_TA_RATES));
                    }}
                  >
                    Standard wiederherstellen (162,50 € / 122,50 €)
                  </button>
                </div>
              </div>

              {/* Per-Team Custom Cost Rate Override (€/TA) */}
              {filterOptions.teams.length > 0 && (
                <div style={{ paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
                    Individueller Kostensatz pro Team (€ / TA) — falls ein Subunternehmer-Team einen eigenen Satz pro TA erhält:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 8 }}>
                    {filterOptions.teams.map((tName) => {
                      const customVal = rates.teamCostRates?.[tName] ?? '';
                      return (
                        <div key={tName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '5px 8px', borderRadius: 7, background: '#ffffff', border: '1px solid #cbd5e1' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tName}
                          </span>
                          <input
                            type="number"
                            step="1"
                            placeholder={`${rates.estimatedCostPerTa} €/TA`}
                            value={customVal}
                            onChange={(e) => updateTeamCostRate(tName, e.target.value)}
                            style={{ width: 78, padding: '4px 6px', fontSize: 11.5, fontWeight: 700, borderRadius: 5, border: '1px solid #cbd5e1', textAlign: 'right' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===================================================================
            VIEW 1: OVERVIEW & PROJEKT-KALKULATION (ANIMATED BI DASHBOARD)
           =================================================================== */}
        {subView === 'overview' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Top 6 Financial Stage KPI Cards (Clickable to filter by Stage!) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {[
                {
                  id: 'ALL',
                  title: 'Gesamt-Erlös (Erfasste TA)',
                  amount: summary.totalInstalledRev,
                  sub: `Kosten: ${formatEur(summary.totalEstimatedCost)} · DB: ${formatEur(summary.totalEstimatedProfit)}`,
                  meta: `${enrichedObjects.length} Objekte · ${summary.totalTa} / ${summary.totalWe} TA`,
                  accent: '#0f172a',
                  bg: '#f8fafc',
                },
                {
                  id: 'planned',
                  title: '📅 Geplant (Terminiert)',
                  amount: summary.stages.planned.effectiveRev,
                  sub: `Erfasste TA: ${formatEur(summary.stages.planned.installedRev)}`,
                  meta: `${summary.stages.planned.count} Objekte · ${summary.stages.planned.taCount}/${summary.stages.planned.totalWe} TA`,
                  accent: '#475569',
                  bg: '#ffffff',
                },
                {
                  id: 'open',
                  title: '🔧 Offen / In Arbeit (Restarbeiten)',
                  amount: summary.stages.open.installedRev,
                  sub: `Team-Kosten: ${formatEur(summary.stages.open.cost)} · DB: ${formatEur(summary.stages.open.profit)}`,
                  meta: `${summary.stages.open.count} Objekte · ${summary.stages.open.taCount} TA`,
                  accent: '#f97316',
                  bg: '#fff7ed',
                },
                {
                  id: 'completed_unbilled',
                  title: '✓ Fertig (Bereit f. Abrechnung)',
                  amount: summary.stages.completed_unbilled.installedRev,
                  sub: `Team-Kosten: ${formatEur(summary.stages.completed_unbilled.cost)} · DB: ${formatEur(summary.stages.completed_unbilled.profit)}`,
                  meta: `${summary.stages.completed_unbilled.count} Objekte · ${summary.stages.completed_unbilled.taCount} TA`,
                  accent: '#16a34a',
                  bg: '#f0fdf4',
                },
                {
                  id: 'invoiced',
                  title: '📄 Rechnung erstellt (Offen)',
                  amount: summary.stages.invoiced.installedRev,
                  sub: `Team-Kosten: ${formatEur(summary.stages.invoiced.cost)} · DB: ${formatEur(summary.stages.invoiced.profit)}`,
                  meta: `${summary.stages.invoiced.count} Objekte · ${summary.stages.invoiced.taCount} TA`,
                  accent: '#2563eb',
                  bg: '#eff6ff',
                },
                {
                  id: 'paid',
                  title: '💰 Rechnung erhalten (Bezahlt)',
                  amount: summary.stages.paid.installedRev,
                  sub: `Team-Kosten: ${formatEur(summary.stages.paid.cost)} · DB: ${formatEur(summary.stages.paid.profit)}`,
                  meta: `${summary.stages.paid.count} Objekte · ${summary.stages.paid.taCount} TA`,
                  accent: '#059669',
                  bg: '#ecfdf5',
                },
              ].map((card) => {
                const isSelected = stageFilter === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => setStageFilter((prev) => (prev === card.id ? 'ALL' : card.id))}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 11,
                      background: card.bg,
                      border: isSelected ? `2px solid ${card.accent}` : '1px solid #e2e8f0',
                      borderLeft: `4px solid ${card.accent}`,
                      cursor: 'pointer',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                      boxShadow: isSelected ? '0 6px 18px rgba(15,23,42,0.08)' : '0 1px 3px rgba(15,23,42,0.03)',
                    }}
                    title="Klicken, um nach dieser Phase zu filtern"
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{card.title}</div>
                    <div style={{ fontSize: 19, fontWeight: 900, color: '#0f172a', marginTop: 4, fontFamily: 'monospace' }}>
                      {formatEur(card.amount)}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: card.accent, marginTop: 3 }}>{card.meta}</div>
                    <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>{card.sub}</div>
                  </div>
                );
              })}
            </div>

            {/* Animated Visual Progression & Revenue Pipeline Bar */}
            <div style={{ padding: '14px 16px', borderRadius: 11, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <strong style={{ fontSize: 12.5, color: '#0f172a' }}>
                  Erlös-, Kosten- &amp; Ausbau-Progression (Erlös: {formatEur(summary.totalInstalledRev)} · Team-Kosten: {formatEur(summary.totalEstimatedCost)} · Deckungsbeitrag: {formatEur(summary.totalEstimatedProfit)})
                </strong>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  Metalkabelkanal: {formatEur(summary.categories.metalkanal.installedRev)} ({summary.categories.metalkanal.taCount} TA) · Flexrohr/Kaminkanal: {formatEur(summary.categories.flex_kamin.installedRev)} ({summary.categories.flex_kamin.taCount} TA)
                </span>
              </div>

              {(() => {
                const denom = Math.max(1, summary.totalEffectiveRev);
                const segments = [
                  { label: 'Bezahlt', val: summary.stages.paid.installedRev, color: '#059669' },
                  { label: 'RE erstellt', val: summary.stages.invoiced.installedRev, color: '#2563eb' },
                  { label: 'Bereit f. RE', val: summary.stages.completed_unbilled.installedRev, color: '#16a34a' },
                  { label: 'Offen / In Bau', val: summary.stages.open.installedRev, color: '#f97316' },
                  { label: 'Geplant', val: summary.stages.planned.effectiveRev, color: '#94a3b8' },
                ];
                return (
                  <>
                    <div style={{ height: 14, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', display: 'flex' }}>
                      {segments.map((seg) => {
                        const pct = Math.max(0, (seg.val / denom) * 100);
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={seg.label}
                            style={{
                              width: `${pct}%`,
                              background: seg.color,
                              transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                            title={`${seg.label}: ${formatEur(seg.val)} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
                      {segments.map((seg) => (
                        <div key={seg.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#334155' }}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, background: seg.color }} />
                          <span>{seg.label}: {formatEur(seg.val)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Detailed Per-Team Income, Cost & Margin Breakdown in Overview */}
            {summary.teamsList.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={15} style={{ color: '#FF6B00' }} /> Erlöse (Income) &amp; Kosten (Cost) nach Teams ({summary.teamsList.length})
                    </strong>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Anteilige Berechnung nach Prozent (%), Aufgaben (TA, Flex, HÜP, Spleißen) und installierten TAs · Klicken zum Filtern
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setSubView('teams')}
                    style={{ fontSize: 11.5, fontWeight: 700 }}
                  >
                    Detaillierte Team- &amp; Aufgaben-Ansicht öffnen →
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                  {summary.teamsList.map((tm) => {
                    const isSelected = teamFilter === tm.name;
                    const taskBadges = Object.entries(tm.tasksCounter || {});
                    return (
                      <div
                        key={tm.name}
                        onClick={() => setTeamFilter((prev) => (prev === tm.name ? 'ALL' : tm.name))}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          background: isSelected ? '#fff7ed' : '#ffffff',
                          border: isSelected ? '2px solid #FF6B00' : '1px solid #e2e8f0',
                          borderLeft: '4px solid #0f172a',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 9,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{tm.name}</strong>
                              <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74' }}>
                                KST: {tm.cost_center}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                              {tm.fullObjects} ganze Objekte{tm.splitObjects > 0 ? ` · ${tm.splitObjects} geteilt (%/Tasks)` : ''} · <strong>{tm.taShare} TA-Anteil</strong>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Erlös-Anteil</div>
                            <div style={{ fontSize: 16.5, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
                              {formatEur(tm.totalInstalledRev)}
                            </div>
                          </div>
                        </div>

                        {/* Income vs Cost vs Margin Box */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11 }}>
                          <div>
                            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>ERLÖS (INCOME)</div>
                            <strong style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: 12.5 }}>{formatEur(tm.totalInstalledRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#c2410c', fontSize: 10, fontWeight: 700 }}>TEAM-KOSTEN</div>
                            <strong style={{ color: '#c2410c', fontFamily: 'monospace', fontSize: 12.5 }}>{formatEur(tm.totalCost)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#15803d', fontSize: 10, fontWeight: 700 }}>DECKUNGSBEITRAG</div>
                            <strong style={{ color: tm.totalProfit >= 0 ? '#15803d' : '#dc2626', fontFamily: 'monospace', fontSize: 12.5 }}>
                              {formatEur(tm.totalProfit)}
                            </strong>
                          </div>
                        </div>

                        {taskBadges.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {taskBadges.map(([lbl, cnt]) => (
                              <span
                                key={lbl}
                                style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
                              >
                                {lbl} ({cnt}×)
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, paddingTop: 6, borderTop: '1px solid #f1f5f9', fontSize: 10 }}>
                          <div>
                            <div style={{ color: '#64748b', fontWeight: 600 }}>Geplant</div>
                            <strong style={{ color: '#334155', fontFamily: 'monospace' }}>{formatEur(tm.plannedRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#c2410c', fontWeight: 600 }}>Offen</div>
                            <strong style={{ color: '#c2410c', fontFamily: 'monospace' }}>{formatEur(tm.openRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#15803d', fontWeight: 600 }}>Bereit f. RE</div>
                            <strong style={{ color: '#15803d', fontFamily: 'monospace' }}>{formatEur(tm.readyRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#1d4ed8', fontWeight: 600 }}>RE erstellt</div>
                            <strong style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{formatEur(tm.invoicedRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#047857', fontWeight: 600 }}>RE erhalten</div>
                            <strong style={{ color: '#047857', fontFamily: 'monospace' }}>{formatEur(tm.paidRev)}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cost Center / Kostenstellen Abrechnung (Separated by Cost Center incl. 2+ Team Splits) */}
            {summary.costCentersList.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <strong style={{ fontSize: 13.5, color: '#0f172a' }}>
                    Cost Center / Kostenstellen Abrechnung ({summary.costCentersList.length})
                  </strong>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Geteilte Objekte (2+ Teams / Arbeitsschritte) werden automatisch anteilig nach Erlös &amp; Kosten berechnet · Klicken zum Filtern
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 12 }}>
                  {summary.costCentersList.map((cc) => {
                    const isSelected = costCenterFilter === cc.name;
                    return (
                      <div
                        key={cc.name}
                        onClick={() => setCostCenterFilter((prev) => (prev === cc.name ? 'ALL' : cc.name))}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          background: isSelected ? '#fff7ed' : '#ffffff',
                          border: isSelected ? '2px solid #FF6B00' : '1px solid #e2e8f0',
                          borderLeft: '4px solid #FF6B00',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74' }}>
                              KST: {cc.name}
                            </span>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                              {cc.fullObjects} ganze Objekte{cc.splitObjects > 0 ? ` · ${cc.splitObjects} geteilt (%)` : ''} · {cc.taShare} TA
                              {cc.teamsList.length > 0 ? ` · Teams: ${cc.teamsList.join(', ')}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16.5, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
                              {formatEur(cc.totalInstalledRev)}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#c2410c', fontWeight: 700 }}>
                              Kosten: {formatEur(cc.totalCost)} · DB: <span style={{ color: '#15803d' }}>{formatEur(cc.totalProfit)}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, paddingTop: 6, borderTop: '1px solid #f1f5f9', fontSize: 10.5 }}>
                          <div>
                            <div style={{ color: '#64748b', fontWeight: 600 }}>Geplant</div>
                            <strong style={{ color: '#334155', fontFamily: 'monospace' }}>{formatEur(cc.plannedRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#c2410c', fontWeight: 600 }}>Offen</div>
                            <strong style={{ color: '#c2410c', fontFamily: 'monospace' }}>{formatEur(cc.openRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#15803d', fontWeight: 600 }}>Bereit f. RE</div>
                            <strong style={{ color: '#15803d', fontFamily: 'monospace' }}>{formatEur(cc.readyRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#1d4ed8', fontWeight: 600 }}>RE erstellt</div>
                            <strong style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{formatEur(cc.invoicedRev)}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#047857', fontWeight: 600 }}>RE erhalten</div>
                            <strong style={{ color: '#047857', fontFamily: 'monospace' }}>{formatEur(cc.paidRev)}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-Project Financial Breakdown Cards */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13.5, color: '#0f172a' }}>
                  Projekt-Finanzübersicht &amp; Tarif-Aufschlüsselung ({summary.projectsList.length} Projekte)
                </strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                {summary.projectsList.map((proj) => (
                  <div
                    key={proj.name}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#faf5ff', color: '#6b21a8', border: '1px solid #d8b4fe' }}>
                          Projekt: {proj.name}
                        </span>
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
                          {proj.count} Objekte · {proj.taCount} installierte TA von {proj.totalWe} WE
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
                          {formatEur(proj.totalInstalledRev)}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>
                          Kosten: {formatEur(proj.totalCost)} · DB: <strong style={{ color: '#15803d' }}>{formatEur(proj.totalProfit)}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Metalkabelkanal vs Flexrohr/Kaminkanal Breakdown inside Project */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#9a3412' }}>
                          Metalkabelkanal ({formatEur(rates.metalkanalRate)}/TA)
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                          {formatEur(proj.metalkanalRev)}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#c2410c' }}>
                          {proj.metalkanalCount} Häuser · {proj.metalkanalTa} TA
                        </div>
                      </div>

                      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1e40af' }}>
                          Flexrohr/Kaminkanal ({formatEur(rates.flexKaminRate)}/TA)
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                          {formatEur(proj.flexKaminRev)}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#1d4ed8' }}>
                          {proj.flexKaminCount} Häuser · {proj.flexKaminTa} TA
                        </div>
                      </div>
                    </div>

                    {/* Stage Amounts inside Project */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, paddingTop: 6, borderTop: '1px solid #f1f5f9', fontSize: 10.5 }}>
                      <div>
                        <div style={{ color: '#64748b', fontWeight: 600 }}>Geplant</div>
                        <strong style={{ color: '#334155', fontFamily: 'monospace' }}>{formatEur(proj.plannedRev)}</strong>
                      </div>
                      <div>
                        <div style={{ color: '#c2410c', fontWeight: 600 }}>Offen</div>
                        <strong style={{ color: '#c2410c', fontFamily: 'monospace' }}>{formatEur(proj.openRev)}</strong>
                      </div>
                      <div>
                        <div style={{ color: '#15803d', fontWeight: 600 }}>Bereit f. RE</div>
                        <strong style={{ color: '#15803d', fontFamily: 'monospace' }}>{formatEur(proj.readyRev)}</strong>
                      </div>
                      <div>
                        <div style={{ color: '#1d4ed8', fontWeight: 600 }}>RE erstellt</div>
                        <strong style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{formatEur(proj.invoicedRev)}</strong>
                      </div>
                      <div>
                        <div style={{ color: '#047857', fontWeight: 600 }}>RE erhalten</div>
                        <strong style={{ color: '#047857', fontFamily: 'monospace' }}>{formatEur(proj.paidRev)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-Gemeinde Revenue Distribution */}
            {summary.orteList.length > 0 && (
              <div style={{ padding: 14, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <strong style={{ fontSize: 13, color: '#0f172a', display: 'block', marginBottom: 10 }}>
                  Umsatz-Verteilung nach Gemeinde / Ort
                </strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                  {summary.orteList.map((o) => {
                    const maxOrtRev = Math.max(1, summary.orteList[0]?.installedRev || 1);
                    const widthPct = Math.min(100, Math.round((o.installedRev / maxOrtRev) * 100));
                    return (
                      <div
                        key={o.name}
                        onClick={() => setOrtFilter((prev) => (prev === o.name ? 'ALL' : o.name))}
                        style={{
                          padding: '9px 11px',
                          borderRadius: 8,
                          background: ortFilter === o.name ? '#fff7ed' : '#f8fafc',
                          border: `1px solid ${ortFilter === o.name ? '#FF6B00' : '#e2e8f0'}`,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <strong style={{ color: '#0f172a' }}>{o.name}</strong>
                          <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{formatEur(o.installedRev)}</strong>
                        </div>
                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                          {o.count} Objekte · {o.taCount}/{o.totalWe} TA · Abgerechnet: {formatEur(o.invoicedOrPaidRev)}
                        </div>
                        <div style={{ height: 5, borderRadius: 999, background: '#e2e8f0', marginTop: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${widthPct}%`, height: '100%', background: '#FF6B00', transition: 'width 0.35s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            VIEW 2: TEAMS & KOSTENSTELLEN (DETAILED INCOME, COST & TASK DRILLDOWN)
           =================================================================== */}
        {subView === 'teams' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>
                  Detaillierte Team- &amp; Kostenstellen-Kalkulation (Erlöse, Kosten, Aufgaben &amp; Objekte)
                </h4>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>
                  Zeigt für jedes Team den genauen Anteil am UGG-Erlös (162,50 €/TA bzw. 122,50 €/TA), die kalkulierten Team-Kosten und den Deckungsbeitrag pro Objekt und Aufgabe.
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setActiveDrawer((p) => (p === 'rates' ? null : 'rates'))}
                style={{ fontSize: 11.5, fontWeight: 700 }}
              >
                <Settings size={13} /> Team-Kostensätze (€/TA) anpassen
              </button>
            </div>

            {summary.teamsList.map((tm) => {
              const isExpanded = Boolean(expandedTeamDetails[tm.name]);
              const customTeamRate = rates.teamCostRates?.[tm.name];
              const effectiveTeamRate =
                customTeamRate !== undefined && customTeamRate !== '' ? Number(customTeamRate) : rates.estimatedCostPerTa;
              return (
                <div
                  key={tm.name}
                  style={{
                    borderRadius: 12,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: '4px solid #FF6B00',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                      background: '#f8fafc',
                      borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15, color: '#0f172a' }}>{tm.name}</strong>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74' }}>
                          KST: {tm.cost_center}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#334155' }}>
                          Kostensatz: {formatEur(effectiveTeamRate)} / TA
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        {tm.fullObjects} ganze Objekte · {tm.splitObjects} geteilte Objekte (%/Tasks) · <strong>{tm.taShare} TA-Anteil</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Erlös-Anteil (Income)</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
                          {formatEur(tm.totalInstalledRev)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>Potenzial: {formatEur(tm.totalPotentialRev)}</div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>Team-Kosten (Cost)</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#c2410c', fontFamily: 'monospace' }}>
                          {formatEur(tm.totalCost)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{tm.taShare} TA × Satz</div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>Deckungsbeitrag</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: tm.totalProfit >= 0 ? '#15803d' : '#dc2626', fontFamily: 'monospace' }}>
                          {formatEur(tm.totalProfit)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          Bereit/Abger.: {formatEur(tm.readyRev + tm.invoicedRev + tm.paidRev)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() =>
                          setExpandedTeamDetails((prev) => ({ ...prev, [tm.name]: !prev[tm.name] }))
                        }
                        style={{ fontSize: 11.5, fontWeight: 700 }}
                      >
                        {isExpanded ? 'Objekte ausblenden ▲' : `Objekte & Aufgaben (${tm.objectsBreakdown.length}) ▼`}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '10px 14px', overflowX: 'auto' }}>
                      <table className="no-min-width" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase' }}>
                            <th style={{ padding: '7px 8px' }}>Objekt / Adresse</th>
                            <th style={{ padding: '7px 8px' }}>Tarif</th>
                            <th style={{ padding: '7px 8px' }}>Team-Anteil &amp; Aufgaben</th>
                            <th style={{ padding: '7px 8px', textAlign: 'center' }}>TA-Anteil</th>
                            <th style={{ padding: '7px 8px', textAlign: 'right' }}>Erlös-Anteil (€)</th>
                            <th style={{ padding: '7px 8px', textAlign: 'right' }}>Team-Kosten (€)</th>
                            <th style={{ padding: '7px 8px', textAlign: 'right' }}>Marge (€)</th>
                            <th style={{ padding: '7px 8px', textAlign: 'right' }}>Aufteilung</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tm.objectsBreakdown.map((item) => (
                            <tr key={`${tm.name}-${item.addr.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '7px 8px' }}>
                                <strong style={{ color: '#0f172a' }}>
                                  {item.addr.strasse} {item.addr.hausnummer}
                                </strong>
                                <div style={{ fontSize: 10.5, color: '#64748b' }}>
                                  {item.addr.plz} {item.city} · {item.addr.project_name || 'UGG'}
                                </div>
                              </td>
                              <td style={{ padding: '7px 8px', fontSize: 11 }}>
                                {item.categoryLabel} ({formatEur(item.ratePerTa)}/TA)
                              </td>
                              <td style={{ padding: '7px 8px' }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: 6,
                                    background: item.isSplit ? '#fff7ed' : '#f1f5f9',
                                    color: item.isSplit ? '#c2410c' : '#334155',
                                    border: `1px solid ${item.isSplit ? '#fdba74' : '#cbd5e1'}`,
                                  }}
                                >
                                  {item.percent}%
                                </span>
                                {item.steps.length > 0 && (
                                  <span style={{ marginLeft: 6, fontSize: 10.5, color: '#475569', fontWeight: 600 }}>
                                    Aufgaben: {item.steps.join(', ')}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700 }}>
                                {item.taShare} / {item.totalObjectTa} TA
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                                {formatEur(item.incomeInstalled)}
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#c2410c' }}>
                                {formatEur(item.costEur)}
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: item.profitEur >= 0 ? '#15803d' : '#dc2626' }}>
                                {formatEur(item.profitEur)}
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  style={{ padding: '3px 8px', fontSize: 10.5 }}
                                  onClick={() => setTeamSplitTargetAddr(item.addr)}
                                >
                                  Teams / % &amp; Tasks
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===================================================================
            VIEW 3: OBJEKT-KALKULATION (PER-BUILDING FINANCIAL TABLE)
           =================================================================== */}
        {subView === 'objects' && (
          <div style={{ padding: '12px 14px' }}>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table className="no-min-width" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '9px 10px', cursor: 'pointer' }} onClick={() => { setSortBy('project'); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}>Projekt &amp; Teams / KST</th>
                    <th style={{ padding: '9px 10px', cursor: 'pointer' }} onClick={() => { setSortBy('ort'); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}>Adresse &amp; Gemeinde</th>
                    <th style={{ padding: '9px 10px' }}>Ausbau-Typ &amp; Tarif (€/TA)</th>
                    <th style={{ padding: '9px 10px', cursor: 'pointer', textAlign: 'center' }} onClick={() => { setSortBy('ta_count'); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}>TA / WE</th>
                    <th style={{ padding: '9px 10px', cursor: 'pointer', textAlign: 'right' }} onClick={() => { setSortBy('installed_revenue'); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}>Erlös (Erfasste TA)</th>
                    <th style={{ padding: '9px 10px', cursor: 'pointer', textAlign: 'right' }} onClick={() => { setSortBy('estimated_cost'); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}>Team-Kosten</th>
                    <th style={{ padding: '9px 10px', cursor: 'pointer', textAlign: 'right' }} onClick={() => { setSortBy('estimated_profit'); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}>Marge / DB</th>
                    <th style={{ padding: '9px 10px' }}>Phase / Status</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right' }}>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedObjects.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                        Keine Objekte für die aktuellen Filter gefunden.
                      </td>
                    </tr>
                  ) : (
                    enrichedObjects.map(({ addr, fin, shares, city }) => {
                      const stBadge = stageLabelMap[fin.stage] || stageLabelMap.open;
                      return (
                        <tr key={addr.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 700, color: '#6b21a8' }}>
                            <div>{addr.project_name || 'UGG'}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                              {(shares || []).map((sh) => (
                                <span
                                  key={`${sh.team}-${sh.cost_center}`}
                                  style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa', display: 'inline-block' }}
                                >
                                  {sh.team} ({sh.percent}% · KST: {sh.cost_center})
                                  {sh.steps && sh.steps.length > 0 ? ` [${sh.steps.join('·')}]` : ''}
                                  {shares.length > 1 ? ` → ${formatEur(sh.incomeInstalled)}` : ''}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '9px 10px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                              {addr.strasse} {addr.hausnummer}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {addr.plz} {city} · ID: {addr.adress_id || addr.projektnummer || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '9px 10px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: fin.categoryKey === 'flex_kamin' ? '#eff6ff' : '#fff7ed',
                                color: fin.categoryKey === 'flex_kamin' ? '#1d4ed8' : '#9a3412',
                                border: `1px solid ${fin.categoryKey === 'flex_kamin' ? '#93c5fd' : '#fdba74'}`,
                              }}
                            >
                              {fin.categoryLabel} · {formatEur(fin.ratePerTa)}/TA
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700 }}>
                            <span style={{ color: fin.taCount > 0 ? '#15803d' : '#64748b' }}>{fin.taCount}</span> / {fin.totalWe} TA
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                            <div>{formatEur(fin.installedTaRevenue)}</div>
                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Max: {formatEur(fin.maxWePotentialRevenue)}</div>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#c2410c' }}>
                            {formatEur(fin.estimatedCost)}
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: fin.estimatedProfit >= 0 ? '#15803d' : '#dc2626' }}>
                            {formatEur(fin.estimatedProfit)}
                          </td>
                          <td style={{ padding: '9px 10px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                background: stBadge.bg,
                                color: stBadge.color,
                                border: `1px solid ${stBadge.border}`,
                              }}
                            >
                              {stBadge.label}
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 5 }}>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  background: shares.length > 1 ? '#fff7ed' : '#f8fafc',
                                  color: shares.length > 1 ? '#c2410c' : '#334155',
                                  borderColor: shares.length > 1 ? '#fdba74' : '#cbd5e1',
                                }}
                                onClick={() => setTeamSplitTargetAddr(addr)}
                                title="Mehrere Teams, Prozent-Aufteilung & Aufgaben für dieses Objekt festlegen"
                              >
                                <Users size={11} /> Teams / %
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => onOpenBuilding?.(addr.id)}
                              >
                                Objekt →
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
          </div>
        )}

        {/* ===================================================================
            VIEW 4: FINANZ-PIPELINE (5-COLUMN FINANCIAL STAGE BOARD)
           =================================================================== */}
        {subView === 'pipeline' && (
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(5, minmax(235px, 1fr))', gap: 10, overflowX: 'auto' }}>
            {[
              { key: 'planned', title: '📅 Geplant (Terminiert)', bg: '#f8fafc', border: '#cbd5e1', text: '#334155' },
              { key: 'open', title: '🔧 Offen / In Bau', bg: '#fff7ed', border: '#fdba74', text: '#9a3412' },
              { key: 'completed_unbilled', title: '✓ Fertig (Bereit f. RE)', bg: '#f0fdf4', border: '#86efac', text: '#14532d' },
              { key: 'invoiced', title: '📄 Rechnung erstellt', bg: '#eff6ff', border: '#93c5fd', text: '#1e3a8a' },
              { key: 'paid', title: '💰 Rechnung erhalten', bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
            ].map((col) => {
              const items = enrichedObjects.filter((x) => x.fin.stage === col.key);
              const colSum = items.reduce((acc, x) => acc + (col.key === 'planned' ? x.fin.effectiveEstimatedRevenue : x.fin.installedTaRevenue), 0);
              const colTa = items.reduce((acc, x) => acc + x.fin.taCount, 0);

              return (
                <div
                  key={col.key}
                  style={{
                    background: col.bg,
                    border: `1.5px solid ${col.border}`,
                    borderRadius: 11,
                    padding: 10,
                    minHeight: 460,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ paddingBottom: 8, borderBottom: `1px solid ${col.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 12, color: col.text }}>{col.title}</strong>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#fff', color: col.text, border: `1px solid ${col.border}` }}>
                        {items.length}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', marginTop: 4 }}>
                      {formatEur(colSum)}
                    </div>
                    <div style={{ fontSize: 10.5, color: col.text, opacity: 0.85 }}>
                      {Number(colTa.toFixed(1))} installierte TA
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 560, overflowY: 'auto' }}>
                    {items.map(({ addr, fin, shares, city }) => (
                      <div
                        key={addr.id}
                        style={{
                          padding: '9px 10px',
                          borderRadius: 8,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <strong style={{ fontSize: 12, color: '#0f172a' }}>
                            {addr.strasse} {addr.hausnummer}
                          </strong>
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => setTeamSplitTargetAddr(addr)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: 5, background: '#f8fafc', color: '#475569', cursor: 'pointer', padding: '1px 5px', fontSize: 9.5, fontWeight: 700 }}
                              title="Teams / % & Aufgaben aufteilen"
                            >
                              %
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenBuilding?.(addr.id)}
                              style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 0 }}
                            >
                              <ArrowUpRight size={13} />
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>
                          {city} · {addr.project_name || 'UGG'}
                        </div>
                        {shares && shares.length > 0 && shares[0].team !== 'Nicht zugewiesen' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {shares.map((sh) => (
                              <span
                                key={sh.team}
                                style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}
                              >
                                {sh.team} ({sh.percent}%)
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: fin.categoryKey === 'flex_kamin' ? '#1d4ed8' : '#9a3412' }}>
                            {fin.taCount}/{fin.totalWe} TA × {formatEur(fin.ratePerTa)}
                          </span>
                          <strong style={{ fontSize: 12, fontFamily: 'monospace', color: '#0f172a' }}>
                            {formatEur(col.key === 'planned' ? fin.effectiveEstimatedRevenue : fin.installedTaRevenue)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =====================================================================
          VIEW 5: ABRECHNUNG & RECHNUNGEN (INVOICE CREATION & MANAGEMENT)
         ===================================================================== */}
      {subView === 'abrechnung' && renderAbrechnungInvoicesView?.()}

      {/* MULTI-TEAM & TASK SPLIT MODAL */}
      {teamSplitTargetAddr && (
        <TeamSplitModal
          addr={teamSplitTargetAddr}
          fieldTeams={fieldTeams}
          rates={rates}
          onClose={() => setTeamSplitTargetAddr(null)}
          onSave={(teamSummaryLabel, allocations) => {
            onPatchBuilding?.(teamSplitTargetAddr.id, {
              team: teamSummaryLabel,
              team_allocations: allocations,
            });
          }}
        />
      )}
    </div>
  );
}
