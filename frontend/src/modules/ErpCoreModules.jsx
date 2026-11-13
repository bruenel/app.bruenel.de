import React, { useState, useEffect, useMemo } from 'react';
import { DateInput, TimeInput } from '../components/DateTimeInputs';
import {
  Users, Clock, Calendar, FileText, HeartPulse, Plus, Check, X, Upload,
  Building2, MapPin, Video, Image, ShieldAlert, ArrowRightLeft, Lock, Edit3,
  MessageSquare, Download, ChevronLeft, ChevronRight, BarChart3, GripVertical,
  Search, KeyRound, Trash2, ShieldCheck, Briefcase, PhoneCall, AlertTriangle,
  Sparkles, ScanLine, FolderOpen, ShieldCheck as ShieldKey, ArrowLeft,
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, TIER_LABELS, formatEuro, formatDate, formatDateTime, formatDateRange } from '../core/api';
import { TASK_STATUS_CONFIG, getStatusStyle } from '../core/i18n';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHead, SubTabs, useQuickAction, Empty, downloadCsv, confirmDelete } from '../components/ui';

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
  const [empSortBy, setEmpSortBy] = useState('name');
  const [empSortDir, setEmpSortDir] = useState('asc');
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
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [docCategory, setDocCategory] = useState('Lohnabrechnung');
  const [docUploadDate, setDocUploadDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [docPayslipMonth, setDocPayslipMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [docPayslipYear, setDocPayslipYear] = useState(() => String(new Date().getFullYear()));
  const [stagedUploadFiles, setStagedUploadFiles] = useState([]);
  const [docUploadFeedback, setDocUploadFeedback] = useState(null);
  const [customDocLabel, setCustomDocLabel] = useState('');
  const [uploadingEmpDoc, setUploadingEmpDoc] = useState(false);
  const [otpBanner, setOtpBanner] = useState(null);

  // Document Selection, Sorting & Filtering State (for Personalakte & HR Documents Tab)
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [docSortBy, setDocSortBy] = useState('date_desc'); // 'date_desc' | 'date_asc' | 'kind_asc' | 'title_asc'
  const [docFilterKind, setDocFilterKind] = useState('ALL');
  const [docFilterSearch, setDocFilterSearch] = useState('');
  const [docFilterEmpId, setDocFilterEmpId] = useState('ALL');
  const [centralUploadEmpId, setCentralUploadEmpId] = useState('');
  const [bulkTargetKind, setBulkTargetKind] = useState('');
  const [editingDocCategory, setEditingDocCategory] = useState('');
  const [editingDocDate, setEditingDocDate] = useState('');

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
  const [editingDocId, setEditingDocId] = useState(null);
  const [editingDocTitle, setEditingDocTitle] = useState('');

  // AI Document Reader state
  const [aiDocReading, setAiDocReading] = useState(false);
  const [aiDocResult, setAiDocResult] = useState(null); // { fields, raw }
  const [aiDocError, setAiDocError] = useState(null);

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
    employee_id: '', period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(),
    gross_salary: 0, net_salary: 0, commission_bonus: 0, hours_worked: 0, notes: ''
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
  const [otReport, setOtReport] = useState(null);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogForm, setEditLogForm] = useState({ date: '', project_id: '', check_in_time: '', check_out_time: '', break_minutes: 0 });

  // Manager Add Holiday (Urlaub) & Sickness (Krankmeldung) State
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [newLeaveForm, setNewLeaveForm] = useState(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return { employee_id: '', type: 'Annual Leave', start_date: todayIso, end_date: todayIso, reason: '', status: 'Approved' };
  });
  const [showAddSick, setShowAddSick] = useState(false);
  const [sickAuFile, setSickAuFile] = useState(null);
  const [newSickForm, setNewSickForm] = useState(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return { employee_id: '', start_date: todayIso, end_date: todayIso, doctor_visited: true, symptoms_note: '' };
  });

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
    fetchWithToken(`/api/v1/hr/time-logs/overtime-report?year=${yr}${empId ? `&employee_id=${empId}` : ''}`)
      .then(setOtReport)
      .catch(() => setOtReport(null));
  };

  // ── AI Document Reader (Multi-file support) ────────────────────────────────
  const handleAiDocumentRead = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    setAiDocReading(true);
    setAiDocResult(null);
    setAiDocError(null);

    const mergedFields = {};
    const uploadedDocsList = [];

    const toBase64 = (f) =>
      new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(f);
      });

    const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

    const prompt = `You are an HR document parser for a German company. Analyze this document image (it may be a Personalausweis, Reisepass, Aufenthaltstitel, Arbeitsvertrag, Gewerbeanmeldung, Freistellungsbescheinigung, or other HR document).
Extract as many of the following fields as you can find. Return ONLY valid JSON (no markdown):
{
  "first_name": "",
  "last_name": "",
  "birth_date": "YYYY-MM-DD",
  "nationality": "",
  "gender": "",
  "street": "",
  "postal_code": "",
  "city": "",
  "steuer_id": "",
  "document_type": "",
  "document_number": "",
  "document_valid_until": "YYYY-MM-DD",
  "company_name": "",
  "ust_id": "",
  "iban": "",
  "notes": ""
}
Leave a field as empty string if you cannot find it. Do not guess. Only return JSON.`;

    try {
      for (const file of files) {
        // 1. Upload each document immediately as a separate file
        const uploadedDoc = await uploadMediaFile({
          file,
          referenceType: 'PersonalDokument',
          referenceId: editingEmpId || 'NEW_EMPLOYEE',
          title: `KI-Upload: ${file.name}`,
        });

        if (uploadedDoc?.document_id) {
          uploadedDocsList.push({ ...uploadedDoc, name: file.name });
          if (editingEmpId) {
            await fetchWithToken(`/api/v1/hr/employees/${editingEmpId}/documents`, {
              method: 'POST',
              body: JSON.stringify({
                document_id: uploadedDoc.document_id,
                category: docCategory || 'Personalausweis / Reisepass',
                title: `KI-Upload: ${file.name}`,
              }),
            }).catch(() => null);
          }
        }

        // 2. Read each document with Gemini Vision
        try {
          const b64 = await toBase64(file);
          const mimeType = file.type || 'image/jpeg';
          let docFields = {};

          if (GEMINI_KEY) {
            let geminiRes = null;
            for (const model of modelsToTry) {
              try {
                const res = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{
                        parts: [
                          { text: prompt },
                          { inline_data: { mime_type: mimeType, data: b64 } },
                        ],
                      }],
                      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
                    }),
                  }
                );
                if (res.ok) {
                  geminiRes = res;
                  break;
                }
              } catch (e) {
                // next model
              }
            }

            if (geminiRes) {
              const geminiJson = await geminiRes.json();
              const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
              try { docFields = JSON.parse(rawText); } catch { docFields = {}; }
            } else {
              const backendRes = await fetchWithToken('/api/v1/hr/ai/read-document', {
                method: 'POST',
                body: JSON.stringify({ mime_type: mimeType, data: b64 }),
              }).catch(() => null);
              docFields = backendRes?.fields || {};
            }
          } else {
            const backendRes = await fetchWithToken('/api/v1/hr/ai/read-document', {
              method: 'POST',
              body: JSON.stringify({ mime_type: mimeType, data: b64 }),
            }).catch(() => null);
            docFields = backendRes?.fields || {};
          }

          for (const [k, v] of Object.entries(docFields)) {
            if (v && String(v).trim()) {
              mergedFields[k] = v;
            }
          }
        } catch (readErr) {
          console.warn('Error reading file with AI:', file.name, readErr);
        }
      }

      if (editingEmpId) {
        loadAll();
      }

      // 3. Auto-fill form fields from all extracted documents
      setNewEmp((prev) => {
        const attrs = { ...(prev.attributes || {}) };
        if (mergedFields.birth_date) attrs.geburtsdatum = mergedFields.birth_date;
        if (mergedFields.nationality) attrs.staatsangehoerigkeit = mergedFields.nationality;
        if (mergedFields.gender) attrs.geschlecht = mergedFields.gender;
        if (mergedFields.street) attrs.strasse = mergedFields.street;
        if (mergedFields.postal_code) attrs.plz = mergedFields.postal_code;
        if (mergedFields.city) attrs.ort = mergedFields.city;
        if (mergedFields.steuer_id) attrs.steuer_id = mergedFields.steuer_id;
        if (mergedFields.document_type) attrs.ausweistyp = mergedFields.document_type;
        if (mergedFields.document_number) attrs.ausweisnummer = mergedFields.document_number;
        if (mergedFields.document_valid_until) attrs.ausweis_gueltig_bis = mergedFields.document_valid_until;
        if (mergedFields.company_name) attrs.company_name = mergedFields.company_name;
        if (mergedFields.ust_id) attrs.ust_id = mergedFields.ust_id;
        if (mergedFields.iban) attrs.iban = mergedFields.iban;

        return {
          ...prev,
          first_name: mergedFields.first_name || prev.first_name,
          last_name: mergedFields.last_name || prev.last_name,
          attributes: attrs,
          documents: [
            ...(prev.documents || []),
            ...uploadedDocsList.map(doc => ({
              id: doc.document_id,
              title: doc.name,
              category: docCategory || 'Personalausweis / Reisepass',
              url: doc.download_url,
              created_at: new Date().toISOString(),
            })),
          ],
        };
      });

      setAiDocResult({
        fields: mergedFields,
        fileName: files.map(f => f.name).join(', '),
        count: files.length,
      });
    } catch (err) {
      setAiDocError(err.message || 'Fehler beim Hochladen oder Verarbeiten der Dokumente');
    } finally {
      setAiDocReading(false);
    }
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
      if (data.length > 0 && !newLeaveForm.employee_id) {
        setNewLeaveForm(prev => ({ ...prev, employee_id: data[0].id }));
      }
      if (data.length > 0 && !newSickForm.employee_id) {
        setNewSickForm(prev => ({ ...prev, employee_id: data[0].id }));
      }
      if (data.length > 0 && !centralUploadEmpId) {
        setCentralUploadEmpId(data[0].id);
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

  const handleRemoveFreelancerContract = async (fcId) => {
    const existingList = Array.isArray(newEmp.attributes?.freelancer_contracts)
      ? newEmp.attributes.freelancer_contracts
      : [];
    const target = existingList.find(c => c.id === fcId);
    const ok = await confirmDelete({
      title: 'Freelancer-Vertrag löschen?',
      message: 'Sind Sie sicher, dass Sie diesen Freelancer-/Werkvertrag aus der Akte entfernen möchten?',
      itemName: target ? `${target.title || 'Vertrag'} (${target.project_name || 'Allgemein'})` : undefined,
    });
    if (!ok) return;
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
      project_id: log.project_id || '',
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
          project_id: editLogForm.project_id || null,
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
    const logItem = timeLogs.find(l => l.id === logId);
    const ok = await confirmDelete({
      title: 'Arbeitszeiteintrag löschen?',
      message: 'Sind Sie sicher, dass Sie diesen Arbeitszeiteintrag unwiderruflich löschen möchten?',
      itemName: logItem ? `${logItem.employee_name || 'Mitarbeiter'} — ${formatDate(logItem.date)} (${logItem.net_hours ?? 0} Std.)` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${logId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteEmployee = async (empId, empName) => {
    const ok = await confirmDelete({
      title: 'Mitarbeiter & Personalakte löschen?',
      message: `Sind Sie sicher, dass Sie die Personalakte und den Account von "${empName}" unwiderruflich löschen möchten?\n\nAlle zugehörigen Dokumente, Arbeitszeiten und Zugangsdaten werden endgültig entfernt.`,
      itemName: empName,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/hr/employees/${empId}`, { method: 'DELETE' });
      if (editingEmpId === empId) {
        setShowAddEmp(false);
        setEditingEmpId(null);
      }
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/hr/leave-requests', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: newLeaveForm.employee_id || employees[0]?.id,
          type: newLeaveForm.type,
          start_date: newLeaveForm.start_date,
          end_date: newLeaveForm.end_date,
          reason: newLeaveForm.reason,
          status: newLeaveForm.status || 'Approved',
        }),
      });
      setShowAddLeave(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    const lv = leaves.find(l => l.id === leaveId);
    const ok = await confirmDelete({
      title: 'Urlaubsantrag löschen?',
      message: 'Sind Sie sicher, dass Sie diesen Urlaubs-/Abwesenheitseintrag unwiderruflich löschen möchten?',
      itemName: lv ? `${lv.employee_name || 'Mitarbeiter'} — ${lv.type} (${formatDateRange(lv.start_date, lv.end_date)})` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/hr/leave-requests/${leaveId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateSickness = async (e) => {
    e.preventDefault();
    try {
      const targetEmpId = newSickForm.employee_id || employees[0]?.id;
      let docId = null;
      if (sickAuFile && targetEmpId) {
        const up = await uploadMediaFile({
          file: sickAuFile,
          referenceType: 'Krankmeldung (AU)',
          referenceId: targetEmpId,
          employeeId: targetEmpId,
          title: `Krankmeldung (AU): ${sickAuFile.name}`,
          metadata: {
            category: 'Krankmeldung (AU)',
            doc_date: newSickForm.start_date,
            uploaded_by: 'Management',
          },
        });
        docId = up.document_id;
      }
      await fetchWithToken('/api/v1/hr/sickness', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: targetEmpId,
          start_date: newSickForm.start_date,
          end_date: newSickForm.end_date,
          doctor_visited: newSickForm.doctor_visited,
          symptoms_note: newSickForm.symptoms_note,
          au_document_id: docId,
        }),
      });
      setShowAddSick(false);
      setSickAuFile(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteSickness = async (sickId) => {
    const sk = sickness.find(s => s.id === sickId);
    const ok = await confirmDelete({
      title: 'Krankmeldung löschen?',
      message: 'Sind Sie sicher, dass Sie diese Krankmeldung unwiderruflich löschen möchten?',
      itemName: sk ? `${sk.employee_name || 'Mitarbeiter'} (${formatDateRange(sk.start_date, sk.end_date)})` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/hr/sickness/${sickId}`, { method: 'DELETE' });
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
          project_id: manualTimeForm.project_id || null,
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
  useQuickAction('add-payslip', () => setTab('documents'));

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
            one_time_password: newEmp.one_time_password || undefined,
            attributes: mergedAttrs,
          }),
        });
      } else {
        const cleanEmail = (newEmp.email || '').trim().toLowerCase();
        const existingEmp = cleanEmail ? employees.find(emp => (emp.email || '').trim().toLowerCase() === cleanEmail) : null;
        if (existingEmp) {
          const proceed = window.confirm(
            `Ein Mitarbeiter mit der E-Mail "${newEmp.email}" existiert bereits (${existingEmp.full_name}).\n\nMöchten Sie stattdessen die bestehende Personalakte dieses Mitarbeiters mit den eingegebenen Daten aktualisieren?`
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

      if (pendingUploadFiles.length > 0 && targetEmpId) {
        const isSlip = docCategory.toLowerCase().includes('lohnabrechnung');
        const refType = isSlip ? 'Lohnabrechnung' : docCategory;
        for (const f of pendingUploadFiles) {
          const docLabel = customDocLabel.trim()
            ? `${docCategory}: ${customDocLabel.trim()} (${f.name})`
            : `${docCategory}: ${f.name}`;
          await uploadMediaFile({
            file: f,
            referenceType: refType,
            referenceId: targetEmpId,
            employeeId: targetEmpId,
            title: docLabel,
            metadata: {
              category: docCategory,
              doc_date: docUploadDate,
              uploaded_by: 'Management',
            },
          });
        }
        setPendingUploadFiles([]);
        setContractFile(null);
        setCustomDocLabel('');
      } else if (contractFile && targetEmpId) {
        const isSlip = docCategory.toLowerCase().includes('lohnabrechnung');
        const refType = isSlip ? 'Lohnabrechnung' : docCategory;
        const docLabel = customDocLabel.trim()
          ? `${docCategory} — ${customDocLabel.trim()}`
          : `${docCategory} — ${newEmp.first_name} ${newEmp.last_name}`;
        await uploadMediaFile({
          file: contractFile,
          referenceType: refType,
          referenceId: targetEmpId,
          employeeId: targetEmpId,
          title: docLabel,
          metadata: {
            category: docCategory,
            doc_date: docUploadDate,
            uploaded_by: 'Management',
          },
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

  const executeDocUpload = async (filesToUpload, overrideEmpId = null) => {
    const targetEmpId = overrideEmpId || editingEmpId || centralUploadEmpId || employees[0]?.id;
    if (!targetEmpId) {
      alert('Bitte wählen Sie zuerst einen Mitarbeiter aus.');
      return;
    }
    if (!filesToUpload || filesToUpload.length === 0) {
      alert('Bitte wählen Sie mindestens eine Datei (PDF / Bild) zum Hochladen aus.');
      return;
    }
    setUploadingEmpDoc(true);
    setDocUploadFeedback(null);
    try {
      const isSlip = docCategory.toLowerCase().includes('lohnabrechnung');
      const refType = isSlip ? 'Lohnabrechnung' : docCategory;
      const monthObj = MONTH_OPTIONS.find(m => m.value === String(docPayslipMonth).padStart(2, '0'));
      const monthName = monthObj ? monthObj.label.replace(/^\d+\s*·\s*/, '') : docPayslipMonth;
      const effectiveDocDate = isSlip
        ? `${docPayslipYear}-${String(docPayslipMonth).padStart(2, '0')}-01`
        : docUploadDate;

      for (const file of filesToUpload) {
        let labelTitle;
        if (isSlip) {
          labelTitle = customDocLabel.trim()
            ? `Lohnabrechnung ${monthName} ${docPayslipYear} (${String(docPayslipMonth).padStart(2, '0')}/${docPayslipYear}) — ${customDocLabel.trim()}`
            : `Lohnabrechnung ${monthName} ${docPayslipYear} (${String(docPayslipMonth).padStart(2, '0')}/${docPayslipYear})`;
        } else {
          labelTitle = customDocLabel.trim()
            ? `${docCategory}: ${customDocLabel.trim()} (${file.name})`
            : `${docCategory}: ${file.name}`;
        }

        await uploadMediaFile({
          file,
          referenceType: refType,
          referenceId: targetEmpId,
          employeeId: targetEmpId,
          title: labelTitle,
          metadata: {
            category: isSlip ? 'Lohnabrechnung' : docCategory,
            doc_date: effectiveDocDate,
            ...(isSlip ? { period_month: Number(docPayslipMonth), period_year: Number(docPayslipYear) } : {}),
            uploaded_by: 'Management',
          },
        });
      }

      const empObj = employees.find(x => x.id === targetEmpId);
      const empLabel = empObj ? empObj.full_name : 'Mitarbeiter';
      setDocUploadFeedback({
        type: 'success',
        text: isSlip
          ? `✅ Lohnabrechnung (${String(docPayslipMonth).padStart(2, '0')}/${docPayslipYear}) für ${empLabel} erfolgreich hochgeladen! Sie ist ab sofort im Mitarbeiter-Portal unter „Lohnabrechnung“ sichtbar und als PDF abrufbar.`
          : `✅ ${filesToUpload.length} Dokument(e) (${docCategory}) für ${empLabel} erfolgreich hochgeladen!`,
      });
      setCustomDocLabel('');
      setStagedUploadFiles([]);
      loadAll();
    } catch (err) {
      setDocUploadFeedback({
        type: 'error',
        text: `⚠️ Fehler beim Hochladen: ${err.message}`,
      });
      alert(err.message);
    }
    setUploadingEmpDoc(false);
  };

  const handleUploadEmpDocumentNow = async (e, overrideEmpId = null) => {
    const files = Array.from(e.target?.files || []);
    if (!files.length) return;
    setStagedUploadFiles(files);
  };

  const handleSubmitStagedDocuments = async (overrideEmpId = null) => {
    await executeDocUpload(stagedUploadFiles, overrideEmpId);
  };

  const handleDeleteEmpDocument = async (docId) => {
    const allDocs = employees.flatMap(emp => (emp.documents || []).map(d => ({ ...d, empName: emp.full_name })));
    const foundDoc = allDocs.find(d => d.id === docId) || (newEmp.documents || []).find(d => d.id === docId);
    const ok = await confirmDelete({
      title: 'Dokument unwiderruflich löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Dokument (bzw. diese Lohnabrechnung) endgültig löschen möchten?',
      itemName: foundDoc ? `${foundDoc.title || foundDoc.file_name}${foundDoc.empName ? ` — ${foundDoc.empName}` : ''}` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/media/${docId}`, { method: 'DELETE' });
      setNewEmp(prev => ({
        ...prev,
        documents: (prev.documents || []).filter(d => d.id !== docId),
      }));
      setSelectedDocIds(prev => prev.filter(id => id !== docId));
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBulkDeleteDocs = async () => {
    if (!selectedDocIds.length) return;
    const ok = await confirmDelete({
      title: `${selectedDocIds.length} ausgewählte Dokumente löschen?`,
      message: `Sind Sie sicher, dass Sie die ${selectedDocIds.length} markierten Dokumente unwiderruflich löschen möchten?`,
      itemName: `${selectedDocIds.length} Dokument(e) markiert`,
    });
    if (!ok) return;
    try {
      for (const docId of selectedDocIds) {
        await fetchWithToken(`/api/v1/media/${docId}`, { method: 'DELETE' });
      }
      setSelectedDocIds([]);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBulkChangeDocCategory = async (newKind) => {
    if (!selectedDocIds.length || !newKind) return;
    try {
      for (const docId of selectedDocIds) {
        await fetchWithToken(`/api/v1/media/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify({ category: newKind, reference_type: newKind.toLowerCase().includes('lohnabrechnung') ? 'Lohnabrechnung' : newKind }),
        });
      }
      setSelectedDocIds([]);
      setBulkTargetKind('');
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveDocTitle = async (docId) => {
    if (!editingDocTitle.trim()) return;
    try {
      const catToSave = editingDocCategory || undefined;
      const dateToSave = editingDocDate || undefined;
      await fetchWithToken(`/api/v1/media/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editingDocTitle.trim(),
          category: catToSave,
          reference_type: catToSave && catToSave.toLowerCase().includes('lohnabrechnung') ? 'Lohnabrechnung' : catToSave,
          doc_date: dateToSave,
        }),
      });
      setEditingDocId(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
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
    if (!newSlip.employee_id) {
      alert('Bitte wählen Sie einen Mitarbeiter aus.');
      return;
    }
    if (!slipFile) {
      alert('Bitte laden Sie die persönliche Lohnabrechnung (PDF / Bild) für diesen Mitarbeiter hoch.');
      return;
    }
    setUploadingSlip(true);
    try {
      let docId = null;
      if (slipFile) {
        const up = await uploadMediaFile({
          file: slipFile,
          referenceType: 'Lohnabrechnung',
          referenceId: newSlip.employee_id,
          title: `Lohnabrechnung ${String(newSlip.period_month).padStart(2, '0')}/${newSlip.period_year}`,
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

  const handleDeletePayslip = async (slipId) => {
    const sl = payslips.find(p => p.id === slipId);
    const ok = await confirmDelete({
      title: 'Lohnabrechnung löschen?',
      message: 'Sind Sie sicher, dass Sie diese Lohnabrechnung unwiderruflich löschen möchten?',
      itemName: sl ? `${sl.employee_name || 'Mitarbeiter'} (${String(sl.period_month).padStart(2, '0')}/${sl.period_year})` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/hr/payslips/${slipId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
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
      {/* Compact single-row HR header (matches Objects & Properties) */}
      <div className="glass-panel" style={{ padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#0f172a' }}>HR & Workforce</h3>
          <span style={{ padding: '4px 10px', borderRadius: 8, background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 700 }}>Gesamtzahl Mitarbeiter: {employees.length}</span>
          <span style={{ padding: '4px 9px', borderRadius: 8, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: 11.5, fontWeight: 700 }}>Aktiv: {employees.filter((e) => e.is_active !== false).length}</span>
          <span style={{ padding: '4px 9px', borderRadius: 8, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: 11.5, fontWeight: 700 }}>Freelancer/Sub: {subCount}</span>
          <span style={{ padding: '4px 9px', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: 11.5, fontWeight: 700 }}>Kandidaten: {candidateCount}</span>
          <span style={{ padding: '4px 9px', borderRadius: 8, background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', fontSize: 11.5, fontWeight: 700 }}>Stunden: {biSummary ? `${biSummary.total_hours} h` : '—'}</span>
          <span style={{ padding: '4px 9px', borderRadius: 8, background: totalOvertimeHoursSum > 0 ? '#fff7ed' : '#f8fafc', color: totalOvertimeHoursSum > 0 ? '#ea580c' : '#475569', border: '1px solid #e2e8f0', fontSize: 11.5, fontWeight: 700 }}>Überstunden: {totalOvertimeHoursSum} h</span>
          <span style={{ padding: '4px 9px', borderRadius: 8, background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', fontSize: 11.5, fontWeight: 700 }}>Kosten: {formatEuro(totalEstimatedMonthlyCost)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '2px 8px' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Monat</span>
            <select value={selectedBiMonthPart} onChange={(e) => setBiMonth(`${selectedBiYear}-${e.target.value}`)} style={{ width: 'auto', border: 'none', padding: '3px 4px', fontWeight: 700, background: 'transparent', fontSize: 12 }}>
              {MONTH_OPTIONS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
            <select value={selectedBiYear} onChange={(e) => setBiMonth(`${e.target.value}-${selectedBiMonthPart}`)} style={{ width: 'auto', border: 'none', padding: '3px 4px', fontWeight: 700, background: 'transparent', fontSize: 12 }}>
              {YEAR_OPTIONS.map((yr) => (<option key={yr} value={yr}>{yr}</option>))}
            </select>
          </div>
          <button className="btn-primary btn-sm" onClick={openCreateEmployeeModal} style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700 }}><Plus size={14} /> Neuer Mitarbeiter</button>
        </div>
      </div>

      {weeklyAlerts.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <strong style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={13} /> Wochenarbeitszeit überschritten:</strong>
          {weeklyAlerts.map((al, i) => (
            <button key={`${al.employee_id}-${al.week_key}-${i}`} type="button" onClick={() => { setBiEmpFilter(al.employee_id); setTimeSearchQuery(al.employee_name); setTab('timelogs'); }}
              style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}>
              {al.employee_name} {al.week_key}: {al.worked_hours}/{al.weekly_limit}h (+{al.exceeded_by}h)
            </button>
          ))}
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <SubTabs base="/hr" active={showAddEmp ? 'register' : tab} items={[
        { id: 'employees', label: 'Employees, Freelancers & Candidates', count: employees.length },
        ...(showAddEmp ? [{ id: 'register', label: editingEmpId ? `Personalakte: ${newEmp.first_name} ${newEmp.last_name}` : 'Mitarbeiter erfassen (Vollbild)' }] : []),
        { id: 'timelogs', label: 'Working Hours & Smart Search', count: timeLogs.length },
        { id: 'leaves', label: 'Holiday (Urlaub)', count: leaves.length },
        { id: 'sickness', label: 'Sickness (AU)', count: sickness.length },
        { id: 'documents', label: 'Documents (Dokumente & Lohnabrechnung)', count: employees.reduce((acc, e) => acc + ((e.documents || []).length), 0) },
      ]} />

      {/* =====================================================================
          CLEAN, STATIC MODERN FORM: REGISTER / EDIT EMPLOYEE (FULL-SCREEN PLATFORM TAB)
         ===================================================================== */}
      {showAddEmp && (
        <div
          className="glass-panel"
          style={{
            width: '100%',
            minHeight: '82vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            marginTop: '16px',
            marginBottom: '32px',
          }}
        >
          {/* Platform Integrated Full-Screen Header with Back Button */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
            <div className="flex-between" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddEmp(false)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, padding: '7px 14px' }}
                >
                  <ArrowLeft size={16} /> Zurück zur Übersicht
                </button>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.18rem', margin: 0 }}>
                    <Briefcase size={20} style={{ color: 'var(--accent)' }} />
                    {editingEmpId
                      ? `Personalakte / Master Card: ${newEmp.first_name} ${newEmp.last_name}`
                      : 'Mitarbeiter, Freelancer & Subunternehmer erfassen (Vollbild-Formular)'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Plattform-integriertes Vollbild-Formular • Wählen Sie unten den Beschäftigungstyp (Vollzeit, Freelancer, Subunternehmer oder IT-Kandidat).
                  </p>
                </div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddEmp(false)}>
                <X size={15} /> Schließen
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

            {/* Mac Finder–Style Section Tabs Bar */}
            <div className="finder-tabs">
              {[
                { id: 'personal', num: 1, label: 'Stammdaten & Position' },
                { id: 'contract', num: 2, label: isFreelanceModal ? 'Freelancing & Verträge' : 'Vertrag & Gehalt' },
                { id: 'tax', num: 3, label: 'Steuer, KV & Bank' },
                { id: 'sos', num: 4, label: 'SOS Notfallkontakt' },
                { id: 'sub', num: 5, label: 'Freelancer / Sub §48b' },
                { id: 'docs', num: 6, label: `Dokumente`, badge: (newEmp.documents || []).length || null },
                { id: 'security', num: 7, label: 'Account & Sicherheit' },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  className={`finder-tab ${empCardTab === st.id ? 'active' : ''}`}
                  onClick={() => setEmpCardTab(st.id)}
                >
                  <span className="ftab-num">{st.num}</span>
                  {st.label}
                  {st.badge != null && st.badge > 0 && (
                    <span className="ftab-badge">{st.badge}</span>
                  )}
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
                        <DateInput  value={newEmp.attributes?.birth_date || ''} onChange={e => setEmpAttr('birth_date', e.target.value)} />
                      </div>
                    </div>

                    {/* Employment Type Dropdown — inline in form, Tab 1 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#fff7ed,#fff)', border: '1.5px solid rgba(255,107,0,0.25)' }}>
                      <div>
                        <label style={{ fontWeight: 700, color: '#9a3412' }}>Mitarbeiter-Typ (Employment Type) *</label>
                        <select
                          value={newEmp.employment_type}
                          onChange={e => handleEmploymentTypeSwitch(e.target.value)}
                          style={{ fontWeight: 700, borderColor: 'rgba(255,107,0,0.4)', background: '#fffbf7' }}
                        >
                          <option value="Full-time">Full-time — Vollzeit Angestellter</option>
                          <option value="Part-time">Part-time — Teilzeit</option>
                          <option value="Minijob">Minijob — Geringfügig Beschäftigt</option>
                          <option value="Freelancer">Freelancer — Freier Mitarbeiter</option>
                          <option value="Subunternehmer">Subunternehmer — Nachunternehmer</option>
                          <option value="Candidate">Candidate — Bewerber (IT Projects)</option>
                        </select>
                        <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#c2410c' }}>
                          {newEmp.employment_type === 'Full-time' && '📋 Vollzeit · Arbeitsvertrag · ELStAM pflicht'}
                          {newEmp.employment_type === 'Part-time' && '📋 Teilzeit · Angestelltenverhältnis'}
                          {newEmp.employment_type === 'Minijob' && '📋 538€ Grenze · Minijobzentrale'}
                          {newEmp.employment_type === 'Freelancer' && '🔑 Freier Mitarbeiter · Tagessatz / Stundensatz · Multi-Verträge'}
                          {newEmp.employment_type === 'Subunternehmer' && '🏗️ §48b EStG · Freistellungsbescheinigung · BG BAU'}
                          {newEmp.employment_type === 'Candidate' && '🎯 IT Bewerber · Kein Vertrag · Nur Personalakte'}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontWeight: 700 }}>Registrierungsstatus (HR/ELStAM)</label>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
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
                              <DateInput  value={newFc.start_date} onChange={e => setNewFc({ ...newFc, start_date: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem' }}>Ende</label>
                              <DateInput  value={newFc.end_date} onChange={e => setNewFc({ ...newFc, end_date: e.target.value })} />
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
                            <DateInput  value={newEmp.attributes?.contract_signed_date || ''} onChange={e => setEmpAttr('contract_signed_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Vertragsbeginn (Start Date)</label>
                            <DateInput  value={newEmp.attributes?.contract_start_date || ''} onChange={e => setEmpAttr('contract_start_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Probezeit Ende am (Probezeit Ends On)</label>
                            <DateInput  value={newEmp.attributes?.probezeit_end_date || ''} onChange={e => setEmpAttr('probezeit_end_date', e.target.value)} />
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
                        <DateInput  value={newEmp.attributes?.freistellungsbescheinigung_until || ''} onChange={e => setEmpAttr('freistellungsbescheinigung_until', e.target.value)} />
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

                {/* SECTION 6: DOKUMENTE — AI READER + MULTI-UPLOAD + ARCHIVE (sorted & filtered) */}
                {empCardTab === 'docs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* ── AI Ausweis / Document Reader ──────────────────────────── */}
                    <div style={{ padding: '16px', borderRadius: '12px', background: 'linear-gradient(135deg,#f0fdf4,#fffbf7)', border: '1.5px solid rgba(16,185,129,0.3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', color: '#059669', display: 'flex' }}>
                          <ScanLine size={18} />
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.92rem', color: '#065f46' }}>
                            <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            KI-Dokumentenleser — Ausweis / Reisepass / Aufenthaltstitel automatisch einlesen
                          </strong>
                          <p style={{ fontSize: '0.73rem', color: '#6b7280', margin: '2px 0 0' }}>
                            Foto oder Scan hochladen → KI liest Felder automatisch aus und füllt das Formular. Dokument wird gleichzeitig in der Personalakte gespeichert.
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                          <label style={{ fontSize: '0.72rem' }}>Dokumenttyp für KI-Upload</label>
                          <select value={docCategory} onChange={e => setDocCategory(e.target.value)} style={{ fontSize: '0.82rem' }}>
                            <option value="Lohnabrechnung">💰 Lohnabrechnung / Entgeltnachweis (Erscheint im Lohnabrechnung-Tab)</option>
                            <option value="Personalausweis / Reisepass">🪪 Personalausweis / Reisepass / Aufenthaltstitel</option>
                            <option value="Arbeitsvertrag / Werkvertrag">📄 Arbeitsvertrag / Werkvertrag</option>
                            <option value="Freelancer Projektvertrag">📑 Freelancer Projektvertrag</option>
                            <option value="Krankmeldung (AU)">🏥 Krankmeldung (AU)</option>
                            <option value="Krankenkassenkarte / SV-Ausweis">🏥 Krankenkassenkarte / SV-Ausweis</option>
                            <option value="Freistellungsbescheinigung §48b EStG">📋 Freistellungsbescheinigung §48b EStG</option>
                            <option value="Gewerbeanmeldung / BG BAU">🏗️ Gewerbeanmeldung / BG BAU Nachweis</option>
                            <option value="Führerschein / Zertifikat">🚗 Führerschein / Schulungszertifikat</option>
                            <option value="Lebenslauf / CV">📝 Lebenslauf / CV</option>
                            <option value="Sonstiges">📎 Sonstiges</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.72rem' }}>
                            {aiDocReading ? '⏳ KI liest Dokument...' : '📎 Dokument / Foto auswählen'}
                          </label>
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                            borderRadius: '8px', background: aiDocReading ? '#d1fae5' : '#059669', color: '#fff',
                            cursor: aiDocReading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 700,
                            border: 'none', transition: 'background 0.2s',
                          }}>
                            {aiDocReading ? <><Sparkles size={14} /> Lese Dokument...</> : <><ScanLine size={14} /> KI-Upload & Einlesen</>}
                            <input
                              type="file"
                              accept=".pdf,image/*,.doc,.docx"
                              style={{ display: 'none' }}
                              disabled={aiDocReading}
                              onChange={handleAiDocumentRead}
                            />
                          </label>
                        </div>
                      </div>

                      {/* AI Result Banner */}
                      {aiDocResult && (
                        <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #10b981', fontSize: '0.8rem' }}>
                          <div style={{ fontWeight: 700, color: '#065f46', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Check size={14} /> KI hat folgende Felder erkannt & ins Formular übernommen:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {Object.entries(aiDocResult.fields).filter(([, v]) => v).map(([k, v]) => (
                              <span key={k} style={{ padding: '2px 8px', borderRadius: '20px', background: '#d1fae5', color: '#065f46', fontSize: '0.72rem', fontWeight: 600 }}>
                                {k.replace(/_/g, ' ')}: <strong>{String(v)}</strong>
                              </span>
                            ))}
                          </div>
                          <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#6b7280' }}>
                            Datei «{aiDocResult.fileName}» hochgeladen & in Personalakte gespeichert.
                          </div>
                        </div>
                      )}
                      {aiDocError && (
                        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: '0.78rem' }}>
                          ⚠️ {aiDocError}
                        </div>
                      )}
                    </div>

                    {/* ── Divider: Manual Multi-Upload ───────────────────────────── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Mehrfach-Upload & Lohnabrechnung-Freigabe
                      </span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    </div>

                    {/* ── Manual Multi-Document Upload ──────────────────────────── */}
                    <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                        <div>
                          <h4 style={{ fontSize: '0.88rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Upload size={14} /> Dokumente oder monatliche Lohnabrechnung hochladen
                          </h4>
                          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                            Wählen Sie <strong>„Lohnabrechnung“</strong> und den Abrechnungsmonat, damit die PDF automatisch im Lohnabrechnungs-Tab des Mitarbeiters angezeigt wird.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setDocCategory('Lohnabrechnung')}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: docCategory === 'Lohnabrechnung' ? '1.5px solid #059669' : '1px solid var(--border)',
                              background: docCategory === 'Lohnabrechnung' ? '#ecfdf5' : '#ffffff',
                              color: docCategory === 'Lohnabrechnung' ? '#047857' : 'var(--text-main)',
                            }}
                          >
                            💰 Monatliche Lohnabrechnung
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (docCategory === 'Lohnabrechnung') setDocCategory('Arbeitsvertrag / Werkvertrag');
                            }}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: docCategory !== 'Lohnabrechnung' ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                              background: docCategory !== 'Lohnabrechnung' ? 'var(--accent-soft)' : '#ffffff',
                              color: docCategory !== 'Lohnabrechnung' ? 'var(--accent)' : 'var(--text-main)',
                            }}
                          >
                            📂 Personaldokument / Vertrag
                          </button>
                        </div>
                      </div>

                      {docUploadFeedback && (
                        <div
                          style={{
                            marginBottom: '12px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            background: docUploadFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                            border: `1px solid ${docUploadFeedback.type === 'success' ? '#10b981' : '#fca5a5'}`,
                            color: docUploadFeedback.type === 'success' ? '#065f46' : '#991b1b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <span>{docUploadFeedback.text}</span>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setDocUploadFeedback(null)}>
                            <X size={12} />
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr 1.1fr auto', gap: '10px', alignItems: 'end' }}>
                        <div>
                          <label>Dokumentenart (Kategorie)</label>
                          <select value={docCategory} onChange={e => setDocCategory(e.target.value)}>
                            <option value="Lohnabrechnung">💰 Lohnabrechnung / Entgeltnachweis (→ Lohnabrechnung-Tab)</option>
                            <option value="Personalausweis / Reisepass">🪪 Personalausweis / Reisepass / Aufenthaltstitel</option>
                            <option value="Arbeitsvertrag / Werkvertrag">📄 Arbeitsvertrag / Werkvertrag</option>
                            <option value="Freelancer Projektvertrag">📑 Freelancer Projektvertrag</option>
                            <option value="Krankmeldung (AU)">🏥 Krankmeldung (AU)</option>
                            <option value="Krankenkassenkarte / SV-Ausweis">🏥 Krankenkassenkarte / SV-Ausweis</option>
                            <option value="Freistellungsbescheinigung §48b EStG">📋 Freistellungsbescheinigung §48b EStG</option>
                            <option value="Gewerbeanmeldung / BG BAU">🏗️ Gewerbeanmeldung / BG BAU Nachweis</option>
                            <option value="Führerschein / Zertifikat">🚗 Führerschein / Schulungszertifikat</option>
                            <option value="Lebenslauf / CV">📝 Lebenslauf / CV</option>
                            <option value="Sonstiges">📎 Sonstiges (Eigene Bezeichnung)</option>
                          </select>
                        </div>

                        {docCategory === 'Lohnabrechnung' ? (
                          <div>
                            <label>Abrechnungsmonat & Jahr *</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <select value={docPayslipMonth} onChange={e => setDocPayslipMonth(e.target.value)} style={{ fontWeight: 700 }}>
                                {MONTH_OPTIONS.map(m => (
                                  <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                              </select>
                              <select value={docPayslipYear} onChange={e => setDocPayslipYear(e.target.value)} style={{ width: '92px', fontWeight: 700 }}>
                                {YEAR_OPTIONS.map(yr => (
                                  <option key={yr} value={yr}>{yr}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label>Dokumentendatum</label>
                            <DateInput value={docUploadDate} onChange={e => setDocUploadDate(e.target.value)} />
                          </div>
                        )}

                        <div>
                          <label>Zusatz / Notiz (Optional)</label>
                          <input
                            placeholder={docCategory === 'Lohnabrechnung' ? 'z.B. Korrektur / Bonus' : 'z.B. Nachtrag Nr. 2'}
                            value={customDocLabel}
                            onChange={e => setCustomDocLabel(e.target.value)}
                          />
                        </div>

                        <div>
                          <label>
                            {editingEmpId ? 'Datei(en) auswählen *' : 'Dateien beim Speichern hinzufügen'}
                          </label>
                          {editingEmpId ? (
                            <input
                              type="file"
                              multiple
                              accept=".pdf,image/*,.doc,.docx"
                              onChange={handleUploadEmpDocumentNow}
                              disabled={uploadingEmpDoc}
                            />
                          ) : (
                            <input
                              type="file"
                              multiple
                              accept=".pdf,image/*,.doc,.docx"
                              onChange={e => setPendingUploadFiles(Array.from(e.target.files || []))}
                            />
                          )}
                        </div>

                        {editingEmpId && (
                          <div>
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={uploadingEmpDoc}
                              onClick={() => handleSubmitStagedDocuments(editingEmpId)}
                              style={{ whiteSpace: 'nowrap', height: '38px' }}
                            >
                              <Upload size={14} />{' '}
                              {uploadingEmpDoc
                                ? 'Hochladen...'
                                : docCategory === 'Lohnabrechnung'
                                ? `Lohnabrechnung (${docPayslipMonth}/${docPayslipYear}) hochladen`
                                : `Dokument(e) hochladen${stagedUploadFiles.length > 0 ? ` (${stagedUploadFiles.length})` : ''}`}
                            </button>
                          </div>
                        )}
                      </div>

                      {editingEmpId && stagedUploadFiles.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '0.76rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={13} />
                          <span>
                            Bereit zum Hochladen: <strong>{stagedUploadFiles.map(f => f.name).join(', ')}</strong>
                          </span>
                          <button type="button" className="btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '0.7rem', color: '#dc2626' }} onClick={() => setStagedUploadFiles([])}>
                            <X size={11} /> Auswahl löschen
                          </button>
                        </div>
                      )}
                      {!editingEmpId && pendingUploadFiles.length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                          <FileText size={13} />
                          <span><strong>{pendingUploadFiles.length} Datei(en)</strong> ausgewählt</span>
                          <button type="button" className="btn-secondary btn-sm" style={{ padding: '1px 5px', fontSize: '0.7rem', color: '#dc2626' }} onClick={() => setPendingUploadFiles([])}>
                            <X size={11} /> Abbrechen
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ── Divider: Archive ─────────────────────────────────────── */}
                    {editingEmpId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Dokumente-Archiv ({(newEmp.documents || []).length})
                        </span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                      </div>
                    )}

                    {/* ── Documents Archive with Multi-Select, Sort & Filter ────── */}
                    {editingEmpId && (
                      <div>
                        {(newEmp.documents || []).length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Noch keine Dokumente in dieser Personalakte hinterlegt.
                          </div>
                        ) : (() => {
                          const allEmpDocs = (newEmp.documents || []).map(doc => ({
                            ...doc,
                            effectiveKind: doc.category || doc.reference_type || 'Sonstiges',
                            effectiveDate: doc.doc_date || (doc.created_at ? String(doc.created_at).slice(0, 10) : ''),
                          }));
                          const uniqueKinds = Array.from(new Set(allEmpDocs.map(d => d.effectiveKind)));
                          const filteredEmpDocs = allEmpDocs
                            .filter(d => docFilterKind === 'ALL' || d.effectiveKind === docFilterKind)
                            .filter(d => {
                              if (!docFilterSearch.trim()) return true;
                              const qStr = docFilterSearch.toLowerCase();
                              return (
                                (d.title || '').toLowerCase().includes(qStr) ||
                                (d.file_name || '').toLowerCase().includes(qStr) ||
                                (d.effectiveKind || '').toLowerCase().includes(qStr) ||
                                (d.effectiveDate || '').toLowerCase().includes(qStr)
                              );
                            })
                            .sort((a, b) => {
                              if (docSortBy === 'date_asc') return (a.effectiveDate || '').localeCompare(b.effectiveDate || '');
                              if (docSortBy === 'kind_asc') return (a.effectiveKind || '').localeCompare(b.effectiveKind || '');
                              if (docSortBy === 'title_asc') return (a.title || '').localeCompare(b.title || '');
                              return (b.effectiveDate || '').localeCompare(a.effectiveDate || '');
                            });
                          const allVisibleSelected = filteredEmpDocs.length > 0 && filteredEmpDocs.every(d => selectedDocIds.includes(d.id));

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {/* Filter, Sort & Bulk Action Toolbar */}
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid var(--border)' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={(ev) => {
                                      if (ev.target.checked) {
                                        setSelectedDocIds(Array.from(new Set([...selectedDocIds, ...filteredEmpDocs.map(d => d.id)])));
                                      } else {
                                        const visibleSet = new Set(filteredEmpDocs.map(d => d.id));
                                        setSelectedDocIds(selectedDocIds.filter(id => !visibleSet.has(id)));
                                      }
                                    }}
                                  />
                                  Alle auswählen ({selectedDocIds.length})
                                </label>
                                <input
                                  placeholder="Dokument suchen..."
                                  value={docFilterSearch}
                                  onChange={e => setDocFilterSearch(e.target.value)}
                                  style={{ width: '180px', fontSize: '0.8rem', padding: '5px 9px' }}
                                />
                                <select value={docFilterKind} onChange={e => setDocFilterKind(e.target.value)} style={{ width: 'auto', fontSize: '0.8rem', padding: '5px 9px' }}>
                                  <option value="ALL">Alle Dokumentenarten ({allEmpDocs.length})</option>
                                  {uniqueKinds.map(k => (
                                    <option key={k} value={k}>{k}</option>
                                  ))}
                                </select>
                                <select value={docSortBy} onChange={e => setDocSortBy(e.target.value)} style={{ width: 'auto', fontSize: '0.8rem', padding: '5px 9px' }}>
                                  <option value="date_desc">Sortieren: Datum (Neueste zuerst)</option>
                                  <option value="date_asc">Sortieren: Datum (Älteste zuerst)</option>
                                  <option value="kind_asc">Sortieren: Dokumentenart (A–Z)</option>
                                  <option value="title_asc">Sortieren: Bezeichnung (A–Z)</option>
                                </select>
                                {selectedDocIds.length > 0 && (
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                                    <select
                                      value={bulkTargetKind}
                                      onChange={e => {
                                        setBulkTargetKind(e.target.value);
                                        if (e.target.value) handleBulkChangeDocCategory(e.target.value);
                                      }}
                                      style={{ width: 'auto', fontSize: '0.78rem', padding: '4px 8px' }}
                                    >
                                      <option value="">Kategorie für {selectedDocIds.length} ändern...</option>
                                      <option value="Lohnabrechnung">💰 Lohnabrechnung</option>
                                      <option value="Arbeitsvertrag / Werkvertrag">📄 Arbeitsvertrag / Werkvertrag</option>
                                      <option value="Personalausweis / Reisepass">🪪 Personalausweis / Reisepass</option>
                                      <option value="Krankmeldung (AU)">🏥 Krankmeldung (AU)</option>
                                      <option value="Führerschein / Zertifikat">🚗 Führerschein / Zertifikat</option>
                                      <option value="Sonstiges">📎 Sonstiges</option>
                                    </select>
                                    <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={handleBulkDeleteDocs}>
                                      <Trash2 size={13} /> Ausgewählte löschen ({selectedDocIds.length})
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Document Cards */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {filteredEmpDocs.map(doc => {
                                  const fileUrl = doc.url || doc.download_url || doc.file_url;
                                  const isEditingThis = editingDocId === doc.id;
                                  const ext = (doc.file_name || '').split('.').pop()?.toUpperCase() || 'FILE';
                                  const isChecked = selectedDocIds.includes(doc.id);
                                  const isPayslipDoc = (doc.effectiveKind || '').toLowerCase().includes('lohnabrechnung') || doc.reference_type === 'Lohnabrechnung';
                                  return (
                                    <div key={doc.id} className="flex-between" style={{ padding: '10px 14px', borderRadius: '8px', background: isChecked ? '#fff7ed' : 'var(--surface)', border: isChecked ? '1.5px solid var(--accent)' : '1px solid var(--border)', fontSize: '0.8rem', gap: '12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0, flex: 1 }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(ev) => {
                                            if (ev.target.checked) setSelectedDocIds(prev => [...prev, doc.id]);
                                            else setSelectedDocIds(prev => prev.filter(id => id !== doc.id));
                                          }}
                                          style={{ marginTop: '6px' }}
                                        />
                                        <div style={{ marginTop: '2px', padding: '6px', borderRadius: '6px', background: isPayslipDoc ? '#ecfdf5' : 'rgba(255,107,0,0.1)', color: isPayslipDoc ? '#059669' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                          <FileText size={16} />
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          {isEditingThis ? (
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                                              <input value={editingDocTitle} onChange={e => setEditingDocTitle(e.target.value)} style={{ fontSize: '0.82rem', padding: '4px 8px', flex: 1, minWidth: '160px' }} placeholder="Dokumenten-Bezeichnung" autoFocus />
                                              <select value={editingDocCategory} onChange={e => setEditingDocCategory(e.target.value)} style={{ fontSize: '0.8rem', padding: '4px 8px', width: 'auto' }}>
                                                <option value="Lohnabrechnung">💰 Lohnabrechnung</option>
                                                <option value="Personalausweis / Reisepass">Personalausweis / Reisepass</option>
                                                <option value="Arbeitsvertrag / Werkvertrag">Arbeitsvertrag / Werkvertrag</option>
                                                <option value="Freelancer Projektvertrag">Freelancer Projektvertrag</option>
                                                <option value="Krankmeldung (AU)">Krankmeldung (AU)</option>
                                                <option value="Krankenkassenkarte / SV-Ausweis">Krankenkassenkarte / SV-Ausweis</option>
                                                <option value="Führerschein / Zertifikat">Führerschein / Zertifikat</option>
                                                <option value="Sonstiges">Sonstiges</option>
                                              </select>
                                              <DateInput value={editingDocDate} onChange={e => setEditingDocDate(e.target.value)} style={{ width: '135px' }} />
                                              <button type="button" className="btn-primary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleSaveDocTitle(doc.id)}><Check size={13} /> Speichern</button>
                                              <button type="button" className="btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => setEditingDocId(null)}><X size={13} /></button>
                                            </div>
                                          ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                              <strong style={{ wordBreak: 'break-word', fontSize: '0.86rem' }}>{doc.title}</strong>
                                              <span className="badge" style={{ fontSize: '0.68rem', padding: '2px 7px', background: isPayslipDoc ? '#d1fae5' : 'rgba(255,107,0,0.12)', color: isPayslipDoc ? '#065f46' : 'var(--accent)', fontWeight: 700 }}>
                                                {doc.effectiveKind}
                                              </span>
                                              {isPayslipDoc && (
                                                <span className="badge" style={{ fontSize: '0.66rem', padding: '2px 6px', background: '#ecfdf5', color: '#047857' }}>
                                                  ✓ Im Lohnabrechnung-Tab sichtbar
                                                </span>
                                              )}
                                              <span className="badge" style={{ fontSize: '0.66rem', padding: '2px 6px', background: doc.uploaded_by === 'Mitarbeiter' ? '#dbeafe' : '#f1f5f9', color: doc.uploaded_by === 'Mitarbeiter' ? '#1d4ed8' : '#475569' }}>
                                                {doc.uploaded_by === 'Mitarbeiter' ? '👤 Vom Mitarbeiter' : '🏢 Vom Management'}
                                              </span>
                                              <span className="badge" style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#e2e8f0', color: '#475569' }}>{ext}</span>
                                            </div>
                                          )}
                                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                            {doc.effectiveDate && <span>Datum: <strong style={{ color: 'var(--text)' }}>{formatDate(doc.effectiveDate)}</strong></span>}
                                            {doc.file_name && <span>Datei: <strong style={{ color: 'var(--text)' }}>{doc.file_name}</strong></span>}
                                            {doc.file_size ? <span>Größe: <strong style={{ color: 'var(--text)' }}>{(doc.file_size / 1024).toFixed(1)} KB</strong></span> : null}
                                          </div>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                        {fileUrl && (
                                          <a href={resolveMediaUrl(fileUrl)} target="_blank" rel="noreferrer" download={doc.file_name || true} className="btn-secondary btn-sm" style={{ textDecoration: 'none', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px' }}>
                                            <Download size={13} /> Download
                                          </a>
                                        )}
                                        {!isEditingThis && (
                                          <button
                                            type="button"
                                            className="btn-secondary btn-sm"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
                                            onClick={() => {
                                              setEditingDocId(doc.id);
                                              setEditingDocTitle(doc.title || doc.file_name || '');
                                              setEditingDocCategory(doc.effectiveKind || 'Sonstiges');
                                              setEditingDocDate(doc.effectiveDate || new Date().toISOString().slice(0, 10));
                                            }}
                                          >
                                            <Edit3 size={13} /> Sortieren / Bearbeiten
                                          </button>
                                        )}
                                        <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }} onClick={() => handleDeleteEmpDocument(doc.id)}>
                                          <Trash2 size={13} /> Löschen
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION 7: ACCOUNT SECURITY & ONE-TIME PASSWORD (OTP) */}
                {empCardTab === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,107,0,0.06)', border: '1.5px solid rgba(255,107,0,0.22)' }}>
                      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                        <div>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem' }}>
                            <KeyRound size={16} style={{ color: 'var(--accent)' }} />
                            Einmalpasswort (OTP) & Account-Sicherheit
                          </strong>
                          <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {editingEmpId
                              ? 'Neues OTP generieren: Mitarbeiter muss beim nächsten Login ein persönliches Passwort setzen.'
                              : 'Einmalpasswort für den ersten Login. Der Mitarbeiter muss es beim ersten Login ändern.'}
                          </p>
                        </div>
                        {editingEmpId ? (
                          <button type="button" className="btn-primary btn-sm" onClick={handleResetEmployeeOtp}>
                            <KeyRound size={13} /> Passwort zurücksetzen / Neues OTP
                          </button>
                        ) : (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setNewEmp({ ...newEmp, one_time_password: generateRandomOtp() })}>
                            Neues OTP generieren
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <label style={{ fontSize: '0.72rem' }}>
                            {editingEmpId ? 'Zuletzt ausgestelltes Einmalpasswort (OTP)' : 'Initiales Einmalpasswort (OTP)'}
                          </label>
                          <input
                            value={newEmp.one_time_password || ''}
                            onChange={e => setNewEmp({ ...newEmp, one_time_password: e.target.value })}
                            placeholder="BRN-XXXXXX!"
                            style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.08em' }}
                          />
                        </div>
                        {editingEmpId && (
                          <span className="badge" style={{ marginTop: '18px', background: newEmp.must_change_password ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.16)', color: newEmp.must_change_password ? '#ca8a04' : '#16a34a' }}>
                            {newEmp.must_change_password ? '⏳ Warte auf ersten Login' : '✅ Eigenes Passwort gesetzt'}
                          </span>
                        )}
                      </div>

                      {otpBanner && (
                        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', fontSize: '0.84rem' }}>
                          Neues OTP generiert: <strong style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{otpBanner}</strong>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                        <ShieldCheck size={15} /> Portal-Zugangsdaten
                      </strong>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem' }}>Login E-Mail</label>
                          <div style={{ fontWeight: 700, padding: '8px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)' }}>{newEmp.email || '—'}</div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem' }}>Account-Status</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={newEmp.is_active} onChange={e => setNewEmp({ ...newEmp, is_active: e.target.checked })} />
                              <span style={{ fontWeight: 600, color: newEmp.is_active ? '#16a34a' : '#dc2626' }}>
                                {newEmp.is_active ? '✅ Account aktiv — Portal-Zugang erlaubt' : '🔒 Account gesperrt'}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}              </div>

              {/* Fixed Static Footer */}
              <div className="flex-between" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {editingEmpId && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                      onClick={() => handleDeleteEmployee(editingEmpId, `${newEmp.first_name} ${newEmp.last_name}`)}
                    >
                      <Trash2 size={13} /> Personalakte löschen
                    </button>
                  )}
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Active Mode: <strong>{newEmp.employment_type}</strong> • Position: <strong>{newEmp.role}</strong> • Abteilung: <strong>{newEmp.department}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAddEmp(false)}>
                    <ArrowLeft size={14} /> Zurück zur Übersicht
                  </button>
                  <button type="submit" className="btn-primary">
                    <Check size={15} /> {editingEmpId ? 'Save Employee Master Card' : 'Create Account & Save Personalakte'}
                  </button>
                </div>
              </div>
            </form>
        </div>
      )}

      {/* Tab Content */}
      {tab === 'employees' && (() => {
        const monthHours = {};
        timeLogs.forEach((l) => {
          if (!l.employee_id || !String(l.date || '').startsWith(biMonth)) return;
          monthHours[l.employee_id] = (monthHours[l.employee_id] || 0) + Number(l.net_hours || 0);
        });
        const sortVal = (e) => {
          const a = e.attributes || {};
          switch (empSortBy) {
            case 'number': return String(e.employee_number || '');
            case 'role': return `${e.role || ''} ${e.department || ''}`.toLowerCase();
            case 'type': return String(e.employment_type || '');
            case 'hours': return monthHours[e.id] || 0;
            case 'pay': return Number(e.base_salary || a.tagessatz || e.hourly_rate || 0);
            case 'docs': return (e.documents || []).length;
            case 'status': return e.is_active === false ? 1 : 0;
            default: return String(e.full_name || '').toLowerCase();
          }
        };
        const sortedEmps = [...filteredEmps].sort((x, y) => {
          const a = sortVal(x), b = sortVal(y);
          const c = typeof a === 'number' ? a - b : String(a).localeCompare(String(b), 'de', { numeric: true });
          return empSortDir === 'asc' ? c : -c;
        });
        const th = (key, label, align = 'left') => (
          <th
            onClick={() => { if (empSortBy === key) setEmpSortDir(empSortDir === 'asc' ? 'desc' : 'asc'); else { setEmpSortBy(key); setEmpSortDir('asc'); } }}
            style={{ padding: '9px 10px', textAlign: align, cursor: 'pointer', userSelect: 'none' }}
          >
            {label} {empSortBy === key ? (empSortDir === 'asc' ? '↑' : '↓') : '↕'}
          </th>
        );
        const sel = { width: 'auto', padding: '6px 9px', fontSize: 12, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 7, color: '#0f172a' };
        return (
          <div className="glass-panel" style={{ padding: 0, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input placeholder="Suchen (Name, Position, Nr., Steuer-ID)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...sel, minWidth: 230, flex: '1 1 230px', maxWidth: 320 }} />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={sel}>
                <option value="All">Typ: Alle ({employees.length})</option>
                {['Full-time', 'Part-time', 'Minijob', 'Freelancer', 'Subunternehmer', 'Candidate'].map((t) => (
                  <option key={t} value={t}>{t} ({employees.filter((e) => e.employment_type === t || (t === 'Candidate' && e.attributes?.is_candidate)).length})</option>
                ))}
              </select>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={sel}>
                <option value="All">RBAC: Alle</option>
                <option value="2">Tier 2 · Projektleiter</option>
                <option value="3">Tier 3 · HR & Finance</option>
                <option value="4">Tier 4 · Team Lead</option>
                <option value="5">Tier 5 · Field / Extern</option>
              </select>
              <select value={empSortBy} onChange={(e) => setEmpSortBy(e.target.value)} style={{ ...sel, fontWeight: 700, background: '#fff7ed', border: '1px solid #FF6B00' }}>
                <option value="name">Sort: Name</option>
                <option value="number">Sort: Personal-Nr.</option>
                <option value="role">Sort: Position / Abteilung</option>
                <option value="type">Sort: Typ</option>
                <option value="hours">Sort: Stunden (Monat)</option>
                <option value="pay">Sort: Gehalt / Satz</option>
                <option value="docs">Sort: Dokumente</option>
                <option value="status">Sort: Status</option>
              </select>
              <button type="button" onClick={() => setEmpSortDir(empSortDir === 'asc' ? 'desc' : 'asc')} style={{ ...sel, fontWeight: 700, cursor: 'pointer' }}>
                {empSortDir === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend'}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setQ(''); setTypeFilter('All'); setRoleFilter('All'); setEmpSortBy('name'); setEmpSortDir('asc'); }}>Reset</button>
              <button type="button" className="btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv({
                rows: sortedEmps,
                columns: [
                  { key: 'employee_number', label: 'Personal-Nr.' },
                  { key: 'full_name', label: 'Name' },
                  { key: 'email', label: 'E-Mail' },
                  { key: 'phone', label: 'Telefon' },
                  { key: 'employment_type', label: 'Typ' },
                  { key: 'role', label: 'Position' },
                  { key: 'department', label: 'Abteilung' },
                  { key: 'base_salary', label: 'Grundgehalt' },
                  { key: 'hourly_rate', label: 'Stundenlohn' },
                  { label: 'Tagessatz', fn: (r) => r.attributes?.tagessatz ?? '' },
                  { label: 'Steuer-ID', fn: (r) => r.attributes?.steuer_id || '' },
                  { label: 'IBAN', fn: (r) => r.attributes?.iban || '' },
                  { label: `Stunden ${biMonth}`, fn: (r) => (monthHours[r.id] || 0).toFixed(1) },
                ],
              }, `bruenel_mitarbeiter_${new Date().toISOString().slice(0, 10)}.csv`)}>
                <Download size={13} /> CSV
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textTransform: 'uppercase', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0' }}>
                    {th('number', 'Nr.')}
                    {th('status', 'Status')}
                    {th('name', 'Name & Kontakt')}
                    {th('role', 'Position & Abteilung')}
                    {th('type', 'Typ & Vertrag')}
                    <th style={{ padding: '9px 10px', textAlign: 'left' }}>Projekt</th>
                    {th('hours', 'Stunden (Monat)')}
                    {th('pay', 'Gehalt / Satz')}
                    {th('docs', 'Akte')}
                    <th style={{ padding: '9px 10px', textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {sortedEmps.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Keine Mitarbeiter gefunden.</td></tr>
                  )}
                  {sortedEmps.map((e) => {
                    const attr = e.attributes || {};
                    const isSub = ['Freelancer', 'Subunternehmer'].includes(e.employment_type);
                    const hrs = monthHours[e.id] || 0;
                    const quota = Number(attr.monthly_contract_hours || 160);
                    const pct = Math.min(100, Math.round((hrs / quota) * 100));
                    const over = hrs > quota;
                    return (
                      <tr key={e.id} onClick={() => openEditEmployeeModal(e)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', opacity: e.is_active === false ? 0.65 : 1 }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{e.employee_number || '—'}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: e.is_active === false ? '#fef2f2' : '#dcfce7', color: e.is_active === false ? '#dc2626' : '#15803d' }}>
                            {e.is_active === false ? 'Gesperrt' : 'Aktiv'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{e.full_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{e.email || '—'} · {e.phone || '—'}</div>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ fontWeight: 600 }}>{e.role}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{e.department}</div>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: isSub ? '#fff7ed' : '#f0fdf4', color: isSub ? '#c2410c' : '#15803d' }}>{e.employment_type}</span>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{attr.contract_model || '—'}</div>
                        </td>
                        <td style={{ padding: '9px 10px' }} onClick={(ev) => ev.stopPropagation()}>
                          <select value={e.assigned_project_id || attr.assigned_project_id || ''} onChange={(ev) => handleQuickProjectChange(e.id, ev.target.value)} style={{ ...sel, minWidth: 150, fontSize: 11.5 }}>
                            <option value="">— Kein Projekt —</option>
                            {projects.map((p) => (<option key={p.id} value={p.id}>{p.code} · {p.name}</option>))}
                          </select>
                        </td>
                        <td style={{ padding: '9px 10px', minWidth: 130 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: over ? '#dc2626' : '#0f172a' }}>{hrs.toFixed(1)} h / {quota} h</div>
                          <div style={{ height: 5, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', marginTop: 3 }}>
                            <div style={{ width: `${Math.max(3, pct)}%`, height: '100%', background: over ? '#dc2626' : '#FF6B00' }} />
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 700 }}>
                          {isSub ? `${formatEuro(attr.tagessatz || 640)}/Tag` : e.base_salary > 0 ? `${formatEuro(e.base_salary)}/Mo` : `${formatEuro(e.hourly_rate)}/h`}
                        </td>
                        <td style={{ padding: '9px 10px' }} onClick={(ev) => ev.stopPropagation()}>
                          <button type="button" className="btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => { openEditEmployeeModal(e); setEmpCardTab('docs'); }}>
                            <Upload size={11} /> {(e.documents || []).length}
                          </button>
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                          <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626', padding: '4px 7px' }} onClick={() => handleDeleteEmployee(e.id, e.full_name)}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
                            {emp.full_name}
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
                      <option key={emp.id} value={emp.id}>{emp.full_name}</option>
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
                    <option value="">— Allgemein / Kein Projekt —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Date</label>
                  <DateInput  required value={manualTimeForm.date} onChange={e => setManualTimeForm({ ...manualTimeForm, date: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Start</label>
                  <TimeInput  required value={manualTimeForm.check_in_time} onChange={e => setManualTimeForm({ ...manualTimeForm, check_in_time: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Finish</label>
                  <TimeInput  required value={manualTimeForm.check_out_time} onChange={e => setManualTimeForm({ ...manualTimeForm, check_out_time: e.target.value })} />
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
                                {eb.employee_name}
                              </td>
                              <td style={{ padding: '8px', fontSize: '0.76rem' }}>
                                {eb.employment_type} ({eb.weekly_hours_limit || 40}h/Woche)
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Soll bis heute: {eb.soll_hours ?? 0} h</div>
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
                                    +{eb.overtime_hours}h Mehrstunden ({formatEuro(eb.overtime_cost)})
                                  </span>
                                ) : (
                                  <span style={{ color: (eb.difference_hours || 0) < 0 ? '#64748b' : undefined }}>
                                    0 h{(eb.difference_hours || 0) < 0 ? ` (${eb.difference_hours} h zum Soll)` : ''}
                                  </span>
                                )}
                                {eb.weekly_exceeded && (
                                  <div style={{ marginTop: 2 }}>
                                    <span className="badge danger" style={{ fontSize: '0.66rem' }}>
                                      Woche über Vertrag ({eb.max_weekly_hours}h / {eb.weekly_hours_limit}h)
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

                {/* Yearly month-by-month Mehrstunden (Überstunden) per employee based on weekly contract hours */}
                {otReport && (otReport.employees || []).length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: 4 }}>
                      Mehrstunden pro Monat {otReport.year} (laut Wochenstunden im Vertrag)
                    </h4>
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                      Soll = Wochenstunden ÷ 5 × Werktage. Ist = gearbeitete Stunden + Urlaub (8 h/Tag) + Krankheit (8 h/Tag). Mehrstunden = Ist − Soll (nur positiv).
                    </p>
                    {otReport.employees
                      .filter(r => !biEmpFilter || r.employee_id === biEmpFilter)
                      .map(r => (
                        <div key={r.employee_id} style={{ marginBottom: 18, overflowX: 'auto' }}>
                          <div className="flex-between" style={{ marginBottom: 6 }}>
                            <strong>{r.employee_name} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.76rem' }}>({r.employment_type}{r.overtime_exempt ? ' – ohne Überstundenberechnung' : ` – ${r.weekly_hours} h/Woche`})</span></strong>
                            {!r.overtime_exempt && (
                              <span style={{ fontWeight: 800, color: r.total_overtime_hours > 0 ? '#ea580c' : 'var(--text-muted)' }}>
                                Mehrstunden {otReport.year}: +{r.total_overtime_hours} h • Saldo: {r.balance_hours > 0 ? '+' : ''}{r.balance_hours} h
                              </span>
                            )}
                          </div>
                          {!r.overtime_exempt && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', textAlign: 'right' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                  <th style={{ padding: '5px 6px', textAlign: 'left' }}>Monat</th>
                                  <th style={{ padding: '5px 6px' }}>Soll</th>
                                  <th style={{ padding: '5px 6px' }}>Gearbeitet</th>
                                  <th style={{ padding: '5px 6px' }}>Urlaub</th>
                                  <th style={{ padding: '5px 6px' }}>Krank</th>
                                  <th style={{ padding: '5px 6px' }}>Ist gesamt</th>
                                  <th style={{ padding: '5px 6px' }}>Differenz</th>
                                  <th style={{ padding: '5px 6px' }}>Mehrstunden</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.months.map(mo => (
                                  <tr key={mo.month} style={{ borderBottom: '1px solid var(--border)', background: mo.overtime_hours > 0 ? 'rgba(255,237,213,0.5)' : undefined }}>
                                    <td style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 600 }}>{MONTH_OPTIONS[mo.month - 1]?.label.replace(/^\d+\s*·\s*/, '')}</td>
                                    <td style={{ padding: '5px 6px' }}>{mo.soll_hours} h</td>
                                    <td style={{ padding: '5px 6px' }}>{mo.worked_hours} h</td>
                                    <td style={{ padding: '5px 6px', color: mo.urlaub_hours > 0 ? '#ca8a04' : undefined }}>{mo.urlaub_hours} h</td>
                                    <td style={{ padding: '5px 6px', color: mo.krankheit_hours > 0 ? '#dc2626' : undefined }}>{mo.krankheit_hours} h</td>
                                    <td style={{ padding: '5px 6px', fontWeight: 700 }}>{mo.ist_hours} h</td>
                                    <td style={{ padding: '5px 6px', color: mo.difference_hours < 0 ? '#64748b' : '#16a34a' }}>{mo.difference_hours > 0 ? '+' : ''}{mo.difference_hours} h</td>
                                    <td style={{ padding: '5px 6px', fontWeight: 800, color: mo.overtime_hours > 0 ? '#ea580c' : 'var(--text-muted)' }}>{mo.overtime_hours > 0 ? `+${mo.overtime_hours} h` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ))}
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
              <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv({
                rows: timeLogs,
                columns: [
                  { key: 'id', label: 'Log-ID' },
                  { key: 'employee_name', label: 'Mitarbeiter Name' },
                  { key: 'employee_id', label: 'Mitarbeiter-ID' },
                  { key: 'date', label: 'Datum' },
                  { key: 'project_name', label: 'Projekt' },
                  { key: 'project_id', label: 'Projekt-ID' },
                  { label: 'Check-In (Uhrzeit)', fn: l => l.check_in_time ? new Date(l.check_in_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '' },
                  { label: 'Check-Out (Uhrzeit)', fn: l => l.check_out_time ? new Date(l.check_out_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Aktiv' },
                  { key: 'break_minutes', label: 'Pause (Min)' },
                  { label: 'Nettostunden', fn: l => {
                    if (!l.check_in_time || !l.check_out_time) return '';
                    const diff = (new Date(l.check_out_time) - new Date(l.check_in_time)) / 3600000 - (l.break_minutes || 0) / 60;
                    return diff > 0 ? diff.toFixed(2) : '0';
                  }},
                  { key: 'status', label: 'Status' },
                  { key: 'notes', label: 'Notizen' },
                  { key: 'created_at', label: 'Erstellt am' },
                ],
              }, `bruenel_arbeitszeiten_${new Date().toISOString().slice(0,10)}.csv`)}>
              📥 Arbeitszeiten CSV exportieren
            </button>
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
                            <DateInput
                              
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
                              <option value="">— Allgemein / Kein Projekt —</option>
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
                              <TimeInput  value={editLogForm.check_in_time} onChange={e => setEditLogForm({ ...editLogForm, check_in_time: e.target.value })} style={{ width: '105px', padding: '4px 6px' }} />
                              <span>→</span>
                              <TimeInput  value={editLogForm.check_out_time} onChange={e => setEditLogForm({ ...editLogForm, check_out_time: e.target.value })} style={{ width: '105px', padding: '4px 6px' }} />
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
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-primary" onClick={() => setShowAddLeave(!showAddLeave)}>
                <Plus size={15} /> {showAddLeave ? 'Schließen' : 'Urlaub eintragen'}
              </button>
              <button className="btn-secondary" onClick={() => downloadCsv(filteredLeaves, 'leave-requests.csv')}>Export CSV</button>
            </div>
          </div>

          {showAddLeave && (
            <form
              onSubmit={handleCreateLeave}
              style={{
                marginBottom: '16px',
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1.4fr 0.9fr auto',
                gap: '8px',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Mitarbeiter</label>
                <select value={newLeaveForm.employee_id} onChange={e => setNewLeaveForm({ ...newLeaveForm, employee_id: e.target.value })}>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Art</label>
                <select value={newLeaveForm.type} onChange={e => setNewLeaveForm({ ...newLeaveForm, type: e.target.value })}>
                  <option value="Annual Leave">Erholungsurlaub (Annual Leave)</option>
                  <option value="Special Leave">Sonderurlaub</option>
                  <option value="Unpaid Leave">Unbezahlter Urlaub</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Von</label>
                <DateInput required value={newLeaveForm.start_date} onChange={e => setNewLeaveForm({ ...newLeaveForm, start_date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Bis</label>
                <DateInput required value={newLeaveForm.end_date} onChange={e => setNewLeaveForm({ ...newLeaveForm, end_date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Grund / Notiz</label>
                <input placeholder="Optional..." value={newLeaveForm.reason} onChange={e => setNewLeaveForm({ ...newLeaveForm, reason: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Status</label>
                <select value={newLeaveForm.status} onChange={e => setNewLeaveForm({ ...newLeaveForm, status: e.target.value })}>
                  <option value="Approved">Approved (Genehmigt)</option>
                  <option value="Pending">Pending (Offen)</option>
                </select>
              </div>
              <button type="submit" className="btn-primary">Speichern</button>
            </form>
          )}

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
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleDeleteLeave(lv.id)} title="Urlaubsantrag löschen">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sickness' && (
        <div className="glass-panel">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Krankmeldungen & Arbeitsunfähigkeitsbescheinigungen (AU) • Werden automatisch mit +8.0h/Tag in der HR-Monatsübersicht gutgeschrieben
            </p>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-primary" onClick={() => setShowAddSick(!showAddSick)}>
                <Plus size={15} /> {showAddSick ? 'Schließen' : 'Krankmeldung erfassen'}
              </button>
            </div>
          </div>

          {showAddSick && (
            <form
              onSubmit={handleCreateSickness}
              style={{
                marginBottom: '16px',
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: '1.2fr 0.9fr 0.9fr 1.2fr 1.2fr auto',
                gap: '8px',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Mitarbeiter</label>
                <select value={newSickForm.employee_id} onChange={e => setNewSickForm({ ...newSickForm, employee_id: e.target.value })}>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Von</label>
                <DateInput required value={newSickForm.start_date} onChange={e => setNewSickForm({ ...newSickForm, start_date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Bis</label>
                <DateInput required value={newSickForm.end_date} onChange={e => setNewSickForm({ ...newSickForm, end_date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Notiz / Arztbesuch</label>
                <input placeholder="Arzt attestiert / Notiz..." value={newSickForm.symptoms_note} onChange={e => setNewSickForm({ ...newSickForm, symptoms_note: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>AU-Bescheinigung (Optional)</label>
                <input type="file" accept=".pdf,image/*" onChange={e => setSickAuFile(e.target.files?.[0] || null)} />
              </div>
              <button type="submit" className="btn-primary">Speichern</button>
            </form>
          )}

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
                  <td style={{ padding: '10px 8px', display: 'flex', gap: '6px' }}>
                    {s.status !== 'Acknowledged' && (
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleSicknessAck(s.id, 'Acknowledged')}>
                        Acknowledge
                      </button>
                    )}
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleDeleteSickness(s.id)} title="Krankmeldung löschen">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(tab === 'documents' || tab === 'payslips') && (() => {
        const allEmployeeDocs = employees.flatMap(emp =>
          (emp.documents || []).map(doc => ({
            ...doc,
            employee_id: emp.id,
            employee_name: emp.full_name,
            effectiveKind: doc.category || doc.reference_type || 'Sonstiges',
            effectiveDate: doc.doc_date || (doc.created_at ? String(doc.created_at).slice(0, 10) : ''),
          }))
        );
        const uniqueKinds = Array.from(new Set([
          'Lohnabrechnung',
          'Arbeitsvertrag / Werkvertrag',
          'Personalausweis / Reisepass',
          'Krankmeldung (AU)',
          'Führerschein / Zertifikat',
          'Sonstiges',
          ...allEmployeeDocs.map(d => d.effectiveKind),
        ]));
        const filteredAllDocs = allEmployeeDocs
          .filter(d => docFilterEmpId === 'ALL' || String(d.employee_id) === String(docFilterEmpId))
          .filter(d => docFilterKind === 'ALL' || d.effectiveKind === docFilterKind)
          .filter(d => {
            if (!docFilterSearch.trim()) return true;
            const qStr = docFilterSearch.toLowerCase();
            return (
              (d.title || '').toLowerCase().includes(qStr) ||
              (d.file_name || '').toLowerCase().includes(qStr) ||
              (d.employee_name || '').toLowerCase().includes(qStr) ||
              (d.effectiveKind || '').toLowerCase().includes(qStr) ||
              (d.effectiveDate || '').toLowerCase().includes(qStr)
            );
          })
          .sort((a, b) => {
            if (docSortBy === 'date_asc') return (a.effectiveDate || '').localeCompare(b.effectiveDate || '');
            if (docSortBy === 'kind_asc') return (a.effectiveKind || '').localeCompare(b.effectiveKind || '');
            if (docSortBy === 'title_asc') return (a.title || '').localeCompare(b.title || '');
            return (b.effectiveDate || '').localeCompare(a.effectiveDate || '');
          });
        const allVisibleSelected = filteredAllDocs.length > 0 && filteredAllDocs.every(d => selectedDocIds.includes(d.id));

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Multi-Document & Payslip Upload Card */}
            <div className="glass-panel" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '1.02rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Upload size={17} style={{ color: 'var(--accent)' }} />
                    Mehrfach-Dokumenten-Upload & Monatliche Lohnabrechnungen
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Wählen Sie <strong>„💰 Monatliche Lohnabrechnung“</strong> und den gewünschten Monat/Jahr aus, um einem Mitarbeiter seine Abrechnung bereitzustellen — sie erscheint sofort im Mitarbeiter-Portal unter <strong>„Lohnabrechnung“</strong> zum Ansehen & PDF-Download.
                  </p>
                </div>

                {/* Quick Mode Switcher: Lohnabrechnung vs. Personaldokument */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setDocCategory('Lohnabrechnung')}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: docCategory === 'Lohnabrechnung' ? '1.5px solid #059669' : '1px solid var(--border)',
                      background: docCategory === 'Lohnabrechnung' ? '#ecfdf5' : '#ffffff',
                      color: docCategory === 'Lohnabrechnung' ? '#047857' : 'var(--text-main)',
                    }}
                  >
                    💰 Monatliche Lohnabrechnung hochladen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (docCategory === 'Lohnabrechnung') setDocCategory('Arbeitsvertrag / Werkvertrag');
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: docCategory !== 'Lohnabrechnung' ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                      background: docCategory !== 'Lohnabrechnung' ? 'var(--accent-soft)' : '#ffffff',
                      color: docCategory !== 'Lohnabrechnung' ? 'var(--accent)' : 'var(--text-main)',
                    }}
                  >
                    📂 Allgemeines Dokument hochladen
                  </button>
                </div>
              </div>

              {docUploadFeedback && (
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    background: docUploadFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${docUploadFeedback.type === 'success' ? '#10b981' : '#fca5a5'}`,
                    color: docUploadFeedback.type === 'success' ? '#065f46' : '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <span>{docUploadFeedback.text}</span>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setDocUploadFeedback(null)}>
                    <X size={13} />
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.15fr 1.05fr 0.9fr 1.1fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label>Mitarbeiter auswählen *</label>
                  <select
                    value={centralUploadEmpId}
                    onChange={e => setCentralUploadEmpId(e.target.value)}
                  >
                    <option value="">— Mitarbeiter wählen —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.department || emp.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Dokumentenart (Kategorie) *</label>
                  <select value={docCategory} onChange={e => setDocCategory(e.target.value)}>
                    <option value="Lohnabrechnung">💰 Lohnabrechnung / Entgeltnachweis (→ Lohnabrechnung-Tab)</option>
                    <option value="Arbeitsvertrag / Werkvertrag">📄 Arbeitsvertrag / Werkvertrag</option>
                    <option value="Personalausweis / Reisepass">🪪 Personalausweis / Reisepass / Aufenthaltstitel</option>
                    <option value="Freelancer Projektvertrag">📑 Freelancer Projektvertrag</option>
                    <option value="Krankmeldung (AU)">🏥 Krankmeldung (AU)</option>
                    <option value="Krankenkassenkarte / SV-Ausweis">🏥 Krankenkassenkarte / SV-Ausweis</option>
                    <option value="Freistellungsbescheinigung §48b EStG">📋 Freistellungsbescheinigung §48b EStG</option>
                    <option value="Gewerbeanmeldung / BG BAU">🏗️ Gewerbeanmeldung / BG BAU Nachweis</option>
                    <option value="Führerschein / Zertifikat">🚗 Führerschein / Schulungszertifikat</option>
                    <option value="Lebenslauf / CV">📝 Lebenslauf / CV</option>
                    <option value="Sonstiges">📎 Sonstiges</option>
                  </select>
                </div>

                {docCategory === 'Lohnabrechnung' ? (
                  <div>
                    <label>Abrechnungsmonat & Jahr *</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select
                        value={docPayslipMonth}
                        onChange={e => setDocPayslipMonth(e.target.value)}
                        style={{ fontWeight: 700, borderColor: '#10b981', background: '#f0fdf4' }}
                      >
                        {MONTH_OPTIONS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                      <select
                        value={docPayslipYear}
                        onChange={e => setDocPayslipYear(e.target.value)}
                        style={{ width: '92px', fontWeight: 700, borderColor: '#10b981', background: '#f0fdf4' }}
                      >
                        {YEAR_OPTIONS.map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label>Dokumentendatum</label>
                    <DateInput value={docUploadDate} onChange={e => setDocUploadDate(e.target.value)} />
                  </div>
                )}

                <div>
                  <label>Bezeichnung / Notiz (Optional)</label>
                  <input
                    placeholder={docCategory === 'Lohnabrechnung' ? 'z.B. inkl. Prämie' : 'z.B. Nachtrag / Zertifikat'}
                    value={customDocLabel}
                    onChange={e => setCustomDocLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label>
                    Dateien auswählen (PDF / Bild) *
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/*,.doc,.docx"
                    disabled={uploadingEmpDoc}
                    onChange={(e) => handleUploadEmpDocumentNow(e, centralUploadEmpId)}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={uploadingEmpDoc}
                    onClick={() => handleSubmitStagedDocuments(centralUploadEmpId)}
                    style={{ whiteSpace: 'nowrap', height: '38px', fontWeight: 700, padding: '0 16px' }}
                  >
                    <Upload size={15} />{' '}
                    {uploadingEmpDoc
                      ? 'Wird hochgeladen...'
                      : docCategory === 'Lohnabrechnung'
                      ? `Lohnabrechnung (${docPayslipMonth}/${docPayslipYear}) hochladen`
                      : `Dokument(e) hochladen${stagedUploadFiles.length > 0 ? ` (${stagedUploadFiles.length})` : ''}`}
                  </button>
                </div>
              </div>

              {stagedUploadFiles.length > 0 && (
                <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: '#fff7ed', border: '1px solid rgba(255,107,0,0.3)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9a3412' }}>
                    <FileText size={14} style={{ color: 'var(--accent)' }} />
                    <span>
                      Ausgewählte Datei(en) ({stagedUploadFiles.length}): <strong>{stagedUploadFiles.map(f => f.name).join(', ')}</strong> — Klicken Sie rechts auf <strong>„{docCategory === 'Lohnabrechnung' ? `Lohnabrechnung (${docPayslipMonth}/${docPayslipYear}) hochladen` : 'Dokument(e) hochladen'}“</strong>, um den Upload abzuschließen.
                    </span>
                  </div>
                  <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={() => setStagedUploadFiles([])}>
                    <X size={12} /> Auswahl aufheben
                  </button>
                </div>
              )}
            </div>

            {/* Documents Master Table with Filter, Sort & Multi-Select */}
            <div className="glass-panel">
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', margin: 0 }}
                    checked={allVisibleSelected}
                    onChange={(ev) => {
                      if (ev.target.checked) {
                        setSelectedDocIds(Array.from(new Set([...selectedDocIds, ...filteredAllDocs.map(d => d.id)])));
                      } else {
                        const visibleSet = new Set(filteredAllDocs.map(d => d.id));
                        setSelectedDocIds(selectedDocIds.filter(id => !visibleSet.has(id)));
                      }
                    }}
                  />
                  <span>Alle auswählen ({selectedDocIds.length})</span>
                </label>

                <input
                  placeholder="Suche nach Mitarbeiter, Titel, Datei, Datum..."
                  value={docFilterSearch}
                  onChange={e => setDocFilterSearch(e.target.value)}
                  style={{ width: '240px', fontSize: '0.82rem' }}
                />

                <select value={docFilterEmpId} onChange={e => setDocFilterEmpId(e.target.value)} style={{ width: 'auto', fontSize: '0.82rem' }}>
                  <option value="ALL">Alle Mitarbeiter ({employees.length})</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name} ({(emp.documents || []).length})</option>
                  ))}
                </select>

                <select value={docFilterKind} onChange={e => setDocFilterKind(e.target.value)} style={{ width: 'auto', fontSize: '0.82rem' }}>
                  <option value="ALL">Alle Dokumentenarten ({allEmployeeDocs.length})</option>
                  {uniqueKinds.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>

                <select value={docSortBy} onChange={e => setDocSortBy(e.target.value)} style={{ width: 'auto', fontSize: '0.82rem' }}>
                  <option value="date_desc">Sortieren: Datum (Neueste zuerst)</option>
                  <option value="date_asc">Sortieren: Datum (Älteste zuerst)</option>
                  <option value="kind_asc">Sortieren: Dokumentenart (A–Z)</option>
                  <option value="title_asc">Sortieren: Bezeichnung (A–Z)</option>
                </select>

                {selectedDocIds.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                    <select
                      value={bulkTargetKind}
                      onChange={e => {
                        setBulkTargetKind(e.target.value);
                        if (e.target.value) handleBulkChangeDocCategory(e.target.value);
                      }}
                      style={{ width: 'auto', fontSize: '0.8rem' }}
                    >
                      <option value="">Art für {selectedDocIds.length} Dokumente ändern...</option>
                      <option value="Lohnabrechnung">💰 Lohnabrechnung (Erscheint im Payslip-Tab)</option>
                      <option value="Arbeitsvertrag / Werkvertrag">📄 Arbeitsvertrag / Werkvertrag</option>
                      <option value="Personalausweis / Reisepass">🪪 Personalausweis / Reisepass</option>
                      <option value="Krankmeldung (AU)">🏥 Krankmeldung (AU)</option>
                      <option value="Führerschein / Zertifikat">🚗 Führerschein / Zertifikat</option>
                      <option value="Sonstiges">📎 Sonstiges</option>
                    </select>
                    <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626', fontWeight: 700 }} onClick={handleBulkDeleteDocs}>
                      <Trash2 size={14} /> Ausgewählte löschen ({selectedDocIds.length})
                    </button>
                  </div>
                )}
              </div>

              {filteredAllDocs.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                  Keine Dokumente für die gewählten Filter gefunden.
                </div>
              ) : (
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 8px', width: '36px' }} />
                      <th style={{ padding: '10px 8px' }}>Datum</th>
                      <th style={{ padding: '10px 8px' }}>Mitarbeiter</th>
                      <th style={{ padding: '10px 8px' }}>Dokumentenart</th>
                      <th style={{ padding: '10px 8px' }}>Bezeichnung / Datei</th>
                      <th style={{ padding: '10px 8px' }}>Herkunft</th>
                      <th style={{ padding: '10px 8px' }}>Aktionen (Management)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllDocs.map(doc => {
                      const fileUrl = doc.url || doc.download_url || doc.file_url;
                      const isChecked = selectedDocIds.includes(doc.id);
                      const isEditingThis = editingDocId === doc.id;
                      const isPayslipDoc = (doc.effectiveKind || '').toLowerCase().includes('lohnabrechnung') || doc.reference_type === 'Lohnabrechnung';
                      return (
                        <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)', background: isChecked ? '#fff7ed' : 'transparent' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(ev) => {
                                if (ev.target.checked) setSelectedDocIds(prev => [...prev, doc.id]);
                                else setSelectedDocIds(prev => prev.filter(id => id !== doc.id));
                              }}
                            />
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {isEditingThis ? (
                              <DateInput value={editingDocDate} onChange={e => setEditingDocDate(e.target.value)} style={{ width: '130px' }} />
                            ) : (
                              formatDate(doc.effectiveDate)
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 700 }}>{doc.employee_name}</td>
                          <td style={{ padding: '10px 8px' }}>
                            {isEditingThis ? (
                              <select value={editingDocCategory} onChange={e => setEditingDocCategory(e.target.value)} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                                <option value="Lohnabrechnung">💰 Lohnabrechnung</option>
                                <option value="Arbeitsvertrag / Werkvertrag">Arbeitsvertrag / Werkvertrag</option>
                                <option value="Personalausweis / Reisepass">Personalausweis / Reisepass</option>
                                <option value="Krankmeldung (AU)">Krankmeldung (AU)</option>
                                <option value="Führerschein / Zertifikat">Führerschein / Zertifikat</option>
                                <option value="Sonstiges">Sonstiges</option>
                              </select>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                <span className="badge" style={{ background: isPayslipDoc ? '#d1fae5' : 'rgba(255,107,0,0.12)', color: isPayslipDoc ? '#065f46' : 'var(--accent)', fontWeight: 700 }}>
                                  {doc.effectiveKind}
                                </span>
                                {isPayslipDoc && (
                                  <span style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600 }}>✓ Im Lohnabrechnung-Tab sichtbar</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {isEditingThis ? (
                              <input value={editingDocTitle} onChange={e => setEditingDocTitle(e.target.value)} style={{ fontSize: '0.82rem', padding: '4px 8px', width: '100%' }} />
                            ) : (
                              <div>
                                <div style={{ fontWeight: 700 }}>{doc.title}</div>
                                {doc.file_name && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{doc.file_name}</div>}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span className="badge" style={{ background: doc.uploaded_by === 'Mitarbeiter' ? '#dbeafe' : '#f1f5f9', color: doc.uploaded_by === 'Mitarbeiter' ? '#1d4ed8' : '#475569' }}>
                              {doc.uploaded_by === 'Mitarbeiter' ? '👤 Mitarbeiter-Upload' : '🏢 Management'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {isEditingThis ? (
                                <>
                                  <button type="button" className="btn-primary btn-sm" onClick={() => handleSaveDocTitle(doc.id)}>
                                    <Check size={13} /> Speichern
                                  </button>
                                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingDocId(null)}>
                                    <X size={13} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  {fileUrl && (
                                    <a
                                      href={resolveMediaUrl(fileUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={doc.file_name || true}
                                      className="btn-secondary btn-sm"
                                      style={{ textDecoration: 'none', color: 'var(--accent)', fontWeight: 600 }}
                                    >
                                      <Download size={13} /> Ansehen / Download
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() => {
                                      setEditingDocId(doc.id);
                                      setEditingDocTitle(doc.title || doc.file_name || '');
                                      setEditingDocCategory(doc.effectiveKind || 'Sonstiges');
                                      setEditingDocDate(doc.effectiveDate || new Date().toISOString().slice(0, 10));
                                    }}
                                  >
                                    <Edit3 size={13} /> Sortieren / Bearbeiten
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    style={{ color: '#dc2626' }}
                                    onClick={() => handleDeleteEmpDocument(doc.id)}
                                  >
                                    <Trash2 size={13} /> Löschen
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
              )}
            </div>
          </div>
        );
      })()}
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
  const [showQuickAddRegion, setShowQuickAddRegion] = useState(false);
  const [newRegion, setNewRegion] = useState({ postal_code: '', name: '', city: '' });
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
  const [newProj, setNewProj] = useState({
    name: '',
    code: '',
    client_name: '',
    kst: 1000,
    budget: 50000,
    status: 'Active',
    region_id: '',
    manager_id: '',
    start_date: '',
    end_date: '',
  });
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

  const handleCreateRegion = async (e) => {
    e.preventDefault();
    try {
      const created = await fetchWithToken('/api/v1/regions', {
        method: 'POST',
        body: JSON.stringify(newRegion),
      });
      setRegions(prev => [...prev, created]);
      setNewProj(prev => ({ ...prev, region_id: created.id }));
      setNewObj(prev => ({ ...prev, region_id: created.id }));
      setShowQuickAddRegion(false);
      setNewRegion({ postal_code: '', name: '', city: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateObject = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newObj,
        project_id: newObj.project_id || null,
        region_id: newObj.region_id?.trim() || null,
        units_count: Number(newObj.units_count) || 1,
      };
      await fetchWithToken('/api/v1/objects', { method: 'POST', body: JSON.stringify(payload) });
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
          team_id: newTask.team_id?.trim() || null,
          employee_id: newTask.employee_id?.trim() || null,
          project_id: newTask.project_id?.trim() || null,
          region_id: newTask.region_id?.trim() || null,
          object_id: newTask.object_id?.trim() || null,
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
      const payload = {
        name: newProj.name.trim(),
        code: newProj.code?.trim() || undefined,
        client_name: newProj.client_name?.trim() || undefined,
        kst: Number(newProj.kst) || 1000,
        budget: Number(newProj.budget) || 0,
        status: newProj.status || 'Active',
        manager_id: newProj.manager_id?.trim() || null,
        region_id: newProj.region_id?.trim() || null,
        start_date: newProj.start_date?.trim() || null,
        end_date: newProj.end_date?.trim() || null,
      };
      await fetchWithToken('/api/v1/projects', { method: 'POST', body: JSON.stringify(payload) });
      setShowAddProj(false);
      setNewProj({
        name: '',
        code: '',
        client_name: '',
        kst: 1000,
        budget: 50000,
        status: 'Active',
        region_id: '',
        manager_id: '',
        start_date: '',
        end_date: '',
      });
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

  const handleDeleteProject = async (proj) => {
    const ok = await confirmDelete({
      title: 'Projekt löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Projekt unwiderruflich löschen möchten?',
      itemName: `${proj.name} (KST ${proj.kst})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/projects/${proj.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteObject = async (obj) => {
    const ok = await confirmDelete({
      title: 'Gebäude / Objekt löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Gebäudeobjekt unwiderruflich löschen möchten?',
      itemName: `${obj.address} (${obj.units_count} WE)`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/objects/${obj.id}`, { method: 'DELETE' });
      if (selectedObjectMedia?.id === obj.id) setSelectedObjectMedia(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTask = async (task) => {
    const ok = await confirmDelete({
      title: 'Aufgabe / Einsatz löschen?',
      message: 'Sind Sie sicher, dass Sie diese Aufgabe aus dem Kalender unwiderruflich löschen möchten?',
      itemName: `${task.title} (${formatDate(task.date)})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/assignments/${task.id}`, { method: 'DELETE' });
      if (selectedTaskDoc?.id === task.id) setSelectedTaskDoc(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTeam = async (tm) => {
    const ok = await confirmDelete({
      title: 'Team löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Einsatzteam unwiderruflich löschen möchten?',
      itemName: tm.name,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/teams/${tm.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDelegation = async (del) => {
    const ok = await confirmDelete({
      title: 'Vertretung löschen?',
      message: 'Sind Sie sicher, dass Sie diese Vertretungsregelung unwiderruflich löschen möchten?',
      itemName: `${del.delegator_name} → ${del.delegatee_name}`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/delegations/${del.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMediaDoc = async (mediaItem, refreshCallback) => {
    const ok = await confirmDelete({
      title: 'Dokument / Datei löschen?',
      message: 'Sind Sie sicher, dass Sie diese hochgeladene Datei unwiderruflich löschen möchten?',
      itemName: mediaItem.title || mediaItem.file_name,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/media/${mediaItem.id}`, { method: 'DELETE' });
      if (refreshCallback) await refreshCallback();
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
        { id: 'objects', label: 'Objects & Properties', count: objects.length },
        { id: 'abrechnung', label: 'Abrechnung' },
        { id: 'tasks', label: 'Task Calendar & Assignments', count: assignments.length },
        { id: 'teams', label: 'Field Teams', count: teams.length },
        { id: 'projects', label: 'Projects & Regions', count: projects.length },
        { id: 'delegation', label: 'Vertretung', count: delegations.length },
      ]} />

      {/* Modals */}
      {showAddObj && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0 }}>New Building Object (Gebäude)</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>Register a building object / house address for FTTH survey or connection.</p>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddObj(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateObject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Project <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <select value={newObj.project_id} onChange={e => setNewObj({...newObj, project_id: e.target.value})} required>
                  <option value="">Select Project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex-between" style={{ marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Region (PLZ & City)</label>
                  <button type="button" onClick={() => setShowQuickAddRegion(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>
                    + New Region
                  </button>
                </div>
                <select value={newObj.region_id} onChange={e => setNewObj({...newObj, region_id: e.target.value})}>
                  <option value="">— Select Region (Optional) —</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.postal_code} — {r.name} {r.city ? `(${r.city})` : ''}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Street & House Number <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <input placeholder="e.g. Rheinstraße 42" required value={newObj.address} onChange={e => setNewObj({...newObj, address: e.target.value})} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Units (WE - Wohneinheiten)</label>
                  <input type="number" placeholder="12" value={newObj.units_count} onChange={e => setNewObj({...newObj, units_count: parseInt(e.target.value) || 1})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Cabling Type</label>
                  <input placeholder="e.g. FTTH Singlemode" value={newObj.cabling_type} onChange={e => setNewObj({...newObj, cabling_type: e.target.value})} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Technical Site Survey Notes</label>
                <textarea placeholder="Technical site survey notes, HÜP location, cellar access..." value={newObj.notes} onChange={e => setNewObj({...newObj, notes: e.target.value})} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
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
                <DateInput  value={newTask.date} onChange={e => setNewTask({...newTask, date: e.target.value})} required />
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
                  <option value={selectedTaskDoc.task_status} disabled hidden>{selectedTaskDoc.task_status}</option>
                  {Object.values(TASK_STATUS_CONFIG).map(st => (
                    <option key={st.key} value={st.key}>{st.en}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  title="Aufgabe löschen"
                  onClick={() => handleDeleteTask(selectedTaskDoc)}
                >
                  <Trash2 size={14} /> Löschen
                </button>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(m.created_at)}</span>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ padding: '2px 6px', color: '#dc2626', borderColor: '#fecaca' }}
                              title="Datei löschen"
                              onClick={() => handleDeleteMediaDoc(m, async () => {
                                const fresh = await fetchWithToken(`/api/v1/assignments/${selectedTaskDoc.id}/documentation`);
                                setSelectedTaskDoc(fresh);
                              })}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
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

      {/* Quick Add Region Modal */}
      {showQuickAddRegion && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="glass-panel" style={{ width: '420px' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Add New Region (PLZ & City)</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowQuickAddRegion(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateRegion} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Postal Code (PLZ) <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <input required placeholder="e.g. 65391" value={newRegion.postal_code} onChange={e => setNewRegion({ ...newRegion, postal_code: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Region / Rollout Area Name <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <input required placeholder="e.g. Lorch / Rheingau" value={newRegion.name} onChange={e => setNewRegion({ ...newRegion, name: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  City / Municipality (Gemeinde / Stadt)
                </label>
                <input placeholder="e.g. Lorch am Rhein" value={newRegion.city} onChange={e => setNewRegion({ ...newRegion, city: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowQuickAddRegion(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Region</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddProj && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Create New Project</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>Configure project attributes, budget, cost center, and regional assignment.</p>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddProj(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Project Name <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <input required placeholder="e.g. NE4 - Lorch FTTH Rollout" value={newProj.name} onChange={e => setNewProj({...newProj, name: e.target.value})} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Project Code (Optional)
                  </label>
                  <input placeholder="e.g. PRJ-101 (Auto-generated if empty)" value={newProj.code} onChange={e => setNewProj({...newProj, code: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Client / Auftraggeber
                  </label>
                  <input placeholder="e.g. UGG, Deutsche Telekom, Vodafone" value={newProj.client_name} onChange={e => setNewProj({...newProj, client_name: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="flex-between" style={{ marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      Region (PLZ & City)
                    </label>
                    <button type="button" onClick={() => setShowQuickAddRegion(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>
                      + New Region
                    </button>
                  </div>
                  <select value={newProj.region_id} onChange={e => setNewProj({...newProj, region_id: e.target.value})}>
                    <option value="">— Select Region (Optional / All Regions) —</option>
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>{r.postal_code} — {r.name} {r.city ? `(${r.city})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Project Manager (Projektleiter)
                  </label>
                  <select value={newProj.manager_id} onChange={e => setNewProj({...newProj, manager_id: e.target.value})}>
                    <option value="">— Assign Project Manager (Optional) —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Cost Center (KST)
                  </label>
                  <input type="number" placeholder="1000" value={newProj.kst} onChange={e => setNewProj({...newProj, kst: parseInt(e.target.value) || 1000})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Budget (€)
                  </label>
                  <input type="number" step="100" placeholder="50000" value={newProj.budget} onChange={e => setNewProj({...newProj, budget: parseFloat(e.target.value) || 0})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Status
                  </label>
                  <select value={newProj.status} onChange={e => setNewProj({...newProj, status: e.target.value})}>
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Start Date (Projektbeginn)
                  </label>
                  <DateInput  value={newProj.start_date} onChange={e => setNewProj({...newProj, start_date: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    End Date (Projektende)
                  </label>
                  <DateInput  value={newProj.end_date} onChange={e => setNewProj({...newProj, end_date: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
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
                    <div className="flex-between" style={{ marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{m.title}</div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        style={{ padding: '2px 6px', color: '#dc2626', borderColor: '#fecaca' }}
                        title="Datei löschen"
                        onClick={() => handleDeleteMediaDoc(m, async () => {
                          const updated = await fetchWithToken(`/api/v1/objects/${selectedObjectMedia.id}`);
                          setSelectedObjectMedia(updated);
                        })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{obj.region_name}</span>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        style={{ padding: '2px 5px', color: '#dc2626', borderColor: '#fecaca' }}
                        title="Gebäude löschen"
                        onClick={() => handleDeleteObject(obj)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
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
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button className="btn-secondary btn-sm" onClick={() => setSelectedTaskDoc(a)}>
                              <MessageSquare size={13} /> {(a.comments || []).length} • <Video size={13} /> {a.media_count || 0} Open
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: '#dc2626', borderColor: '#fecaca', padding: '4px 7px' }}
                              title="Aufgabe löschen"
                              onClick={() => handleDeleteTask(a)}
                            >
                              <Trash2 size={13} />
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
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-secondary btn-sm" onClick={() => setTeamForm({ id: tm.id, name: tm.name, leader_id: tm.leader_id || '', member_ids: tm.member_ids || [], notes: tm.notes || '' })}>
                        <Edit3 size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        title="Team löschen"
                        onClick={() => handleDeleteTeam(tm)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0 }}>Projects & Regional Rollouts ({projects.length})</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>Manage construction sites, FTTH rollout projects, and cost centers.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setShowQuickAddRegion(true)}>+ New Region (PLZ)</button>
              <button className="btn-primary" onClick={() => setShowAddProj(true)}>+ New Project</button>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <h4 style={{ marginBottom: '6px' }}>No projects created yet</h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Create your first project to organize building objects, field teams, and site surveys.</p>
              <button className="btn-primary" onClick={() => setShowAddProj(true)}>+ Create First Project</button>
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {projects.map(p => (
                <div key={p.id} className="glass-panel">
                  <div className="flex-between" style={{ marginBottom: '8px' }}>
                    <span className="badge">KST {p.kst}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="badge">{p.status}</span>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        style={{ padding: '2px 6px', color: '#dc2626', borderColor: '#fecaca' }}
                        title="Projekt löschen"
                        onClick={() => handleDeleteProject(p)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <h3>{p.name}</h3>
                  <p style={{ fontSize: '0.8rem', margin: '6px 0' }}>Client: {p.client_name || 'Internal'}</p>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>Manager: <strong>{p.manager_name}</strong></div>
                    <div>Region: {p.region_name}</div>
                    {p.start_date && <div>Duration: {formatDate(p.start_date)} {p.end_date ? `→ ${formatDate(p.end_date)}` : ''}</div>}
                    <div>Progress: {p.completed_objects_count}/{p.objects_count} Objects ({p.total_units} WE)</div>
                    <div>Budget: {formatEuro(p.budget)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            <form onSubmit={handleCreateDelegation} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', marginBottom: '16px', padding: '14px', background: 'var(--surface)', borderRadius: '8px', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Delegator (Absent PM) *</label>
                <select value={newDel.delegator_id} onChange={e => setNewDel({...newDel, delegator_id: e.target.value})} required>
                  <option value="">Select PM...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Acting PM (Vertreter) *</label>
                <select value={newDel.delegatee_id} onChange={e => setNewDel({...newDel, delegatee_id: e.target.value})} required>
                  <option value="">Select Acting PM...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Start Date *</label>
                <DateInput  value={newDel.start_date} onChange={e => setNewDel({...newDel, start_date: e.target.value})} required />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>End Date *</label>
                <DateInput  value={newDel.end_date} onChange={e => setNewDel({...newDel, end_date: e.target.value})} required />
              </div>
              <button type="submit" className="btn-primary" style={{ height: '38px' }}>Activate</button>
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
                <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
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
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fecaca' }}
                      title="Vertretung löschen"
                      onClick={() => handleDeleteDelegation(d)}
                    >
                      <Trash2 size={13} />
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
};
