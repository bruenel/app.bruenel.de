import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DateInput, TimeInput } from '../components/DateTimeInputs';
import {
  Users, Clock, Calendar, FileText, HeartPulse, Plus, Check, X, Upload,
  Building2, MapPin, Video, Image, ShieldAlert, ArrowRightLeft, Lock, Edit3,
  MessageSquare, Download, ChevronLeft, ChevronRight, BarChart3, GripVertical,
  Search, KeyRound, Trash2, ShieldCheck, Briefcase, PhoneCall, AlertTriangle,
  Sparkles, ScanLine, FolderOpen, ShieldCheck as ShieldKey, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, TIER_LABELS, formatEuro, formatDate, formatDateTime, formatDateRange } from '../core/api';
import { TASK_STATUS_CONFIG, getStatusStyle } from '../core/i18n';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHead, SubTabs, useQuickAction, Empty, downloadCsv, confirmDelete } from '../components/ui';
import { MasterCalendarModule } from './ErpOperationsModules';
import { HRContractGeneratorView, HREmployeeOverviewView, downloadSingleContractPdf } from './HRContractsAndOverview';

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
  salutation: 'Herr',
  private_email: '',
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

const buildBruenelLoginEmail = (firstName, lastName) => {
  const clean = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '');
  const f = clean(firstName);
  const l = clean(lastName);
  if (f && l) return `${f}.${l}@bruenel.de`;
  if (f) return `${f}@bruenel.de`;
  if (l) return `${l}@bruenel.de`;
  return '';
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
  const [contractGenEmpId, setContractGenEmpId] = useState('');

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
  const [aiReadingFiles, setAiReadingFiles] = useState([]);
  const [aiReviewModal, setAiReviewModal] = useState(null);
  const [biViewMode, setBiViewMode] = useState('bars'); // 'bars' | 'calendar' | 'compact'
  const [empHoursViewMode, setEmpHoursViewMode] = useState('months'); // 'months' | 'calendar'
  const [expandedHoursMonthMap, setExpandedHoursMonthMap] = useState({});
  const [hoursCalMonth, setHoursCalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [approvingAllEmpId, setApprovingAllEmpId] = useState(null);
  const [expandedDocMap, setExpandedDocMap] = useState({});
  const [expandedTimeEmpMap, setExpandedTimeEmpMap] = useState({});
  const [recycledEmployees, setRecycledEmployees] = useState([]);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [empFormDirty, setEmpFormDirty] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const skipNextDirtyRef = useRef(false);

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

  // ── AI Document Reader (Multi-file support with Loading & Review Modal) ─────
  const applyAiReviewedFields = () => {
    if (!aiReviewModal) return;
    const reviewed = aiReviewModal.fields || {};
    const uploadedDocsList = aiReviewModal.uploadedDocs || [];

    setNewEmp((prev) => {
      const attrs = { ...(prev.attributes || {}) };
      if (reviewed.birth_date) {
        attrs.birth_date = reviewed.birth_date;
        attrs.geburtsdatum = reviewed.birth_date;
      }
      if (reviewed.nationality) {
        attrs.nationality = reviewed.nationality;
        attrs.staatsangehoerigkeit = reviewed.nationality;
      }
      if (reviewed.gender) {
        attrs.geschlecht = reviewed.gender;
        const g = String(reviewed.gender).trim().toLowerCase();
        if (g === 'f' || g === 'w' || g.includes('weib') || g.includes('fem') || g.includes('frau')) {
          attrs.salutation = 'Frau';
        } else if (g === 'm' || g.includes('männ') || g.includes('male') || g.includes('herr')) {
          attrs.salutation = 'Herr';
        }
      }
      if (reviewed.company_name && prev.employment_type === 'Subunternehmer') {
        attrs.salutation = 'Firma';
      }
      if (reviewed.street) {
        attrs.street = reviewed.street;
        attrs.strasse = reviewed.street;
      }
      if (reviewed.postal_code) {
        attrs.postal_code = reviewed.postal_code;
        attrs.plz = reviewed.postal_code;
      }
      if (reviewed.city) {
        attrs.city = reviewed.city;
        attrs.ort = reviewed.city;
      }
      if (reviewed.steuer_id) attrs.steuer_id = reviewed.steuer_id;
      if (reviewed.sozialversicherungsnummer) attrs.sozialversicherungsnummer = reviewed.sozialversicherungsnummer;
      if (reviewed.krankenversicherung_name) attrs.krankenversicherung_name = reviewed.krankenversicherung_name;
      if (reviewed.krankenversicherung_nummer) attrs.krankenversicherung_nummer = reviewed.krankenversicherung_nummer;
      if (reviewed.drivers_license) attrs.drivers_license = reviewed.drivers_license;
      if (reviewed.document_type) attrs.ausweistyp = reviewed.document_type;
      if (reviewed.document_number) attrs.ausweisnummer = reviewed.document_number;
      if (reviewed.document_valid_until) attrs.ausweis_gueltig_bis = reviewed.document_valid_until;
      if (reviewed.company_name) attrs.company_name = reviewed.company_name;
      if (reviewed.ust_id) attrs.ust_id = reviewed.ust_id;
      if (reviewed.steuernummer) attrs.steuernummer = reviewed.steuernummer;
      if (reviewed.iban) attrs.iban = reviewed.iban;
      if (reviewed.bic) attrs.bic = reviewed.bic;
      if (reviewed.bank_name) attrs.bank_name = reviewed.bank_name;
      if (reviewed.notes) attrs.notes = reviewed.notes;

      const nextFirst = reviewed.first_name || prev.first_name;
      const nextLast = reviewed.last_name || prev.last_name;
      const scannedEmail = String(reviewed.email || '').trim();
      if (scannedEmail && !scannedEmail.toLowerCase().endsWith('@bruenel.de')) {
        attrs.private_email = scannedEmail;
      }
      let nextPortalEmail = prev.email || '';
      if (scannedEmail && scannedEmail.toLowerCase().endsWith('@bruenel.de')) {
        nextPortalEmail = scannedEmail.toLowerCase();
      } else if (!nextPortalEmail || !nextPortalEmail.toLowerCase().endsWith('@bruenel.de')) {
        const generatedBruenel = buildBruenelLoginEmail(nextFirst, nextLast);
        if (generatedBruenel) nextPortalEmail = generatedBruenel;
      }

      const existingIds = new Set((prev.documents || []).map((d) => d.id));
      const newDocs = uploadedDocsList
        .filter((doc) => doc.document_id && !existingIds.has(doc.document_id))
        .map((doc) => ({
          id: doc.document_id,
          title: doc.name,
          category: docCategory || 'Personalausweis / Reisepass',
          url: doc.download_url,
          created_at: new Date().toISOString(),
        }));

      return {
        ...prev,
        first_name: nextFirst,
        last_name: nextLast,
        email: nextPortalEmail,
        phone: reviewed.phone || prev.phone,
        role: reviewed.role || prev.role,
        attributes: attrs,
        documents: [...(prev.documents || []), ...newDocs],
      };
    });

    setAiDocResult({
      fields: reviewed,
      fileName: (aiReviewModal.fileNames || []).join(', '),
      count: (aiReviewModal.fileNames || []).length,
    });
    setAiReviewModal(null);
    if (!showAddEmp) {
      setShowAddEmp(true);
    }
    setEmpCardTab('personal');
  };

  const handleAiDocumentRead = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    setAiReadingFiles(files.map((f) => f.name));
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

    // Resize large images client-side (max 1600px, JPEG 0.85) for 5x faster AI OCR
    const prepareForAi = async (f) => {
      const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
      let mimeType = f.type;
      if (!mimeType) {
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'webp') mimeType = 'image/webp';
        else mimeType = 'image/jpeg';
      }
      if (mimeType.startsWith('image/') && f.size > 350 * 1024 && typeof createImageBitmap === 'function') {
        try {
          const bmp = await createImageBitmap(f);
          const maxDim = 1600;
          const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
          if (scale < 1) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bmp.width * scale);
            canvas.height = Math.round(bmp.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
            bmp.close?.();
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            return { b64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
          }
          bmp.close?.();
        } catch {
          // fallback to raw base64
        }
      }
      const b64 = await toBase64(f);
      return { b64, mimeType };
    };

    const normalizeIsoDate = (val) => {
      const s = String(val || '').trim();
      if (!s) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        let yy = m[3];
        if (yy.length === 2) yy = (Number(yy) > 40 ? '19' : '20') + yy;
        return `${yy}-${mm}-${dd}`;
      }
      return s;
    };

    const parseAiJson = (rawText) => {
      try {
        let cleaned = String(rawText || '{}').trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        }
        let parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0];
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    };

    const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
    const modelsToTry = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];

    const prompt = `You are an expert German & EU HR document parser. Analyze the uploaded document thoroughly (Personalausweis front/back, Reisepass, Aufenthaltstitel, Meldebestätigung, Führerschein, Krankenkassenkarte/eGK, Sozialversicherungsausweis, Steuer-ID Schreiben, Bankkarte/Kontoauszug, Lebenslauf/CV, Arbeitsvertrag, Lohnabrechnung, Gewerbeanmeldung, §48b Freistellungsbescheinigung, or any other HR/ID document).
Read ALL visible text, tables, headers, and Machine-Readable Zones (MRZ lines at the bottom of IDs/passports).
Convert all dates from DD.MM.YYYY or DD.MM.YY to YYYY-MM-DD format.
Return ONLY a valid JSON object with these exact keys (empty string "" if not present, do not guess):
{
  "first_name": "",
  "last_name": "",
  "email": "",
  "phone": "",
  "birth_date": "YYYY-MM-DD",
  "nationality": "",
  "gender": "",
  "street": "",
  "postal_code": "",
  "city": "",
  "steuer_id": "",
  "sozialversicherungsnummer": "",
  "krankenversicherung_name": "",
  "krankenversicherung_nummer": "",
  "drivers_license": "",
  "document_type": "",
  "document_number": "",
  "document_valid_until": "YYYY-MM-DD",
  "company_name": "",
  "ust_id": "",
  "steuernummer": "",
  "iban": "",
  "bic": "",
  "bank_name": "",
  "role": "",
  "notes": ""
}`;

    try {
      // Run upload + AI extraction in parallel across all uploaded files
      const perFileResults = await Promise.all(
        files.map(async (file) => {
          const uploadPromise = uploadMediaFile({
            file,
            referenceType: 'PersonalDokument',
            referenceId: editingEmpId || 'NEW_EMPLOYEE',
            title: `KI-Upload: ${file.name}`,
          }).then(async (uploadedDoc) => {
            if (uploadedDoc?.document_id && editingEmpId) {
              await fetchWithToken(`/api/v1/hr/employees/${editingEmpId}/documents`, {
                method: 'POST',
                body: JSON.stringify({
                  document_id: uploadedDoc.document_id,
                  category: docCategory || 'Personalausweis / Reisepass',
                  title: `KI-Upload: ${file.name}`,
                }),
              }).catch(() => null);
            }
            return uploadedDoc;
          }).catch(() => null);

          const aiPromise = (async () => {
            const { b64, mimeType } = await prepareForAi(file);
            let docFields = {};
            if (GEMINI_KEY) {
              for (const model of modelsToTry) {
                try {
                  const genCfg = { temperature: 0, responseMimeType: 'application/json' };
                  const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: b64 } }] }],
                        generationConfig: genCfg,
                      }),
                    }
                  );
                  if (res.ok) {
                    const geminiJson = await res.json();
                    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
                    docFields = parseAiJson(rawText);
                    if (Object.keys(docFields).length > 0) return docFields;
                  }
                } catch {
                  // try next model
                }
              }
            }
            const backendRes = await fetchWithToken('/api/v1/hr/ai/read-document', {
              method: 'POST',
              body: JSON.stringify({ mime_type: mimeType, data: b64 }),
            });
            return backendRes?.fields || {};
          })().catch((err) => {
            console.warn('Error reading file with AI:', file.name, err);
            return { _aiError: err?.message || 'AI read failed' };
          });

          const [uploadedDoc, docFields] = await Promise.all([uploadPromise, aiPromise]);
          return { file, uploadedDoc, docFields };
        })
      );

      let lastAiErr = null;
      for (const item of perFileResults) {
        if (item.uploadedDoc?.document_id) {
          uploadedDocsList.push({ ...item.uploadedDoc, name: item.file.name });
        }
        if (item.docFields?._aiError) {
          lastAiErr = item.docFields._aiError;
        }
        for (const [k, v] of Object.entries(item.docFields || {})) {
          if (k === '_aiError') continue;
          if (v && String(v).trim()) {
            mergedFields[k] = (k === 'birth_date' || k === 'document_valid_until') ? normalizeIsoDate(v) : String(v).trim();
          }
        }
      }
      if (Object.keys(mergedFields).length === 0 && lastAiErr) {
        setAiDocError(lastAiErr);
      }

      // Open review & edit popup modal with all extracted fields before applying to form
      setAiReviewModal({
        fields: {
          first_name: mergedFields.first_name || '',
          last_name: mergedFields.last_name || '',
          gender: mergedFields.gender || '',
          birth_date: mergedFields.birth_date || '',
          nationality: mergedFields.nationality || '',
          email: mergedFields.email || '',
          phone: mergedFields.phone || '',
          street: mergedFields.street || '',
          postal_code: mergedFields.postal_code || '',
          city: mergedFields.city || '',
          steuer_id: mergedFields.steuer_id || '',
          sozialversicherungsnummer: mergedFields.sozialversicherungsnummer || '',
          krankenversicherung_name: mergedFields.krankenversicherung_name || '',
          krankenversicherung_nummer: mergedFields.krankenversicherung_nummer || '',
          drivers_license: mergedFields.drivers_license || '',
          document_type: mergedFields.document_type || '',
          document_number: mergedFields.document_number || '',
          document_valid_until: mergedFields.document_valid_until || '',
          iban: mergedFields.iban || '',
          bic: mergedFields.bic || '',
          bank_name: mergedFields.bank_name || '',
          company_name: mergedFields.company_name || '',
          ust_id: mergedFields.ust_id || '',
          steuernummer: mergedFields.steuernummer || '',
          role: mergedFields.role || '',
          notes: mergedFields.notes || '',
        },
        uploadedDocs: uploadedDocsList,
        fileNames: files.map((f) => f.name),
      });
    } catch (err) {
      setAiDocError(err.message || 'Fehler beim Hochladen oder Verarbeiten der Dokumente');
    } finally {
      setAiDocReading(false);
      setAiReadingFiles([]);
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
    fetchWithToken('/api/v1/hr/employees/recycle-bin').then(d => setRecycledEmployees(Array.isArray(d) ? d : [])).catch(() => setRecycledEmployees([]));
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
    skipNextDirtyRef.current = true;
    setEmpFormDirty(false);
    setShowUnsavedPrompt(false);
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
    skipNextDirtyRef.current = true;
    setEmpFormDirty(false);
    setShowUnsavedPrompt(false);
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

  const handleApproveAllEmployeeHours = async (empId, monthKey = null) => {
    const pendingLogs = timeLogs.filter(
      (l) =>
        l.employee_id === empId &&
        l.status !== 'Approved' &&
        Boolean(l.check_out_time) &&
        (!monthKey || String(l.date || '').startsWith(monthKey))
    );
    if (pendingLogs.length === 0) return;
    setApprovingAllEmpId(empId);
    try {
      await Promise.all(
        pendingLogs.map((l) =>
          fetchWithToken(`/api/v1/hr/time-logs/${l.id}/approve`, {
            method: 'PATCH',
            body: JSON.stringify({}),
          })
        )
      );
      loadAll();
    } catch (err) {
      alert(err.message || 'Fehler bei der Sammel-Freigabe');
    } finally {
      setApprovingAllEmpId(null);
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
      status: log.status || 'Completed',
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
          status: editLogForm.status || log.status,
        }),
      });
      setEditingLogId(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSetTimeLogStatus = async (logId, nextStatus) => {
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${logId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const renderEditableTimeLogRow = (l) => {
    const isEditing = editingLogId === l.id;
    const isApproved = l.status === 'Approved';
    return (
      <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbf7' : undefined }}>
        <td style={{ padding: '6px 10px', fontWeight: 700 }}>
          {isEditing ? (
            <DateInput
              value={editLogForm.date}
              onChange={(e) => setEditLogForm({ ...editLogForm, date: e.target.value })}
              style={{ width: 130, padding: '4px 6px', fontSize: 11.5 }}
            />
          ) : (
            formatDate(l.date)
          )}
        </td>
        <td style={{ padding: '6px 10px' }}>
          {isEditing ? (
            <select
              value={editLogForm.project_id}
              onChange={(e) => setEditLogForm({ ...editLogForm, project_id: e.target.value })}
              style={{ width: 165, padding: '4px 6px', fontSize: 11.5 }}
            >
              <option value="">— Allgemein / Kein Projekt —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            l.project_name || '—'
          )}
        </td>
        <td style={{ padding: '6px 10px' }}>
          {isEditing ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <TimeInput
                value={editLogForm.check_in_time}
                onChange={(e) => setEditLogForm({ ...editLogForm, check_in_time: e.target.value })}
                style={{ width: 92, padding: '4px 5px', fontSize: 11.5 }}
              />
              <span>–</span>
              <TimeInput
                value={editLogForm.check_out_time}
                onChange={(e) => setEditLogForm({ ...editLogForm, check_out_time: e.target.value })}
                style={{ width: 92, padding: '4px 5px', fontSize: 11.5 }}
              />
            </div>
          ) : (
            <>In: {fmtTimeInput(l.check_in_time) || '—'} · Out: {fmtTimeInput(l.check_out_time) || 'Aktiv'}</>
          )}
        </td>
        <td style={{ padding: '6px 10px' }}>
          {isEditing ? (
            <input
              type="number"
              min="0"
              value={editLogForm.break_minutes}
              onChange={(e) => setEditLogForm({ ...editLogForm, break_minutes: e.target.value })}
              style={{ width: 65, padding: '4px 6px', fontSize: 11.5 }}
            />
          ) : (
            `${l.break_minutes || 0} min`
          )}
        </td>
        <td style={{ padding: '6px 10px', fontWeight: 800, color: '#0f172a' }}>
          {l.net_hours ?? l.total_hours ?? 0} h
        </td>
        <td style={{ padding: '6px 10px' }}>
          {isEditing ? (
            <select
              value={editLogForm.status || 'Completed'}
              onChange={(e) => setEditLogForm({ ...editLogForm, status: e.target.value })}
              style={{ width: 'auto', padding: '4px 6px', fontSize: 11 }}
            >
              <option value="Approved">Approved (Freigegeben)</option>
              <option value="Completed">Pending (Offen)</option>
            </select>
          ) : (
            <span
              className="badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: isApproved ? '#dcfce7' : '#fef3c7',
                color: isApproved ? '#15803d' : '#b45309',
                fontSize: 10.5,
              }}
            >
              {isApproved && <Lock size={10} />}
              {isApproved ? 'Freigegeben' : 'Pending'}
            </span>
          )}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isEditing ? (
              <>
                <button type="button" className="btn-primary btn-sm" style={{ padding: '3px 8px', fontSize: 10.5 }} onClick={() => saveEditLog(l)}>
                  <Check size={11} /> Speichern
                </button>
                <button type="button" className="btn-secondary btn-sm" style={{ padding: '3px 7px', fontSize: 10.5 }} onClick={() => setEditingLogId(null)}>
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                {isApproved ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ padding: '3px 7px', fontSize: 10.5, color: '#b45309', borderColor: '#fde68a', background: '#fffbeb' }}
                    onClick={() => handleSetTimeLogStatus(l.id, 'Completed')}
                    title="Freigabe aufheben und auf Pending setzen"
                  >
                    Auf Pending
                  </button>
                ) : (
                  l.check_out_time && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      style={{ padding: '3px 7px', fontSize: 10.5, background: '#059669', borderColor: '#047857' }}
                      onClick={() => handleApproveTimeLog(l.id)}
                      title="Freigeben & Sperren"
                    >
                      <Check size={11} /> Freigeben
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ padding: '3px 7px', fontSize: 10.5 }}
                  onClick={() => startEditLog(l)}
                  title="Datum, Uhrzeit, Pause oder Projekt bearbeiten"
                >
                  <Edit3 size={11} /> Edit
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ color: '#dc2626', padding: '3px 6px' }}
                  onClick={() => handleDeleteTimeLog(l.id)}
                  title="Eintrag löschen"
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
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

  useEffect(() => {
    if (!showAddEmp) return;
    if (skipNextDirtyRef.current) {
      skipNextDirtyRef.current = false;
      return;
    }
    setEmpFormDirty(true);
  }, [newEmp, showAddEmp]);

  const requestCloseEmpModal = () => {
    if (empFormDirty) {
      setShowUnsavedPrompt(true);
    } else {
      setShowAddEmp(false);
      setShowUnsavedPrompt(false);
    }
  };

  const handleDeleteEmployee = async (empId, empName) => {
    const ok = await confirmDelete({
      title: 'Mitarbeiter in Papierkorb verschieben?',
      message: `Möchten Sie "${empName}" in den Papierkorb verschieben?\n\nKeine Daten werden endgültig gelöscht — Personalakte, Arbeitszeiten, Urlaub, Dokumente und Zugangsdaten bleiben im Papierkorb gespeichert und können jederzeit wiederhergestellt werden.`,
      itemName: empName,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/hr/employees/${empId}`, { method: 'DELETE' });
      if (editingEmpId === empId) {
        setEmpFormDirty(false);
        setShowUnsavedPrompt(false);
        setShowAddEmp(false);
        setEditingEmpId(null);
      }
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRestoreEmployee = async (empId) => {
    try {
      await fetchWithToken(`/api/v1/hr/employees/${empId}/restore`, { method: 'POST' });
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

  const handleSaveEmployeeCard = async (e, jumpToContract = false) => {
    if (e && e.preventDefault) e.preventDefault();
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
            employee_number: (newEmp.employee_number || '').trim() || undefined,
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
              employee_number: (newEmp.employee_number || '').trim() || undefined,
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
              employee_number: (newEmp.employee_number || '').trim() || undefined,
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

        // Link any AI-scanned documents uploaded before the new employee record was created
        if (targetEmpId && Array.isArray(newEmp.documents) && newEmp.documents.length > 0) {
          for (const d of newEmp.documents) {
            if (d.id) {
              await fetchWithToken(`/api/v1/hr/employees/${targetEmpId}/documents`, {
                method: 'POST',
                body: JSON.stringify({
                  document_id: d.id,
                  category: d.category || 'Personalausweis / Reisepass',
                  title: d.title || 'KI-Upload',
                }),
              }).catch(() => null);
            }
          }
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

      setEmpFormDirty(false);
      setShowUnsavedPrompt(false);
      setShowAddEmp(false);
      loadAll();
      if (jumpToContract && targetEmpId) {
        setContractGenEmpId(targetEmpId);
        setTab('contracts');
      }
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
    <div className="hr-module">
      {/* Minimal HR header: title · KPI strip · month (single global filter) · primary action */}
      <div className="hr-head">
        <h2>HR &amp; Workforce</h2>
        <div className="hr-kpis">
          <div className="hr-kpi" title="Gesamt · davon aktiv"><span>Mitarbeiter</span><b>{employees.length}<small> · {employees.filter((e) => e.is_active !== false).length} aktiv</small></b></div>
          <div className="hr-kpi"><span>Freelancer/Sub</span><b>{subCount}</b></div>
          <div className="hr-kpi"><span>Kandidaten</span><b>{candidateCount}</b></div>
          <div className="hr-kpi"><span>Stunden</span><b>{biSummary ? `${biSummary.total_hours} h` : '—'}</b></div>
          <div className={`hr-kpi${totalOvertimeHoursSum > 0 ? ' warn' : ''}`}><span>Überstunden</span><b>{totalOvertimeHoursSum} h</b></div>
          <div className="hr-kpi"><span>Kosten</span><b>{formatEuro(totalEstimatedMonthlyCost)}</b></div>
        </div>
        <div className="hr-head-actions">
          <div className="hr-month" title="Abrechnungsmonat (gilt für alle Reiter)">
            <select value={selectedBiMonthPart} onChange={(e) => setBiMonth(`${selectedBiYear}-${e.target.value}`)}>
              {MONTH_OPTIONS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
            <select value={selectedBiYear} onChange={(e) => setBiMonth(`${e.target.value}-${selectedBiMonthPart}`)}>
              {YEAR_OPTIONS.map((yr) => (<option key={yr} value={yr}>{yr}</option>))}
            </select>
          </div>
          <button className="btn-primary btn-sm" onClick={openCreateEmployeeModal}><Plus size={13} /> Mitarbeiter</button>
        </div>
      </div>

      {weeklyAlerts.length > 0 && (
        <div className="hr-alert">
          <strong><AlertTriangle size={12} /> Wochenlimit überschritten</strong>
          {weeklyAlerts.map((al, i) => (
            <button key={`${al.employee_id}-${al.week_key}-${i}`} type="button" onClick={() => { setBiEmpFilter(al.employee_id); setTimeSearchQuery(al.employee_name); setTab('timelogs'); }}>
              {al.employee_name} {al.week_key}: {al.worked_hours}/{al.weekly_limit}h (+{al.exceeded_by}h)
            </button>
          ))}
        </div>
      )}

      {/* Sub-navigation (short labels, underline style) */}
      <SubTabs base="/hr" variant="underline" active={tab === 'overview' || tab === 'documents' ? 'employees' : tab} items={[
        { id: 'employees', label: 'Mitarbeiter', count: employees.length },
        { id: 'contracts', label: 'Verträge' },
        { id: 'timelogs', label: 'Arbeitszeiten', count: timeLogs.length },
        { id: 'leaves', label: 'Urlaub', count: leaves.length },
        { id: 'sickness', label: 'Krankheit', count: sickness.length },
      ]} />

      {/* =====================================================================
          CLEAN MINIMAL POPUP MODAL: MITARBEITER ERSTELLEN / PERSONALAKTE
         ===================================================================== */}
      {showAddEmp && (() => {
        const empLogsAll = editingEmpId ? timeLogs.filter((l) => l.employee_id === editingEmpId) : [];
        const empMonthLogs = empLogsAll.filter((l) => String(l.date || '').startsWith(biMonth));
        const empMonthHours = empMonthLogs.reduce((s, l) => s + Number(l.net_hours ?? l.total_hours ?? 0), 0);
        const empQuotaHours = Number(newEmp.attributes?.monthly_contract_hours || 160);
        const empOvertimeHours = Math.max(0, Number((empMonthHours - empQuotaHours).toFixed(1)));
        const empLeavesAll = editingEmpId ? leaves.filter((l) => l.employee_id === editingEmpId) : [];
        const empSicknessAll = editingEmpId ? sickness.filter((s) => s.employee_id === editingEmpId) : [];
        const empPayslipsAll = editingEmpId
          ? [
              ...payslips.filter((p) => p.employee_id === editingEmpId).map((p) => ({
                id: p.id,
                source: 'payslip',
                title: `Lohnabrechnung ${String(p.period_month).padStart(2, '0')}/${p.period_year}`,
                period: `${String(p.period_month).padStart(2, '0')}.${p.period_year}`,
                gross: p.gross_amount,
                net: p.net_amount,
                bonus: p.bonus_amount,
                date: p.issued_at ? String(p.issued_at).slice(0, 10) : '',
                url: p.pdf_url || p.file_url || '',
                notes: p.notes || '',
              })),
              ...(newEmp.documents || [])
                .filter((d) => (d.category || d.reference_type || '').toLowerCase().includes('lohnabrechnung'))
                .map((d) => ({
                  id: d.id,
                  source: 'doc',
                  title: d.title || d.file_name || 'Lohnabrechnung PDF',
                  period: d.payslip_month && d.payslip_year ? `${d.payslip_month}.${d.payslip_year}` : formatDate(d.doc_date || d.created_at),
                  gross: newEmp.base_salary,
                  net: null,
                  bonus: null,
                  date: d.doc_date || (d.created_at ? String(d.created_at).slice(0, 10) : ''),
                  url: d.url || d.download_url || d.file_url || '',
                  notes: d.file_name || '',
                })),
            ]
          : [];

        const modalTabs = [
          { id: 'personal', num: 1, label: 'Stammdaten' },
          { id: 'contract', num: 2, label: isFreelanceModal ? 'Freelancer & Verträge' : 'Vertrag & Gehalt' },
          { id: 'tax', num: 3, label: 'Steuer, KV & Bank' },
          ...(editingEmpId ? [
            { id: 'hours', num: 4, label: 'Arbeitszeiten', badge: empLogsAll.length || null },
            { id: 'absence', num: 5, label: 'Urlaub & AU', badge: (empSicknessAll.length + empLeavesAll.length) || null },
            { id: 'payslips', num: 6, label: 'Lohn', badge: empPayslipsAll.length || null },
          ] : []),
          { id: 'docs', num: editingEmpId ? 7 : 4, label: 'Dokumente & KI', badge: (newEmp.documents || []).length || null },
          { id: 'sos', num: editingEmpId ? 8 : 5, label: 'SOS Notfall' },
          { id: 'sub', num: editingEmpId ? 9 : 6, label: 'Sub §48b' },
          { id: 'security', num: editingEmpId ? 10 : 7, label: 'Account & OTP' },
        ];
        const currentTabIdx = Math.max(0, modalTabs.findIndex((t) => t.id === empCardTab));
        const isLastTab = currentTabIdx === modalTabs.length - 1;

        return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9990,
            background: 'rgba(15, 23, 42, 0.56)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={requestCloseEmpModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 1020,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
              animation: 'hrModalIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* Minimal Popup Header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {editingEmpId && (
                  <span style={{ padding: '2px 8px', borderRadius: 5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                    {newEmp.employee_number || employees.find((x) => x.id === editingEmpId)?.employee_number || 'EMP'}
                  </span>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      {editingEmpId ? `${newEmp.first_name} ${newEmp.last_name}` : 'Neuer Mitarbeiter / Freelancer'}
                    </strong>
                    <button
                      type="button"
                      onClick={() => setNewEmp((prev) => ({ ...prev, is_active: !prev.is_active }))}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: newEmp.is_active === false ? '1px solid #fca5a5' : '1px solid #86efac',
                        background: newEmp.is_active === false ? '#fef2f2' : '#dcfce7',
                        color: newEmp.is_active === false ? '#dc2626' : '#15803d',
                      }}
                      title="Status umschalten (Aktiv / Gesperrt)"
                    >
                      {newEmp.is_active === false ? 'Gesperrt' : 'Aktiv'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {newEmp.role} · {newEmp.department}{newEmp.email ? ` · ${newEmp.email}` : ''}
                  </div>
                </div>
              </div>

              {/* Right: KPI Pills (edit mode) + Type Selector + Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {editingEmpId && (
                  <>
                    <button type="button" onClick={() => setEmpCardTab('hours')} style={{ padding: '4px 8px', borderRadius: 6, background: empCardTab === 'hours' ? '#fff7ed' : '#fff', border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                      {empMonthHours.toFixed(1)}/{empQuotaHours}h {empOvertimeHours > 0 ? `(+${empOvertimeHours}h)` : ''}
                    </button>
                    <button type="button" onClick={() => setEmpCardTab('absence')} style={{ padding: '4px 8px', borderRadius: 6, background: empCardTab === 'absence' ? '#fff7ed' : '#fff', border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                      Urlaub: {empLeavesAll.length} · AU: {empSicknessAll.length}
                    </button>
                    <button type="button" onClick={() => setEmpCardTab('payslips')} style={{ padding: '4px 8px', borderRadius: 6, background: empCardTab === 'payslips' ? '#ecfdf5' : '#fff', border: '1px solid #a7f3d0', fontSize: 11, fontWeight: 700, color: '#047857', cursor: 'pointer' }}>
                      Lohn: {empPayslipsAll.length}
                    </button>
                  </>
                )}
                <select
                  value={newEmp.employment_type}
                  onChange={(e) => handleEmploymentTypeSwitch(e.target.value)}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412' }}
                >
                  {['Full-time', 'Part-time', 'Minijob', 'Freelancer', 'Subunternehmer', 'Candidate'].map((tp) => (
                    <option key={tp} value={tp}>{tp}</option>
                  ))}
                </select>
                {editingEmpId && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', padding: '5px 8px' }}
                    onClick={() => handleDeleteEmployee(editingEmpId, `${newEmp.first_name} ${newEmp.last_name}`)}
                    title="In Papierkorb verschieben"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={requestCloseEmpModal}
                  title="Schließen"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#475569',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Minimal Animated Underline Tabs */}
            <div
              style={{
                padding: '0 18px',
                background: '#fff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              {modalTabs.map((st) => {
                const isActive = empCardTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setEmpCardTab(st.id)}
                    style={{
                      padding: '9px 11px',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#FF6B00' : '#64748b',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: isActive ? '2px solid #FF6B00' : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'color 0.18s ease, border-color 0.2s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isActive ? '#FF6B00' : '#f1f5f9',
                        color: isActive ? '#fff' : '#64748b',
                        transition: 'background 0.18s ease, color 0.18s ease',
                      }}
                    >
                      {st.num}
                    </span>
                    {st.label}
                    {st.badge != null && st.badge > 0 && (
                      <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontWeight: 700 }}>
                        {st.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Animated Form Body */}
            <form onSubmit={handleSaveEmployeeCard} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div
                key={empCardTab}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '18px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  animation: 'hrTabFade 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {/* SECTION 1: STAMMDATEN, SELECTIVE POSITION & ABTEILUNG, ASSIGNED PROJECT */}
                {empCardTab === 'personal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* STEP 1 ONBOARDING: AI DOCUMENT UPLOAD & AUTO-FILL RIGHT IN REGISTRATION FORM */}
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#f0fdf4,#fffbf7)', border: '1.5px solid rgba(16,185,129,0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ padding: 7, borderRadius: 8, background: 'rgba(16,185,129,0.14)', color: '#059669', display: 'flex' }}>
                          <ScanLine size={17} />
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.86rem', color: '#065f46' }}>
                            Schritt 1: Dokumente hochladen &amp; per KI automatisch ins Formular übernehmen
                          </strong>
                          <div style={{ fontSize: '0.73rem', color: '#4b5563' }}>
                            Ausweis, Reisepass, Aufenthaltstitel, Krankenkassenkarte oder Gewerbeanmeldung wählen → KI füllt Name, Adresse, Geburtsdatum, Steuer-ID &amp; IBAN sofort aus.
                          </div>
                        </div>
                      </div>
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                        borderRadius: 8, background: aiDocReading ? '#d1fae5' : '#059669', color: '#fff',
                        cursor: aiDocReading ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, margin: 0
                      }}>
                        {aiDocReading ? <><Sparkles size={14} /> KI liest Dokumente...</> : <><ScanLine size={14} /> Dokumente hochladen &amp; KI-Scan starten</>}
                        <input
                          type="file"
                          multiple
                          accept=".pdf,image/*,.doc,.docx"
                          style={{ display: 'none' }}
                          disabled={aiDocReading}
                          onChange={handleAiDocumentRead}
                        />
                      </label>
                    </div>

                    {aiDocResult && (
                      <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #10b981', fontSize: '0.78rem', color: '#065f46' }}>
                        <strong>✅ KI hat Daten aus «{aiDocResult.fileName}» ins Formular übertragen:</strong>{' '}
                        {Object.entries(aiDocResult.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}

                    {newEmp.attributes?.is_candidate && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.8rem', color: '#1e40af' }}>
                        <strong>IT Project Candidate Profile:</strong> Experience: {newEmp.attributes?.experience_years || '—'} • Skills: {newEmp.attributes?.skills || '—'} • Summary: {newEmp.attributes?.work_history_summary || '—'}. Change Type above to convert this candidate to Employee, Freelancer, or Subunternehmer.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 0.6fr 1fr 1fr 0.9fr', gap: '12px' }}>
                      <div>
                        <label>Personalnummer (Intern)</label>
                        <input
                          value={newEmp.employee_number || ''}
                          onChange={e => setNewEmp({ ...newEmp, employee_number: e.target.value })}
                          placeholder="z.B. BRN-1001"
                          style={{ fontFamily: 'monospace', fontWeight: 700 }}
                        />
                      </div>
                      <div>
                        <label>Anrede (Herr / Frau / Firma) *</label>
                        <select
                          value={newEmp.attributes?.salutation || newEmp.attributes?.anrede || 'Herr'}
                          onChange={e => setEmpAttr('salutation', e.target.value)}
                          style={{ fontWeight: 700 }}
                        >
                          <option value="Herr">Herr</option>
                          <option value="Frau">Frau</option>
                          <option value="Firma">Firma</option>
                        </select>
                      </div>
                      <div>
                        <label>Vorname (First Name) *</label>
                        <input
                          required
                          value={newEmp.first_name}
                          onChange={e => {
                            const val = e.target.value;
                            const autoBruenel = !editingEmpId && (!newEmp.email || newEmp.email === buildBruenelLoginEmail(newEmp.first_name, newEmp.last_name))
                              ? buildBruenelLoginEmail(val, newEmp.last_name)
                              : newEmp.email;
                            setNewEmp({ ...newEmp, first_name: val, email: autoBruenel });
                          }}
                          placeholder="z.B. Lukas"
                        />
                      </div>
                      <div>
                        <label>Nachname (Last Name) *</label>
                        <input
                          required
                          value={newEmp.last_name}
                          onChange={e => {
                            const val = e.target.value;
                            const autoBruenel = !editingEmpId && (!newEmp.email || newEmp.email === buildBruenelLoginEmail(newEmp.first_name, newEmp.last_name))
                              ? buildBruenelLoginEmail(newEmp.first_name, val)
                              : newEmp.email;
                            setNewEmp({ ...newEmp, last_name: val, email: autoBruenel });
                          }}
                          placeholder="z.B. Weber"
                        />
                      </div>
                      <div>
                        <label>Geburtsdatum (Birth Date)</label>
                        <DateInput value={newEmp.attributes?.birth_date || ''} onChange={e => setEmpAttr('birth_date', e.target.value)} />
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.15fr 0.9fr 0.8fr', gap: '12px' }}>
                      <div>
                        <div className="flex-between" style={{ marginBottom: 4 }}>
                          <label style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>E-Mail (Portal-Login @bruenel.de) *</label>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ padding: '1px 7px', fontSize: '0.68rem', color: '#FF6B00', borderColor: '#fed7aa', background: '#fff7ed', fontWeight: 700 }}
                            onClick={() => {
                              const gen = buildBruenelLoginEmail(newEmp.first_name, newEmp.last_name);
                              if (gen) setNewEmp({ ...newEmp, email: gen });
                            }}
                            title="Automatisch vorname.nachname@bruenel.de aus Vor- und Nachname generieren"
                          >
                            ✨ @bruenel.de
                          </button>
                        </div>
                        <input
                          type="email"
                          required
                          value={newEmp.email}
                          onChange={e => setNewEmp({ ...newEmp, email: e.target.value })}
                          onBlur={e => {
                            const v = e.target.value.trim().toLowerCase();
                            if (v && !v.includes('@')) {
                              setNewEmp(prev => ({ ...prev, email: `${v}@bruenel.de` }));
                            }
                          }}
                          placeholder="vorname.nachname@bruenel.de"
                          style={{ fontFamily: 'monospace', fontWeight: 700, background: '#f8fafc' }}
                        />
                        <div style={{ marginTop: 3, fontSize: '0.68rem', color: '#64748b' }}>
                          🔑 Nur Benutzername für Panel-Login (kein E-Mail-Versand an @bruenel.de)
                        </div>
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
                        <label style={{ fontWeight: 700, color: '#047857' }}>Private E-Mail (Onboarding &amp; Kontakt) *</label>
                        <input
                          type="email"
                          value={newEmp.attributes?.private_email || ''}
                          onChange={e => setEmpAttr('private_email', e.target.value)}
                          placeholder="z.B. lukas.weber@gmail.com"
                          style={{ borderColor: '#6ee7b7', background: '#f0fdf4', fontWeight: 600 }}
                        />
                        <div style={{ marginTop: 3, fontSize: '0.68rem', color: '#047857', fontWeight: 600 }}>
                          📧 Empfänger für Willkommens-E-Mail, OTP &amp; HR-Dokumente
                        </div>
                      </div>
                      <div>
                        <label>Telefon / Mobil *</label>
                        <input value={newEmp.phone} onChange={e => setNewEmp({ ...newEmp, phone: e.target.value })} placeholder="+49 172 ..." />
                      </div>
                      <div>
                        <label>Staatsangehörigkeit</label>
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                          <div>
                            <label>Vertrag unterschrieben am</label>
                            <DateInput value={newEmp.attributes?.contract_signed_date || ''} onChange={e => setEmpAttr('contract_signed_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Vertragsbeginn (Start Date)</label>
                            <DateInput value={newEmp.attributes?.contract_start_date || ''} onChange={e => setEmpAttr('contract_start_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Probezeit Ende am</label>
                            <DateInput value={newEmp.attributes?.probezeit_end_date || ''} onChange={e => setEmpAttr('probezeit_end_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Praktikum Von (Start)</label>
                            <DateInput value={newEmp.attributes?.praktikum_start_date || ''} onChange={e => setEmpAttr('praktikum_start_date', e.target.value)} />
                          </div>
                          <div>
                            <label>Praktikum Bis (Ende)</label>
                            <DateInput value={newEmp.attributes?.praktikum_end_date || ''} onChange={e => setEmpAttr('praktikum_end_date', e.target.value)} />
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

                        {editingEmpId && (
                          <div className="flex-between" style={{ padding: '10px 14px', borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ fontSize: 12, color: '#9a3412' }}>
                              <strong>Vertragsgenerator (5 Vertragsmodule inkl. Pflicht-DSGVO):</strong> Arbeitsvertrag, Kfz-Übergabe, Orientierungspraktikum oder Werkvertrag direkt mit diesen Konditionen ausstellen.
                            </div>
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={(ev) => handleSaveEmployeeCard(ev, true)}
                            >
                              <FileText size={13} /> Speichern & Vertrag im Generator ausstellen →
                            </button>
                          </div>
                        )}
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
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>
                                  <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    style={{ width: '16px', height: '16px', flexShrink: 0, margin: 0, padding: 0 }}
                                    onChange={(ev) => {
                                      if (ev.target.checked) {
                                        setSelectedDocIds(Array.from(new Set([...selectedDocIds, ...filteredEmpDocs.map(d => d.id)])));
                                      } else {
                                        const visibleSet = new Set(filteredEmpDocs.map(d => d.id));
                                        setSelectedDocIds(selectedDocIds.filter(id => !visibleSet.has(id)));
                                      }
                                    }}
                                  />
                                  <span>Alle auswählen ({selectedDocIds.length})</span>
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

                              {/* Animated Expanding Document Title List */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {filteredEmpDocs.map(doc => {
                                  const fileUrl = doc.url || doc.download_url || doc.file_url;
                                  const isEditingThis = editingDocId === doc.id;
                                  const ext = (doc.file_name || '').split('.').pop()?.toUpperCase() || 'FILE';
                                  const isChecked = selectedDocIds.includes(doc.id);
                                  const isPayslipDoc = (doc.effectiveKind || '').toLowerCase().includes('lohnabrechnung') || doc.reference_type === 'Lohnabrechnung';
                                  const isDocOpen = isEditingThis || Boolean(expandedDocMap[doc.id]);
                                  return (
                                    <div
                                      key={doc.id}
                                      style={{
                                        borderRadius: '8px',
                                        background: isChecked ? '#fff7ed' : '#ffffff',
                                        border: isChecked ? '1.5px solid var(--accent)' : '1px solid #e2e8f0',
                                        overflow: 'hidden',
                                        fontSize: '0.8rem',
                                      }}
                                    >
                                      {/* Minimal Title Row (Click to Expand) */}
                                      <div
                                        onClick={() => setExpandedDocMap(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                                        style={{
                                          padding: '9px 12px',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          gap: '10px',
                                          cursor: 'pointer',
                                          background: isDocOpen ? '#f8fafc' : 'transparent',
                                          borderBottom: isDocOpen ? '1px solid #e2e8f0' : '1px solid transparent',
                                          transition: 'background 0.18s ease, border-color 0.18s ease',
                                          userSelect: 'none',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onClick={(ev) => ev.stopPropagation()}
                                            onChange={(ev) => {
                                              if (ev.target.checked) setSelectedDocIds(prev => [...prev, doc.id]);
                                              else setSelectedDocIds(prev => prev.filter(id => id !== doc.id));
                                            }}
                                            style={{ width: '15px', height: '15px', flexShrink: 0, margin: 0, padding: 0 }}
                                          />
                                          <FileText size={15} style={{ color: isPayslipDoc ? '#059669' : '#FF6B00', flexShrink: 0 }} />
                                          <strong style={{ fontSize: '0.84rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {doc.title || doc.file_name || 'Dokument'}
                                          </strong>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 999, background: isPayslipDoc ? '#d1fae5' : '#fff7ed', color: isPayslipDoc ? '#065f46' : '#c2410c', fontWeight: 700 }}>
                                            {doc.effectiveKind}
                                          </span>
                                          {doc.effectiveDate && (
                                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                              {formatDate(doc.effectiveDate)}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Smooth Animated Expandable Details */}
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateRows: isDocOpen ? '1fr' : '0fr',
                                          opacity: isDocOpen ? 1 : 0,
                                          transition: 'grid-template-rows 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
                                        }}
                                      >
                                        <div style={{ overflow: 'hidden', minHeight: 0 }}>
                                          <div style={{ padding: '10px 14px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                                              {isEditingThis && (
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
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
                                              )}
                                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.73rem', color: '#475569' }}>
                                                <span style={{ padding: '1px 6px', borderRadius: 4, background: '#e2e8f0', color: '#334155', fontWeight: 700 }}>{ext}</span>
                                                {doc.file_name && <span>Datei: <strong>{doc.file_name}</strong></span>}
                                                {doc.file_size ? <span>Größe: <strong>{(doc.file_size / 1024).toFixed(1)} KB</strong></span> : null}
                                                <span>Quelle: <strong>{doc.uploaded_by === 'Mitarbeiter' ? 'Mitarbeiter' : 'Management'}</strong></span>
                                                {(doc.status === 'Pending_Signature' || doc.employee_visible === false || doc.visibility === 'admin_only') && (
                                                  <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
                                                    ⏳ Ausstehend (Nur HR)
                                                  </span>
                                                )}
                                                {doc.status === 'Signed' && (
                                                  <span style={{ padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                                    ✓ Unterschrieben
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                                              {doc.html_content ? (
                                                <button
                                                  type="button"
                                                  className="btn-secondary btn-sm"
                                                  style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px' }}
                                                  onClick={() => downloadSingleContractPdf(doc.title, doc.html_content)}
                                                >
                                                  <Download size={13} /> Als PDF
                                                </button>
                                              ) : fileUrl ? (
                                                <a href={resolveMediaUrl(fileUrl)} target="_blank" rel="noreferrer" download={doc.file_name || true} className="btn-secondary btn-sm" style={{ textDecoration: 'none', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px' }}>
                                                  <Download size={13} /> Download
                                                </a>
                                              ) : null}
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
                                                  <Edit3 size={13} /> Bearbeiten
                                                </button>
                                              )}
                                              <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }} onClick={() => handleDeleteEmpDocument(doc.id)}>
                                                <Trash2 size={13} /> Löschen
                                              </button>
                                            </div>
                                          </div>
                                        </div>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem' }}>Portal-Login Benutzername (@bruenel.de — Kein E-Mail-Versand)</label>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace', padding: '8px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)' }}>{newEmp.email || '—'}</div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: '#047857' }}>Private E-Mail-Adresse (Für Onboarding &amp; E-Mail-Versand)</label>
                          <div style={{ fontWeight: 700, padding: '8px', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46' }}>{newEmp.attributes?.private_email || '— (Bitte in Tab 1 eintragen)'}</div>
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
                )}

                {/* SECTION 8: ARBEITSZEITEN & ÜBERSTUNDEN (PER EMPLOYEE — MONTHS ACCORDION + CALENDAR + 1-CLICK APPROVE) */}
                {editingEmpId && empCardTab === 'hours' && (() => {
                  const empPendingAll = empLogsAll.filter((l) => l.status !== 'Approved' && Boolean(l.check_out_time));
                  const empApprovedHoursAll = empLogsAll
                    .filter((l) => l.status === 'Approved')
                    .reduce((s, l) => s + Number(l.net_hours ?? l.total_hours ?? 0), 0);

                  // Group logs by YYYY-MM descending
                  const monthGroupsMap = new Map();
                  for (const l of empLogsAll) {
                    const mKey = String(l.date || '').slice(0, 7) || 'Unbekannt';
                    if (!monthGroupsMap.has(mKey)) monthGroupsMap.set(mKey, []);
                    monthGroupsMap.get(mKey).push(l);
                  }
                  const monthGroups = Array.from(monthGroupsMap.entries())
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([mKey, logs]) => {
                      const sortedLogs = [...logs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
                      const totalH = sortedLogs.reduce((s, x) => s + Number(x.net_hours ?? x.total_hours ?? 0), 0);
                      const pendingCount = sortedLogs.filter((x) => x.status !== 'Approved' && Boolean(x.check_out_time)).length;
                      let label = mKey;
                      if (/^\d{4}-\d{2}$/.test(mKey)) {
                        const [yy, mm] = mKey.split('-').map(Number);
                        label = new Date(yy, mm - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
                      }
                      return { mKey, label, logs: sortedLogs, totalH, pendingCount };
                    });

                  // Calendar grid data for hoursCalMonth
                  const [calY, calM] = (/^\d{4}-\d{2}$/.test(hoursCalMonth) ? hoursCalMonth : new Date().toISOString().slice(0, 7)).split('-').map(Number);
                  const calFirstDay = new Date(calY, calM - 1, 1);
                  const calDaysInMonth = new Date(calY, calM, 0).getDate();
                  const calStartOffset = (calFirstDay.getDay() + 6) % 7; // Monday = 0
                  const calTitle = calFirstDay.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
                  const shiftCalMonth = (delta) => {
                    const d = new Date(calY, calM - 1 + delta, 1);
                    setHoursCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  };

                  return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* KPI Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                      {[
                        { label: `Stunden (${biMonth})`, val: `${empMonthHours.toFixed(1)} h`, sub: `Soll: ${empQuotaHours} h` },
                        { label: 'Überstunden (Monat)', val: `${empOvertimeHours} h`, sub: `Satz: ${formatEuro(newEmp.attributes?.overtime_rate || 28.5)}/h`, color: empOvertimeHours > 0 ? '#ea580c' : '#0f172a' },
                        { label: 'Freigegeben (Gesamt)', val: `${empApprovedHoursAll.toFixed(1)} h`, sub: `${empLogsAll.length - empPendingAll.length} Schichten`, color: '#15803d' },
                        { label: 'Offen zur Freigabe', val: `${empPendingAll.length}`, sub: empPendingAll.length > 0 ? 'Klick zum Freigeben' : 'Alles freigegeben', color: empPendingAll.length > 0 ? '#b45309' : '#15803d' },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{k.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: k.color || '#0f172a', marginTop: 2 }}>{k.val}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{k.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Action Bar: View Switcher (Monatsliste / Kalender) + One-Click Approve All Pending */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div className="hr-seg">
                        <button
                          type="button"
                          className={empHoursViewMode === 'months' ? 'active' : ''}
                          onClick={() => setEmpHoursViewMode('months')}
                        >
                          Monatsliste ({monthGroups.length})
                        </button>
                        <button
                          type="button"
                          className={empHoursViewMode === 'calendar' ? 'active' : ''}
                          onClick={() => setEmpHoursViewMode('calendar')}
                        >
                          Kalenderansicht
                        </button>
                      </div>

                      {empPendingAll.length > 0 && (
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={approvingAllEmpId === editingEmpId}
                          onClick={() => handleApproveAllEmployeeHours(editingEmpId)}
                          style={{ background: '#059669', borderColor: '#047857', fontWeight: 700 }}
                        >
                          <Check size={13} />{' '}
                          {approvingAllEmpId === editingEmpId
                            ? 'Wird freigegeben…'
                            : `Alle offenen Stunden freigeben (${empPendingAll.length})`}
                        </button>
                      )}
                    </div>

                    {/* Inline Quick-Add Working Hours for this Employee */}
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 0.8fr 0.7fr 1.2fr auto', gap: 8, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 11 }}>Datum</label>
                        <DateInput value={manualTimeForm.date} onChange={(e) => setManualTimeForm({ ...manualTimeForm, date: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11 }}>Projekt</label>
                        <select value={manualTimeForm.project_id} onChange={(e) => setManualTimeForm({ ...manualTimeForm, project_id: e.target.value })}>
                          <option value="">— Allgemein —</option>
                          {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11 }}>Start</label>
                        <TimeInput value={manualTimeForm.check_in_time} onChange={(e) => setManualTimeForm({ ...manualTimeForm, check_in_time: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11 }}>Ende</label>
                        <TimeInput value={manualTimeForm.check_out_time} onChange={(e) => setManualTimeForm({ ...manualTimeForm, check_out_time: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11 }}>Pause (m)</label>
                        <input type="number" min="0" value={manualTimeForm.break_minutes} onChange={(e) => setManualTimeForm({ ...manualTimeForm, break_minutes: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11 }}>Notiz / Tätigkeit</label>
                        <input placeholder="z.B. Montage / Spleißen..." value={manualTimeForm.notes} onChange={(e) => setManualTimeForm({ ...manualTimeForm, notes: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        style={{ height: 36 }}
                        onClick={async () => {
                          try {
                            await fetchWithToken('/api/v1/hr/time-logs/manual', {
                              method: 'POST',
                              body: JSON.stringify({
                                employee_id: editingEmpId,
                                project_id: manualTimeForm.project_id || null,
                                date: manualTimeForm.date,
                                check_in_time: manualTimeForm.check_in_time,
                                check_out_time: manualTimeForm.check_out_time,
                                break_minutes: parseInt(manualTimeForm.break_minutes || 0, 10),
                                status: 'Approved',
                                notes: manualTimeForm.notes,
                              }),
                            });
                            loadAll();
                          } catch (err) { alert(err.message); }
                        }}
                      >
                        <Plus size={13} /> Buchen
                      </button>
                    </div>

                    {/* VIEW 1: MONTHS ACCORDION WITH SMOOTH ANIMATION */}
                    {empHoursViewMode === 'months' && (
                      monthGroups.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: 10, fontSize: 12.5 }}>
                          Noch keine Arbeitszeiten für diesen Mitarbeiter erfasst.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {monthGroups.map((mg) => {
                            const key = `${editingEmpId}_${mg.mKey}`;
                            const isOpen = expandedHoursMonthMap[key] !== undefined
                              ? Boolean(expandedHoursMonthMap[key])
                              : mg.pendingCount > 0 || mg.mKey === biMonth;
                            return (
                              <div key={mg.mKey} style={{ border: `1px solid ${mg.pendingCount > 0 ? '#fcd34d' : '#e2e8f0'}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                <div
                                  onClick={() => setExpandedHoursMonthMap((prev) => ({ ...prev, [key]: !isOpen }))}
                                  style={{
                                    padding: '8px 12px',
                                    background: isOpen ? '#f8fafc' : '#fff',
                                    borderBottom: isOpen ? '1px solid #e2e8f0' : '1px solid transparent',
                                    transition: 'background 0.2s ease, border-color 0.2s ease',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 8,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <strong style={{ fontSize: 13, color: '#0f172a', textTransform: 'capitalize' }}>{mg.label}</strong>
                                    <span style={{ fontSize: 11.5, color: '#64748b' }}>
                                      {mg.logs.length} Schichten · <strong style={{ color: '#0f172a' }}>{mg.totalH.toFixed(1)} h</strong>
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                                    {mg.pendingCount > 0 ? (
                                      <>
                                        <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 700 }}>
                                          {mg.pendingCount} offen
                                        </span>
                                        <button
                                          type="button"
                                          className="btn-primary btn-sm"
                                          style={{ fontSize: 11, padding: '3px 8px', background: '#059669', borderColor: '#047857' }}
                                          disabled={approvingAllEmpId === editingEmpId}
                                          onClick={() => handleApproveAllEmployeeHours(editingEmpId, mg.mKey)}
                                        >
                                          <Check size={11} /> Monat freigeben
                                        </button>
                                      </>
                                    ) : (
                                      <span style={{ padding: '2px 8px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700 }}>
                                        ✓ Freigegeben
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Smooth Animated Expandable Month Details */}
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                                    opacity: isOpen ? 1 : 0,
                                    transition: 'grid-template-rows 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
                                  }}
                                >
                                  <div style={{ overflow: 'hidden', minHeight: 0 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                      <thead>
                                        <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>
                                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Datum</th>
                                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Projekt</th>
                                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Start – Ende</th>
                                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Pause</th>
                                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Netto</th>
                                          <th style={{ padding: '6px 10px', textAlign: 'left' }}>Status</th>
                                          <th style={{ padding: '6px 10px', textAlign: 'right' }}>Aktion</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {mg.logs.map(renderEditableTimeLogRow)}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}

                    {/* VIEW 2: EMPLOYEE MONTHLY CALENDAR VIEW */}
                    {empHoursViewMode === 'calendar' && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff', animation: 'hrTabFade 0.2s ease' }}>
                        <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => shiftCalMonth(-1)}>
                            <ChevronLeft size={14} />
                          </button>
                          <strong style={{ fontSize: 13.5, color: '#0f172a', textTransform: 'capitalize' }}>{calTitle}</strong>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => shiftCalMonth(1)}>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: 10.5, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>
                          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
                            <div key={d} style={{ padding: '6px 4px' }}>{d}</div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                          {Array.from({ length: calStartOffset }).map((_, idx) => (
                            <div key={`empty-${idx}`} style={{ minHeight: 68, background: '#fafafa', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }} />
                          ))}
                          {Array.from({ length: calDaysInMonth }).map((_, idx) => {
                            const dayNum = idx + 1;
                            const isoDay = `${calY}-${String(calM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                            const dayLogs = empLogsAll.filter((l) => String(l.date || '').slice(0, 10) === isoDay);
                            const dayHours = dayLogs.reduce((s, l) => s + Number(l.net_hours ?? l.total_hours ?? 0), 0);
                            const hasPending = dayLogs.some((l) => l.status !== 'Approved');
                            const hasLeave = empLeavesAll.some((lv) => lv.status === 'Approved' && isoDay >= lv.start_date && isoDay <= lv.end_date);
                            const hasSick = empSicknessAll.some((sk) => isoDay >= sk.start_date && isoDay <= sk.end_date);
                            return (
                              <div
                                key={isoDay}
                                style={{
                                  minHeight: 68,
                                  padding: 6,
                                  borderRight: '1px solid #f1f5f9',
                                  borderBottom: '1px solid #f1f5f9',
                                  background: hasSick ? '#fef2f2' : hasLeave ? '#fefce8' : dayLogs.length > 0 ? (hasPending ? '#fff7ed' : '#f0fdf4') : '#fff',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{dayNum}</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  {dayLogs.length > 0 && (
                                    <span style={{ fontSize: 10.5, fontWeight: 800, color: hasPending ? '#c2410c' : '#15803d' }}>
                                      {dayHours.toFixed(1)}h {hasPending ? '⏳' : '✓'}
                                    </span>
                                  )}
                                  {hasLeave && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a16207' }}>Urlaub</span>}
                                  {hasSick && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#dc2626' }}>Krank</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* SECTION 9: KRANKHEIT (AU) & URLAUB (PER EMPLOYEE) */}
                {editingEmpId && empCardTab === 'absence' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {/* Left: Krankmeldung (AU) */}
                      <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <strong style={{ fontSize: 13, color: '#991b1b' }}>🏥 Krankmeldung (AU) für {newEmp.first_name} erfassen</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div><label style={{ fontSize: 11 }}>Von</label><DateInput value={newSickForm.start_date} onChange={(e) => setNewSickForm({ ...newSickForm, start_date: e.target.value })} /></div>
                          <div><label style={{ fontSize: 11 }}>Bis</label><DateInput value={newSickForm.end_date} onChange={(e) => setNewSickForm({ ...newSickForm, end_date: e.target.value })} /></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                          <div><label style={{ fontSize: 11 }}>Notiz / Diagnose</label><input placeholder="Arzt / AU..." value={newSickForm.symptoms_note} onChange={(e) => setNewSickForm({ ...newSickForm, symptoms_note: e.target.value })} /></div>
                          <div><label style={{ fontSize: 11 }}>AU-Attest (PDF/Foto)</label><input type="file" accept=".pdf,image/*" onChange={(e) => setSickAuFile(e.target.files?.[0] || null)} /></div>
                          <button type="button" className="btn-primary btn-sm" style={{ height: 36 }} onClick={async () => {
                            try {
                              let docId = null;
                              if (sickAuFile) {
                                const up = await uploadMediaFile({ file: sickAuFile, referenceType: 'SicknessAU', referenceId: editingEmpId, employeeId: editingEmpId, title: `AU ${newSickForm.start_date}` });
                                docId = up.document_id;
                              }
                              await fetchWithToken('/api/v1/hr/sickness', {
                                method: 'POST',
                                body: JSON.stringify({ employee_id: editingEmpId, start_date: newSickForm.start_date, end_date: newSickForm.end_date, doctor_visited: true, symptoms_note: newSickForm.symptoms_note, au_document_id: docId }),
                              });
                              setSickAuFile(null);
                              loadAll();
                            } catch (err) { alert(err.message); }
                          }}><Plus size={13} /> AU speichern</button>
                        </div>
                      </div>

                      {/* Right: Urlaub */}
                      <div style={{ padding: 12, borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <strong style={{ fontSize: 13, color: '#166534' }}>🌴 Urlaub für {newEmp.first_name} eintragen (Anspruch: {newEmp.annual_leave_days || 28} Tage)</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 11 }}>Art</label>
                            <select value={newLeaveForm.type} onChange={(e) => setNewLeaveForm({ ...newLeaveForm, type: e.target.value })}>
                              <option value="Annual Leave">Erholungsurlaub</option>
                              <option value="Special Leave">Sonderurlaub</option>
                              <option value="Unpaid Leave">Unbezahlt</option>
                            </select>
                          </div>
                          <div><label style={{ fontSize: 11 }}>Von</label><DateInput value={newLeaveForm.start_date} onChange={(e) => setNewLeaveForm({ ...newLeaveForm, start_date: e.target.value })} /></div>
                          <div><label style={{ fontSize: 11 }}>Bis</label><DateInput value={newLeaveForm.end_date} onChange={(e) => setNewLeaveForm({ ...newLeaveForm, end_date: e.target.value })} /></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                          <div><label style={{ fontSize: 11 }}>Grund / Notiz</label><input placeholder="Sommerurlaub..." value={newLeaveForm.reason} onChange={(e) => setNewLeaveForm({ ...newLeaveForm, reason: e.target.value })} /></div>
                          <button type="button" className="btn-primary btn-sm" style={{ height: 36 }} onClick={async () => {
                            try {
                              await fetchWithToken('/api/v1/hr/leave-requests', {
                                method: 'POST',
                                body: JSON.stringify({ employee_id: editingEmpId, type: newLeaveForm.type, start_date: newLeaveForm.start_date, end_date: newLeaveForm.end_date, reason: newLeaveForm.reason, status: 'Approved' }),
                              });
                              loadAll();
                            } catch (err) { alert(err.message); }
                          }}><Plus size={13} /> Urlaub buchen</button>
                        </div>
                      </div>
                    </div>

                    {/* Tables: Sickness & Leaves */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 12 }}>Krankmeldungen (AU) ({empSicknessAll.length})</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <tbody>
                            {empSicknessAll.length === 0 ? (
                              <tr><td style={{ padding: 14, color: '#64748b' }}>Keine Krankmeldungen vorhanden.</td></tr>
                            ) : empSicknessAll.map((s) => (
                              <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{formatDate(s.start_date)} – {formatDate(s.end_date)}</td>
                                <td style={{ padding: '8px 10px' }}>{s.symptoms_note || '—'}</td>
                                <td style={{ padding: '8px 10px' }}>{s.au_document_url ? <a href={resolveMediaUrl(s.au_document_url)} target="_blank" rel="noreferrer" style={{ color: '#FF6B00', fontWeight: 700 }}>AU PDF</a> : '—'}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteSickness(s.id)}><Trash2 size={12} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 12 }}>Urlaub & Abwesenheit ({empLeavesAll.length})</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <tbody>
                            {empLeavesAll.length === 0 ? (
                              <tr><td style={{ padding: 14, color: '#64748b' }}>Keine Urlaubsanträge vorhanden.</td></tr>
                            ) : empLeavesAll.map((lv) => (
                              <tr key={lv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{formatDate(lv.start_date)} – {formatDate(lv.end_date)}</td>
                                <td style={{ padding: '8px 10px' }}>{lv.type}</td>
                                <td style={{ padding: '8px 10px' }}><span className="badge">{lv.status}</span></td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  <button type="button" className="btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteLeave(lv.id)}><Trash2 size={12} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 10: LOHNABRECHNUNG (PER EMPLOYEE) */}
                {editingEmpId && empCardTab === 'payslips' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ padding: 12, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <strong style={{ fontSize: 13, color: '#065f46' }}>💰 Monatliche Lohnabrechnung (PDF) für {newEmp.first_name} {newEmp.last_name} hochladen</strong>
                        <div style={{ fontSize: 11.5, color: '#047857' }}>Erscheint sofort in der Akte und im Mitarbeiter-Portal zum PDF-Download.</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ fontSize: 11 }}>Monat & Jahr</label>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select value={docPayslipMonth} onChange={(e) => setDocPayslipMonth(e.target.value)} style={{ width: 'auto', fontWeight: 700 }}>
                              {MONTH_OPTIONS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                            </select>
                            <select value={docPayslipYear} onChange={(e) => setDocPayslipYear(e.target.value)} style={{ width: 85, fontWeight: 700 }}>
                              {YEAR_OPTIONS.map((yr) => (<option key={yr} value={yr}>{yr}</option>))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11 }}>Notiz (Optional)</label>
                          <input placeholder="z.B. inkl. Prämie" value={customDocLabel} onChange={(e) => setCustomDocLabel(e.target.value)} style={{ width: 150 }} />
                        </div>
                        <label className="btn-primary btn-sm" style={{ cursor: 'pointer', height: 36, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Upload size={13} /> {uploadingEmpDoc ? 'Lädt hoch...' : `PDF wählen & bereitstellen (${docPayslipMonth}/${docPayslipYear})`}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            style={{ display: 'none' }}
                            onChange={async (ev) => {
                              const files = Array.from(ev.target.files || []);
                              if (!files.length) return;
                              setDocCategory('Lohnabrechnung');
                              await executeDocUpload(editingEmpId, files);
                              ev.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', color: '#475569', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Zeitraum</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Bezeichnung</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Brutto / Grundgehalt</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Datum</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>PDF / Aktion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empPayslipsAll.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Noch keine Lohnabrechnungen für diesen Mitarbeiter hinterlegt.</td></tr>
                          ) : empPayslipsAll.map((sl) => (
                            <tr key={`${sl.source}-${sl.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 800, color: '#047857' }}>{sl.period}</td>
                              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{sl.title}</td>
                              <td style={{ padding: '8px 10px' }}>{formatEuro(sl.gross || newEmp.base_salary || 0)}</td>
                              <td style={{ padding: '8px 10px' }}>{formatDate(sl.date)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  {sl.url && (
                                    <a href={resolveMediaUrl(sl.url)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ textDecoration: 'none', color: '#FF6B00', fontWeight: 700 }}>
                                      <Download size={12} /> PDF öffnen
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    style={{ color: '#dc2626' }}
                                    onClick={() => sl.source === 'payslip' ? handleDeletePayslip(sl.id) : handleDeleteEmpDocument(sl.id)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}              </div>

              {/* Minimal Step Footer */}
              <div className="flex-between" style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={requestCloseEmpModal}>
                    Abbrechen
                  </button>
                  <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                    Schritt {currentTabIdx + 1} / {modalTabs.length}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {currentTabIdx > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setEmpCardTab(modalTabs[currentTabIdx - 1].id)}
                    >
                      <ArrowLeft size={14} /> Zurück
                    </button>
                  )}
                  {editingEmpId && (
                    <button type="submit" className={isLastTab ? 'btn-secondary' : 'btn-primary'}>
                      <Check size={14} /> Änderungen speichern
                    </button>
                  )}
                  {!isLastTab ? (
                    <button
                      type="button"
                      className={editingEmpId ? 'btn-secondary' : 'btn-primary'}
                      onClick={() => setEmpCardTab(modalTabs[currentTabIdx + 1].id)}
                    >
                      Weiter <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={(ev) => handleSaveEmployeeCard(ev, true)}
                    >
                      <FileText size={14} /> {editingEmpId ? 'Speichern & Vertrag generieren →' : 'Mitarbeiter anlegen & Vertrag generieren →'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {showAddEmp && showUnsavedPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10060,
            background: 'rgba(15, 23, 42, 0.62)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowUnsavedPrompt(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.32)',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <strong style={{ fontSize: 15.5, color: '#0f172a' }}>Ungespeicherte Änderungen</strong>
              <button
                type="button"
                onClick={() => setShowUnsavedPrompt(false)}
                style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 4 }}
                title="Zurück zum Formular"
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Sie haben Änderungen in der Personalakte vorgenommen. Möchten Sie diese jetzt speichern/aktualisieren oder verwerfen?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowUnsavedPrompt(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                onClick={() => {
                  setEmpFormDirty(false);
                  setShowUnsavedPrompt(false);
                  setShowAddEmp(false);
                }}
              >
                Verwerfen
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={(ev) => {
                  setShowUnsavedPrompt(false);
                  handleSaveEmployeeCard(ev, false);
                }}
              >
                <Check size={14} /> Änderungen speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          AI DOCUMENT READER: LOADING POPUP + REVIEW & EDIT POPUP
         ===================================================================== */}
      {aiDocReading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#ffffff',
              borderRadius: 14,
              padding: '26px 24px',
              textAlign: 'center',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.3)',
              border: '1px solid #e2e8f0',
              animation: 'hrModalIn 0.2s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                margin: '0 auto 14px',
                borderRadius: 999,
                border: '3px solid #fed7aa',
                borderTopColor: '#FF6B00',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
              KI liest Dokumente…
            </div>
            <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
              Dokumente werden hochgeladen und automatisch ausgelesen:
            </div>
            {aiReadingFiles.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11.5, color: '#334155', fontWeight: 600 }}>
                {aiReadingFiles.join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {aiReviewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setAiReviewModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 780,
              maxHeight: '88vh',
              background: '#ffffff',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(15, 23, 42, 0.32)',
              border: '1px solid #e2e8f0',
              animation: 'hrModalIn 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Sparkles size={16} style={{ color: '#059669' }} />
                  KI-Ergebnis prüfen &amp; übernehmen
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Datei(en): {(aiReviewModal.fileNames || []).join(', ')} — Bitte prüfen oder korrigieren Sie die Felder vor der Übernahme.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiReviewModal(null)}
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {aiDocError && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 12 }}>
                  ⚠️ KI-Hinweis: {aiDocError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10 }}>
                {[
                  { key: 'first_name', label: 'Vorname' },
                  { key: 'last_name', label: 'Nachname' },
                  { key: 'gender', label: 'Geschlecht (m/w)' },
                  { key: 'birth_date', label: 'Geburtsdatum (YYYY-MM-DD)' },
                  { key: 'nationality', label: 'Staatsangehörigkeit' },
                  { key: 'phone', label: 'Telefon' },
                  { key: 'email', label: 'E-Mail' },
                  { key: 'role', label: 'Position / Beruf' },
                  { key: 'street', label: 'Straße & Hausnr.' },
                  { key: 'postal_code', label: 'PLZ' },
                  { key: 'city', label: 'Ort / Stadt' },
                  { key: 'steuer_id', label: 'Steuer-ID' },
                  { key: 'sozialversicherungsnummer', label: 'SV-Nummer' },
                  { key: 'krankenversicherung_name', label: 'Krankenkasse' },
                  { key: 'krankenversicherung_nummer', label: 'KV-Nummer' },
                  { key: 'iban', label: 'IBAN' },
                  { key: 'bic', label: 'BIC' },
                  { key: 'bank_name', label: 'Bankname' },
                  { key: 'document_type', label: 'Ausweistyp' },
                  { key: 'document_number', label: 'Ausweisnummer' },
                  { key: 'document_valid_until', label: 'Gültig bis (YYYY-MM-DD)' },
                  { key: 'drivers_license', label: 'Führerschein' },
                  { key: 'company_name', label: 'Firmenname (Sub)' },
                  { key: 'ust_id', label: 'USt-IdNr.' },
                  { key: 'steuernummer', label: 'Steuernummer' },
                ].map((f) => {
                  const val = aiReviewModal.fields?.[f.key] || '';
                  return (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: val ? '#065f46' : '#64748b', display: 'block', marginBottom: 3 }}>
                        {f.label}
                      </label>
                      <input
                        value={val}
                        onChange={(ev) =>
                          setAiReviewModal((prev) => ({
                            ...prev,
                            fields: { ...(prev?.fields || {}), [f.key]: ev.target.value },
                          }))
                        }
                        style={{
                          fontSize: 12.5,
                          padding: '6px 9px',
                          borderRadius: 7,
                          border: val ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                          background: val ? '#f0fdf4' : '#ffffff',
                          width: '100%',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setAiReviewModal(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn-primary" onClick={applyAiReviewedFields}>
                <Check size={14} /> Daten übernehmen &amp; Formular ausfüllen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {tab === 'contracts' && (
        <HRContractGeneratorView
          employees={employees}
          preselectedEmpId={contractGenEmpId}
          initialEmpId={contractGenEmpId}
          onReload={loadAll}
          onRefreshEmployees={loadAll}
          onOpenEmployeeModal={(emp) => openEditEmployeeModal(emp)}
          onOpenEmployee={(emp) => openEditEmployeeModal(emp)}
          onOpenCreateEmployeeModal={openCreateEmployeeModal}
        />
      )}

      {/* Unified Modern & Minimal Employees View (Overview + Directory) */}
      {(tab === 'employees' || tab === 'overview' || tab === 'documents' || !tab) && (() => {
        const monthHours = {};
        timeLogs.forEach((l) => {
          if (!l.employee_id || !String(l.date || '').startsWith(biMonth)) return;
          monthHours[l.employee_id] = (monthHours[l.employee_id] || 0) + Number(l.net_hours || 0);
        });
        const totalMonthHrsAll = Object.values(monthHours).reduce((a, b) => a + b, 0);
        const activeEmpCount = employees.filter((e) => e.is_active !== false).length;
        const totalDocsCount = employees.reduce((acc, e) => acc + ((e.documents || []).length), 0);
        const pendingLeavesCount = leaves.filter((l) => l.status === 'Pending').length;
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Minimal Overview KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {[
                { label: 'Mitarbeiter Gesamt', val: employees.length, sub: `${activeEmpCount} aktiv`, accent: '#0f172a' },
                { label: `Arbeitsstunden (${biMonth})`, val: `${totalMonthHrsAll.toFixed(1)} h`, sub: 'Erfasste Netto-Stunden', accent: '#FF6B00' },
                { label: 'Offene Urlaubsanträge', val: pendingLeavesCount, sub: `${sickness.length} Krankmeldungen`, accent: pendingLeavesCount > 0 ? '#ca8a04' : '#16a34a' },
                { label: 'Personalakten-Dokumente', val: totalDocsCount, sub: 'Klick auf Mitarbeiter → Akte', accent: '#1d4ed8' },
              ].map((k, idx) => (
                <div key={idx} style={{ padding: '10px 14px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${k.accent}` }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div className="glass-panel" style={{ padding: 0, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...sel, minWidth: 230, flex: '1 1 230px', maxWidth: 320 }} />
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
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setQ(''); setTypeFilter('All'); setRoleFilter('All'); setEmpSortBy('name'); setEmpSortDir('asc'); }}>Reset</button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                style={{
                  marginLeft: 'auto',
                  borderColor: showRecycleBin ? '#f97316' : undefined,
                  background: showRecycleBin ? '#fff7ed' : undefined,
                  color: showRecycleBin ? '#c2410c' : undefined,
                }}
                onClick={() => setShowRecycleBin((v) => !v)}
                title="Gelöschte Mitarbeiter & Personalakten im Papierkorb anzeigen"
              >
                <Trash2 size={13} /> Papierkorb ({recycledEmployees.length})
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => downloadCsv({
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
            {showRecycleBin && (
              <div style={{ padding: '14px 16px', background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 13.5, color: '#9a3412' }}>Papierkorb — Gespeicherte gelöschte Mitarbeiter ({recycledEmployees.length})</strong>
                    <div style={{ fontSize: 11.5, color: '#c2410c' }}>
                      Mitarbeiter und alle zugehörigen Daten (Arbeitszeiten, Urlaub, Dokumente, Verträge) werden niemals endgültig gelöscht und können hier wiederhergestellt werden.
                    </div>
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setShowRecycleBin(false)}>
                    Schließen
                  </button>
                </div>
                {recycledEmployees.length === 0 ? (
                  <div style={{ padding: '14px 12px', borderRadius: 8, background: '#fff', border: '1px dashed #fdba74', color: '#9a3412', fontSize: 12.5 }}>
                    Der Papierkorb ist leer.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
                    {recycledEmployees.map((re) => (
                      <div key={re.id} style={{ padding: '10px 12px', borderRadius: 9, background: '#fff', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {re.full_name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {re.employee_number} · {re.employment_type} · {re.role || '—'}
                          </div>
                          {re.attributes?.deleted_at && (
                            <div style={{ fontSize: 10.5, color: '#9a3412', marginTop: 2 }}>
                              Im Papierkorb seit {formatDate(re.attributes.deleted_at)}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          style={{ flexShrink: 0 }}
                          onClick={() => handleRestoreEmployee(re.id)}
                        >
                          Wiederherstellen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                          <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>🔑 Login: {e.email || '—'}</div>
                          <div style={{ fontSize: 11, color: '#047857' }}>📧 Privat: {attr.private_email || '—'} · 📞 {e.phone || '—'}</div>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ fontWeight: 600 }}>{e.role}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{e.department}</div>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: isSub ? '#fff7ed' : '#f0fdf4', color: isSub ? '#c2410c' : '#15803d' }}>{e.employment_type}</span>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{attr.contract_model || '—'}</div>
                          {attr.probezeit_end_date && (
                            <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>Probezeit bis: {formatDate(attr.probezeit_end_date)}</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px' }} onClick={(ev) => ev.stopPropagation()}>
                          <select value={e.assigned_project_id || attr.assigned_project_id || ''} onChange={(ev) => handleQuickProjectChange(e.id, ev.target.value)} style={{ ...sel, minWidth: 150, fontSize: 11.5 }}>
                            <option value="">— Kein Projekt —</option>
                            {projects.map((p) => (<option key={p.id} value={p.id}>{p.code} · {p.name}</option>))}
                          </select>
                        </td>
                        <td style={{ padding: '9px 10px', minWidth: 130 }} onClick={(ev) => { ev.stopPropagation(); openEditEmployeeModal(e); setEmpCardTab('hours'); }} title="Arbeitszeiten & Überstunden öffnen">
                          <div style={{ fontSize: 11, fontWeight: 700, color: over ? '#dc2626' : '#0f172a' }}>{hrs.toFixed(1)} h / {quota} h</div>
                          <div style={{ height: 5, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', marginTop: 3 }}>
                            <div style={{ width: `${Math.max(3, pct)}%`, height: '100%', background: over ? '#dc2626' : '#FF6B00' }} />
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 700 }}>
                          {isSub ? `${formatEuro(attr.tagessatz || 640)}/Tag` : e.base_salary > 0 ? `${formatEuro(e.base_salary)}/Mo` : `${formatEuro(e.hourly_rate)}/h`}
                        </td>
                        <td style={{ padding: '9px 10px' }} onClick={(ev) => ev.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ padding: '3px 7px', fontSize: 10.5, color: '#FF6B00', borderColor: '#fed7aa', background: '#fff7ed', fontWeight: 700 }}
                              onClick={() => {
                                setContractGenEmpId(e.id);
                                setTab('contracts');
                              }}
                              title="Vertrag generieren (Arbeitsvertrag, Kfz, Praktikum, Werkvertrag, DSGVO)"
                            >
                              📄 Vertrag
                            </button>
                            <button type="button" className="btn-secondary btn-sm" style={{ padding: '3px 7px', fontSize: 10.5 }} onClick={() => { openEditEmployeeModal(e); setEmpCardTab('absence'); }} title="Krankheit (AU) & Urlaub">
                              🏥/🌴
                            </button>
                            <button type="button" className="btn-secondary btn-sm" style={{ padding: '3px 7px', fontSize: 10.5, color: '#047857' }} onClick={() => { openEditEmployeeModal(e); setEmpCardTab('payslips'); }} title="Lohnabrechnung">
                              💰
                            </button>
                            <button type="button" className="btn-secondary btn-sm" style={{ padding: '3px 7px', fontSize: 10.5 }} onClick={() => { openEditEmployeeModal(e); setEmpCardTab('docs'); }} title="Dokumente">
                              <Upload size={11} /> {(e.documents || []).length}
                            </button>
                          </div>
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
          </div>
        );
      })()}

      {tab === 'timelogs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Smart Instant Character-by-Character Employee Search + Selective Billing Month + Add Manual Working Hours Bar */}
          <div className="glass-panel" style={{ padding: '16px 18px' }}>
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      list="hr-emp-list"
                      value={timeSearchQuery}
                      onChange={e => {
                        const v = e.target.value;
                        setTimeSearchQuery(v);
                        if (!v.trim()) { setBiEmpFilter(''); return; }
                        const exact = employees.find(x => (x.full_name || '').toLowerCase() === v.trim().toLowerCase());
                        if (exact) setBiEmpFilter(exact.id);
                      }}
                      placeholder="Mitarbeiter suchen oder auswählen…"
                      style={{ paddingLeft: '32px' }}
                    />
                    <datalist id="hr-emp-list">
                      {employees.map(emp => <option key={emp.id} value={emp.full_name} />)}
                    </datalist>
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
                      <X size={13} /> Zurücksetzen
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
                <button type="button" className="btn-primary" onClick={() => setShowAddManualTime(!showAddManualTime)}>
                  <Plus size={14} /> Arbeitszeit erfassen
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

          {/* Modern Minimal Animated BI Dashboard (1st to 31st) */}
          <div className="glass-panel" style={{ padding: '16px 18px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={17} style={{ color: '#FF6B00' }} />
                  Monthly HR Working Time, Überstunden, Urlaub &amp; Krankheit Summary (1st – 31st)
                </h3>
                {biSummary && (
                  <p style={{ fontSize: 11.5, color: '#64748b', margin: '3px 0 0' }}>
                    {biSummary.period_start} – {biSummary.period_end} · +8.0h/Tag Urlaub &amp; Krankheit
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="month"
                  value={biMonth}
                  onChange={(e) => setBiMonth(e.target.value)}
                  style={{ width: 'auto', padding: '5px 9px', fontSize: 12, borderRadius: 7, border: '1px solid #cbd5e1', fontWeight: 600 }}
                />
                <div className="hr-seg">
                  {[
                    { id: 'bars', label: 'Balken' },
                    { id: 'calendar', label: 'Kalender' },
                    { id: 'compact', label: 'Kompakt' },
                  ].map((vm) => (
                    <button
                      key={vm.id}
                      type="button"
                      className={biViewMode === vm.id ? 'active' : ''}
                      onClick={() => setBiViewMode(vm.id)}
                    >
                      {vm.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {biSummary && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14, animation: 'hrTabFade 0.22s ease' }}>
                  {[
                    { label: 'Worked (1st–31st)', val: `${biSummary.total_hours} h`, sub: `${biSummary.days_worked} Tage vor Ort`, accent: '#0f172a' },
                    { label: 'Überstunden', val: `${biSummary.total_overtime_hours || 0} h`, sub: `${formatEuro(biSummary.total_overtime_cost)} · ${(biSummary.weekly_alerts || []).length} KW`, accent: '#ea580c' },
                    { label: 'Approved / Pending', val: `${biSummary.approved_hours} / ${biSummary.pending_hours} h`, sub: `Pause: ${biSummary.total_break_minutes} min`, accent: '#16a34a' },
                    { label: 'Urlaub (+8h/Tag)', val: `+${biSummary.leave_credited_hours || 0} h`, sub: `${biSummary.leave_days_count || 0} Tag(e)`, accent: '#ca8a04' },
                    { label: 'Krankheit (+8h/Tag)', val: `+${biSummary.sick_credited_hours || 0} h`, sub: `${biSummary.sick_days_count || 0} Tag(e)`, accent: '#dc2626' },
                  ].map((k, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderTop: `3px solid ${k.accent}`,
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{k.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3, color: k.accent }}>{k.val}</div>
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Total HR Payroll Credited Hours Strip */}
                <div
                  className="flex-between"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'linear-gradient(90deg, rgba(255,107,0,0.08), rgba(255,107,0,0.02))',
                    border: '1px solid rgba(255,107,0,0.22)',
                    marginBottom: biViewMode === 'compact' ? 0 : 14,
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>Total HR Monthly Credited Hours</strong>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>
                      {biSummary.total_hours}h gearbeitet + {biSummary.leave_credited_hours || 0}h Urlaub + {biSummary.sick_credited_hours || 0}h Krankheit
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#FF6B00' }}>
                    {biSummary.total_credited_hours_with_absences ?? biSummary.total_hours} h
                  </div>
                </div>

                {biViewMode !== 'compact' && (
                  <div key={biViewMode} style={{ animation: 'hrTabFade 0.22s ease' }}>
                    <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 600, marginBottom: 8, flexWrap: 'wrap', color: '#475569' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#16a34a' }} /> Approved
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF6B00' }} /> Pending
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#eab308' }} /> Urlaub (+8h)
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444' }} /> Krankheit (+8h)
                      </span>
                    </div>

                    {biViewMode === 'bars' && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${biSummary.daily_breakdown.length}, minmax(16px, 1fr))`,
                          gap: 4,
                          alignItems: 'end',
                          height: 120,
                          padding: '12px 10px 6px',
                          borderRadius: 10,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          marginBottom: 16,
                        }}
                      >
                        {biSummary.daily_breakdown.map((d) => {
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
                              ? '#FF6B00'
                              : '#e2e8f0';
                          return (
                            <div
                              key={d.day}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                              title={`${d.date}: Worked ${d.hours}h | Urlaub +${d.leave_hours || 0}h | Krankheit +${d.sick_hours || 0}h | Total: ${eff}h`}
                            >
                              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b' }}>
                                {eff > 0 ? eff : ''}
                              </div>
                              <div
                                style={{
                                  width: '100%',
                                  height: `${Math.max(pct, 4)}px`,
                                  borderRadius: '4px 4px 2px 2px',
                                  background: barColor,
                                  transition: 'height 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                                }}
                              />
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                                {String(d.day).padStart(2, '0')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {biViewMode === 'calendar' && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                          gap: 6,
                          padding: 10,
                          borderRadius: 10,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          marginBottom: 16,
                        }}
                      >
                        {biSummary.daily_breakdown.map((d) => {
                          const eff = d.effective_hours ?? d.hours;
                          const bg =
                            d.sick_hours > 0
                              ? '#fef2f2'
                              : d.leave_hours > 0
                              ? '#fefce8'
                              : d.approved_hours > 0
                              ? '#f0fdf4'
                              : d.hours > 0
                              ? '#fff7ed'
                              : '#ffffff';
                          const col =
                            d.sick_hours > 0
                              ? '#dc2626'
                              : d.leave_hours > 0
                              ? '#ca8a04'
                              : d.approved_hours > 0
                              ? '#15803d'
                              : d.hours > 0
                              ? '#ea580c'
                              : '#94a3b8';
                          return (
                            <div
                              key={d.day}
                              style={{
                                padding: '6px 8px',
                                borderRadius: 7,
                                background: bg,
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                              title={`${d.date}: ${eff}h`}
                            >
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{String(d.day).padStart(2, '0')}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 800, color: col }}>{eff > 0 ? `${eff}h` : '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </>
            )}
          </div>

          <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Mitarbeiter-Arbeitszeiten ({employees.filter(emp => !biEmpFilter || emp.id === biEmpFilter).length})
                <span style={{ fontSize: 11.5, fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                  {timeLogs.filter((t) => !t.check_out_time).length} aktiv · Klick auf Mitarbeiter öffnet Monatsliste, Kalender &amp; Freigabe
                </span>
              </div>
              <button className="btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv({
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
                📥 CSV exportieren
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {employees
                .filter((emp) => {
                  if (biEmpFilter && emp.id !== biEmpFilter) return false;
                  if (timeSearchQuery.trim()) {
                    const q = timeSearchQuery.trim().toLowerCase();
                    return `${emp.full_name} ${emp.role || ''} ${emp.employment_type || ''}`.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((emp) => {
                  const empAll = timeLogs.filter((l) => l.employee_id === emp.id);
                  const empMonth = empAll.filter((l) => String(l.date || '').startsWith(biMonth));
                  const monthHours = empMonth.reduce((s, l) => s + Number(l.net_hours ?? l.total_hours ?? 0), 0);
                  const quota = Number(emp.attributes?.monthly_contract_hours || 160);
                  const overtime = Math.max(0, Number((monthHours - quota).toFixed(1)));
                  const pendingLogs = empAll.filter((l) => l.status !== 'Approved' && Boolean(l.check_out_time));
                  const pendingHours = pendingLogs.reduce((s, l) => s + Number(l.net_hours ?? l.total_hours ?? 0), 0);
                  const isEmpOpen = Boolean(expandedTimeEmpMap[emp.id]);
                  const eb = (biSummary?.employee_breakdown || []).find((x) => x.employee_id === emp.id);
                  const otEmp = (otReport?.employees || []).find((x) => x.employee_id === emp.id);
                  const empLeavesList = leaves.filter((lv) => lv.employee_id === emp.id);
                  const empSickList = sickness.filter((sk) => sk.employee_id === emp.id);

                  // Group employee logs by YYYY-MM descending
                  const mMap = new Map();
                  for (const l of empAll) {
                    const mKey = String(l.date || '').slice(0, 7) || 'Unbekannt';
                    if (!mMap.has(mKey)) mMap.set(mKey, []);
                    mMap.get(mKey).push(l);
                  }
                  const monthGroups = Array.from(mMap.entries())
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([mKey, logs]) => {
                      const sortedLogs = [...logs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
                      const totalH = sortedLogs.reduce((s, x) => s + Number(x.net_hours ?? x.total_hours ?? 0), 0);
                      const pendingCount = sortedLogs.filter((x) => x.status !== 'Approved' && Boolean(x.check_out_time)).length;
                      let label = mKey;
                      if (/^\d{4}-\d{2}$/.test(mKey)) {
                        const [yy, mm] = mKey.split('-').map(Number);
                        label = new Date(yy, mm - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
                      }
                      return { mKey, label, logs: sortedLogs, totalH, pendingCount };
                    });

                  // Calendar grid data for hoursCalMonth
                  const [calY, calM] = (/^\d{4}-\d{2}$/.test(hoursCalMonth) ? hoursCalMonth : new Date().toISOString().slice(0, 7)).split('-').map(Number);
                  const calFirstDay = new Date(calY, calM - 1, 1);
                  const calDaysInMonth = new Date(calY, calM, 0).getDate();
                  const calStartOffset = (calFirstDay.getDay() + 6) % 7;
                  const calTitle = calFirstDay.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
                  const shiftCalMonth = (delta) => {
                    const d = new Date(calY, calM - 1 + delta, 1);
                    setHoursCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  };

                  return (
                    <div
                      key={emp.id}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${pendingLogs.length > 0 ? '#fcd34d' : '#e2e8f0'}`,
                        background: '#ffffff',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Minimal Employee Row (Click to Expand Inline) */}
                      <div
                        onClick={() => setExpandedTimeEmpMap((prev) => ({ ...prev, [emp.id]: !prev[emp.id] }))}
                        style={{
                          padding: '10px 14px',
                          background: isEmpOpen ? '#f8fafc' : '#ffffff',
                          borderBottom: isEmpOpen ? '1px solid #e2e8f0' : '1px solid transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 10,
                          cursor: 'pointer',
                          transition: 'background 0.16s ease, border-color 0.16s ease',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{emp.full_name}</strong>
                          <span style={{ fontSize: 11.5, color: '#64748b' }}>
                            {emp.role} · {emp.employment_type} ({eb?.weekly_hours_limit || emp.attributes?.weekly_hours || 40}h/Woche)
                          </span>
                          {eb && (
                            <span style={{ fontSize: 11, color: '#475569' }}>
                              Soll: <strong>{eb.soll_hours ?? 0}h</strong> · U: <strong>+{eb.urlaub_hours || 0}h</strong> · K: <strong>+{eb.krankheit_hours || 0}h</strong> · Gesamt: <strong style={{ color: '#FF6B00' }}>{eb.total_credited_hours}h</strong> · Kosten: <strong>{formatEuro(eb.estimated_monthly_cost || eb.base_salary)}</strong>
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                            {monthHours.toFixed(1)} / {quota} h
                          </span>
                          {overtime > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', background: '#fff7ed', padding: '2px 7px', borderRadius: 999 }}>
                              +{overtime}h ÜS
                            </span>
                          )}
                          {pendingLogs.length > 0 ? (
                            <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 700 }}>
                              {pendingLogs.length} offen ({pendingHours.toFixed(1)}h)
                            </span>
                          ) : (
                            <span style={{ padding: '2px 8px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700 }}>
                              ✓ Freigegeben
                            </span>
                          )}
                          {pendingLogs.length > 0 && (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              style={{ fontSize: 11, padding: '4px 9px', background: '#059669', borderColor: '#047857' }}
                              disabled={approvingAllEmpId === emp.id}
                              onClick={() => handleApproveAllEmployeeHours(emp.id)}
                            >
                              <Check size={12} /> {approvingAllEmpId === emp.id ? 'Lädt…' : `Alle freigeben (${pendingLogs.length})`}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Smooth Animated Inline Employee Hours & Cost Control Drawer */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateRows: isEmpOpen ? '1fr' : '0fr',
                          opacity: isEmpOpen ? 1 : 0,
                          transition: 'grid-template-rows 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
                        }}
                      >
                        <div style={{ overflow: 'hidden', minHeight: 0 }}>
                          <div style={{ padding: '14px 16px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* 1. Per-Employee Working Hours, Überstunden, Weekly Limit & Cost Control Breakdown */}
                            {eb && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
                                {[
                                  { label: `Gearbeitet (${biMonth})`, val: `${eb.worked_hours} h`, sub: `${eb.approved_worked_hours}h freigegeben` },
                                  { label: 'Soll / Wochenlimit', val: `${eb.soll_hours ?? 0} h`, sub: `${eb.weekly_hours_limit || 40}h/Woche` },
                                  { label: 'Urlaub & Krankheit', val: `+${eb.urlaub_hours || 0}h / +${eb.krankheit_hours || 0}h`, sub: `${eb.urlaub_days || 0}d U · ${eb.krankheit_days || 0}d K` },
                                  { label: 'Gesamt angerechnet', val: `${eb.total_credited_hours} h`, sub: eb.weekly_exceeded ? `⚠️ KW Limit (${eb.max_weekly_hours}h)` : 'KW im Limit', color: '#FF6B00' },
                                  { label: 'Überstunden & Kosten', val: eb.overtime_hours > 0 ? `+${eb.overtime_hours} h` : '0 h', sub: formatEuro(eb.estimated_monthly_cost || eb.base_salary), color: eb.overtime_hours > 0 ? '#ea580c' : '#0f172a' },
                                ].map((c, idx) => (
                                  <div key={idx} style={{ padding: '8px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>{c.label}</div>
                                    <div style={{ fontSize: 14.5, fontWeight: 800, color: c.color || '#0f172a', marginTop: 2 }}>{c.val}</div>
                                    <div style={{ fontSize: 10.5, color: '#64748b' }}>{c.sub}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 2. View Switcher: Monatsliste vs Kalenderansicht + Approve All */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                              <div className="hr-seg">
                                <button type="button" className={empHoursViewMode === 'months' ? 'active' : ''} onClick={() => setEmpHoursViewMode('months')}>
                                  Monatsliste ({monthGroups.length})
                                </button>
                                <button type="button" className={empHoursViewMode === 'calendar' ? 'active' : ''} onClick={() => setEmpHoursViewMode('calendar')}>
                                  Kalenderansicht
                                </button>
                              </div>
                              {pendingLogs.length > 0 && (
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  disabled={approvingAllEmpId === emp.id}
                                  onClick={() => handleApproveAllEmployeeHours(emp.id)}
                                  style={{ background: '#059669', borderColor: '#047857', fontWeight: 700 }}
                                >
                                  <Check size={12} /> {approvingAllEmpId === emp.id ? 'Wird freigegeben…' : `Alle offenen Stunden freigeben (${pendingLogs.length})`}
                                </button>
                              )}
                            </div>

                            {/* 3. Months Accordion (Animated) OR Calendar View */}
                            {empHoursViewMode === 'months' && (
                              monthGroups.length === 0 ? (
                                <div style={{ padding: 16, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 8, border: '1px dashed #cbd5e1', fontSize: 12 }}>
                                  Noch keine Arbeitszeiten erfasst.
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {monthGroups.map((mg) => {
                                    const mStateKey = `tl_${emp.id}_${mg.mKey}`;
                                    const isMonthOpen = expandedHoursMonthMap[mStateKey] !== undefined
                                      ? Boolean(expandedHoursMonthMap[mStateKey])
                                      : mg.pendingCount > 0 || mg.mKey === biMonth;
                                    return (
                                      <div key={mg.mKey} style={{ border: `1px solid ${mg.pendingCount > 0 ? '#fcd34d' : '#e2e8f0'}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                        <div
                                          onClick={() => setExpandedHoursMonthMap((prev) => ({ ...prev, [mStateKey]: !isMonthOpen }))}
                                          style={{
                                            padding: '7px 12px',
                                            background: isMonthOpen ? '#f8fafc' : '#fff',
                                            borderBottom: isMonthOpen ? '1px solid #e2e8f0' : '1px solid transparent',
                                            transition: 'background 0.2s ease, border-color 0.2s ease',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 8,
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <strong style={{ fontSize: 12.5, color: '#0f172a', textTransform: 'capitalize' }}>{mg.label}</strong>
                                            <span style={{ fontSize: 11.5, color: '#64748b' }}>
                                              {mg.logs.length} Schichten · <strong style={{ color: '#0f172a' }}>{mg.totalH.toFixed(1)} h</strong>
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                                            {mg.pendingCount > 0 ? (
                                              <>
                                                <span style={{ padding: '2px 7px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontSize: 10.5, fontWeight: 700 }}>
                                                  {mg.pendingCount} offen
                                                </span>
                                                <button
                                                  type="button"
                                                  className="btn-primary btn-sm"
                                                  style={{ fontSize: 10.5, padding: '3px 8px', background: '#059669', borderColor: '#047857' }}
                                                  disabled={approvingAllEmpId === emp.id}
                                                  onClick={() => handleApproveAllEmployeeHours(emp.id, mg.mKey)}
                                                >
                                                  <Check size={11} /> Monat freigeben
                                                </button>
                                              </>
                                            ) : (
                                              <span style={{ padding: '2px 7px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 10.5, fontWeight: 700 }}>
                                                ✓ Freigegeben
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <div
                                          style={{
                                            display: 'grid',
                                            gridTemplateRows: isMonthOpen ? '1fr' : '0fr',
                                            opacity: isMonthOpen ? 1 : 0,
                                            transition: 'grid-template-rows 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
                                          }}
                                        >
                                          <div style={{ overflow: 'hidden', minHeight: 0 }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                              <thead>
                                                <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>
                                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Datum</th>
                                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Projekt</th>
                                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Start – Ende</th>
                                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Pause</th>
                                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Netto</th>
                                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Status</th>
                                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Aktion</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {mg.logs.map(renderEditableTimeLogRow)}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )
                            )}

                            {empHoursViewMode === 'calendar' && (
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff', animation: 'hrTabFade 0.2s ease' }}>
                                <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <button type="button" className="btn-secondary btn-sm" onClick={() => shiftCalMonth(-1)}><ChevronLeft size={14} /></button>
                                  <strong style={{ fontSize: 13, color: '#0f172a', textTransform: 'capitalize' }}>{calTitle}</strong>
                                  <button type="button" className="btn-secondary btn-sm" onClick={() => shiftCalMonth(1)}><ChevronRight size={14} /></button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>
                                  {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => <div key={d} style={{ padding: '5px 4px' }}>{d}</div>)}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                                  {Array.from({ length: calStartOffset }).map((_, idx) => (
                                    <div key={`e-${idx}`} style={{ minHeight: 58, background: '#fafafa', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }} />
                                  ))}
                                  {Array.from({ length: calDaysInMonth }).map((_, idx) => {
                                    const dayNum = idx + 1;
                                    const isoDay = `${calY}-${String(calM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                    const dLogs = empAll.filter((l) => String(l.date || '').slice(0, 10) === isoDay);
                                    const dH = dLogs.reduce((s, l) => s + Number(l.net_hours ?? l.total_hours ?? 0), 0);
                                    const hasPend = dLogs.some((l) => l.status !== 'Approved');
                                    const hasLv = empLeavesList.some((lv) => lv.status === 'Approved' && isoDay >= lv.start_date && isoDay <= lv.end_date);
                                    const hasSk = empSickList.some((sk) => isoDay >= sk.start_date && isoDay <= sk.end_date);
                                    return (
                                      <div key={isoDay} style={{ minHeight: 58, padding: 5, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: hasSk ? '#fef2f2' : hasLv ? '#fefce8' : dLogs.length > 0 ? (hasPend ? '#fff7ed' : '#f0fdf4') : '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569' }}>{dayNum}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                          {dLogs.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: hasPend ? '#c2410c' : '#15803d' }}>{dH.toFixed(1)}h {hasPend ? '⏳' : '✓'}</span>}
                                          {hasLv && <span style={{ fontSize: 9, fontWeight: 700, color: '#a16207' }}>Urlaub</span>}
                                          {hasSk && <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626' }}>Krank</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 4. Mehrstunden pro Monat (laut Wochenstunden im Vertrag) for this Employee */}
                            {otEmp && !otEmp.overtime_exempt && (
                              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', overflowX: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                                  <strong style={{ fontSize: 12, color: '#0f172a' }}>
                                    Mehrstunden pro Monat {otReport.year} ({otEmp.weekly_hours} h/Woche)
                                  </strong>
                                  <span style={{ fontSize: 11.5, fontWeight: 800, color: otEmp.total_overtime_hours > 0 ? '#ea580c' : '#64748b' }}>
                                    Mehrstunden: +{otEmp.total_overtime_hours} h · Saldo: {otEmp.balance_hours > 0 ? '+' : ''}{otEmp.balance_hours} h
                                  </span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'right' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>Monat</th>
                                      <th style={{ padding: '4px 6px' }}>Soll</th>
                                      <th style={{ padding: '4px 6px' }}>Gearbeitet</th>
                                      <th style={{ padding: '4px 6px' }}>Urlaub</th>
                                      <th style={{ padding: '4px 6px' }}>Krank</th>
                                      <th style={{ padding: '4px 6px' }}>Ist gesamt</th>
                                      <th style={{ padding: '4px 6px' }}>Differenz</th>
                                      <th style={{ padding: '4px 6px' }}>Mehrstunden</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {otEmp.months.map((mo) => (
                                      <tr key={mo.month} style={{ borderBottom: '1px solid #f1f5f9', background: mo.overtime_hours > 0 ? 'rgba(255,237,213,0.45)' : undefined }}>
                                        <td style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>{MONTH_OPTIONS[mo.month - 1]?.label.replace(/^\d+\s*·\s*/, '')}</td>
                                        <td style={{ padding: '4px 6px' }}>{mo.soll_hours} h</td>
                                        <td style={{ padding: '4px 6px' }}>{mo.worked_hours} h</td>
                                        <td style={{ padding: '4px 6px', color: mo.urlaub_hours > 0 ? '#ca8a04' : undefined }}>{mo.urlaub_hours} h</td>
                                        <td style={{ padding: '4px 6px', color: mo.krankheit_hours > 0 ? '#dc2626' : undefined }}>{mo.krankheit_hours} h</td>
                                        <td style={{ padding: '4px 6px', fontWeight: 700 }}>{mo.ist_hours} h</td>
                                        <td style={{ padding: '4px 6px', color: mo.difference_hours < 0 ? '#64748b' : '#16a34a' }}>{mo.difference_hours > 0 ? '+' : ''}{mo.difference_hours} h</td>
                                        <td style={{ padding: '4px 6px', fontWeight: 800, color: mo.overtime_hours > 0 ? '#ea580c' : '#94a3b8' }}>{mo.overtime_hours > 0 ? `+${mo.overtime_hours} h` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
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
              AU-Meldungen · automatisch +8 h/Tag in der HR-Monatsübersicht
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

      {tab === 'payslips' && (() => {
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
                    Dokumente & Lohnabrechnungen
                  </h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>Lohnabrechnungen erscheinen sofort im Mitarbeiter-Portal.</p>
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
                    💰 Lohnabrechnung
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
                    📂 Dokument
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
                                {(doc.status === 'Pending_Signature' || doc.employee_visible === false || doc.visibility === 'admin_only') && (
                                  <span style={{ fontSize: '0.68rem', color: '#b45309', fontWeight: 700 }}>⏳ Ausstehend (Nicht im Mitarbeiter-Portal sichtbar)</span>
                                )}
                                {doc.status === 'Signed' && (
                                  <span style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 700 }}>✅ Unterschrieben (Für Mitarbeiter sichtbar)</span>
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
  const [teamForm, setTeamForm] = useState({
    id: '',
    name: '',
    cost_center: '',
    is_external: false,
    leader_id: '',
    member_ids: [],
    external_members: [],
    notes: '',
  });
  const [extMemberInput, setExtMemberInput] = useState('');

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
    const pendingExt = extMemberInput.trim();
    const finalExternalMembers = pendingExt
      ? Array.from(new Set([...(teamForm.external_members || []), pendingExt]))
      : (teamForm.external_members || []);
    const payload = {
      ...teamForm,
      name: teamForm.name.trim(),
      cost_center: (teamForm.cost_center || '').trim(),
      external_members: finalExternalMembers,
    };
    try {
      if (teamForm.id) {
        await fetchWithToken(`/api/v1/teams/${teamForm.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await fetchWithToken('/api/v1/teams', { method: 'POST', body: JSON.stringify(payload) });
      }
      setTeamForm({ id: '', name: '', cost_center: '', is_external: false, leader_id: '', member_ids: [], external_members: [], notes: '' });
      setExtMemberInput('');
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
        { id: 'abrechnung', label: 'Cost Management' },
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Unified Adaptive Calendar (Monat / Woche / Tag / Liste) with Objects & Properties sync */}
          <MasterCalendarModule embeddedInProjects />

          {/* Compact Field Assignments & Documentation Table */}
          <div className="glass-panel" style={{ padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="flex-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5, color: '#0f172a' }}>Einsatz-Aufgaben & Baustellen-Dokumentation ({filteredTasks.length})</strong>
                <select value={empCalFilter} onChange={e => setEmpCalFilter(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                  <option value="">Alle Mitarbeiter</option>
                  {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.full_name}</option>))}
                </select>
                <select value={teamCalFilter} onChange={e => setTeamCalFilter(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                  <option value="">Alle Teams</option>
                  {teams.map(tm => (<option key={tm.id} value={tm.id}>{tm.name}</option>))}
                </select>
              </div>
              <button className="btn-primary btn-sm" onClick={() => setShowAddTask(true)}>
                <Plus size={14} /> Neue Aufgabe / Einsatz zuweisen
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: 10.5, textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 10px' }}>Datum</th>
                    <th style={{ padding: '8px 10px' }}>Team / Mitarbeiter</th>
                    <th style={{ padding: '8px 10px' }}>Aufgabe & Anweisung</th>
                    <th style={{ padding: '8px 10px' }}>Gebäude / Region</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>Dokumentation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map(a => {
                    const st = getStatusStyle(a.task_status);
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{formatDate(a.date)}</td>
                        <td style={{ padding: '8px 10px' }}>{a.assignee_label}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 700 }}>{a.title}</div>
                          <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{a.instructions}</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div>{a.object_address}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{a.region_name}</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <select
                            value={a.task_status}
                            onChange={e => handleTaskStatusUpdate(a.id, e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, color: st.color, background: st.bg, width: 'auto' }}
                          >
                            {Object.values(TASK_STATUS_CONFIG).map(opt => (
                              <option key={opt.key} value={opt.key}>{opt.en}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button className="btn-secondary btn-sm" onClick={() => setSelectedTaskDoc(a)}>
                              <MessageSquare size={12} /> {(a.comments || []).length} • <Video size={12} /> {a.media_count || 0} Öffnen
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: '#dc2626', borderColor: '#fecaca', padding: '4px 7px' }}
                              title="Aufgabe löschen"
                              onClick={() => handleDeleteTask(a)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'teams' && (() => {
        const existingCostCenters = Array.from(new Set(teams.map((t) => (t.cost_center || '').trim()).filter(Boolean)));
        const addExtMember = () => {
          const val = extMemberInput.trim();
          if (!val) return;
          setTeamForm((prev) => ({
            ...prev,
            external_members: Array.from(new Set([...(prev.external_members || []), val])),
          }));
          setExtMemberInput('');
        };
        return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px' }}>
          <div className="glass-panel">
            <div className="flex-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>{teamForm.id ? 'Edit Field Team' : 'Create Field Team (Internal or External)'}</h3>
              {teamForm.id && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setTeamForm({ id: '', name: '', cost_center: '', is_external: false, leader_id: '', member_ids: [], external_members: [], notes: '' });
                    setExtMemberInput('');
                  }}
                >
                  + Neu
                </button>
              )}
            </div>
            <form onSubmit={handleSaveTeam} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTeamForm((p) => ({ ...p, is_external: false }))}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: !teamForm.is_external ? '1.5px solid #FF6B00' : '1px solid var(--border)',
                    background: !teamForm.is_external ? '#fff7ed' : 'var(--surface-2)',
                    color: !teamForm.is_external ? '#c2410c' : 'var(--text-main)',
                  }}
                >
                  Internes Team
                </button>
                <button
                  type="button"
                  onClick={() => setTeamForm((p) => ({ ...p, is_external: true }))}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: teamForm.is_external ? '1.5px solid #2563eb' : '1px solid var(--border)',
                    background: teamForm.is_external ? '#eff6ff' : 'var(--surface-2)',
                    color: teamForm.is_external ? '#1d4ed8' : 'var(--text-main)',
                  }}
                >
                  Externes / Partner-Team
                </button>
              </div>

              <input required placeholder="Team Name (z. B. Team Pejman — Spleiß / Team Alpha)" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} />

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Cost Center / Kostenstelle (z. B. Pejman, Brünel Intern)
                </label>
                <input
                  list="team-cost-centers-list"
                  placeholder="Cost Center eingeben (z. B. Pejman)"
                  value={teamForm.cost_center || ''}
                  onChange={e => setTeamForm({ ...teamForm, cost_center: e.target.value })}
                />
                <datalist id="team-cost-centers-list">
                  <option value="Brünel Intern" />
                  <option value="Pejman" />
                  {existingCostCenters.map((cc) => <option key={cc} value={cc} />)}
                </datalist>
              </div>

              {/* Manual / External Member Names (Non-Employees) */}
              <div style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>
                  Manuelle / Externe Mitglieder (Nicht-Mitarbeiter)
                </label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    placeholder="Name eingeben (z. B. Ali, Reza) & Enter…"
                    value={extMemberInput}
                    onChange={(e) => setExtMemberInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addExtMember();
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary btn-sm" onClick={addExtMember}>
                    + Add
                  </button>
                </div>
                {(teamForm.external_members || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(teamForm.external_members || []).map((name) => (
                      <span
                        key={name}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 9px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          borderRadius: '999px',
                          background: '#eff6ff',
                          border: '1px solid #93c5fd',
                          color: '#1d4ed8',
                        }}
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() =>
                            setTeamForm((prev) => ({
                              ...prev,
                              external_members: (prev.external_members || []).filter((x) => x !== name),
                            }))
                          }
                          style={{ border: 'none', background: 'transparent', color: '#1d4ed8', cursor: 'pointer', padding: 0, fontWeight: 800 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <select value={teamForm.leader_id} onChange={e => setTeamForm({ ...teamForm, leader_id: e.target.value })}>
                <option value="">Interner Team Lead (optional)...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Interne Mitarbeiter (optional)</label>
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
              <button type="submit" className="btn-primary">{teamForm.id ? 'Update Team' : 'Save Team'}</button>
            </form>
          </div>

          <div className="glass-panel">
            <h3 style={{ marginBottom: '12px' }}>Active Field Teams ({teams.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {teams.map(tm => (
                <div key={tm.id} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong>{tm.name}</strong>
                      {tm.cost_center && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}>
                          KST: {tm.cost_center}
                        </span>
                      )}
                      {tm.is_external && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                          Extern
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setTeamForm({
                            id: tm.id,
                            name: tm.name,
                            cost_center: tm.cost_center || '',
                            is_external: Boolean(tm.is_external),
                            leader_id: tm.leader_id || '',
                            member_ids: tm.member_ids || [],
                            external_members: tm.external_members || [],
                            notes: tm.notes || '',
                          });
                          setExtMemberInput('');
                        }}
                      >
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
                    Lead: <strong>{tm.leader_name}</strong> • Members: {(tm.members || []).map(m => m.name).join(', ') || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        );
      })()}

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
