import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Clock, Calendar, FileText, HeartPulse, Plus, Check, X, Upload,
  Building2, MapPin, Video, Image, ShieldAlert, ArrowRightLeft, Lock, Edit3,
  MessageSquare, Download, ChevronLeft, ChevronRight, BarChart3, GripVertical,
  Search, KeyRound, Trash2, ShieldCheck, Briefcase, PhoneCall, AlertTriangle
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, TIER_LABELS, formatEuro, formatDate, formatDateTime, formatDateRange } from '../core/api';
import { TASK_STATUS_CONFIG, getStatusStyle } from '../core/i18n';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHead, SubTabs, useQuickAction, Empty, downloadCsv } from '../components/ui';

// ==============================================================================
// EXECUTIVE COMMAND DASHBOARD (app.bruenel.de Overview)
// ==============================================================================

export const ExecutiveDashboard = ({ user }) => {
  const [stats, setStats] = useState({
    projects: [],
    employees: [],
    timeLogs: [],
    leaves: [],
    sales: null,
    accounting: null,
    stock: [],
  });
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([
      fetchWithToken('/api/v1/projects').catch(() => []),
      fetchWithToken('/api/v1/hr/employees').catch(() => []),
      fetchWithToken('/api/v1/hr/time-logs').catch(() => []),
      fetchWithToken('/api/v1/hr/leave-requests').catch(() => []),
      fetchWithToken('/api/v1/sales/dashboard').catch(() => null),
      fetchWithToken('/api/v1/accounting/summary').catch(() => null),
      fetchWithToken('/api/v1/inventory/stock').catch(() => []),
    ])
      .then(([projects, employees, timeLogs, leaves, sales, accounting, stock]) => {
        setStats({ projects, employees, timeLogs, leaves, sales, accounting, stock });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading Executive Command Center...</p>;

  const activeProjects = stats.projects.filter(p => p.status === 'Active').length;
  const pendingLeaves = stats.leaves.filter(l => l.status === 'Pending').length;
  const activeShifts = stats.timeLogs.filter(t => !t.check_out_time).length;
  const lowStockCount = stats.stock.filter(s => s.low_stock_alert).length;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '20px' }}>
        <div>
          <h2>Brünel ERP & Field Operations Command Center</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
            Real-time operational telemetry across `app.bruenel.de` (Management) & `portal.bruenel.de` (Field Workforce).
          </p>
        </div>
        <span className="badge" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
          {TIER_LABELS[user.role_tier || 1]}
        </span>
      </div>

      <div className="glass-panel" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick actions</span>
        {[
          ['New Employee', '/hr/employees', 'add-employee'],
          ['Assign Task', '/projects/tasks', 'add-task'],
          ['New Building Object', '/projects/objects', 'add-object'],
          ['Material Buchen', '/inventory/stock', 'buchen'],
          ['Record Expense', '/accounting/expenses', 'add-expense'],
          ['Issue Payslip', '/hr/payslips', 'add-payslip'],
        ].map(([label, to, action]) => (
          <button key={action} className="btn-secondary btn-sm" onClick={() => nav(to, { state: { action, t: Date.now() } })}>+ {label}</button>
        ))}
      </div>

      {/* Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-panel kpi">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ACTIVE PROJECTS & OBJECTS</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent)', margin: '6px 0' }}>{activeProjects}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {stats.projects.reduce((s, p) => s + (p.objects_count || 0), 0)} Building Objects ({stats.projects.reduce((s, p) => s + (p.total_units || 0), 0)} WE)
          </div>
        </div>

        <div className="glass-panel kpi">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>WORKFORCE & ACTIVE CHECK-INS</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#059669', margin: '6px 0' }}>{stats.employees.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {activeShifts} live on-site shifts • {pendingLeaves} pending Urlaub
          </div>
        </div>

        <div className="glass-panel kpi">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>FIELD SALES & PROVISION</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#2563eb', margin: '6px 0' }}>
            {formatEuro(stats.sales?.total_revenue)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {formatEuro(stats.sales?.total_commission)} earned commissions ({stats.sales?.total_units_sold || 0} units)
          </div>
        </div>

        <div className="glass-panel kpi">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>INVENTORY & EXPENSES</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: lowStockCount > 0 ? '#d97706' : '#7c3aed', margin: '6px 0' }}>
            {formatEuro(stats.accounting?.total_expenses_gross)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {stats.accounting?.pending_expenses_count || 0} pending expenses • {lowStockCount} low-stock SKUs
          </div>
        </div>
      </div>

      {/* Active Projects & Recent Field Operations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Active Fiber & Infrastructure Projects</h3>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Project</th>
                <th style={{ padding: '8px' }}>Manager</th>
                <th style={{ padding: '8px' }}>Objects / WE</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.projects.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.code} • {p.region_name}</div>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{p.manager_name}</td>
                  <td style={{ padding: '10px 8px' }}>{p.completed_objects_count}/{p.objects_count} Objects ({p.total_units} WE)</td>
                  <td style={{ padding: '10px 8px' }}><span className="badge">{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-panel">
          <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Recent Audit Trail (Trigger & RBAC Log)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
            {(stats.accounting?.recent_audit_logs || []).length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No recent mutations logged.</p>
            ) : (
              stats.accounting.recent_audit_logs.slice(0, 8).map(a => (
                <div key={a.id} style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                  <div className="flex-between">
                    <strong>{a.operation} on `{a.table_name}`</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(a.created_at)}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>By: {a.changed_by} • Record: {a.record_id?.slice(0, 12)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==============================================================================
// MODULE 1: HR, EMPLOYEES, WORKING HOURS, LEAVE, SICKNESS & PAYSLIPS (Management)
// ==============================================================================

const GERMAN_HEALTH_INSURERS = [
  'TK — Techniker Krankenkasse',
  'AOK Bayern',
  'AOK Rheinland/Hamburg',
  'AOK Baden-Württemberg',
  'AOK PLUS (Sachsen / Thüringen)',
  'AOK Nordost (Berlin / Brandenburg / MV)',
  'AOK Niedersachsen',
  'AOK Hessen',
  'AOK NordWest',
  'AOK Rheinland-Pfalz/Saarland',
  'AOK Bremen/Bremerhaven',
  'BARMER',
  'DAK-Gesundheit',
  'IKK classic',
  'IKK gesund plus',
  'IKK Südwest',
  'KKH Kaufmännische Krankenkasse',
  'KNAPPSCHAFT',
  'hkk Krankenkasse',
  'HEK — Hanseatische Krankenkasse',
  'SBK (Siemens-Betriebskrankenkasse)',
  'Audi BKK',
  'BKK firmus',
  'BKK VBU (mkk)',
  'Pronova BKK',
  'VIACTIV Krankenkasse',
  'Debeka Private Krankenversicherung (PKV)',
  'Allianz Private Krankenversicherung (PKV)',
  'DKV Deutsche Krankenversicherung (PKV)',
  'AXA Krankenversicherung (PKV)',
  'Signal Iduna Krankenversicherung (PKV)',
  'HUK-Coburg Krankenversicherung (PKV)',
  'Barmenia Krankenversicherung (PKV)',
  'Continentale Krankenversicherung (PKV)',
  'Hallesche Krankenversicherung (PKV)',
  'ottonova (PKV)',
  'Selbstversichert / Privat (Freelancer / Subunternehmer)',
];

const INITIAL_ROLES = [
  'Field Technician',
  'FTTH Splicer (LWL-Monteur)',
  'Team Lead (Vorarbeiter)',
  'Project Manager (Projektleiter)',
  'Bauleiter Glasfaser / Tiefbau',
  'Senior Cloud & FTTH Network Architect',
  'IT & DevOps Engineer',
  'HR & Finance Specialist',
  'Field Sales Representative (D2D)',
  'Subunternehmer (Tiefbau & Glasfaser)',
  'Managing Director',
];

const INITIAL_DEPARTMENTS = [
  'Field Operations',
  'FTTH & Splicing',
  'Project Management',
  'IT & Cloud Infrastructure',
  'Tiefbau & Einblastechnik (Sub)',
  'HR & Accounting',
  'Field Sales & Upsell',
  'Executive Management',
];

const MONTH_OPTIONS = [
  { value: '01', label: '01 · Januar' },
  { value: '02', label: '02 · Februar' },
  { value: '03', label: '03 · März' },
  { value: '04', label: '04 · April' },
  { value: '05', label: '05 · Mai' },
  { value: '06', label: '06 · Juni' },
  { value: '07', label: '07 · Juli' },
  { value: '08', label: '08 · August' },
  { value: '09', label: '09 · September' },
  { value: '10', label: '10 · Oktober' },
  { value: '11', label: '11 · November' },
  { value: '12', label: '12 · Dezember' },
];

const YEAR_OPTIONS = ['2025', '2026', '2027'];

const DEFAULT_EMP_ATTRIBUTES = {
  birth_date: '1992-05-14',
  nationality: 'Deutsch',
  street: '',
  postal_code: '',
  city: 'Frankfurt am Main',
  sos_contact_name: '',
  sos_contact_relation: 'Ehepartner/in',
  sos_contact_phone: '',
  steuer_id: '',
  steuerklasse: 'I',
  kinderfreibetrag: '0.0',
  kirchensteuer: 'Nein',
  sozialversicherungsnummer: '',
  krankenversicherung_name: 'TK — Techniker Krankenkasse',
  krankenversicherung_nummer: '',
  krankenversicherung_typ: 'Gesetzlich (GKV)',
  iban: '',
  bic: '',
  bank_name: '',
  contract_model: 'Unbefristet (Vollzeit 40h)',
  contract_signed_date: '2026-01-15',
  contract_start_date: '2026-02-01',
  probezeit_end_date: '2026-07-31',
  monthly_contract_hours: 160,
  weekly_hours: 40,
  overtime_rate: 28.5,
  tagessatz: 640,
  stundensatz: 80,
  freelancer_contracts: [],
  assigned_project_id: '',
  assigned_project_name: '',
  registration_status: 'Angemeldet (ELStAM & SV aktiv)',
  work_permit_status: 'EU / Unbefristet',
  drivers_license: 'Klasse B, BE',
  unterweisung_arbeitsschutz: 'DGUV Vorschrift 1 & Glasfaser/Tiefbau',
  company_name: '',
  ust_id: '',
  steuernummer: '',
  gewerbeanmeldung: '',
  freistellungsbescheinigung_until: '',
  bg_bau_unbedenklichkeit: '',
  a1_bescheinigung: '',
};

const generateRandomOtp = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let code = 'BRN-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${code}!`;
};

export const HRManagementModule = ({ user }) => {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = section || 'employees';
  const setTab = (id) => navigate(`/hr/${id}`);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [leaveFilter, setLeaveFilter] = useState('All');
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [sickness, setSickness] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showAddSlip, setShowAddSlip] = useState(false);

  // Dynamic Custom Roles & Abteilungen (Departments) Lists
  const [roleOptions, setRoleOptions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bruenel_custom_roles') || '[]');
      return Array.from(new Set([...INITIAL_ROLES, ...saved]));
    } catch {
      return INITIAL_ROLES;
    }
  });
  const [deptOptions, setDeptOptions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bruenel_custom_depts') || '[]');
      return Array.from(new Set([...INITIAL_DEPARTMENTS, ...saved]));
    } catch {
      return INITIAL_DEPARTMENTS;
    }
  });
  const [addingNewRole, setAddingNewRole] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [addingNewDept, setAddingNewDept] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');

  // Employee Master Card (Create / Click-to-Edit Personalakte)
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [empCardTab, setEmpCardTab] = useState('personal'); // 'personal' | 'sos' | 'contract' | 'tax' | 'sub' | 'docs'
  const [contractFile, setContractFile] = useState(null);
  const [docCategory, setDocCategory] = useState('Arbeitsvertrag / Werkvertrag');
  const [customDocLabel, setCustomDocLabel] = useState('');
  const [uploadingEmpDoc, setUploadingEmpDoc] = useState(false);
  const [otpBanner, setOtpBanner] = useState(null);

  // Freelancer Multi-Contract Creator State
  const [newFc, setNewFc] = useState({
    title: '',
    project_name: '',
    start_date: '2026-01-15',
    end_date: '2026-12-31',
    tagessatz: 640,
    stundensatz: 80,
    status: 'Aktiv',
    file_url: '',
    file_name: '',
  });
  const [uploadingFcPdf, setUploadingFcPdf] = useState(false);

  const [newEmp, setNewEmp] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department: 'Field Operations',
    employment_type: 'Full-time',
    role: 'Field Technician',
    role_tier: 5,
    base_salary: 3600,
    hourly_rate: 22.5,
    annual_leave_days: 28,
    is_active: true,
    assigned_project_id: '',
    one_time_password: generateRandomOtp(),
    attributes: { ...DEFAULT_EMP_ATTRIBUTES },
    documents: [],
  });

  const [newSlip, setNewSlip] = useState({
    employee_id: '', period_month: 10, period_year: 2026,
    gross_salary: 3600, net_salary: 2450, commission_bonus: 0, hours_worked: 168, notes: ''
  });
  const [slipFile, setSlipFile] = useState(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);

  // Manager Working Hours Edit, Smart Search, Manual Entry & Monthly BI Summary State
  const [biEmpFilter, setBiEmpFilter] = useState('');
  const [timeSearchQuery, setTimeSearchQuery] = useState('');
  const [showAddManualTime, setShowAddManualTime] = useState(false);
  const [manualTimeForm, setManualTimeForm] = useState(() => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      employee_id: '',
      project_id: '',
      date: iso,
      check_in_time: '08:00',
      check_out_time: '16:30',
      break_minutes: 30,
      status: 'Approved',
      notes: '',
    };
  });
  const [biMonth, setBiMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedBiYear, selectedBiMonthPart] = useMemo(() => {
    const parts = (biMonth || '2026-10').split('-');
    return [parts[0] || '2026', parts[1] || '10'];
  }, [biMonth]);
  const [biSummary, setBiSummary] = useState(null);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogForm, setEditLogForm] = useState({ date: '', project_id: '', check_in_time: '', check_out_time: '', break_minutes: 0 });

  const fmtTimeInput = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Smart character-by-character matching employees for Working Hours
  const smartSearchedEmployees = useMemo(() => {
    const term = timeSearchQuery.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(emp =>
      `${emp.full_name} ${emp.first_name} ${emp.last_name} ${emp.employee_number}`
        .toLowerCase()
        .includes(term)
    );
  }, [employees, timeSearchQuery]);

  // Effective employee ID when filtering BI summary: either explicitly selected or unique smart search match
  const effectiveBiEmpId = useMemo(() => {
    if (biEmpFilter) return biEmpFilter;
    if (timeSearchQuery.trim() && smartSearchedEmployees.length === 1) {
      return smartSearchedEmployees[0].id;
    }
    return '';
  }, [biEmpFilter, timeSearchQuery, smartSearchedEmployees]);

  const loadBi = (ym = biMonth, empId = effectiveBiEmpId) => {
    const [yr, mo] = ym.split('-').map(Number);
    if (!yr || !mo) return;
    const qs = `year=${yr}&month=${mo}&include_absence_credits=true${empId ? `&employee_id=${empId}` : ''}`;
    fetchWithToken(`/api/v1/hr/time-logs/bi-summary?${qs}`).then(setBiSummary).catch(() => null);
  };

  const handleUploadPayslipFile = async (e, slipObj) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlip(true);
    try {
      const up = await uploadMediaFile({
        file,
        referenceType: 'Lohnabrechnung',
        referenceId: slipObj.employee_id,
        title: `Lohnabrechnung ${slipObj.period_label}`,
      });
      await fetchWithToken(`/api/v1/hr/payslips/${slipObj.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ document_id: up.document_id }),
      });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
    setUploadingSlip(false);
  };

  const loadAll = () => {
    fetchWithToken('/api/v1/hr/employees').then(data => {
      setEmployees(data);
      if (data.length > 0 && !newSlip.employee_id) {
        setNewSlip(prev => ({ ...prev, employee_id: data[0].id }));
      }
      if (data.length > 0 && !manualTimeForm.employee_id) {
        setManualTimeForm(prev => ({ ...prev, employee_id: data[0].id }));
      }
      if (editingEmpId) {
        const refreshed = data.find(x => x.id === editingEmpId);
        if (refreshed) populateEmpModal(refreshed);
      }
    }).catch(console.error);
    fetchWithToken('/api/v1/projects').then(prjs => {
      setProjects(prjs);
      if (prjs.length > 0 && !manualTimeForm.project_id) {
        setManualTimeForm(prev => ({ ...prev, project_id: prjs[0].id }));
      }
    }).catch(() => []);
    fetchWithToken('/api/v1/hr/time-logs').then(setTimeLogs).catch(console.error);
    fetchWithToken('/api/v1/hr/leave-requests').then(setLeaves).catch(console.error);
    fetchWithToken('/api/v1/hr/sickness').then(setSickness).catch(console.error);
    fetchWithToken('/api/v1/hr/payslips').then(setPayslips).catch(console.error);
    loadBi(biMonth, effectiveBiEmpId);
  };

  useEffect(() => {
    loadAll();
    const onCandidateReg = () => loadAll();
    window.addEventListener('bruenel-candidate-registered', onCandidateReg);
    return () => window.removeEventListener('bruenel-candidate-registered', onCandidateReg);
  }, []);
  useEffect(() => { loadBi(biMonth, effectiveBiEmpId); }, [biMonth, effectiveBiEmpId]);

  const handleAddCustomRole = () => {
    const val = newRoleInput.trim();
    if (!val) return;
    const updated = Array.from(new Set([...roleOptions, val]));
    setRoleOptions(updated);
    localStorage.setItem('bruenel_custom_roles', JSON.stringify(updated));
    setNewEmp(prev => ({ ...prev, role: val }));
    setNewRoleInput('');
    setAddingNewRole(false);
  };

  const handleAddCustomDepartment = () => {
    const val = newDeptInput.trim();
    if (!val) return;
    const updated = Array.from(new Set([...deptOptions, val]));
    setDeptOptions(updated);
    localStorage.setItem('bruenel_custom_depts', JSON.stringify(updated));
    setNewEmp(prev => ({ ...prev, department: val }));
    setNewDeptInput('');
    setAddingNewDept(false);
  };

  const handleEmploymentTypeSwitch = (nextType) => {
    const isFreelance = nextType === 'Freelancer' || nextType === 'Subunternehmer';
    setNewEmp(prev => ({
      ...prev,
      employment_type: nextType,
      base_salary: isFreelance ? 0 : (prev.base_salary || 3600),
      hourly_rate: isFreelance ? Number(prev.attributes?.stundensatz || 80) : (prev.hourly_rate || 22.5),
      attributes: {
        ...(prev.attributes || {}),
        contract_model:
          nextType === 'Freelancer'
            ? 'Freier Mitarbeitervertrag (Freelancer)'
            : nextType === 'Subunternehmer'
            ? 'Rahmenwerkvertrag (§631 BGB)'
            : nextType === 'Part-time'
            ? 'Teilzeitvertrag (20h-30h)'
            : nextType === 'Minijob'
            ? 'Minijob (538€ Grenze)'
            : 'Unbefristet (Vollzeit 40h)',
        tagessatz: prev.attributes?.tagessatz || 640,
        stundensatz: prev.attributes?.stundensatz || 80,
      },
    }));
  };

  const handleQuickProjectChange = async (empId, newProjectId) => {
    try {
      await fetchWithToken(`/api/v1/hr/employees/${empId}`, {
        method: 'PUT',
        body: JSON.stringify({ assigned_project_id: newProjectId }),
      });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadFcFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFcPdf(true);
    try {
      const up = await uploadMediaFile({
        file,
        referenceType: 'Contract',
        referenceId: editingEmpId || 'NEW_FREELANCER',
        title: `Freelancer Vertrag: ${newFc.title || file.name}`,
      });
      setNewFc(prev => ({
        ...prev,
        file_url: up.download_url || up.file_url || `/api/v1/media/${up.document_id}/download`,
        file_name: file.name,
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setUploadingFcPdf(false);
    }
  };

  const handleAddFreelancerContract = () => {
    if (!newFc.title.trim()) {
      alert('Bitte Vertragsbezeichnung / Projekttitel eingeben (Please enter contract title).');
      return;
    }
    const existingList = Array.isArray(newEmp.attributes?.freelancer_contracts)
      ? newEmp.attributes.freelancer_contracts
      : [];
    const createdContract = {
      id: `FC-${Date.now().toString().slice(-5)}`,
      title: newFc.title.trim(),
      project_name: newFc.project_name || (projects[0]?.name || 'FTTH & IT Rollout'),
      start_date: newFc.start_date,
      end_date: newFc.end_date,
      tagessatz: Number(newFc.tagessatz || newEmp.attributes?.tagessatz || 640),
      stundensatz: Number(newFc.stundensatz || newEmp.attributes?.stundensatz || 80),
      status: newFc.status || 'Aktiv',
      file_url: newFc.file_url || '',
      file_name: newFc.file_name || '',
    };
    setEmpAttr('freelancer_contracts', [...existingList, createdContract]);
    setNewFc({
      title: '',
      project_name: projects[0]?.name || '',
      start_date: '2026-01-15',
      end_date: '2026-12-31',
      tagessatz: Number(newEmp.attributes?.tagessatz || 640),
      stundensatz: Number(newEmp.attributes?.stundensatz || 80),
      status: 'Aktiv',
      file_url: '',
      file_name: '',
    });
  };

  const handleRemoveFreelancerContract = (fcId) => {
    const existingList = Array.isArray(newEmp.attributes?.freelancer_contracts)
      ? newEmp.attributes.freelancer_contracts
      : [];
    setEmpAttr('freelancer_contracts', existingList.filter(c => c.id !== fcId));
  };

  const openCreateEmployeeModal = () => {
    setEditingEmpId(null);
    setEmpCardTab('personal');
    setOtpBanner(null);
    setContractFile(null);
    setCustomDocLabel('');
    setNewEmp({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      department: 'Field Operations',
      employment_type: 'Full-time',
      role: 'Field Technician',
      role_tier: 5,
      base_salary: 3600,
      hourly_rate: 22.5,
      annual_leave_days: 28,
      is_active: true,
      assigned_project_id: projects[0]?.id || '',
      one_time_password: generateRandomOtp(),
      attributes: {
        ...DEFAULT_EMP_ATTRIBUTES,
        assigned_project_id: projects[0]?.id || '',
      },
      documents: [],
    });
    setShowAddEmp(true);
  };

  const populateEmpModal = (emp) => {
    setEditingEmpId(emp.id);
    if (emp.role && !roleOptions.includes(emp.role)) {
      setRoleOptions(prev => Array.from(new Set([...prev, emp.role])));
    }
    if (emp.department && !deptOptions.includes(emp.department)) {
      setDeptOptions(prev => Array.from(new Set([...prev, emp.department])));
    }
    setNewEmp({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || 'Field Operations',
      employment_type: emp.employment_type || 'Full-time',
      role: emp.role || 'Field Technician',
      role_tier: emp.role_tier || 5,
      base_salary: emp.base_salary ?? 0,
      hourly_rate: emp.hourly_rate ?? 0,
      annual_leave_days: emp.annual_leave_days ?? 28,
      is_active: emp.is_active !== false,
      assigned_project_id: emp.assigned_project_id || emp.attributes?.assigned_project_id || '',
      one_time_password: emp.attributes?.last_generated_otp || '',
      must_change_password: emp.must_change_password,
      employee_number: emp.employee_number,
      attributes: {
        ...DEFAULT_EMP_ATTRIBUTES,
        ...(emp.attributes || {}),
        assigned_project_id: emp.assigned_project_id || emp.attributes?.assigned_project_id || '',
      },
      documents: emp.documents || [],
    });
  };

  const openEditEmployeeModal = (emp) => {
    populateEmpModal(emp);
    setEmpCardTab('personal');
    setOtpBanner(null);
    setContractFile(null);
    setCustomDocLabel('');
    setShowAddEmp(true);
  };

  const setEmpAttr = (key, val) => {
    setNewEmp(prev => ({
      ...prev,
      attributes: {
        ...(prev.attributes || {}),
        [key]: val,
      },
    }));
  };

  const handleApproveTimeLog = async (logId) => {
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${logId}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const startEditLog = (log) => {
    setEditingLogId(log.id);
    setEditLogForm({
      date: log.date,
      project_id: log.project_id || projects[0]?.id || '',
      check_in_time: fmtTimeInput(log.check_in_time),
      check_out_time: fmtTimeInput(log.check_out_time),
      break_minutes: log.break_minutes || 0,
    });
  };

  const saveEditLog = async (log) => {
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${log.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: editLogForm.date || log.date,
          project_id: editLogForm.project_id || log.project_id,
          check_in_time: editLogForm.check_in_time,
          check_out_time: editLogForm.check_out_time,
          break_minutes: parseInt(editLogForm.break_minutes || 0, 10),
        }),
      });
      setEditingLogId(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTimeLog = async (logId) => {
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${logId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleManagerAddManualTime = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/hr/time-logs/manual', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: manualTimeForm.employee_id || biEmpFilter || employees[0]?.id,
          project_id: manualTimeForm.project_id || projects[0]?.id || null,
          date: manualTimeForm.date,
          check_in_time: manualTimeForm.check_in_time,
          check_out_time: manualTimeForm.check_out_time,
          break_minutes: parseInt(manualTimeForm.break_minutes || 0, 10),
          status: manualTimeForm.status,
          notes: manualTimeForm.notes,
        }),
      });
      setShowAddManualTime(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  useQuickAction('add-employee', () => openCreateEmployeeModal());
  useQuickAction('add-payslip', () => setShowAddSlip(true));

  const filteredEmps = employees.filter((e) => {
    const matchesType =
      typeFilter === 'All' ||
      e.employment_type === typeFilter ||
      (typeFilter === 'Candidate' && (e.employment_type === 'Candidate' || e.attributes?.is_candidate));
    const matchesRole =
      roleFilter === 'All' ||
      String(e.role_tier) === roleFilter ||
      (roleFilter === 'Sub' && ['Freelancer', 'Subunternehmer'].includes(e.employment_type));
    const matchesSearch = `${e.full_name} ${e.email || ''} ${e.employee_number} ${e.employment_type || ''} ${e.role || ''} ${e.department || ''} ${e.attributes?.company_name || ''} ${e.attributes?.steuer_id || ''}`
      .toLowerCase()
      .includes(q.toLowerCase());
    return matchesType && matchesRole && matchesSearch;
  });
  const filteredLeaves = leaves.filter((l) => leaveFilter === 'All' || l.status === leaveFilter);

  const handleSaveEmployeeCard = async (e) => {
    e.preventDefault();
    try {
      const isFreelance = newEmp.employment_type === 'Freelancer' || newEmp.employment_type === 'Subunternehmer';
      const effectiveHourly = isFreelance
        ? Number(newEmp.attributes?.stundensatz || newEmp.hourly_rate || 80)
        : Number(newEmp.hourly_rate || 0);
      const mergedAttrs = {
        ...(newEmp.attributes || {}),
        assigned_project_id: newEmp.assigned_project_id || newEmp.attributes?.assigned_project_id || '',
      };

      let targetEmpId = editingEmpId;
      if (editingEmpId) {
        await fetchWithToken(`/api/v1/hr/employees/${editingEmpId}`, {
          method: 'PUT',
          body: JSON.stringify({
            first_name: newEmp.first_name,
            last_name: newEmp.last_name,
            email: newEmp.email,
            phone: newEmp.phone,
            department: newEmp.department,
            employment_type: newEmp.employment_type,
            role: newEmp.role,
            role_tier: newEmp.role_tier,
            base_salary: Number(newEmp.base_salary || 0),
            hourly_rate: effectiveHourly,
            annual_leave_days: Number(newEmp.annual_leave_days || 0),
            is_active: newEmp.is_active,
            assigned_project_id: mergedAttrs.assigned_project_id,
            attributes: mergedAttrs,
          }),
        });
      } else {
        const cleanEmail = (newEmp.email || '').trim().toLowerCase();
        const existingEmp = cleanEmail ? employees.find(emp => (emp.email || '').trim().toLowerCase() === cleanEmail) : null;
        if (existingEmp) {
          const proceed = window.confirm(
            `Ein Mitarbeiter mit der E-Mail "${newEmp.email}" existiert bereits (${existingEmp.full_name}, ${existingEmp.employee_number || ''}).\n\nMöchten Sie stattdessen die bestehende Personalakte dieses Mitarbeiters mit den eingegebenen Daten aktualisieren?`
          );
          if (!proceed) return;
          await fetchWithToken(`/api/v1/hr/employees/${existingEmp.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              first_name: newEmp.first_name,
              last_name: newEmp.last_name,
              email: newEmp.email,
              phone: newEmp.phone,
              department: newEmp.department,
              employment_type: newEmp.employment_type,
              role: newEmp.role,
              role_tier: newEmp.role_tier,
              base_salary: Number(newEmp.base_salary || 0),
              hourly_rate: effectiveHourly,
              annual_leave_days: Number(newEmp.annual_leave_days || 0),
              is_active: newEmp.is_active,
              assigned_project_id: mergedAttrs.assigned_project_id,
              attributes: mergedAttrs,
            }),
          });
          targetEmpId = existingEmp.id;
        } else {
          const created = await fetchWithToken('/api/v1/hr/employees', {
            method: 'POST',
            body: JSON.stringify({
              first_name: newEmp.first_name,
              last_name: newEmp.last_name,
              email: newEmp.email,
              phone: newEmp.phone,
              department: newEmp.department,
              employment_type: newEmp.employment_type,
              role: newEmp.role,
              role_tier: newEmp.role_tier,
              base_salary: Number(newEmp.base_salary || 0),
              hourly_rate: effectiveHourly,
              annual_leave_days: Number(newEmp.annual_leave_days || 0),
              assigned_project_id: mergedAttrs.assigned_project_id,
              one_time_password: newEmp.one_time_password || generateRandomOtp(),
              attributes: mergedAttrs,
            }),
          });
          targetEmpId = created.id;
        }
      }

      if (contractFile && targetEmpId) {
        const docLabel = customDocLabel.trim()
          ? `${docCategory} — ${customDocLabel.trim()}`
          : `${docCategory} — ${newEmp.first_name} ${newEmp.last_name}`;
        await uploadMediaFile({
          file: contractFile,
          referenceType: 'Contract',
          referenceId: targetEmpId,
          title: docLabel,
        });
        setContractFile(null);
        setCustomDocLabel('');
      }

      setShowAddEmp(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadEmpDocumentNow = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editingEmpId) return;
    setUploadingEmpDoc(true);
    try {
      const labelTitle = customDocLabel.trim()
        ? `${docCategory}: ${customDocLabel.trim()} (${file.name})`
        : `${docCategory}: ${file.name}`;
      await uploadMediaFile({
        file,
        referenceType: 'Contract',
        referenceId: editingEmpId,
        title: labelTitle,
      });
      setCustomDocLabel('');
      loadAll();
    } catch (err) {
      alert(err.message);
    }
    setUploadingEmpDoc(false);
  };

  const handleResetEmployeeOtp = async () => {
    if (!editingEmpId) return;
    const customOtp = generateRandomOtp();
    try {
      const res = await fetchWithToken(`/api/v1/hr/employees/${editingEmpId}/reset-otp`, {
        method: 'POST',
        body: JSON.stringify({ one_time_password: customOtp }),
      });
      setOtpBanner(res.one_time_password);
      setNewEmp(prev => ({
        ...prev,
        one_time_password: res.one_time_password,
        must_change_password: true,
      }));
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLeaveDecision = async (id, status) => {
    try {
      await fetchWithToken(`/api/v1/hr/leave-requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSicknessAck = async (id, status) => {
    try {
      await fetchWithToken(`/api/v1/hr/sickness/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleIssuePayslip = async (e) => {
    e.preventDefault();
    setUploadingSlip(true);
    try {
      let docId = null;
      if (slipFile) {
        const up = await uploadMediaFile({
          file: slipFile,
          referenceType: 'Lohnabrechnung',
          referenceId: newSlip.employee_id,
          title: `Lohnabrechnung ${newSlip.period_month}/${newSlip.period_year}`,
        });
        docId = up.document_id;
      }
      await fetchWithToken('/api/v1/hr/payslips', {
        method: 'POST',
        body: JSON.stringify({ ...newSlip, document_id: docId }),
      });
      setShowAddSlip(false);
      setSlipFile(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
    setUploadingSlip(false);
  };

  const totalBasePayrollSum = biSummary?.total_base_payroll ?? employees.reduce((acc, e) => acc + (e.base_salary || 0), 0);
  const totalOvertimeHoursSum = biSummary?.total_overtime_hours ?? 0;
  const totalOvertimeCostSum = biSummary?.total_overtime_cost ?? 0;
  const totalEstimatedMonthlyCost = biSummary?.total_estimated_cost ?? totalBasePayrollSum;
  const weeklyAlerts = biSummary?.weekly_alerts || [];
  const subCount = employees.filter(e => ['Freelancer', 'Subunternehmer'].includes(e.employment_type)).length;
  const candidateCount = employees.filter(e => e.employment_type === 'Candidate' || e.attributes?.is_candidate).length;
  const isFreelanceModal = newEmp.employment_type === 'Freelancer' || newEmp.employment_type === 'Subunternehmer';

  return (
    <div>
      <PageHead title="HR, Personalakten & Cost Control" desc="German Arbeitsrecht employee master cards, Freelancer multi-contracts, IT Project Candidates, Überstunden & weekly working hours control.">
        {/* Selective Billing Month in HR Header */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 10px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Billing Month:</span>
          <select
            value={selectedBiMonthPart}
            onChange={(e) => setBiMonth(`${selectedBiYear}-${e.target.value}`)}
            style={{ width: 'auto', border: 'none', padding: '4px 6px', fontWeight: 700, background: 'transparent' }}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedBiYear}
            onChange={(e) => setBiMonth(`${e.target.value}-${selectedBiMonthPart}`)}
            style={{ width: 'auto', border: 'none', padding: '4px 6px', fontWeight: 700, background: 'transparent' }}
          >
            {YEAR_OPTIONS.map((yr) => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" onClick={() => setShowAddSlip(true)}><Upload size={16} /> Issue payslip</button>
        <button className="btn-primary" onClick={openCreateEmployeeModal}><Plus size={16} /> Register Employee / Freelancer / Sub</button>
      </PageHead>

      {/* HR Cost Control, Überstunden & Workforce Total Summary Banner (5 KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px', marginBottom: '14px' }}>
        <div className="glass-panel kpi" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Monthly HR & Sub Cost</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', margin: '4px 0' }}>
            {formatEuro(totalEstimatedMonthlyCost)}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            Base: {formatEuro(totalBasePayrollSum)}
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px 16px', borderColor: totalOvertimeHoursSum > 0 ? '#fdba74' : undefined, background: totalOvertimeHoursSum > 0 ? '#fff7ed' : undefined }}>
          <div style={{ fontSize: '0.71rem', color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>Überstunden (Overtime)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ea580c', margin: '4px 0' }}>
            {totalOvertimeHoursSum} h
          </div>
          <div style={{ fontSize: '0.73rem', color: '#9a3412', fontWeight: 600 }}>
            Cost: {formatEuro(totalOvertimeCostSum)} • {weeklyAlerts.length} Week Alert(s)
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Working Hours</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#059669', margin: '4px 0' }}>
            {biSummary ? `${biSummary.total_hours} h` : '—'}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            {biSummary ? `${biSummary.approved_hours}h appr. • ${biSummary.pending_hours}h pend.` : 'Loading...'}
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Credited (+8h Absence)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', margin: '4px 0' }}>
            {biSummary ? `${biSummary.total_credited_hours_with_absences ?? biSummary.total_hours} h` : '—'}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            Urlaub: +{biSummary?.leave_credited_hours || 0}h • AU: +{biSummary?.sick_credited_hours || 0}h
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Workforce & Candidates</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', margin: '4px 0' }}>
            {employees.length} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total</span>
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            {subCount} Freelance/Sub • {candidateCount} IT Candidates
          </div>
        </div>
      </div>

      {/* WEEKLY WORKING HOURS EXCEEDED ALERT BANNER (Wochenarbeitszeit überschritten) */}
      {weeklyAlerts.length > 0 && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: '#fef2f2',
            border: '1.5px solid #fca5a5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: '#dc2626',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                textTransform: 'uppercase',
              }}
            >
              <AlertTriangle size={13} /> Wochenarbeitszeit überschritten (Weekly Limit Alert)
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {weeklyAlerts.map((al, i) => (
                <button
                  key={`${al.employee_id}-${al.week_key}-${i}`}
                  type="button"
                  onClick={() => {
                    setBiEmpFilter(al.employee_id);
                    setTimeSearchQuery(al.employee_name);
                    setTab('timelogs');
                  }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    color: '#991b1b',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title="Click to inspect employee weekly working hours"
                >
                  <strong>{al.employee_name}</strong> ({al.employee_number}) in <strong>{al.week_key}</strong>: {al.worked_hours}h / {al.weekly_limit}h Limit (<strong>+{al.exceeded_by}h Überstunden</strong>)
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setTab('timelogs')}>
            Inspect Working Hours
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <SubTabs base="/hr" active={tab} items={[
        { id: 'employees', label: 'Employees, Freelancers & Candidates', count: employees.length },
        { id: 'timelogs', label: 'Working Hours & Smart Search', count: timeLogs.length },
        { id: 'leaves', label: 'Holiday (Urlaub)', count: leaves.length },
        { id: 'sickness', label: 'Sickness (AU)', count: sickness.length },
        { id: 'payslips', label: 'Payslips (Lohnabrechnung)', count: payslips.length },
      ]} />

      {/* =====================================================================
          CLEAN, STATIC MODERN FORM: REGISTER / EDIT EMPLOYEE, FREELANCER, SUBUNTERNEHMER, CANDIDATE
         ===================================================================== */}
      {showAddEmp && (
        <div className="modal-overlay" onClick={() => setShowAddEmp(false)}>
          <div
            className="glass-panel"
            style={{
              width: '960px',
              maxWidth: '96vw',
              height: '740px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Fixed Static Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
              <div className="flex-between" style={{ marginBottom: '12px' }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.12rem', margin: 0 }}>
                    <Briefcase size={18} style={{ color: 'var(--accent)' }} />
                    {editingEmpId
                      ? `Personalakte / Master Card: ${newEmp.first_name} ${newEmp.last_name} (${newEmp.employee_number || ''})`
                      : 'Register New Employee / Freelancer / Subunternehmer (German Arbeitsrecht)'}
                  </h3>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Static enterprise form • Select Employment Type below to adapt fields (Full-time, Freelancer with multi-contracts, Subunternehmer, or Candidate).
                  </p>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddEmp(false)}>
                  <X size={15} /> Close
                </button>
              </div>

              {/* Quick Employment Type Switcher Bar inside Form Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type:</span>
                {['Full-time', 'Part-time', 'Minijob', 'Freelancer', 'Subunternehmer', 'Candidate'].map((tp) => {
                  const active = newEmp.employment_type === tp;
                  return (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => handleEmploymentTypeSwitch(tp)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '0.76rem',
                        fontWeight: active ? 700 : 600,
                        border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        background: active ? 'var(--accent-soft)' : '#ffffff',
                        color: active ? 'var(--accent)' : 'var(--text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      {tp === 'Candidate' ? 'Candidate (IT Projects)' : tp}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Static Section Tabs Bar */}
            <div className="subtabs" style={{ padding: '10px 24px 0', margin: 0, borderBottom: '1px solid var(--border)', background: '#ffffff', flexWrap: 'wrap' }}>
              {[
                { id: 'personal', label: '1. Stammdaten, Position & Abteilung' },
                { id: 'contract', label: isFreelanceModal ? '2. Freelancing, Tagessatz & Multi-Verträge' : '2. Vertrag, Gehalt & Überstunden' },
                { id: 'tax', label: '3. Steuer-ID, Krankenversicherung & Bank' },
                { id: 'sos', label: '4. SOS Notfallkontakt' },
                { id: 'sub', label: '5. Freelancer / Subunternehmer (§48b)' },
                { id: 'docs', label: `6. Dokumente (${(newEmp.documents || []).length}) & OTP` },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  className={`subtab ${empCardTab === st.id ? 'active' : ''}`}
                  onClick={() => setEmpCardTab(st.id)}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Static-Height Scrollable Form Body */}
            <form onSubmit={handleSaveEmployeeCard} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* SECTION 1: STAMMDATEN, SELECTIVE POSITION & ABTEILUNG, ASSIGNED PROJECT */}
                {empCardTab === 'personal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {newEmp.attributes?.is_candidate && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.8rem', color: '#1e40af' }}>
                        <strong>IT Project Candidate Profile:</strong> Experience: {newEmp.attributes?.experience_years || '—'} • Skills: {newEmp.attributes?.skills || '—'} • Summary: {newEmp.attributes?.work_history_summary || '—'}. Change Type above to convert this candidate to Employee, Freelancer, or Subunternehmer.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Vorname (First Name) *</label>
                        <input required value={newEmp.first_name} onChange={e => setNewEmp({ ...newEmp, first_name: e.target.value })} placeholder="z.B. Lukas" />
                      </div>
                      <div>
                        <label>Nachname (Last Name) *</label>
                        <input required value={newEmp.last_name} onChange={e => setNewEmp({ ...newEmp, last_name: e.target.value })} placeholder="z.B. Weber" />
                      </div>
                      <div>
                        <label>Geburtsdatum (Birth Date)</label>
                        <input type="date" value={newEmp.attributes?.birth_date || ''} onChange={e => setEmpAttr('birth_date', e.target.value)} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>E-Mail (Portal Login) *</label>
                        <input type="email" required value={newEmp.email} onChange={e => setNewEmp({ ...newEmp, email: e.target.value })} placeholder="name@bruenel.de" />
                        {!editingEmpId && newEmp.email && employees.some(em => (em.email || '').trim().toLowerCase() === newEmp.email.trim().toLowerCase()) && (() => {
                          const dup = employees.find(em => (em.email || '').trim().toLowerCase() === newEmp.email.trim().toLowerCase());
                          return (
                            <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <span>⚠️ Existiert bereits ({dup?.full_name})</span>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                style={{ padding: '2px 6px', fontSize: '0.68rem', height: 'auto', background: '#ffffff' }}
                                onClick={() => openEditEmployeeModal(dup)}
                              >
                                Zu Akte
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <label>Telefon / Mobil *</label>
                        <input value={newEmp.phone} onChange={e => setNewEmp({ ...newEmp, phone: e.target.value })} placeholder="+49 172 ..." />
                      </div>
                      <div>
                        <label>Staatsangehörigkeit (Nationality)</label>
                        <input value={newEmp.attributes?.nationality || ''} onChange={e => setEmpAttr('nationality', e.target.value)} placeholder="Deutsch / EU" />
                      </div>
                    </div>

                    {/* SELECTIVE POSITION (ROLE) & ABTEILUNG (DEPARTMENT) DROPDOWNS + ADD NEW */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '14px', borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                      <div>
                        <div className="flex-between" style={{ marginBottom: 4 }}>
                          <label style={{ margin: 0 }}>Position / Rolle (Selective Dropdown) *</label>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => setAddingNewRole(!addingNewRole)}
                          >
                            <Plus size={11} /> {addingNewRole ? 'Close' : 'Add New Position'}
                          </button>
                        </div>
                        <select value={newEmp.role} onChange={e => setNewEmp({ ...newEmp, role: e.target.value })}>
                          {roleOptions.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {addingNewRole && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <input
                              placeholder="Enter new Position / Role..."
                              value={newRoleInput}
                              onChange={e => setNewRoleInput(e.target.value)}
                            />
                            <button type="button" className="btn-primary btn-sm" onClick={handleAddCustomRole}>Add</button>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex-between" style={{ marginBottom: 4 }}>
                          <label style={{ margin: 0 }}>Abteilung / Department (Selective Dropdown) *</label>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => setAddingNewDept(!addingNewDept)}
                          >
                            <Plus size={11} /> {addingNewDept ? 'Close' : 'Add New Abteilung'}
                          </button>
                        </div>
                        <select value={newEmp.department} onChange={e => setNewEmp({ ...newEmp, department: e.target.value })}>
                          {deptOptions.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {addingNewDept && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <input
                              placeholder="Enter new Abteilung..."
                              value={newDeptInput}
                              onChange={e => setNewDeptInput(e.target.value)}
                            />
                            <button type="button" className="btn-primary btn-sm" onClick={handleAddCustomDepartment}>Add</button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Zugewiesenes Projekt (Assigned Project)</label>
                        <select
                          value={newEmp.assigned_project_id || newEmp.attributes?.assigned_project_id || ''}
                          onChange={e => {
                            const pid = e.target.value;
                            const pObj = projects.find(p => p.id === pid);
                            setNewEmp(prev => ({
                              ...prev,
                              assigned_project_id: pid,
                              attributes: {
                                ...(prev.attributes || {}),
                                assigned_project_id: pid,
                                assigned_project_name: pObj ? `${pObj.code} — ${pObj.name}` : '',
                              },
                            }));
                          }}
                        >
                          <option value="">— Kein Projekt zugewiesen (Unassigned) —</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>RBAC Berechtigungsstufe</label>
                        <select value={newEmp.role_tier} onChange={e => setNewEmp({ ...newEmp, role_tier: parseInt(e.target.value, 10) })}>
                          <option value={1}>Tier 1 — Executive / Owner</option>
                          <option value={2}>Tier 2 — Project Manager</option>
                          <option value={3}>Tier 3 — HR & Finance Admin</option>
                          <option value={4}>Tier 4 — Team Lead (Vorarbeiter)</option>
                          <option value={5}>Tier 5 — Field Employee / Freelancer / Sub</option>
                        </select>
                      </div>
                      <div>
                        <label>Registrierungsstatus (HR/ELStAM)</label>
                        <select value={newEmp.attributes?.registration_status || ''} onChange={e => setEmpAttr('registration_status', e.target.value)}>
                          <option value="Angemeldet (ELStAM & SV aktiv)">Angemeldet (ELStAM & SV aktiv)</option>
                          <option value="Sofortmeldung abgegeben">Sofortmeldung abgegeben (Bau)</option>
                          <option value="Freelancer Aktiv (Vertrag geprüft)">Freelancer Aktiv (Vertrag geprüft)</option>
                          <option value="Subunternehmer Verifiziert (§48b EStG)">Subunternehmer Verifiziert (§48b EStG)</option>
                          <option value="Bewerber (DSGVO akzeptiert)">Bewerber / Candidate (IT Projects)</option>
                          <option value="Abgemeldet / Inaktiv">Abgemeldet / Inaktiv</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr', gap: '12px' }}>
                      <div>
                        <label>Straße & Hausnummer (Street Address)</label>
                        <input value={newEmp.attributes?.street || ''} onChange={e => setEmpAttr('street', e.target.value)} placeholder="z.B. Ramonville Straße 28" />
                      </div>
                      <div>
                        <label>PLZ (Postal Code)</label>
                        <input value={newEmp.attributes?.postal_code || ''} onChange={e => setEmpAttr('postal_code', e.target.value)} placeholder="60311" />
                      </div>
                      <div>
                        <label>Stadt / Ort (City)</label>
                        <input value={newEmp.attributes?.city || ''} onChange={e => setEmpAttr('city', e.target.value)} placeholder="Frankfurt am Main" />
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 2: CONTRACT, SALARY / FREELANCER TAGESSATZ & STUNDENSATZ + MULTI-CONTRACTS */}
                {empCardTab === 'contract' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Beschäftigungsart (Employment Type)</label>
                        <select value={newEmp.employment_type} onChange={e => handleEmploymentTypeSwitch(e.target.value)}>
                          <option value="Full-time">Full-time (Vollzeit)</option>
                          <option value="Part-time">Part-time (Teilzeit)</option>
                          <option value="Minijob">Minijob (Geringfügig)</option>
                          <option value="Freelancer">Freelancer (Freier Mitarbeiter)</option>
                          <option value="Subunternehmer">Subunternehmer (Nachunternehmer)</option>
                          <option value="Candidate">Candidate (Bewerber IT Projects)</option>
                        </select>
                      </div>
                      <div>
                        <label>Vertragsmodell (Contract Model)</label>
                        <select value={newEmp.attributes?.contract_model || ''} onChange={e => setEmpAttr('contract_model', e.target.value)}>
                          <option value="Unbefristet (Vollzeit 40h)">Unbefristet (Vollzeit 40h)</option>
                          <option value="Befristet (§14 TzBfG)">Befristet (§14 TzBfG)</option>
                          <option value="Teilzeitvertrag (20h-30h)">Teilzeitvertrag (20h-30h)</option>
                          <option value="Minijob (538€ Grenze)">Minijob (538€ Grenze)</option>
                          <option value="Freier Mitarbeitervertrag (Freelancer)">Freier Mitarbeitervertrag (Freelancer)</option>
                          <option value="Projektbezogener Dienst-/Werkvertrag">Projektbezogener Dienst-/Werkvertrag</option>
                          <option value="Rahmenwerkvertrag (§631 BGB)">Rahmenwerkvertrag (§631 BGB Subunternehmer)</option>
                        </select>
                      </div>
                      <div>
                        <label>Wochenstunden Limit (Weekly Max h)</label>
                        <input type="number" step="0.5" value={newEmp.attributes?.weekly_hours ?? 40} onChange={e => setEmpAttr('weekly_hours', parseFloat(e.target.value || 0))} />
                      </div>
                    </div>

                    {isFreelanceModal ? (
                      /* FREELANCER / SUBUNTERNEHMER RATE & MULTIPLE CONTRACTS PANEL */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ padding: '14px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#9a3412', marginBottom: 10 }}>
                            Freelancer / Subunternehmer Vergütung: Tagessatz & Stundensatz
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                              <label>Tagessatz (€ / Tag) *</label>
                              <input
                                type="number"
                                step="5"
                                value={newEmp.attributes?.tagessatz ?? 640}
                                onChange={e => setEmpAttr('tagessatz', parseFloat(e.target.value || 0))}
                              />
                            </div>
                            <div>
                              <label>Stundensatz (€ / Std.) *</label>
                              <input
                                type="number"
                                step="1"
                                value={newEmp.attributes?.stundensatz ?? newEmp.hourly_rate ?? 80}
                                onChange={e => {
                                  const v = parseFloat(e.target.value || 0);
                                  setEmpAttr('stundensatz', v);
                                  setNewEmp(prev => ({ ...prev, hourly_rate: v }));
                                }}
                              />
                            </div>
                            <div>
                              <label>Überstunden-Satz (€ / Std.)</label>
                              <input
                                type="number"
                                step="1"
                                value={newEmp.attributes?.overtime_rate ?? 95}
                                onChange={e => setEmpAttr('overtime_rate', parseFloat(e.target.value || 0))}
                              />
                            </div>
                            <div>
                              <label>Monatliches Stundenkontingent</label>
                              <input
                                type="number"
                                value={newEmp.attributes?.monthly_contract_hours ?? 160}
                                onChange={e => setEmpAttr('monthly_contract_hours', parseFloat(e.target.value || 0))}
                              />
                            </div>
                          </div>
                        </div>

                        {/* MULTIPLE FREELANCER CONTRACTS MANAGER */}
                        <div style={{ padding: '14px', borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)' }}>
                          <div className="flex-between" style={{ marginBottom: 10 }}>
                            <div>
                              <strong style={{ fontSize: '0.88rem' }}>
                                Mehrfachverträge / Projektverträge für Freelancer ({(newEmp.attributes?.freelancer_contracts || []).length})
                              </strong>
                              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                                Create, upload and save multiple project contracts with individual Tagessatz & Stundensatz for this freelancer.
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 0.9fr 0.9fr 0.7fr 0.7fr auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Vertrag / Projekttitel</label>
                              <input
                                placeholder="e.g. Einzelvertrag FTTH Los 3"
                                value={newFc.title}
                                onChange={e => setNewFc({ ...newFc, title: e.target.value })}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Projekt</label>
                              <select value={newFc.project_name} onChange={e => setNewFc({ ...newFc, project_name: e.target.value })}>
                                <option value="">Select Project...</option>
                                {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Start</label>
                              <input type="date" value={newFc.start_date} onChange={e => setNewFc({ ...newFc, start_date: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Ende</label>
                              <input type="date" value={newFc.end_date} onChange={e => setNewFc({ ...newFc, end_date: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Tagessatz (€)</label>
                              <input type="number" value={newFc.tagessatz} onChange={e => setNewFc({ ...newFc, tagessatz: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Stundensatz (€)</label>
                              <input type="number" value={newFc.stundensatz} onChange={e => setNewFc({ ...newFc, stundensatz: e.target.value })} />
                            </div>
                            <div>
                              <label className="btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 4, display: 'inline-flex' }}>
                                <Upload size={12} /> {uploadingFcPdf ? '...' : newFc.file_name ? 'PDF ✓' : 'Upload PDF'}
                                <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: 'none' }} onChange={handleUploadFcFile} />
                              </label>
                              <button type="button" className="btn-primary btn-sm" onClick={handleAddFreelancerContract} style={{ width: '100%' }}>
                                <Plus size={12} /> Save Contract
                              </button>
                            </div>
                          </div>

                          {(newEmp.attributes?.freelancer_contracts || []).length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '6px 0' }}>
                              Noch keine Einzelverträge angelegt. Nutzen Sie die Zeile oben, um beliebig viele Freelancer-Verträge hinzuzufügen.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(newEmp.attributes?.freelancer_contracts || []).map((fc) => (
                                <div
                                  key={fc.id}
                                  className="flex-between"
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    background: '#ffffff',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  <div>
                                    <strong>{fc.title}</strong> • <span style={{ color: 'var(--text-muted)' }}>{fc.project_name}</span>
                                    <span style={{ marginLeft: 10, color: '#c2410c', fontWeight: 700 }}>
                                      Tagessatz: {formatEuro(fc.tagessatz)}/Tag • Stundensatz: {formatEuro(fc.stundensatz)}/Std.
                                    </span>
                                    <span style={{ marginLeft: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      ({formatDate(fc.start_date)} – {formatDate(fc.end_date)})
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {fc.file_url && (
                                      <a href={resolveMediaUrl(fc.file_url)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                                        <Download size={12} /> Contract PDF
                                      </a>
                                    )}
                                    <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={() => handleRemoveFreelancerContract(fc.id)}>
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* STANDARD EMPLOYEE SALARY, HOURLY & OVERTIME PANEL */
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div>
                            <label>Vertrag unterschrieben am (Signed Date)</label>
                            <input type="date" value={newEmp.attributes?.contract_signed_date || ''} onChange={e => setEmpAttr('contract_signed_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Vertragsbeginn (Start Date)</label>
                            <input type="date" value={newEmp.attributes?.contract_start_date || ''} onChange={e => setEmpAttr('contract_start_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Probezeit Ende am (Probezeit Ends On)</label>
                            <input type="date" value={newEmp.attributes?.probezeit_end_date || ''} onChange={e => setEmpAttr('probezeit_end_date', e.target.value)} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                          <div>
                            <label>Monatsstunden (Soll h/Mo)</label>
                            <input type="number" step="0.5" value={newEmp.attributes?.monthly_contract_hours ?? 160} onChange={e => setEmpAttr('monthly_contract_hours', parseFloat(e.target.value || 0))} />
                          </div>
                          <div>
                            <label>Jahresurlaub (Tage/Jahr)</label>
                            <input type="number" value={newEmp.annual_leave_days} onChange={e => setNewEmp({ ...newEmp, annual_leave_days: parseInt(e.target.value || 0, 10) })} />
                          </div>
                          <div>
                            <label>Grundgehalt Brutto (€/Mo)</label>
                            <input type="number" step="0.01" value={newEmp.base_salary} onChange={e => setNewEmp({ ...newEmp, base_salary: parseFloat(e.target.value || 0) })} />
                          </div>
                          <div>
                            <label>Stundenlohn (€/h)</label>
                            <input type="number" step="0.01" value={newEmp.hourly_rate} onChange={e => setNewEmp({ ...newEmp, hourly_rate: parseFloat(e.target.value || 0) })} />
                          </div>
                          <div>
                            <label>Überstunden Preis (€/h)</label>
                            <input type="number" step="0.01" value={newEmp.attributes?.overtime_rate ?? 28.5} onChange={e => setEmpAttr('overtime_rate', parseFloat(e.target.value || 0))} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* SECTION 3: STEUER-ID, SELECTIVE KRANKENVERSICHERUNG DROPDOWN & ARBEITSRECHT DE */}
                {empCardTab === 'tax' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 0.8fr 0.8fr', gap: '12px' }}>
                      <div>
                        <label>Steuer-ID (11-stellige IdNr.)</label>
                        <input value={newEmp.attributes?.steuer_id || ''} onChange={e => setEmpAttr('steuer_id', e.target.value)} placeholder="z.B. 48 920 174 503" />
                      </div>
                      <div>
                        <label>Steuerklasse</label>
                        <select value={newEmp.attributes?.steuerklasse || 'I'} onChange={e => setEmpAttr('steuerklasse', e.target.value)}>
                          <option value="I">Steuerklasse I</option>
                          <option value="II">Steuerklasse II</option>
                          <option value="III">Steuerklasse III</option>
                          <option value="IV">Steuerklasse IV</option>
                          <option value="V">Steuerklasse V</option>
                          <option value="VI">Steuerklasse VI</option>
                          <option value="—">N/A (Freelancer / Subunternehmer)</option>
                        </select>
                      </div>
                      <div>
                        <label>Kinderfreibetrag</label>
                        <input value={newEmp.attributes?.kinderfreibetrag || '0.0'} onChange={e => setEmpAttr('kinderfreibetrag', e.target.value)} placeholder="0.0 / 1.0 / 2.0" />
                      </div>
                      <div>
                        <label>Kirchensteuer</label>
                        <select value={newEmp.attributes?.kirchensteuer || 'Nein'} onChange={e => setEmpAttr('kirchensteuer', e.target.value)}>
                          <option value="Nein">Nein (Keine)</option>
                          <option value="Ja (rk - 9%)">Ja (Röm.-Kath. 8%/9%)</option>
                          <option value="Ja (ev - 9%)">Ja (Evangelisch 8%/9%)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr', gap: '12px' }}>
                      <div>
                        <label>Krankenversicherung (Alle deutschen Versicherungen)</label>
                        <select
                          value={newEmp.attributes?.krankenversicherung_name || 'TK — Techniker Krankenkasse'}
                          onChange={e => setEmpAttr('krankenversicherung_name', e.target.value)}
                        >
                          {GERMAN_HEALTH_INSURERS.map(ins => (
                            <option key={ins} value={ins}>{ins}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Krankenversicherungsnummer (KV-Nr.)</label>
                        <input value={newEmp.attributes?.krankenversicherung_nummer || ''} onChange={e => setEmpAttr('krankenversicherung_nummer', e.target.value)} placeholder="z.B. A109482715" />
                      </div>
                      <div>
                        <label>Sozialversicherungsnummer (RV-Nr.)</label>
                        <input value={newEmp.attributes?.sozialversicherungsnummer || ''} onChange={e => setEmpAttr('sozialversicherungsnummer', e.target.value)} placeholder="z.B. 28 140592 W 018" />
                      </div>
                      <div>
                        <label>KV-Art (GKV / PKV)</label>
                        <select value={newEmp.attributes?.krankenversicherung_typ || 'Gesetzlich (GKV)'} onChange={e => setEmpAttr('krankenversicherung_typ', e.target.value)}>
                          <option value="Gesetzlich (GKV)">Gesetzlich (GKV)</option>
                          <option value="Privat (PKV)">Privat (PKV)</option>
                          <option value="Selbstversichert">Selbstversichert</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr', gap: '12px' }}>
                      <div>
                        <label>IBAN (Gehaltskonto / Abrechnungskonto)</label>
                        <input value={newEmp.attributes?.iban || ''} onChange={e => setEmpAttr('iban', e.target.value)} placeholder="DE89 3704 0044 ..." />
                      </div>
                      <div>
                        <label>BIC</label>
                        <input value={newEmp.attributes?.bic || ''} onChange={e => setEmpAttr('bic', e.target.value)} placeholder="COBADEFFXXX" />
                      </div>
                      <div>
                        <label>Bankname</label>
                        <input value={newEmp.attributes?.bank_name || ''} onChange={e => setEmpAttr('bank_name', e.target.value)} placeholder="Sparkasse / Commerzbank" />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Arbeitserlaubnis / Aufenthaltstitel</label>
                        <input value={newEmp.attributes?.work_permit_status || ''} onChange={e => setEmpAttr('work_permit_status', e.target.value)} placeholder="EU / Unbefristet / §18a AufenthG" />
                      </div>
                      <div>
                        <label>Führerscheinklassen</label>
                        <input value={newEmp.attributes?.drivers_license || ''} onChange={e => setEmpAttr('drivers_license', e.target.value)} placeholder="Klasse B, BE, C1" />
                      </div>
                      <div>
                        <label>Arbeitsschutz-Unterweisung (DGUV)</label>
                        <input value={newEmp.attributes?.unterweisung_arbeitsschutz || ''} onChange={e => setEmpAttr('unterweisung_arbeitsschutz', e.target.value)} placeholder="DGUV Vorschrift 1 & Tiefbau" />
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 4: NOTFALLKONTAKT / SOS FAMILY MEMBER */}
                {empCardTab === 'sos' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.8rem' }}>
                      <strong><PhoneCall size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: '#dc2626' }} /> Notfallkontakt (SOS Emergency Family Contact):</strong> Pflichtangabe für Baustellen- und Außendienstsicherheit gemäß DGUV.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '12px' }}>
                      <div>
                        <label>Name des Familienangehörigen (SOS Name)</label>
                        <input value={newEmp.attributes?.sos_contact_name || ''} onChange={e => setEmpAttr('sos_contact_name', e.target.value)} placeholder="z.B. Anna Weber" />
                      </div>
                      <div>
                        <label>Verwandtschaftsgrad (Relationship)</label>
                        <select value={newEmp.attributes?.sos_contact_relation || 'Ehepartner/in'} onChange={e => setEmpAttr('sos_contact_relation', e.target.value)}>
                          <option value="Ehepartner/in">Ehepartner/in (Spouse)</option>
                          <option value="Lebensgefährte/in">Lebensgefährte/in (Partner)</option>
                          <option value="Mutter / Vater">Mutter / Vater (Parent)</option>
                          <option value="Geschwister">Geschwister (Sibling)</option>
                          <option value="Kind">Volljähriges Kind</option>
                          <option value="Sonstige Vertrauensperson">Sonstige Vertrauensperson</option>
                        </select>
                      </div>
                      <div>
                        <label>SOS-Notfall-Telefonnummer</label>
                        <input value={newEmp.attributes?.sos_contact_phone || ''} onChange={e => setEmpAttr('sos_contact_phone', e.target.value)} placeholder="+49 172 9900..." />
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 5: FREELANCER & SUBUNTERNEHMER COMPLIANCE (§48b EStG / BG BAU) */}
                {empCardTab === 'sub' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.79rem' }}>
                      <strong>Subunternehmer & Freelancer Compliance (Bauabzugsteuer §48b EStG & BG BAU):</strong> Company & tax compliance records for external Freelancers and Subunternehmer.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Firmenname / Freelancer-Gewerbe (Company Name)</label>
                        <input value={newEmp.attributes?.company_name || ''} onChange={e => setEmpAttr('company_name', e.target.value)} placeholder="z.B. Petrovic Glasfaser & Tiefbau GmbH" />
                      </div>
                      <div>
                        <label>USt-IdNr. (VAT ID)</label>
                        <input value={newEmp.attributes?.ust_id || ''} onChange={e => setEmpAttr('ust_id', e.target.value)} placeholder="DE329481055" />
                      </div>
                      <div>
                        <label>Steuernummer (Finanzamt)</label>
                        <input value={newEmp.attributes?.steuernummer || ''} onChange={e => setEmpAttr('steuernummer', e.target.value)} placeholder="014/241/55812" />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Gewerbeanmeldung / HRB</label>
                        <input value={newEmp.attributes?.gewerbeanmeldung || ''} onChange={e => setEmpAttr('gewerbeanmeldung', e.target.value)} placeholder="HRB 118492 Frankfurt" />
                      </div>
                      <div>
                        <label>Freistellungsbescheinigung §48b gültig bis</label>
                        <input type="date" value={newEmp.attributes?.freistellungsbescheinigung_until || ''} onChange={e => setEmpAttr('freistellungsbescheinigung_until', e.target.value)} />
                      </div>
                      <div>
                        <label>BG BAU Unbedenklichkeitsbescheinigung</label>
                        <input value={newEmp.attributes?.bg_bau_unbedenklichkeit || ''} onChange={e => setEmpAttr('bg_bau_unbedenklichkeit', e.target.value)} placeholder="Gültig / Geprüft" />
                      </div>
                      <div>
                        <label>A1-Bescheinigung / Mindestlohn §13 MiLoG</label>
                        <input value={newEmp.attributes?.a1_bescheinigung || ''} onChange={e => setEmpAttr('a1_bescheinigung', e.target.value)} placeholder="Geprüft & Vorhanden" />
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 6: DOKUMENTE UPLOAD (WITH SONSTIGES + CUSTOM LABEL) & ONE-TIME PASSWORD (OTP) */}
                {empCardTab === 'docs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(255, 107, 0, 0.07)', border: '1px solid rgba(255, 107, 0, 0.28)' }}>
                      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                            <KeyRound size={15} style={{ color: 'var(--accent)' }} />
                            One-Time Password (Einmalpasswort) & Account Security
                          </strong>
                          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {editingEmpId
                              ? 'Resetting generates a new One-Time Password (OTP). On next login, the employee is required to set their own personal password.'
                              : 'Generate a One-Time Password for the new employee. After first login with this OTP, the employee must choose their own password.'}
                          </p>
                        </div>
                        {editingEmpId ? (
                          <button type="button" className="btn-primary btn-sm" onClick={handleResetEmployeeOtp}>
                            <KeyRound size={13} /> Reset Password / Generate New OTP
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setNewEmp({ ...newEmp, one_time_password: generateRandomOtp() })}
                          >
                            Generate New OTP
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <label style={{ fontSize: '0.72rem' }}>
                            {editingEmpId ? 'Last Issued One-Time Password (OTP)' : 'Initial One-Time Password (OTP)'}
                          </label>
                          <input
                            value={newEmp.one_time_password || ''}
                            onChange={e => setNewEmp({ ...newEmp, one_time_password: e.target.value })}
                            placeholder="BRN-XXXXXX!"
                            style={{ fontFamily: 'monospace', fontWeight: 700 }}
                          />
                        </div>
                        {editingEmpId && (
                          <span className="badge" style={{ marginTop: '18px', background: newEmp.must_change_password ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.16)', color: newEmp.must_change_password ? '#ca8a04' : '#16a34a' }}>
                            {newEmp.must_change_password ? 'Waiting for Employee First-Login Password Change' : 'Personal Password Set by Employee'}
                          </span>
                        )}
                      </div>

                      {otpBanner && (
                        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', fontSize: '0.82rem' }}>
                          New One-Time Password generated: <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{otpBanner}</strong>
                        </div>
                      )}
                    </div>

                    {/* Contract & HR Document Upload with Sonstiges + Custom Label */}
                    <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Upload Document to Personalakte (inkl. Sonstiges & Custom Label)</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 1.3fr', gap: '10px', alignItems: 'end' }}>
                        <div>
                          <label>Dokumententyp (Document Category)</label>
                          <select value={docCategory} onChange={e => setDocCategory(e.target.value)}>
                            <option value="Arbeitsvertrag / Werkvertrag">Arbeitsvertrag / Werkvertrag</option>
                            <option value="Freelancer Projektvertrag">Freelancer Projektvertrag</option>
                            <option value="Personalausweis / Reisepass">Personalausweis / Reisepass / Aufenthaltstitel</option>
                            <option value="Krankenkassenkarte / SV-Ausweis">Krankenkassenkarte / SV-Ausweis</option>
                            <option value="Freistellungsbescheinigung §48b EStG">Freistellungsbescheinigung §48b EStG</option>
                            <option value="Gewerbeanmeldung / BG BAU">Gewerbeanmeldung / BG BAU Nachweis</option>
                            <option value="Führerschein / Zertifikat">Führerschein / Schulungszertifikat</option>
                            <option value="Lebenslauf / CV">Lebenslauf / CV</option>
                            <option value="Sonstiges">Sonstiges (Other — Add Custom Label)</option>
                          </select>
                        </div>
                        <div>
                          <label>Custom Label / Dokumenten-Bezeichnung {docCategory === 'Sonstiges' ? '*' : '(Optional)'}</label>
                          <input
                            placeholder={docCategory === 'Sonstiges' ? 'Enter custom label for this document...' : 'e.g. Nachtrag Nr. 2 / Sicherheitsschein'}
                            value={customDocLabel}
                            onChange={e => setCustomDocLabel(e.target.value)}
                          />
                        </div>
                        <div>
                          <label>
                            {editingEmpId ? 'Select File to Upload Immediately' : 'Attach File on Save'}
                          </label>
                          {editingEmpId ? (
                            <input type="file" accept=".pdf,image/*,.doc,.docx" onChange={handleUploadEmpDocumentNow} disabled={uploadingEmpDoc} />
                          ) : (
                            <input type="file" accept=".pdf,image/*,.doc,.docx" onChange={e => setContractFile(e.target.files?.[0] || null)} />
                          )}
                        </div>
                      </div>

                      {editingEmpId && (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                            Gespeicherte Personal- & Vertragsdokumente ({(newEmp.documents || []).length})
                          </div>
                          {(newEmp.documents || []).length === 0 ? (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Noch keine Dokumente in dieser Personalakte hinterlegt.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {(newEmp.documents || []).map(doc => (
                                <div key={doc.id} className="flex-between" style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                                  <div>
                                    <strong>{doc.title}</strong>
                                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.72rem' }}>({doc.reference_type || doc.category || 'HR Doc'})</span>
                                  </div>
                                  {(doc.download_url || doc.file_url) && (
                                    <a href={resolveMediaUrl(doc.download_url || doc.file_url)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ textDecoration: 'none', color: 'var(--accent)' }}>
                                      <Download size={12} /> Open / Download
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Fixed Static Footer */}
              <div className="flex-between" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: '#f8fafc' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Active Mode: <strong>{newEmp.employment_type}</strong> • Position: <strong>{newEmp.role}</strong> • Abteilung: <strong>{newEmp.department}</strong>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAddEmp(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">
                    <Check size={15} /> {editingEmpId ? 'Save Employee Master Card' : 'Create Account & Save Personalakte'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Payslip Modal */}
      {showAddSlip && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '480px' }}>
            <h3 style={{ marginBottom: '16px' }}>Issue Monthly Salary Document (Lohnabrechnung)</h3>
            <form onSubmit={handleIssuePayslip} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Employee</label>
              <select value={newSlip.employee_id} onChange={e => setNewSlip({...newSlip, employee_id: e.target.value})}>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_number})</option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Month (1-12)</label>
                  <input type="number" min="1" max="12" value={newSlip.period_month} onChange={e => setNewSlip({...newSlip, period_month: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Year</label>
                  <input type="number" value={newSlip.period_year} onChange={e => setNewSlip({...newSlip, period_year: parseInt(e.target.value)})} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Gross (€)</label>
                  <input type="number" step="0.01" value={newSlip.gross_salary} onChange={e => setNewSlip({...newSlip, gross_salary: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Net (€)</label>
                  <input type="number" step="0.01" value={newSlip.net_salary} onChange={e => setNewSlip({...newSlip, net_salary: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Provision (€)</label>
                  <input type="number" step="0.01" value={newSlip.commission_bonus} onChange={e => setNewSlip({...newSlip, commission_bonus: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Attach Payslip PDF / Document</label>
                <input type="file" accept=".pdf,.png,.jpg,.txt" onChange={e => setSlipFile(e.target.files[0])} />
              </div>
              <input placeholder="Notes (e.g. Includes October Field Sales Provision)" value={newSlip.notes} onChange={e => setNewSlip({...newSlip, notes: e.target.value})} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddSlip(false)}>Cancel</button>
                <button type="submit" disabled={uploadingSlip} className="btn-primary" style={{flex: 1}}>
                  {uploadingSlip ? 'Uploading...' : 'Issue Payslip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {tab === 'employees' && (
        <div className="glass-panel">
          {/* Employee Type Filter Pills Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 4 }}>
              Filter by Type:
            </span>
            {[
              { id: 'All', label: `All Types (${employees.length})` },
              { id: 'Full-time', label: `Full-time (${employees.filter(e => e.employment_type === 'Full-time').length})` },
              { id: 'Part-time', label: `Part-time (${employees.filter(e => e.employment_type === 'Part-time').length})` },
              { id: 'Minijob', label: `Minijob (${employees.filter(e => e.employment_type === 'Minijob').length})` },
              { id: 'Freelancer', label: `Freelancer (${employees.filter(e => e.employment_type === 'Freelancer').length})` },
              { id: 'Subunternehmer', label: `Subunternehmer (${employees.filter(e => e.employment_type === 'Subunternehmer').length})` },
              { id: 'Candidate', label: `Candidates / IT Projects (${employees.filter(e => e.employment_type === 'Candidate' || e.attributes?.is_candidate).length})` },
            ].map((tf) => {
              const active = typeFilter === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => setTypeFilter(tf.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: '0.76rem',
                    fontWeight: active ? 700 : 600,
                    border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: active ? 'var(--accent)' : 'var(--text-main)',
                    cursor: 'pointer',
                  }}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          <div className="toolbar" style={{ marginBottom: 16 }}>
            <input placeholder="Smart search by name, position, Steuer-ID, Subunternehmer or employee ID…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: '280px' }} />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="All">All Employment Types</option>
              <option value="Full-time">Full-time (Vollzeit)</option>
              <option value="Part-time">Part-time (Teilzeit)</option>
              <option value="Minijob">Minijob</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Subunternehmer">Subunternehmer</option>
              <option value="Candidate">Candidate (IT Projects)</option>
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="All">All RBAC Tiers</option>
              <option value="2">Tier 2 · Project Manager</option>
              <option value="3">Tier 3 · HR & Finance</option>
              <option value="4">Tier 4 · Team Lead</option>
              <option value="5">Tier 5 · Field Tech / External</option>
            </select>
            <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv(filteredEmps, 'employees.csv')}>Export CSV</button>
          </div>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>ID & Type</th>
                <th style={{ padding: '10px 8px' }}>Name, Position & Abteilung</th>
                <th style={{ padding: '10px 8px' }}>Assigned Project (Change)</th>
                <th style={{ padding: '10px 8px' }}>Contract / Freelancer Multi-Contracts</th>
                <th style={{ padding: '10px 8px' }}>Steuer-ID & Krankenversicherung</th>
                <th style={{ padding: '10px 8px' }}>Salary / Tagessatz / Stundensatz</th>
                <th style={{ padding: '10px 8px' }}>HR Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map(e => {
                const attr = e.attributes || {};
                const isSub = ['Freelancer', 'Subunternehmer'].includes(e.employment_type);
                const isCandidate = e.employment_type === 'Candidate' || attr.is_candidate;
                const fcCount = Array.isArray(attr.freelancer_contracts) ? attr.freelancer_contracts.length : 0;
                const currentProjId = e.assigned_project_id || attr.assigned_project_id || '';
                return (
                  <tr
                    key={e.id}
                    onClick={() => openEditEmployeeModal(e)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    title="Click to open and edit full Personalakte / Employee Card"
                  >
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>{e.employee_number}</div>
                      <span
                        className="badge"
                        style={{
                          marginTop: 4,
                          fontSize: '0.67rem',
                          background: isCandidate ? '#eff6ff' : isSub ? '#fff7ed' : '#f0fdf4',
                          color: isCandidate ? '#1d4ed8' : isSub ? '#c2410c' : '#15803d',
                        }}
                      >
                        {e.employment_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 700 }}>{e.full_name}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>
                        {e.role} • <span style={{ color: 'var(--text-muted)' }}>{e.department}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {e.email || '—'} • {e.phone || '—'}
                      </div>
                      {attr.sos_contact_name && (
                        <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                          SOS: {attr.sos_contact_name} ({attr.sos_contact_phone})
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }} onClick={ev => ev.stopPropagation()}>
                      <select
                        value={currentProjId}
                        onChange={(ev) => handleQuickProjectChange(e.id, ev.target.value)}
                        style={{ fontSize: '0.76rem', padding: '6px 8px', minWidth: 185, fontWeight: 600 }}
                        title="Change assigned project for this employee"
                      >
                        <option value="">— Unassigned —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{attr.contract_model || e.employment_type}</div>
                      {isSub ? (
                        <div style={{ fontSize: '0.72rem', color: '#c2410c', fontWeight: 600 }}>
                          {fcCount} Saved Contract(s) • Limit: {attr.weekly_hours || 40}h/wk
                        </div>
                      ) : isCandidate ? (
                        <div style={{ fontSize: '0.72rem', color: '#1d4ed8' }}>
                          Exp: {attr.experience_years || '—'} • Pref: {attr.preferred_contract_model || 'Freelancer'}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Quota: {attr.monthly_contract_hours || 160}h/mo ({attr.weekly_hours || 40}h/wk) • Probezeit: {formatDate(attr.probezeit_end_date)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {isSub && attr.company_name ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{attr.company_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            USt-ID: {attr.ust_id || '—'} • §48b: {formatDate(attr.freistellungsbescheinigung_until)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600 }}>St-ID: {attr.steuer_id || '—'} (Kl. {attr.steuerklasse || 'I'})</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            KV: {attr.krankenversicherung_name || '—'}
                          </div>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {isSub || isCandidate ? (
                        <>
                          <div style={{ fontWeight: 700, color: '#c2410c' }}>
                            Tagessatz: {formatEuro(attr.tagessatz || 640)}/Tag
                          </div>
                          <div style={{ fontSize: '0.73rem', fontWeight: 600 }}>
                            Stundensatz: {formatEuro(attr.stundensatz || e.hourly_rate || 80)}/h
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 700 }}>
                            {e.base_salary > 0 ? `${formatEuro(e.base_salary)}/Mo` : `${formatEuro(e.hourly_rate)}/h`}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Basis: {formatEuro(e.hourly_rate)}/h • Überstunden: {formatEuro(attr.overtime_rate ?? 28.5)}/h
                          </div>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }} onClick={ev => ev.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => openEditEmployeeModal(e)}
                        >
                          <Edit3 size={12} /> {isCandidate ? 'Convert / Personalakte' : 'Personalakte'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setNewSlip(prev => ({
                              ...prev,
                              employee_id: e.id,
                              gross_salary: e.base_salary || 3600,
                              net_salary: Math.round((e.base_salary || 3600) * 0.68),
                            }));
                            setShowAddSlip(true);
                          }}
                        >
                          <Upload size={12} /> Abrechnung
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'timelogs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Smart Instant Character-by-Character Employee Search + Selective Billing Month + Add Manual Working Hours Bar */}
          <div className="glass-panel" style={{ padding: '16px 18px' }}>
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Smart Employee Working Hours Search (Type 1+ character to filter immediately)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      value={timeSearchQuery}
                      onChange={e => {
                        setTimeSearchQuery(e.target.value);
                        if (!e.target.value.trim()) setBiEmpFilter('');
                      }}
                      placeholder="Type a letter (e.g. 'L', 'M', 'K', 'P') to filter employee working hours..."
                      style={{ paddingLeft: '32px' }}
                    />
                  </div>
                  {(timeSearchQuery || biEmpFilter) && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setTimeSearchQuery('');
                        setBiEmpFilter('');
                      }}
                    >
                      <X size={13} /> Clear Filter
                    </button>
                  )}
                </div>

                {/* Instant Smart Matching Employee Pills when typing */}
                {timeSearchQuery.trim().length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {smartSearchedEmployees.length === 0 ? (
                      <span style={{ fontSize: '0.76rem', color: '#dc2626' }}>No employee matches "{timeSearchQuery}"</span>
                    ) : (
                      smartSearchedEmployees.map(emp => {
                        const active = biEmpFilter === emp.id || (smartSearchedEmployees.length === 1 && !biEmpFilter);
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setBiEmpFilter(emp.id);
                              setTimeSearchQuery(emp.full_name);
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: active ? 'var(--accent)' : 'var(--surface-2)',
                              color: active ? '#fff' : 'var(--text-main)',
                            }}
                          >
                            {emp.full_name} ({emp.employee_number})
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Employee Dropdown</label>
                  <select
                    value={biEmpFilter}
                    onChange={e => {
                      setBiEmpFilter(e.target.value);
                      const found = employees.find(x => x.id === e.target.value);
                      setTimeSearchQuery(found ? found.full_name : '');
                    }}
                    style={{ width: 'auto' }}
                  >
                    <option value="">All Employees</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_number})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Billing Month (Selective)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={selectedBiMonthPart}
                      onChange={e => setBiMonth(`${selectedBiYear}-${e.target.value}`)}
                      style={{ width: 'auto', fontWeight: 600 }}
                    >
                      {MONTH_OPTIONS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      value={selectedBiYear}
                      onChange={e => setBiMonth(`${e.target.value}-${selectedBiMonthPart}`)}
                      style={{ width: 'auto', fontWeight: 600 }}
                    >
                      {YEAR_OPTIONS.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="button" className="btn-primary" onClick={() => setShowAddManualTime(!showAddManualTime)}>
                  <Plus size={15} /> Add Working Hours / Past Day
                </button>
              </div>
            </div>

            {/* Manager Add Manual Working Hours Entry Form */}
            {showAddManualTime && (
              <form
                onSubmit={handleManagerAddManualTime}
                style={{
                  marginTop: '14px',
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 1.2fr 1fr 0.8fr 0.8fr 0.7fr 0.9fr auto',
                  gap: '8px',
                  alignItems: 'end',
                }}
              >
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Employee</label>
                  <select value={manualTimeForm.employee_id} onChange={e => setManualTimeForm({ ...manualTimeForm, employee_id: e.target.value })}>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Project</label>
                  <select value={manualTimeForm.project_id} onChange={e => setManualTimeForm({ ...manualTimeForm, project_id: e.target.value })}>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Date</label>
                  <input type="date" required value={manualTimeForm.date} onChange={e => setManualTimeForm({ ...manualTimeForm, date: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Start</label>
                  <input type="time" required value={manualTimeForm.check_in_time} onChange={e => setManualTimeForm({ ...manualTimeForm, check_in_time: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Finish</label>
                  <input type="time" required value={manualTimeForm.check_out_time} onChange={e => setManualTimeForm({ ...manualTimeForm, check_out_time: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Break (m)</label>
                  <input type="number" min="0" value={manualTimeForm.break_minutes} onChange={e => setManualTimeForm({ ...manualTimeForm, break_minutes: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Status</label>
                  <select value={manualTimeForm.status} onChange={e => setManualTimeForm({ ...manualTimeForm, status: e.target.value })}>
                    <option value="Approved">Approved (Locked)</option>
                    <option value="Completed">Completed (Editable)</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary">Save Entry</button>
              </form>
            )}
          </div>

          {/* Monthly BI Working Hours Summary (1st to 31st + Management HR 8h Urlaub & Krankheit Credits + Überstunden) */}
          <div className="glass-panel">
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart3 size={18} /> Monthly HR Working Time, Überstunden, Urlaub & Krankheit Summary (1st – 31st)
                </h3>
                {biSummary && (
                  <p style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                    Period: <strong>{biSummary.period_start}</strong> to <strong>{biSummary.period_end}</strong> • Management HR view automatically credits <strong>+8.0 h/day</strong> for approved Urlaub & Krankheit and monitors weekly contract limits.
                  </p>
                )}
              </div>
            </div>

            {biSummary && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: 'Worked Hours (1st–31st)', val: `${biSummary.total_hours} h`, sub: `${biSummary.days_worked} days on site` },
                    { label: 'Überstunden (Overtime)', val: `${biSummary.total_overtime_hours || 0} h`, sub: `${formatEuro(biSummary.total_overtime_cost)} • ${(biSummary.weekly_alerts || []).length} KW Alert(s)`, color: '#ea580c' },
                    { label: 'Approved / Pending Shifts', val: `${biSummary.approved_hours} h / ${biSummary.pending_hours} h`, sub: `Break: ${biSummary.total_break_minutes} min` },
                    { label: 'Urlaub Credit (+8h/Day)', val: `+${biSummary.leave_credited_hours || 0} h`, sub: `${biSummary.leave_days_count || 0} Urlaub day(s)`, color: '#ca8a04' },
                    { label: 'Krankheit Credit (+8h/Day)', val: `+${biSummary.sick_credited_hours || 0} h`, sub: `${biSummary.sick_days_count || 0} Krankheit day(s)`, color: '#dc2626' },
                  ].map((k, idx) => (
                    <div key={idx} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{k.label}</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '4px', color: k.color || 'var(--text-main)' }}>{k.val}</div>
                      <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '2px' }}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Total HR Payroll Credited Hours Banner */}
                <div
                  className="flex-between"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 107, 0, 0.08)',
                    border: '1px solid rgba(255, 107, 0, 0.25)',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.9rem' }}>Total HR Monthly Credited Hours (Worked + Urlaub 8h + Krankheit 8h):</strong>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {biSummary.total_hours}h worked + {biSummary.leave_credited_hours || 0}h Urlaub + {biSummary.sick_credited_hours || 0}h Krankheit • Total Überstunden: <strong>{biSummary.total_overtime_hours || 0}h</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--accent)' }}>
                    {biSummary.total_credited_hours_with_absences ?? biSummary.total_hours} h
                  </div>
                </div>

                {/* Color Legend for Daily 1st–31st Chart */}
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.74rem', fontWeight: 600, marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} /> Approved Worked Hours
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} /> Pending Worked Hours
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} /> Urlaub (+8h HR Credit)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} /> Krankheit (+8h HR Credit)
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${biSummary.daily_breakdown.length}, minmax(18px, 1fr))`,
                    gap: '4px',
                    alignItems: 'end',
                    height: '115px',
                    padding: '12px 8px 4px',
                    borderRadius: '10px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    marginBottom: '18px',
                  }}
                >
                  {biSummary.daily_breakdown.map(d => {
                    const eff = d.effective_hours ?? d.hours;
                    const pct = Math.min((eff / 10) * 100, 100);
                    const barColor =
                      d.sick_hours > 0
                        ? '#ef4444'
                        : d.leave_hours > 0
                        ? '#eab308'
                        : d.approved_hours > 0
                        ? '#16a34a'
                        : d.hours > 0
                        ? 'var(--accent)'
                        : 'var(--border)';
                    return (
                      <div
                        key={d.day}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                        title={`${d.date}: Worked ${d.hours}h | Urlaub +${d.leave_hours || 0}h | Krankheit +${d.sick_hours || 0}h | Total: ${eff}h`}
                      >
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {eff > 0 ? eff : ''}
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(pct, 4)}px`,
                            borderRadius: '4px',
                            background: barColor,
                          }}
                        />
                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {String(d.day).padStart(2, '0')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Per-Employee Monthly Working Time + Urlaub (8h) + Krankheit (8h) + Weekly Alert + Cost Control Breakdown Table */}
                {(biSummary.employee_breakdown || []).length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>
                      Per-Employee Working Hours, Überstunden, Weekly Limit Alert & Cost Control Breakdown ({biSummary.period_start} – {biSummary.period_end})
                    </h4>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '8px' }}>Employee / Subunternehmer</th>
                          <th style={{ padding: '8px' }}>Contract / Weekly Limit</th>
                          <th style={{ padding: '8px' }}>Worked Hours</th>
                          <th style={{ padding: '8px' }}>Urlaub (+8h)</th>
                          <th style={{ padding: '8px' }}>Krankheit (+8h)</th>
                          <th style={{ padding: '8px' }}>Total Credited</th>
                          <th style={{ padding: '8px' }}>Überstunden & KW Status</th>
                          <th style={{ padding: '8px' }}>Est. Monthly Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {biSummary.employee_breakdown
                          .filter(eb => {
                            if (biEmpFilter) return eb.employee_id === biEmpFilter;
                            if (!timeSearchQuery.trim()) return true;
                            return smartSearchedEmployees.some(s => s.id === eb.employee_id);
                          })
                          .map(eb => (
                            <tr key={eb.employee_id} style={{ borderBottom: '1px solid var(--border)', background: eb.weekly_exceeded ? 'rgba(254, 242, 242, 0.55)' : undefined }}>
                              <td style={{ padding: '8px', fontWeight: 600 }}>
                                {eb.employee_name} <span style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>({eb.employee_number})</span>
                              </td>
                              <td style={{ padding: '8px', fontSize: '0.76rem' }}>
                                {eb.employment_type} ({eb.monthly_contract_hours || 160}h/mo • {eb.weekly_hours_limit || 40}h/wk)
                              </td>
                              <td style={{ padding: '8px', fontWeight: 600 }}>
                                {eb.worked_hours} h{' '}
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  ({eb.approved_worked_hours}h appr.)
                                </span>
                              </td>
                              <td style={{ padding: '8px', color: eb.urlaub_hours > 0 ? '#ca8a04' : 'var(--text-muted)', fontWeight: eb.urlaub_hours > 0 ? 700 : 400 }}>
                                {eb.urlaub_days} d (+{eb.urlaub_hours} h)
                              </td>
                              <td style={{ padding: '8px', color: eb.krankheit_hours > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: eb.krankheit_hours > 0 ? 700 : 400 }}>
                                {eb.krankheit_days} d (+{eb.krankheit_hours} h)
                              </td>
                              <td style={{ padding: '8px', fontWeight: 800, color: 'var(--accent)' }}>
                                {eb.total_credited_hours} h
                              </td>
                              <td style={{ padding: '8px' }}>
                                {eb.overtime_hours > 0 ? (
                                  <span style={{ fontWeight: 700, color: '#ea580c' }}>
                                    +{eb.overtime_hours}h ({formatEuro(eb.overtime_cost)})
                                  </span>
                                ) : (
                                  '0 h'
                                )}
                                {eb.weekly_exceeded && (
                                  <div style={{ marginTop: 2 }}>
                                    <span className="badge danger" style={{ fontSize: '0.66rem' }}>
                                      Wochenlimit überschritten ({eb.max_weekly_hours}h / {eb.weekly_hours_limit}h)
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px', fontWeight: 800 }}>
                                {formatEuro(eb.estimated_monthly_cost || eb.base_salary)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="glass-panel">
            <div className="toolbar" style={{ marginBottom: 16 }}>
              <p>
                {timeLogs.filter((t) => !t.check_out_time).length} live shift(s) right now • Management can add, change projects, edit dates/times/breaks, approve & delete any working hours entry
              </p>
              <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv(timeLogs, 'working-hours.csv')}>Export CSV</button>
            </div>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 8px' }}>Date</th>
                  <th style={{ padding: '10px 8px' }}>Employee</th>
                  <th style={{ padding: '10px 8px' }}>Project</th>
                  <th style={{ padding: '10px 8px' }}>Start / Finish</th>
                  <th style={{ padding: '10px 8px' }}>Break (min)</th>
                  <th style={{ padding: '10px 8px' }}>Net Hours</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px' }}>Management Actions</th>
                </tr>
              </thead>
              <tbody>
                {timeLogs
                  .filter(l => {
                    if (biEmpFilter && l.employee_id !== biEmpFilter) return false;
                    if (timeSearchQuery.trim()) {
                      return smartSearchedEmployees.some(emp => emp.id === l.employee_id) ||
                        (l.employee_name || '').toLowerCase().includes(timeSearchQuery.trim().toLowerCase());
                    }
                    return true;
                  })
                  .map(l => {
                    const isEditing = editingLogId === l.id;
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                          {isEditing ? (
                            <input
                              type="date"
                              value={editLogForm.date}
                              onChange={e => setEditLogForm({ ...editLogForm, date: e.target.value })}
                              style={{ width: '135px', padding: '4px 6px' }}
                            />
                          ) : (
                            formatDate(l.date)
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>{l.employee_name}</td>
                        <td style={{ padding: '10px 8px' }}>
                          {isEditing ? (
                            <select
                              value={editLogForm.project_id}
                              onChange={e => setEditLogForm({ ...editLogForm, project_id: e.target.value })}
                              style={{ width: '180px', padding: '4px 6px' }}
                            >
                              {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          ) : (
                            l.project_name
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontSize: '0.8rem' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input type="time" value={editLogForm.check_in_time} onChange={e => setEditLogForm({ ...editLogForm, check_in_time: e.target.value })} style={{ width: '105px', padding: '4px 6px' }} />
                              <span>→</span>
                              <input type="time" value={editLogForm.check_out_time} onChange={e => setEditLogForm({ ...editLogForm, check_out_time: e.target.value })} style={{ width: '105px', padding: '4px 6px' }} />
                            </div>
                          ) : (
                            <>
                              In: {fmtTimeInput(l.check_in_time) || '—'} • Out: {fmtTimeInput(l.check_out_time) || 'Active'}
                            </>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {isEditing ? (
                            <input type="number" min="0" value={editLogForm.break_minutes} onChange={e => setEditLogForm({ ...editLogForm, break_minutes: e.target.value })} style={{ width: '75px', padding: '4px 6px' }} />
                          ) : (
                            `${l.break_minutes || 0} min`
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{l.total_hours != null ? `${l.total_hours} h` : 'Running'}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: l.status === 'Approved' ? 'rgba(34,197,94,0.16)' : undefined, color: l.status === 'Approved' ? '#16a34a' : undefined }}>
                            {l.status === 'Approved' && <Lock size={11} />}
                            {l.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {isEditing ? (
                              <>
                                <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => saveEditLog(l)}>
                                  <Check size={12} /> Save
                                </button>
                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setEditingLogId(null)}>
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <>
                                {l.status !== 'Approved' && l.check_out_time && (
                                  <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleApproveTimeLog(l.id)}>
                                    <Check size={12} /> Approve & Lock
                                  </button>
                                )}
                                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => startEditLog(l)}>
                                  <Edit3 size={12} /> Edit Date/Time/Project
                                </button>
                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleDeleteTimeLog(l.id)} title="Delete Working Hours Entry">
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="glass-panel">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <select value={leaveFilter} onChange={(e) => setLeaveFilter(e.target.value)}>
              <option value="All">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option>
            </select>
            <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv(filteredLeaves, 'leave-requests.csv')}>Export CSV</button>
          </div>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>Employee</th>
                <th style={{ padding: '10px 8px' }}>Type</th>
                <th style={{ padding: '10px 8px' }}>Period</th>
                <th style={{ padding: '10px 8px' }}>Reason</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
                <th style={{ padding: '10px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaves.map(lv => (
                <tr key={lv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{lv.employee_name}</td>
                  <td style={{ padding: '10px 8px' }}>{lv.type}</td>
                  <td style={{ padding: '10px 8px' }}>{formatDate(lv.start_date)} → {formatDate(lv.end_date)}</td>
                  <td style={{ padding: '10px 8px' }}>{lv.reason || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span className="badge" style={{
                      background: lv.status === 'Approved' ? '#eab30833' : lv.status === 'Pending' ? '#fde04722' : '#ef444433',
                      color: lv.status === 'Approved' ? '#eab308' : lv.status === 'Pending' ? '#fde047' : '#dc2626'
                    }}>
                      {lv.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', display: 'flex', gap: '6px' }}>
                    {lv.status === 'Pending' && (
                      <>
                        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleLeaveDecision(lv.id, 'Approved')}>
                          Approve
                        </button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleLeaveDecision(lv.id, 'Rejected')}>
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sickness' && (
        <div className="glass-panel">
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>Employee</th>
                <th style={{ padding: '10px 8px' }}>Dates</th>
                <th style={{ padding: '10px 8px' }}>Doctor / Note</th>
                <th style={{ padding: '10px 8px' }}>AU Certificate</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
                <th style={{ padding: '10px 8px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sickness.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{s.employee_name}</td>
                  <td style={{ padding: '10px 8px' }}>{formatDate(s.start_date)} → {formatDate(s.end_date)}</td>
                  <td style={{ padding: '10px 8px' }}>{s.symptoms_note || '—'} ({s.doctor_visited ? 'Doctor visited' : 'Self-report'})</td>
                  <td style={{ padding: '10px 8px' }}>
                    {s.au_document_url ? (
                      <a href={resolveMediaUrl(s.au_document_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <FileText size={14} /> View AU Document
                      </a>
                    ) : 'Pending AU'}
                  </td>
                  <td style={{ padding: '10px 8px' }}><span className="badge">{s.status}</span></td>
                  <td style={{ padding: '10px 8px' }}>
                    {s.status !== 'Acknowledged' && (
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleSicknessAck(s.id, 'Acknowledged')}>
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payslips' && (
        <div className="glass-panel">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Upload or replace monthly salary documents (Lohnabrechnung PDF/Image) for any employee. Uploaded documents appear immediately in the employee's mobile portal.
            </p>
            <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAddSlip(true)}>
              <Upload size={15} /> Upload / Issue Lohnabrechnung
            </button>
          </div>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>Period</th>
                <th style={{ padding: '10px 8px' }}>Employee</th>
                <th style={{ padding: '10px 8px' }}>Gross (€)</th>
                <th style={{ padding: '10px 8px' }}>Net (€)</th>
                <th style={{ padding: '10px 8px' }}>Provision Bonus</th>
                <th style={{ padding: '10px 8px' }}>Total Payout</th>
                <th style={{ padding: '10px 8px' }}>Lohnabrechnung File</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.period_label}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{p.employee_name}</td>
                  <td style={{ padding: '10px 8px' }}>{formatEuro(p.gross_salary)}</td>
                  <td style={{ padding: '10px 8px' }}>{formatEuro(p.net_salary)}</td>
                  <td style={{ padding: '10px 8px', color: '#059669' }}>{formatEuro(p.commission_bonus, { showPlus: true })}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--accent)' }}>{formatEuro(p.total_payout)}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {p.document_url && (
                        <a
                          href={resolveMediaUrl(p.document_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', textDecoration: 'none', color: 'var(--accent)', fontWeight: 600 }}
                        >
                          <Download size={13} /> Download PDF
                        </a>
                      )}
                      <label className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        <Upload size={13} /> {p.document_url ? 'Replace File' : 'Upload Lohnabrechnung'}
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          style={{ display: 'none' }}
                          onChange={e => handleUploadPayslipFile(e, p)}
                        />
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==============================================================================
// MODULE 2: PROJECTS, REGIONS, BUILDING OBJECTS (WITH VIDEO/PHOTO MEDIA) & TASKS
// ==============================================================================

export const ProjectsObjectsModule = () => {
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = section || 'objects';
  const setTab = (id) => navigate(`/projects/${id}`);
  const [regions, setRegions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [objects, setObjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [showAddObj, setShowAddObj] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddProj, setShowAddProj] = useState(false);
  const [showAddDelegation, setShowAddDelegation] = useState(false);
  const [selectedObjectMedia, setSelectedObjectMedia] = useState(null);
  const [selectedTaskDoc, setSelectedTaskDoc] = useState(null);
  const [taskCommentText, setTaskCommentText] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Task Calendar & Filter Controls (Overall vs Per-Employee + Week/Month/Table + Drag & Drop)
  const [taskViewMode, setTaskViewMode] = useState('week'); // 'week' | 'month' | 'table'
  const [empCalFilter, setEmpCalFilter] = useState('');
  const [teamCalFilter, setTeamCalFilter] = useState('');
  const [calCursor, setCalCursor] = useState(() => new Date());
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  const [newObj, setNewObj] = useState({ project_id: '', region_id: '', address: '', units_count: 12, cabling_type: 'FTTH Singlemode', status: 'Planned', notes: '' });
  const [newTask, setNewTask] = useState({
    employee_id: '',
    team_id: '',
    assigned_employee_ids: [],
    project_id: '',
    region_id: '',
    object_id: '',
    date: new Date().toISOString().split('T')[0],
    title: '',
    instructions: '',
    priority: 'High',
    task_status: 'Planned',
  });
  const [newProj, setNewProj] = useState({ name: '', code: '', client_name: '', kst: 1000, budget: 50000, region_id: '', manager_id: '' });
  const [newDel, setNewDel] = useState({ delegator_id: '', delegatee_id: '', start_date: new Date().toISOString().split('T')[0], end_date: new Date().toISOString().split('T')[0], scope_note: '' });
  const [teamForm, setTeamForm] = useState({ id: '', name: '', leader_id: '', member_ids: [], notes: '' });

  const loadData = () => {
    Promise.all([
      fetchWithToken('/api/v1/regions').catch(() => []),
      fetchWithToken('/api/v1/projects').catch(() => []),
      fetchWithToken('/api/v1/objects').catch(() => []),
      fetchWithToken('/api/v1/assignments').catch(() => []),
      fetchWithToken('/api/v1/teams').catch(() => []),
      fetchWithToken('/api/v1/delegations').catch(() => []),
      fetchWithToken('/api/v1/hr/employees').catch(() => []),
    ]).then(([regs, projs, objs, assigns, tms, dels, emps]) => {
      setRegions(regs);
      setProjects(projs);
      setObjects(objs);
      setAssignments(assigns);
      setTeams(tms);
      setDelegations(dels);
      setEmployees(emps);
      if (selectedTaskDoc) {
        const refreshed = assigns.find(x => x.id === selectedTaskDoc.id);
        if (refreshed) setSelectedTaskDoc(refreshed);
      }
      if (projs.length > 0 && !newObj.project_id) {
        setNewObj(o => ({ ...o, project_id: projs[0].id, region_id: regs[0]?.id || '' }));
        setNewTask(t => ({ ...t, project_id: projs[0].id, region_id: regs[0]?.id || '', object_id: objs[0]?.id || '', employee_id: emps[0]?.id || '' }));
      }
    }).catch(console.error);
  };

  useEffect(() => { loadData(); }, []);
  useQuickAction('add-task', () => setShowAddTask(true));
  useQuickAction('add-object', () => setShowAddObj(true));

  const toggleArr = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
  const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const filteredTasks = useMemo(() => {
    return assignments.filter(a => {
      if (empCalFilter && a.employee_id !== empCalFilter && !(a.assigned_employee_ids || []).includes(empCalFilter)) {
        return false;
      }
      if (teamCalFilter && a.team_id !== teamCalFilter) {
        return false;
      }
      return true;
    });
  }, [assignments, empCalFilter, teamCalFilter]);

  const weekCols = useMemo(() => {
    const d = new Date(calCursor);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d.setDate(diff));
    return Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const iso = toIso(cur);
      return {
        iso,
        label: cur.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        isToday: iso === toIso(new Date()),
        tasks: filteredTasks.filter(t => t.date === iso),
      };
    });
  }, [calCursor, filteredTasks]);

  const monthCells = useMemo(() => {
    const yr = calCursor.getFullYear();
    const mo = calCursor.getMonth();
    const first = new Date(yr, mo, 1);
    const last = new Date(yr, mo + 1, 0);
    const offset = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(yr, mo, d);
      const iso = toIso(dt);
      cells.push({
        day: d,
        iso,
        isToday: iso === toIso(new Date()),
        tasks: filteredTasks.filter(t => t.date === iso),
      });
    }
    return cells;
  }, [calCursor, filteredTasks]);

  const handleTaskDropOnDate = async (targetIsoDate) => {
    if (!draggedTaskId || !targetIsoDate) return;
    try {
      await fetchWithToken(`/api/v1/assignments/${draggedTaskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ date: targetIsoDate }),
      });
      setDraggedTaskId(null);
      loadData();
    } catch (err) {
      alert(err.message);
      setDraggedTaskId(null);
    }
  };

  const handleTaskStatusUpdate = async (taskId, newStatus) => {
    try {
      await fetchWithToken(`/api/v1/assignments/${taskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ task_status: newStatus }),
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddTaskComment = async (e) => {
    e.preventDefault();
    if (!selectedTaskDoc || !taskCommentText.trim()) return;
    try {
      await fetchWithToken(`/api/v1/assignments/${selectedTaskDoc.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: taskCommentText }),
      });
      setTaskCommentText('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadTaskDocFile = async (e, taskObj) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress(1);
    try {
      await uploadMediaFile({
        file,
        referenceType: 'TaskMedia',
        referenceId: taskObj.id,
        title: file.name,
        onProgress: setUploadProgress,
      });
      setUploadProgress(0);
      loadData();
    } catch (err) {
      alert(err.message);
      setUploadProgress(0);
    }
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!teamForm.name.trim()) return;
    try {
      if (teamForm.id) {
        await fetchWithToken(`/api/v1/teams/${teamForm.id}`, { method: 'PUT', body: JSON.stringify(teamForm) });
      } else {
        await fetchWithToken('/api/v1/teams', { method: 'POST', body: JSON.stringify(teamForm) });
      }
      setTeamForm({ id: '', name: '', leader_id: '', member_ids: [], notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleObjectStatusChange = async (objectId, newStatus) => {
    try {
      await fetchWithToken(`/api/v1/objects/${objectId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateObject = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/objects', { method: 'POST', body: JSON.stringify(newObj) });
      setShowAddObj(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/assignments', {
        method: 'POST',
        body: JSON.stringify({
          ...newTask,
          team_id: newTask.team_id || null,
          employee_id: newTask.employee_id || null,
          checklist: [{ label: 'Verify site safety & HÜP access', done: false }, { label: 'Upload completion photo/video', done: false }],
        }),
      });
      setShowAddTask(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/projects', { method: 'POST', body: JSON.stringify(newProj) });
      setShowAddProj(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateDelegation = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/delegations', { method: 'POST', body: JSON.stringify(newDel) });
      setShowAddDelegation(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadObjectMedia = async (e, objectId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress(1);
    try {
      await uploadMediaFile({
        file,
        referenceType: 'ObjectMedia',
        referenceId: objectId,
        title: file.name,
        onProgress: setUploadProgress,
      });
      setUploadProgress(0);
      loadData();
      const updated = await fetchWithToken(`/api/v1/objects/${objectId}`);
      setSelectedObjectMedia(updated);
    } catch (err) {
      alert('Media upload failed: ' + err.message);
      setUploadProgress(0);
    }
  };

  const statuses = ['Planned', 'Hausbegehung', 'In Progress', 'Tested', 'Completed'];

  return (
    <div>
      <PageHead title="Projects, Teams & Task Calendar" desc="Manage building objects, assign multi-employee/team tasks, drag-and-drop reschedule tasks, and inspect full task documentation.">
        <button className="btn-secondary" onClick={() => setShowAddProj(true)}><Plus size={15} /> Project</button>
        <button className="btn-secondary" onClick={() => setShowAddObj(true)}><Plus size={15} /> Building object</button>
        <button className="btn-primary" onClick={() => setShowAddTask(true)}><Plus size={15} /> Assign task</button>
      </PageHead>

      <SubTabs base="/projects" active={tab} items={[
        { id: 'objects', label: 'Building Objects', count: objects.length },
        { id: 'tasks', label: 'Task Calendar & Assignments', count: assignments.length },
        { id: 'teams', label: 'Teams', count: teams.length },
        { id: 'projects', label: 'Projects & Regions', count: projects.length },
        { id: 'delegation', label: 'Vertretung', count: delegations.length },
      ]} />

      {/* Modals */}
      {showAddObj && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '460px' }}>
            <h3 style={{ marginBottom: '14px' }}>New Building Object (Gebäude)</h3>
            <form onSubmit={handleCreateObject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={newObj.project_id} onChange={e => setNewObj({...newObj, project_id: e.target.value})} required>
                <option value="">Select Project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={newObj.region_id} onChange={e => setNewObj({...newObj, region_id: e.target.value})} required>
                <option value="">Select Region (PLZ)...</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.postal_code} — {r.name}</option>)}
              </select>
              <input placeholder="Street & House Number" required value={newObj.address} onChange={e => setNewObj({...newObj, address: e.target.value})} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="number" placeholder="Units (WE)" value={newObj.units_count} onChange={e => setNewObj({...newObj, units_count: parseInt(e.target.value)})} />
                <input placeholder="Cabling Type" value={newObj.cabling_type} onChange={e => setNewObj({...newObj, cabling_type: e.target.value})} />
              </div>
              <textarea placeholder="Technical site survey notes..." value={newObj.notes} onChange={e => setNewObj({...newObj, notes: e.target.value})} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddObj(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Save Object</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddTask && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '540px' }}>
            <h3 style={{ marginBottom: '14px' }}>Assign Shared Task to Team or Multiple Employees</h3>
            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assign to Entire Team (Optional)</label>
                  <select value={newTask.team_id} onChange={e => setNewTask({ ...newTask, team_id: e.target.value })}>
                    <option value="">— No Team (Individual Selection) —</option>
                    {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Initial Task Status</label>
                  <select value={newTask.task_status} onChange={e => setNewTask({ ...newTask, task_status: e.target.value })}>
                    {Object.values(TASK_STATUS_CONFIG).map(st => (
                      <option key={st.key} value={st.key}>{st.en}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Assign Employees (Multiple employees share this single task in their calendars)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {employees.map(emp => {
                    const on = newTask.assigned_employee_ids.includes(emp.id) || newTask.employee_id === emp.id;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          const updated = toggleArr(newTask.assigned_employee_ids, emp.id);
                          setNewTask({ ...newTask, assigned_employee_ids: updated, employee_id: updated[0] || '' });
                        }}
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: '999px',
                          border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
                          color: on ? 'var(--accent)' : 'var(--text-main)',
                          cursor: 'pointer',
                        }}
                      >
                        {emp.full_name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <select value={newTask.project_id} onChange={e => setNewTask({...newTask, project_id: e.target.value})} required>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={newTask.region_id} onChange={e => setNewTask({...newTask, region_id: e.target.value})} required>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.postal_code} {r.name}</option>)}
                </select>
              </div>
              <select value={newTask.object_id} onChange={e => setNewTask({...newTask, object_id: e.target.value})}>
                <option value="">Optional Building Object...</option>
                {objects.map(o => <option key={o.id} value={o.id}>{o.address} ({o.units_count} WE)</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="date" value={newTask.date} onChange={e => setNewTask({...newTask, date: e.target.value})} required />
                <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})}>
                  <option value="Normal">Normal Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <input placeholder="Task Title (e.g. NE4 Splicing & OTO Mounting)" required value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} />
              <textarea placeholder="Detailed instructions for technician / team..." value={newTask.instructions} onChange={e => setNewTask({...newTask, instructions: e.target.value})} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddTask(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Documentation Modal (Comments with Date/Hour + Images, Videos & PDFs) */}
      {selectedTaskDoc && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '760px', maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                  <span className="badge">{selectedTaskDoc.date}</span>
                  <span className="badge">{selectedTaskDoc.assignee_label}</span>
                </div>
                <h3>{selectedTaskDoc.title}</h3>
                <p style={{ fontSize: '0.82rem' }}>{selectedTaskDoc.object_address} ({selectedTaskDoc.region_name}) — {selectedTaskDoc.project_name}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={selectedTaskDoc.task_status}
                  onChange={e => handleTaskStatusUpdate(selectedTaskDoc.id, e.target.value)}
                  style={{ width: 'auto', fontWeight: 700 }}
                >
                  {Object.values(TASK_STATUS_CONFIG).map(st => (
                    <option key={st.key} value={st.key}>{st.en}</option>
                  ))}
                </select>
                <button className="btn-secondary" onClick={() => setSelectedTaskDoc(null)}><X size={15} /></button>
              </div>
            </div>

            {selectedTaskDoc.instructions && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-2)', fontSize: '0.84rem', marginBottom: '16px' }}>
                {selectedTaskDoc.instructions}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Left Column: Comments with Date & Hour Timestamps */}
              <div>
                <h4 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={16} /> Field Comments & Documentation ({(selectedTaskDoc.comments || []).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', marginBottom: '10px' }}>
                  {(selectedTaskDoc.comments || []).length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No comments recorded yet.</p>
                  ) : (
                    selectedTaskDoc.comments.map(c => (
                      <div key={c.id} style={{ padding: '10px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                        <div className="flex-between" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          <strong>{c.author_name}</strong>
                          <span>{formatDateTime(c.created_at)}</span>
                        </div>
                        <div>{c.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleAddTaskComment} style={{ display: 'flex', gap: '8px' }}>
                  <input placeholder="Add manager comment / instruction..." value={taskCommentText} onChange={e => setTaskCommentText(e.target.value)} />
                  <button type="submit" className="btn-primary">Post</button>
                </form>
              </div>

              {/* Right Column: Uploaded Photos, Videos & PDF Files */}
              <div>
                <div className="flex-between" style={{ marginBottom: '10px' }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Video size={16} /> Photos, Videos & PDFs ({(selectedTaskDoc.media || []).length})
                  </h4>
                  <label className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <Upload size={13} /> Upload File
                    <input type="file" accept="image/*,video/*,.pdf" style={{ display: 'none' }} onChange={e => handleUploadTaskDocFile(e, selectedTaskDoc)} />
                  </label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
                  {(selectedTaskDoc.media || []).length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No photos, videos, or PDFs attached yet.</p>
                  ) : (
                    selectedTaskDoc.media.map(m => (
                      <div key={m.id} style={{ padding: '10px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div className="flex-between" style={{ fontSize: '0.75rem', marginBottom: '6px' }}>
                          <strong>{m.file_name}</strong>
                          <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(m.created_at)}</span>
                        </div>
                        {m.mime_type?.startsWith('video') ? (
                          <video controls style={{ width: '100%', borderRadius: '6px', maxHeight: '160px', background: '#000' }} src={resolveMediaUrl(m.url)} />
                        ) : m.mime_type?.startsWith('image') ? (
                          <img alt={m.title} style={{ width: '100%', borderRadius: '6px', maxHeight: '160px', objectFit: 'cover' }} src={resolveMediaUrl(m.url)} />
                        ) : (
                          <a href={resolveMediaUrl(m.url)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <FileText size={14} /> Open PDF / Document ({m.file_name})
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddProj && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '440px' }}>
            <h3 style={{ marginBottom: '14px' }}>Create New Project</h3>
            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Project Name" required value={newProj.name} onChange={e => setNewProj({...newProj, name: e.target.value})} />
              <input placeholder="Client Name" value={newProj.client_name} onChange={e => setNewProj({...newProj, client_name: e.target.value})} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="number" placeholder="KST (e.g. 1000)" value={newProj.kst} onChange={e => setNewProj({...newProj, kst: parseInt(e.target.value)})} />
                <input type="number" placeholder="Budget (€)" value={newProj.budget} onChange={e => setNewProj({...newProj, budget: parseFloat(e.target.value)})} />
              </div>
              <select value={newProj.manager_id} onChange={e => setNewProj({...newProj, manager_id: e.target.value})}>
                <option value="">Assign Project Manager...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddProj(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Media & Video Gallery Modal for Building Object */}
      {selectedObjectMedia && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '760px', maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '16px' }}>
              <div>
                <h3>Site Photos & Video Inspections: {selectedObjectMedia.address}</h3>
                <p style={{ fontSize: '0.8rem' }}>{selectedObjectMedia.cabling_type} • {selectedObjectMedia.units_count} Units (WE)</p>
              </div>
              <button className="btn-secondary" onClick={() => setSelectedObjectMedia(null)}>Close</button>
            </div>

            <div style={{ padding: '14px', border: '1px dashed var(--accent)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>Upload Site Video (MP4/MOV) or Inspection Photo</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Streamed directly via Pre-Signed S3 URL with HTTP Range playback</div>
              </div>
              <label className="btn-primary" style={{ cursor: 'pointer' }}>
                <Upload size={16} /> Select Video / Photo
                <input type="file" accept="video/*,image/*,.pdf" style={{ display: 'none' }} onChange={e => handleUploadObjectMedia(e, selectedObjectMedia.id)} />
              </label>
            </div>
            {uploadProgress > 0 && <p style={{ color: 'var(--accent)', fontWeight: 600 }}>Streaming upload to S3 bucket: {uploadProgress}%...</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {(selectedObjectMedia.media || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No site photos or videos uploaded for this building yet.</p>
              ) : (
                selectedObjectMedia.media.map(m => (
                  <div key={m.id} className="glass-panel" style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>{m.title}</div>
                    {m.mime_type?.startsWith('video') ? (
                      <video controls style={{ width: '100%', borderRadius: '8px', maxHeight: '220px', background: '#000' }} src={resolveMediaUrl(m.url)} />
                    ) : m.mime_type?.startsWith('image') ? (
                      <img alt={m.title} style={{ width: '100%', borderRadius: '8px', maxHeight: '220px', objectFit: 'cover' }} src={resolveMediaUrl(m.url)} />
                    ) : (
                      <a href={resolveMediaUrl(m.url)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <FileText size={14} /> Open Document ({m.file_name})
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'objects' && (
        <div className="kanban-board">
          {statuses.map(st => (
            <div key={st} className="kanban-column" style={{ minWidth: '250px' }}>
              <div className="flex-between" style={{ marginBottom: '12px' }}>
                <h4 style={{ fontSize: '0.92rem' }}>{st}</h4>
                <span className="badge">{objects.filter(o => o.status === st).length}</span>
              </div>
              {objects.filter(o => o.status === st).map(obj => (
                <div key={obj.id} className="kanban-card" style={{ cursor: 'default' }}>
                  <div className="flex-between" style={{ marginBottom: '6px' }}>
                    <span className="badge" style={{ fontSize: '0.7rem' }}>{obj.units_count} WE</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{obj.region_name}</span>
                  </div>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '4px' }}>{obj.address}</h4>
                  <p style={{ fontSize: '0.75rem', margin: '4px 0' }}>{obj.cabling_type}</p>
                  {obj.notes && <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '6px', borderRadius: '6px' }}>{obj.notes}</p>}

                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
                    <select
                      value={obj.status}
                      onChange={e => handleObjectStatusChange(obj.id, e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1 }}
                    >
                      {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      onClick={() => setSelectedObjectMedia(obj)}
                    >
                      <Video size={13} /> Media ({obj.media_count || 0})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter Bar: Overall vs Individual Employee Calendar + Drag & Drop Hint + View Switcher */}
          <div className="glass-panel" style={{ padding: '14px 18px' }}>
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={empCalFilter} onChange={e => setEmpCalFilter(e.target.value)} style={{ width: 'auto', fontWeight: 600 }}>
                  <option value="">Overall Calendar (All Employees)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>Employee Calendar: {emp.full_name}</option>
                  ))}
                </select>
                <select value={teamCalFilter} onChange={e => setTeamCalFilter(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">All Teams</option>
                  {teams.map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem', fontWeight: 600, marginLeft: '6px' }}>
                  {Object.values(TASK_STATUS_CONFIG).map(st => (
                    <span key={st.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: st.hex || st.color }} />
                      {st.en}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="btn-secondary btn-sm" onClick={() => {
                  const d = new Date(calCursor);
                  taskViewMode === 'month' ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 7);
                  setCalCursor(d);
                }}><ChevronLeft size={14} /></button>
                <button className="btn-secondary btn-sm" onClick={() => setCalCursor(new Date())}>Today</button>
                <button className="btn-secondary btn-sm" onClick={() => {
                  const d = new Date(calCursor);
                  taskViewMode === 'month' ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 7);
                  setCalCursor(d);
                }}><ChevronRight size={14} /></button>

                <div className="subtabs" style={{ marginLeft: '6px' }}>
                  <button className={`subtab ${taskViewMode === 'week' ? 'active' : ''}`} onClick={() => setTaskViewMode('week')}>Week (Drag & Drop)</button>
                  <button className={`subtab ${taskViewMode === 'month' ? 'active' : ''}`} onClick={() => setTaskViewMode('month')}>Month (Drag & Drop)</button>
                  <button className={`subtab ${taskViewMode === 'table' ? 'active' : ''}`} onClick={() => setTaskViewMode('table')}>Table</button>
                </div>
              </div>
            </div>
          </div>

          {taskViewMode === 'week' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '10px' }}>
              {weekCols.map(col => (
                <div
                  key={col.iso}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleTaskDropOnDate(col.iso)}
                  className="glass-panel"
                  style={{
                    padding: '12px',
                    minHeight: '280px',
                    border: col.isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                    <strong style={{ fontSize: '0.8rem' }}>{col.label}</strong>
                    <span className="badge">{col.tasks.length}</span>
                  </div>
                  {col.tasks.map(a => {
                    const st = getStatusStyle(a.task_status);
                    return (
                      <div
                        key={a.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(a.id)}
                        onClick={() => setSelectedTaskDoc(a)}
                        style={{
                          padding: '9px',
                          borderRadius: '8px',
                          background: st.bg,
                          borderLeft: `4px solid ${st.hex || st.color}`,
                          cursor: 'grab',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div className="flex-between" style={{ marginBottom: '3px' }}>
                          <span style={{ fontWeight: 700, color: st.color, fontSize: '0.7rem' }}>{a.task_status}</span>
                          <GripVertical size={12} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <div style={{ fontWeight: 700 }}>{a.title}</div>
                        <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{a.assignee_label}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                          <span><MessageSquare size={10} /> {(a.comments || []).length}</span>
                          <span><Video size={10} /> {a.media_count || 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {taskViewMode === 'month' && (
            <div className="glass-panel">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>{d}</div>
                ))}
                {monthCells.map((cell, idx) =>
                  !cell ? (
                    <div key={`e-${idx}`} style={{ minHeight: '95px', background: 'var(--surface-2)', borderRadius: '8px', opacity: 0.4 }} />
                  ) : (
                    <div
                      key={cell.iso}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleTaskDropOnDate(cell.iso)}
                      style={{
                        minHeight: '95px',
                        padding: '8px',
                        borderRadius: '8px',
                        border: cell.isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{cell.day}</div>
                      {cell.tasks.map(a => {
                        const st = getStatusStyle(a.task_status);
                        return (
                          <div
                            key={a.id}
                            draggable
                            onDragStart={() => setDraggedTaskId(a.id)}
                            onClick={() => setSelectedTaskDoc(a)}
                            style={{
                              padding: '3px 6px',
                              borderRadius: '5px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              background: st.bg,
                              color: st.color,
                              borderLeft: `3px solid ${st.hex || st.color}`,
                              cursor: 'grab',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {a.title}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {taskViewMode === 'table' && (
            <div className="glass-panel">
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 8px' }}>Date</th>
                    <th style={{ padding: '10px 8px' }}>Assigned Team / Employees</th>
                    <th style={{ padding: '10px 8px' }}>Task & Instructions</th>
                    <th style={{ padding: '10px 8px' }}>Building Object / PLZ</th>
                    <th style={{ padding: '10px 8px' }}>Status</th>
                    <th style={{ padding: '10px 8px' }}>Documentation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map(a => {
                    const st = getStatusStyle(a.task_status);
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>{formatDate(a.date)}</td>
                        <td style={{ padding: '10px 8px' }}>{a.assignee_label}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{a.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.instructions}</div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div>{a.object_address}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.region_name}</div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <select
                            value={a.task_status}
                            onChange={e => handleTaskStatusUpdate(a.id, e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.76rem', fontWeight: 700, color: st.color, background: st.bg, width: 'auto' }}
                          >
                            {Object.values(TASK_STATUS_CONFIG).map(opt => (
                              <option key={opt.key} value={opt.key}>{opt.en}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <button className="btn-secondary btn-sm" onClick={() => setSelectedTaskDoc(a)}>
                            <MessageSquare size={13} /> {(a.comments || []).length} • <Video size={13} /> {a.media_count || 0} Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'teams' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px' }}>
          <div className="glass-panel">
            <h3 style={{ marginBottom: '12px' }}>Create or Edit Field Team</h3>
            <form onSubmit={handleSaveTeam} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input required placeholder="Team Name (e.g. Team Alpha — FTTH)" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} />
              <select value={teamForm.leader_id} onChange={e => setTeamForm({ ...teamForm, leader_id: e.target.value })}>
                <option value="">Select Team Lead...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Team Members</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {employees.map(emp => {
                    const on = teamForm.member_ids.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setTeamForm({ ...teamForm, member_ids: toggleArr(teamForm.member_ids, emp.id) })}
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          borderRadius: '999px',
                          border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
                          color: on ? 'var(--accent)' : 'var(--text-main)',
                          cursor: 'pointer',
                        }}
                      >
                        {emp.full_name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea placeholder="Team notes..." value={teamForm.notes} onChange={e => setTeamForm({ ...teamForm, notes: e.target.value })} />
              <button type="submit" className="btn-primary">Save Team</button>
            </form>
          </div>

          <div className="glass-panel">
            <h3 style={{ marginBottom: '12px' }}>Active Field Teams ({teams.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {teams.map(tm => (
                <div key={tm.id} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div className="flex-between">
                    <strong>{tm.name}</strong>
                    <button className="btn-secondary btn-sm" onClick={() => setTeamForm({ id: tm.id, name: tm.name, leader_id: tm.leader_id || '', member_ids: tm.member_ids || [], notes: tm.notes || '' })}>
                      <Edit3 size={12} /> Edit
                    </button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Lead: <strong>{tm.leader_name}</strong> • Members: {(tm.members || []).map(m => m.name).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'projects' && (
        <div className="grid grid-cols-3">
          {projects.map(p => (
            <div key={p.id} className="glass-panel">
              <div className="flex-between" style={{ marginBottom: '8px' }}>
                <span className="badge">KST {p.kst}</span>
                <span className="badge">{p.status}</span>
              </div>
              <h3>{p.name}</h3>
              <p style={{ fontSize: '0.8rem', margin: '6px 0' }}>Client: {p.client_name || 'Internal'}</p>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                <div>Manager: <strong>{p.manager_name}</strong></div>
                <div>Region: {p.region_name}</div>
                <div>Progress: {p.completed_objects_count}/{p.objects_count} Objects ({p.total_units} WE)</div>
                <div>Budget: {formatEuro(p.budget)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'delegation' && (
        <div className="glass-panel">
          <div className="flex-between" style={{ marginBottom: '16px' }}>
            <div>
              <h3>Time-Bound Delegation Framework (`Vertretung`)</h3>
              <p style={{ fontSize: '0.8rem' }}>Temporarily transfer Project Manager RLS scope during holidays or absences.</p>
            </div>
            <button className="btn-primary" onClick={() => setShowAddDelegation(true)}>+ New Vertretung</button>
          </div>
          {showAddDelegation && (
            <form onSubmit={handleCreateDelegation} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', marginBottom: '16px', padding: '12px', background: 'var(--surface)', borderRadius: '8px' }}>
              <select value={newDel.delegator_id} onChange={e => setNewDel({...newDel, delegator_id: e.target.value})} required>
                <option value="">Delegator (Absent PM)...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
              <select value={newDel.delegatee_id} onChange={e => setNewDel({...newDel, delegatee_id: e.target.value})} required>
                <option value="">Delegatee (Acting PM)...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
              <input type="date" value={newDel.start_date} onChange={e => setNewDel({...newDel, start_date: e.target.value})} required />
              <input type="date" value={newDel.end_date} onChange={e => setNewDel({...newDel, end_date: e.target.value})} required />
              <button type="submit" className="btn-primary">Activate</button>
            </form>
          )}
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Delegator</th>
                <th style={{ padding: '8px' }}>Acting Representative (Vertreter)</th>
                <th style={{ padding: '8px' }}>Start Date</th>
                <th style={{ padding: '8px' }}>End Date</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{d.delegator_name}</td>
                  <td style={{ padding: '8px', fontWeight: 600, color: 'var(--accent)' }}>{d.delegatee_name}</td>
                  <td style={{ padding: '8px' }}>{formatDate(d.start_date)}</td>
                  <td style={{ padding: '8px' }}>{formatDate(d.end_date)}</td>
                  <td style={{ padding: '8px' }}><span className="badge">{d.is_active ? 'Active' : 'Expired'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
