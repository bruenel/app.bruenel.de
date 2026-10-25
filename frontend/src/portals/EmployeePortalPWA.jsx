import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DateInput, TimeInput } from '../components/DateTimeInputs';
import {
  Clock, Calendar, HeartPulse, FileText, ShoppingBag,
  Upload, Play, Pause, Square, LogOut, Users,
  MapPin, Wrench, MessageSquare, Lock, Edit3, Check, X,
  ChevronLeft, ChevronRight, ChevronDown, Globe, BarChart3, Plus, FolderOpen, Download, Trash2, User, KeyRound, Shield,
  LayoutDashboard
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, formatEuro, formatDate, formatDateTime, formatDateRange } from '../core/api';
import { TRANSLATIONS, TASK_STATUS_CONFIG, getStatusStyle } from '../core/i18n';

const fmtTimeInput = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDateTime = (isoStr) => {
  return formatDateTime(isoStr);
};

const toIsoDate = (d) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
};

const getStartOfWeek = (refDate) => {
  const d = new Date(refDate);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const MONTH_LIST_DE = [
  { num: 1, short: '01 · Jan', labelDe: 'Januar', labelEn: 'January' },
  { num: 2, short: '02 · Feb', labelDe: 'Februar', labelEn: 'February' },
  { num: 3, short: '03 · Mär', labelDe: 'März', labelEn: 'March' },
  { num: 4, short: '04 · Apr', labelDe: 'April', labelEn: 'April' },
  { num: 5, short: '05 · Mai', labelDe: 'Mai', labelEn: 'May' },
  { num: 6, short: '06 · Jun', labelDe: 'Juni', labelEn: 'June' },
  { num: 7, short: '07 · Jul', labelDe: 'Juli', labelEn: 'July' },
  { num: 8, short: '08 · Aug', labelDe: 'August', labelEn: 'August' },
  { num: 9, short: '09 · Sep', labelDe: 'September', labelEn: 'September' },
  { num: 10, short: '10 · Okt', labelDe: 'Oktober', labelEn: 'October' },
  { num: 11, short: '11 · Nov', labelDe: 'November', labelEn: 'November' },
  { num: 12, short: '12 · Dez', labelDe: 'Dezember', labelEn: 'December' },
];

export const EmployeePortalPWA = ({ user, logout, onSwitchToManagement }) => {
  const [lang, setLang] = useState(() => user?.preferred_language || localStorage.getItem('bruenel_lang') || 'de');
  const t = TRANSLATIONS[lang] || TRANSLATIONS.de;

  // Arbeitszeiten ('checkin') is now the front page directly after login, followed by Aufgaben ('tasks')
  const [activeTab, setActiveTab] = useState('checkin');
  const [absenceSubTab, setAbsenceSubTab] = useState('leave'); // 'leave' | 'sick'
  const [calView, setCalView] = useState('week'); // 'week' | 'month' | 'list'
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [mobileDayFilter, setMobileDayFilter] = useState('all'); // 'all' or YYYY-MM-DD
  const [selectedTask, setSelectedTask] = useState(null);
  const [commentText, setCommentText] = useState('');

  // User Profile & Settings Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [pwStatus, setPwStatus] = useState({ type: '', text: '' });

  // Payslips (Lohnabrechnung) Accordion State
  const [payslipYear, setPayslipYear] = useState(() => String(new Date().getFullYear()));
  const [expandedPayslipMonth, setExpandedPayslipMonth] = useState(() => new Date().getMonth() + 1);

  // Touch Swipe Refs for Calendar Left/Right Sliding
  const touchStartXRef = useRef(null);
  const weekStripRef = useRef(null);

  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [biSummary, setBiSummary] = useState(null);
  const [biMonth, setBiMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [leaves, setLeaves] = useState([]);
  const [sickness, setSickness] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Smart Check-in / Check-out State
  const [checkInForm, setCheckInForm] = useState({
    project_id: '',
    vehicle_id: '',
    equipment_ids: [],
    team_member_ids: [],
    notes: '',
  });
  const [checkOutForm, setCheckOutForm] = useState({
    break_minutes: 30,
    notes: '',
  });

  // Editable TimeLog Row State
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogForm, setEditLogForm] = useState({
    date: '',
    check_in_time: '',
    check_out_time: '',
    break_minutes: 0,
  });

  // Past-Day / Manual TimeLog Form State
  const [manualLogForm, setManualLogForm] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      date: toIsoDate(yesterday),
      check_in_time: '08:00',
      check_out_time: '16:30',
      break_minutes: 30,
      project_id: '',
      notes: '',
    };
  });

  // Team Form State
  const [teamForm, setTeamForm] = useState({
    id: '',
    name: '',
    member_ids: [],
    notes: '',
  });

  // Leave & Sickness Forms
  const [leaveForm, setLeaveForm] = useState({
    start_date: toIsoDate(new Date()),
    end_date: toIsoDate(new Date()),
    type: 'Daily',
    reason: '',
  });
  const [sickForm, setSickForm] = useState({
    start_date: toIsoDate(new Date()),
    end_date: toIsoDate(new Date()),
    symptoms_note: '',
    doctor_visited: true,
  });
  const [auFile, setAuFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleLanguageChange = async (newLang) => {
    setLang(newLang);
    localStorage.setItem('bruenel_lang', newLang);
    try {
      await fetchWithToken('/api/v1/auth/me/language', {
        method: 'PUT',
        body: JSON.stringify({ preferred_language: newLang }),
      });
    } catch (_) {}
  };

  const handleLogoutToLogin = () => {
    localStorage.removeItem('bruenel_portal_mode');
    setShowUserModal(false);
    logout();
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwStatus({ type: '', text: '' });
    if (pwForm.new_password.length < 6) {
      setPwStatus({
        type: 'error',
        text: lang === 'de' ? 'Neues Passwort muss mind. 6 Zeichen lang sein.' : 'New password must be at least 6 characters.',
      });
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwStatus({
        type: 'error',
        text: lang === 'de' ? 'Passwörter stimmen nicht überein.' : 'Passwords do not match.',
      });
      return;
    }
    try {
      await fetchWithToken('/api/v1/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({
          old_password: pwForm.old_password,
          new_password: pwForm.new_password,
        }),
      });
      setPwForm({ old_password: '', new_password: '', confirm_password: '' });
      setPwStatus({
        type: 'success',
        text: lang === 'de' ? 'Passwort erfolgreich geändert!' : 'Password updated successfully!',
      });
    } catch (err) {
      setPwStatus({ type: 'error', text: err.message });
    }
  };

  const loadBiSummary = (ym = biMonth) => {
    const [yr, mo] = ym.split('-').map(Number);
    if (!yr || !mo) return;
    fetchWithToken(`/api/v1/hr/time-logs/bi-summary?year=${yr}&month=${mo}`)
      .then(setBiSummary)
      .catch(() => null);
  };

  const loadPortalData = () => {
    Promise.all([
      fetchWithToken('/api/v1/assignments').catch(() => []),
      fetchWithToken('/api/v1/teams').catch(() => []),
      fetchWithToken('/api/v1/hr/time-logs').catch(() => []),
      fetchWithToken('/api/v1/hr/leave-requests').catch(() => []),
      fetchWithToken('/api/v1/hr/sickness').catch(() => []),
      fetchWithToken('/api/v1/hr/payslips').catch(() => []),
      fetchWithToken('/api/v1/projects').catch(() => []),
      fetchWithToken('/api/v1/fleet/vehicles').catch(() => []),
      fetchWithToken('/api/v1/fleet/equipment').catch(() => []),
      fetchWithToken('/api/v1/hr/employees').catch(() => []),
    ]).then(([tsk, tms, tl, lv, sk, ps, prj, veh, eq, emps]) => {
      setTasks(tsk);
      setTeams(tms);
      setTimeLogs(tl);
      setLeaves(lv);
      setSickness(sk);
      setPayslips(ps);
      setProjects(prj);
      setVehicles(veh);
      setEquipment(eq);
      setEmployees(emps);

      if (selectedTask) {
        const refreshed = tsk.find(x => x.id === selectedTask.id);
        if (refreshed) setSelectedTask(refreshed);
      }

      if (prj.length > 0 && !checkInForm.project_id) {
        setCheckInForm(f => ({
          ...f,
          project_id: prj[0].id,
          vehicle_id: veh[0]?.id || '',
        }));
      }
    });
    loadBiSummary(biMonth);
  };

  useEffect(() => {
    if (user?.preferred_language && user.preferred_language !== lang) {
      setLang(user.preferred_language);
      localStorage.setItem('bruenel_lang', user.preferred_language);
    }
    loadPortalData();
  }, []);

  useEffect(() => {
    loadBiSummary(biMonth);
  }, [biMonth]);

  // Logged-in Employee's own HR Master Record (Read-Only in User Modal)
  const myEmployeeProfile = useMemo(() => {
    return (
      employees.find(e => e.id === user?.employee_id) ||
      employees.find(e => e.email?.toLowerCase() === user?.email?.toLowerCase()) ||
      null
    );
  }, [employees, user]);

  const activeSession = timeLogs.find(l => !l.check_out_time);
  const isPaused = Boolean(activeSession && (activeSession.status === 'Paused' || activeSession.pause_start_time));

  // Filter team members for Smart Check-In to ONLY members in the employee's assigned team(s)
  const assignedTeamMembers = useMemo(() => {
    const myTeams = teams.filter(tm => tm.is_my_team || (tm.member_ids || []).includes(user?.employee_id));
    if (myTeams.length > 0) {
      const memberSet = new Set();
      myTeams.forEach(tm => (tm.member_ids || []).forEach(id => memberSet.add(id)));
      return employees.filter(e => memberSet.has(e.id));
    }
    return employees;
  }, [teams, employees, user?.employee_id]);

  // Week Days Calculation (Mon - Sun)
  const weekDays = useMemo(() => {
    const start = getStartOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toIsoDate(d);
      const dayTasks = tasks.filter(tsk => tsk.date === iso);
      return {
        date: d,
        iso,
        dayShort: d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        monthShort: d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { month: 'short' }),
        isToday: iso === toIsoDate(new Date()),
        tasks: dayTasks,
      };
    });
  }, [cursorDate, tasks, lang]);

  // Sliding 21-Day Strip (Previous Week + Current Week + Next Week) so user can slide left & right
  const slidingDays = useMemo(() => {
    const start = getStartOfWeek(cursorDate);
    start.setDate(start.getDate() - 7);
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toIsoDate(d);
      const dayTasks = tasks.filter(tsk => tsk.date === iso);
      return {
        date: d,
        iso,
        dayShort: d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        monthShort: d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { month: 'short' }),
        isToday: iso === toIsoDate(new Date()),
        tasks: dayTasks,
      };
    });
  }, [cursorDate, tasks, lang]);

  // Month Days Grid Calculation
  const monthDays = useMemo(() => {
    const yr = cursorDate.getFullYear();
    const mo = cursorDate.getMonth();
    const firstDay = new Date(yr, mo, 1);
    const lastDay = new Date(yr, mo + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(yr, mo, d);
      const iso = toIsoDate(dt);
      cells.push({
        day: d,
        iso,
        isToday: iso === toIsoDate(new Date()),
        tasks: tasks.filter(tsk => tsk.date === iso),
      });
    }
    return cells;
  }, [cursorDate, tasks]);

  const navigateCalendar = (dir) => {
    const next = new Date(cursorDate);
    if (calView === 'month') {
      next.setMonth(next.getMonth() + dir);
    } else {
      next.setDate(next.getDate() + dir * 7);
    }
    setCursorDate(next);
  };

  const handleCalendarTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleCalendarTouchEnd = (e) => {
    if (touchStartXRef.current == null || !e.changedTouches || e.changedTouches.length === 0) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) > 55) {
      navigateCalendar(deltaX < 0 ? 1 : -1);
      setMobileDayFilter('all');
    }
  };

  // Task Status & Comment Handlers
  const handleTaskStatusChange = async (assignmentId, newStatus) => {
    try {
      await fetchWithToken(`/api/v1/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ task_status: newStatus }),
      });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddComment = async (e, assignmentId) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      await fetchWithToken(`/api/v1/assignments/${assignmentId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: commentText }),
      });
      setCommentText('');
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadTaskMedia = async (e, taskObj) => {
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
      loadPortalData();
    } catch (err) {
      alert(err.message);
      setUploadProgress(0);
    }
  };

  // Time Tracking Handlers (One-Tap System Time)
  const handleQuickCheckIn = async (e) => {
    if (e) e.preventDefault();
    try {
      await fetchWithToken('/api/v1/hr/checkin', {
        method: 'POST',
        body: JSON.stringify({
          project_id: checkInForm.project_id || projects[0]?.id || null,
          vehicle_ids: checkInForm.vehicle_id ? [checkInForm.vehicle_id] : [],
          equipment_ids: checkInForm.equipment_ids,
          team_member_ids: checkInForm.team_member_ids,
          notes: checkInForm.notes,
        }),
      });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePauseStart = async () => {
    try {
      await fetchWithToken('/api/v1/hr/pause-start', { method: 'POST', body: JSON.stringify({}) });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePauseEnd = async () => {
    try {
      await fetchWithToken('/api/v1/hr/pause-end', { method: 'POST', body: JSON.stringify({}) });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleQuickCheckOut = async (e) => {
    if (e) e.preventDefault();
    try {
      await fetchWithToken('/api/v1/hr/checkout', {
        method: 'POST',
        body: JSON.stringify({
          time_log_id: activeSession?.id,
          break_minutes: parseInt(checkOutForm.break_minutes || activeSession?.break_minutes || 0, 10),
          notes: checkOutForm.notes,
        }),
      });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const startEditingTimeLog = (log) => {
    setEditingLogId(log.id);
    setEditLogForm({
      date: log.date,
      check_in_time: fmtTimeInput(log.check_in_time),
      check_out_time: fmtTimeInput(log.check_out_time),
      break_minutes: log.break_minutes || 0,
    });
  };

  const saveEditedTimeLog = async (log) => {
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${log.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: editLogForm.date || log.date,
          check_in_time: editLogForm.check_in_time,
          check_out_time: editLogForm.check_out_time,
          break_minutes: parseInt(editLogForm.break_minutes || 0, 10),
        }),
      });
      setEditingLogId(null);
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddManualTimeLog = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/hr/time-logs/manual', {
        method: 'POST',
        body: JSON.stringify({
          date: manualLogForm.date,
          check_in_time: manualLogForm.check_in_time,
          check_out_time: manualLogForm.check_out_time,
          break_minutes: parseInt(manualLogForm.break_minutes || 0, 10),
          project_id: manualLogForm.project_id || projects[0]?.id || null,
          notes: manualLogForm.notes,
        }),
      });
      setManualLogForm(prev => ({ ...prev, notes: '' }));
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTimeLog = async (logId) => {
    try {
      await fetchWithToken(`/api/v1/hr/time-logs/${logId}`, {
        method: 'DELETE',
      });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!teamForm.name.trim()) return;
    try {
      if (teamForm.id) {
        await fetchWithToken(`/api/v1/teams/${teamForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(teamForm),
        });
      } else {
        await fetchWithToken('/api/v1/teams', {
          method: 'POST',
          body: JSON.stringify(teamForm),
        });
      }
      setTeamForm({ id: '', name: '', member_ids: [], notes: '' });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/hr/leave-requests', {
        method: 'POST',
        body: JSON.stringify(leaveForm),
      });
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSubmitSickness = async (e) => {
    e.preventDefault();
    try {
      let docId = null;
      if (auFile) {
        const up = await uploadMediaFile({
          file: auFile,
          referenceType: 'Krankmeldung',
          referenceId: user.employee_id,
          title: `AU_${auFile.name}`,
        });
        docId = up.document_id;
      }
      await fetchWithToken('/api/v1/hr/sickness', {
        method: 'POST',
        body: JSON.stringify({ ...sickForm, au_document_id: docId }),
      });
      setAuFile(null);
      loadPortalData();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleArrayItem = (arr, item) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  const todayIso = toIsoDate(new Date());
  const todayTasks = tasks.filter(tsk => tsk.date === todayIso);
  const todayRemainingCount = todayTasks.filter(tsk => tsk.task_status !== 'Completed').length;

  const empAttrs = myEmployeeProfile?.attributes || {};

  return (
    <div className="neo">
      <div className="neo-shell">
        {/* Compact Top Header: Website Brünel SVG Logo on Left, User Profile Icon on Right (Management Portal section hidden) */}
        <header className="neo-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/bruenel-dark.svg"
              alt="Brünel"
              style={{ height: '22px', width: 'auto', display: 'block' }}
            />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '999px',
                fontSize: '0.68rem',
                fontWeight: 700,
                background: '#e6e9ef',
                boxShadow: 'inset 2px 2px 5px #c5c9d2, inset -2px -2px 5px #ffffff',
                color: activeSession ? (isPaused ? '#d97706' : '#16a34a') : 'var(--text-muted)',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: activeSession ? (isPaused ? '#d97706' : '#16a34a') : '#9ca3af',
                }}
              />
              {activeSession ? (isPaused ? t.tabCheckinPaused : t.tabCheckinActive) : t.tabCheckinOff}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onSwitchToManagement && (
              <button
                type="button"
                onClick={onSwitchToManagement}
                className="btn-primary"
                style={{
                  padding: '6px 14px',
                  minHeight: '34px',
                  borderRadius: '999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #ff6b00, #ea580c)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 3px 10px rgba(255,107,0,0.3)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title={lang === 'de' ? 'Zurück zum Management Portal (Brünel OS)' : 'Return to Management Console'}
              >
                <LayoutDashboard size={15} />
                <span>{lang === 'de' ? 'Management Portal' : 'Management Portal'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setPwStatus({ type: '', text: '' });
                setShowUserModal(true);
              }}
              className="btn-secondary"
              style={{
                padding: '5px 10px',
                minHeight: '32px',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
              }}
              title={lang === 'de' ? 'Mein Profil & Einstellungen' : 'My Profile & Settings'}
            >
              <User size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myEmployeeProfile?.first_name || user?.email?.split('@')[0] || 'Profil'}
              </span>
            </button>
          </div>
        </header>

        {/* Desktop-Only Compact Navigation Pills (Hidden on Mobile via CSS .neo-tabs)
            Order: 1. Arbeitszeiten ('checkin'), 2. Aufgaben & Kalender ('tasks'), 3. Teams, 4. Urlaub & AU, 5. Lohnabrechnung, 6. Upsell (Inactive/Greyed-out) */}
        <div className="neo-tabs">
          {[
            {
              id: 'checkin',
              Icon: Clock,
              label: t.tabCheckin,
              sub: activeSession ? (isPaused ? t.tabCheckinPaused : t.tabCheckinActive) : t.tabCheckinOff,
            },
            { id: 'tasks', Icon: Calendar, label: t.tabTasks, sub: `${tasks.length} • ${todayRemainingCount} today` },
            { id: 'teams', Icon: Users, label: t.tabTeams, sub: `${teams.length} Teams` },
            { id: 'absence', Icon: HeartPulse, label: lang === 'de' ? 'Urlaub & AU' : 'Leave & Sick', sub: `${leaves.length + sickness.length} Einträge` },
            { id: 'payslips', Icon: FileText, label: t.tabPayslips, sub: `${payslips.length} Monate` },
            {
              id: 'sales',
              Icon: ShoppingBag,
              label: 'Upsell',
              sub: lang === 'de' ? 'Derzeit inaktiv' : 'Currently inactive',
              disabled: true,
            },
          ].map(tab => {
            const IconComp = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={tab.disabled}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                className={`neo-tab ${activeTab === tab.id ? 'active' : ''} ${tab.disabled ? 'disabled' : ''}`}
              >
                <div className="t" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconComp size={14} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                </div>
                <div className="s">{tab.sub}</div>
              </button>
            );
          })}
        </div>

        {/* =====================================================================
            TAB 1 (FRONT PAGE AFTER LOGIN): ARBEITSZEITEN (CHECK-IN / PAUSE / CHECK-OUT & SUMMARY)
           ===================================================================== */}
        {activeTab === 'checkin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top Row: Compact One-Tap System Time Buttons + Smart Check-In Setup */}
            <div className="neo-grid-2">
              <div className="glass-panel">
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={15} /> {t.timeControlTitle}
                  </h3>
                  {activeSession && (
                    <span className="badge" style={{ fontSize: '0.68rem' }}>
                      {fmtTimeInput(activeSession.check_in_time)} • {activeSession.project_name}
                    </span>
                  )}
                </div>

                {/* 4 Compact One-Tap System Time Action Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={Boolean(activeSession)}
                    onClick={handleQuickCheckIn}
                    className={activeSession ? 'btn-secondary' : 'btn-primary'}
                    style={{
                      padding: '8px 6px',
                      minHeight: '38px',
                      fontSize: '0.72rem',
                      flexDirection: 'column',
                      gap: '3px',
                      opacity: activeSession ? 0.45 : 1,
                    }}
                  >
                    <Play size={13} />
                    <span>{lang === 'de' ? 'Start' : 'Check-In'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!activeSession || isPaused}
                    onClick={handlePauseStart}
                    className="btn-secondary"
                    style={{
                      padding: '8px 6px',
                      minHeight: '38px',
                      fontSize: '0.72rem',
                      flexDirection: 'column',
                      gap: '3px',
                      opacity: !activeSession || isPaused ? 0.45 : 1,
                    }}
                  >
                    <Pause size={13} />
                    <span>{lang === 'de' ? 'Pause' : 'Pause'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!activeSession || !isPaused}
                    onClick={handlePauseEnd}
                    className={isPaused ? 'btn-primary' : 'btn-secondary'}
                    style={{
                      padding: '8px 6px',
                      minHeight: '38px',
                      fontSize: '0.72rem',
                      flexDirection: 'column',
                      gap: '3px',
                      opacity: !activeSession || !isPaused ? 0.45 : 1,
                    }}
                  >
                    <Play size={13} />
                    <span>{lang === 'de' ? 'Weiter' : 'Resume'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!activeSession}
                    onClick={handleQuickCheckOut}
                    className={!activeSession ? 'btn-secondary' : 'btn-primary'}
                    style={{
                      padding: '8px 6px',
                      minHeight: '38px',
                      fontSize: '0.72rem',
                      flexDirection: 'column',
                      gap: '3px',
                      opacity: !activeSession ? 0.45 : 1,
                    }}
                  >
                    <Square size={13} />
                    <span>{lang === 'de' ? 'Ende' : 'Out'}</span>
                  </button>
                </div>
              </div>

              {/* Compact Smart Check-In Setup */}
              <div className="glass-panel">
                <h3 style={{ fontSize: '0.86rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wrench size={14} /> {t.smartCheckInSetup}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="neo-form-2">
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.selectProject}</label>
                      <select
                        value={checkInForm.project_id}
                        onChange={e => setCheckInForm({ ...checkInForm, project_id: e.target.value })}
                      >
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.selectVehicleDropdown}</label>
                      <select
                        value={checkInForm.vehicle_id}
                        onChange={e => setCheckInForm({ ...checkInForm, vehicle_id: e.target.value })}
                      >
                        <option value="">{t.noVehicle}</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.plate_number} — {v.model}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Assigned Team & Tools Compact Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                    {assignedTeamMembers.slice(0, 5).map(emp => {
                      const on = checkInForm.team_member_ids.includes(emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => setCheckInForm({ ...checkInForm, team_member_ids: toggleArrayItem(checkInForm.team_member_ids, emp.id) })}
                          style={{
                            padding: '4px 9px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            borderRadius: '999px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: on ? 'var(--accent)' : '#e6e9ef',
                            color: on ? '#ffffff' : '#2b2f38',
                            boxShadow: on ? 'inset 2px 2px 4px rgba(0,0,0,0.2)' : '2px 2px 5px #c5c9d2, -2px -2px 5px #ffffff',
                          }}
                        >
                          <Users size={10} /> {emp.full_name}
                        </button>
                      );
                    })}
                    {equipment.slice(0, 4).map(eq => {
                      const on = checkInForm.equipment_ids.includes(eq.id);
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          onClick={() => setCheckInForm({ ...checkInForm, equipment_ids: toggleArrayItem(checkInForm.equipment_ids, eq.id) })}
                          style={{
                            padding: '4px 9px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            borderRadius: '999px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: on ? '#2b2f38' : '#e6e9ef',
                            color: on ? '#ffffff' : '#2b2f38',
                            boxShadow: on ? 'inset 2px 2px 4px rgba(0,0,0,0.25)' : '2px 2px 5px #c5c9d2, -2px -2px 5px #ffffff',
                          }}
                        >
                          <Wrench size={10} /> {eq.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Monthly Working Hours Summary */}
            <div className="glass-panel">
              <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BarChart3 size={15} /> {t.biSummaryTitle}
                </h3>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <select
                    value={(biMonth || '2026-10').split('-')[1] || '10'}
                    onChange={e => setBiMonth(`${(biMonth || '2026-10').split('-')[0] || '2026'}-${e.target.value}`)}
                    style={{ width: 'auto', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700 }}
                  >
                    {MONTH_LIST_DE.map(m => (
                      <option key={m.num} value={String(m.num).padStart(2, '0')}>{m.short}</option>
                    ))}
                  </select>
                  <select
                    value={(biMonth || '2026-10').split('-')[0] || '2026'}
                    onChange={e => setBiMonth(`${e.target.value}-${(biMonth || '2026-10').split('-')[1] || '10'}`)}
                    style={{ width: 'auto', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700 }}
                  >
                    {['2025', '2026', '2027'].map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {biSummary && (
                <>
                  <div className="neo-kpi-grid" style={{ marginBottom: '10px' }}>
                    {[
                      { label: t.totalHours, val: `${biSummary.total_hours} h` },
                      { label: t.approvedHours, val: `${biSummary.approved_hours} h` },
                      { label: t.pendingHours, val: `${biSummary.pending_hours} h` },
                      { label: t.breakHours, val: `${biSummary.total_break_minutes} m` },
                      { label: t.daysWorked, val: `${biSummary.days_worked} d` },
                      { label: t.avgPerDay, val: `${biSummary.avg_hours_per_day} h` },
                    ].map((kpi, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '10px',
                          background: '#e6e9ef',
                          boxShadow: 'inset 2px 2px 5px #c5c9d2, inset -2px -2px 5px #ffffff',
                        }}
                      >
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {kpi.label}
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '1px' }}>{kpi.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Compact 1st to 31st Daily Bar Chart */}
                  <div className="neo-bi-chart-scroll">
                    <div
                      className="neo-bi-chart-inner"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${biSummary.daily_breakdown.length}, minmax(15px, 1fr))`,
                        gap: '3px',
                        alignItems: 'end',
                        height: '76px',
                        padding: '8px 6px 3px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.45)',
                      }}
                    >
                      {biSummary.daily_breakdown.map(d => {
                        const pct = Math.min((d.hours / 10) * 100, 100);
                        return (
                          <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} title={`${formatDate(d.date)}: ${d.hours}h`}>
                            <div style={{ fontSize: '0.54rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                              {d.hours > 0 ? d.hours : ''}
                            </div>
                            <div
                              style={{
                                width: '100%',
                                height: `${Math.max(pct * 0.45, 3)}px`,
                                borderRadius: '3px',
                                background: d.approved_hours > 0 ? '#16a34a' : d.hours > 0 ? 'var(--accent)' : 'rgba(197,201,210,0.6)',
                              }}
                            />
                            <div style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                              {String(d.day).padStart(2, '0')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Compact Add Past Working Day & Recent Working Hours */}
            <div className="neo-grid-2">
              <div className="glass-panel">
                <h3 style={{ fontSize: '0.86rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={15} /> {t.addPastDayTitle}
                </h3>
                <form onSubmit={handleAddManualTimeLog} style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <div className="neo-form-2">
                    <div>
                      <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.colDate}</label>
                      <DateInput
                        
                        required
                        value={manualLogForm.date}
                        onChange={e => setManualLogForm({ ...manualLogForm, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.selectProject}</label>
                      <select
                        value={manualLogForm.project_id || projects[0]?.id || ''}
                        onChange={e => setManualLogForm({ ...manualLogForm, project_id: e.target.value })}
                      >
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: '6px' }}>
                    <div>
                      <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.colStart}</label>
                      <TimeInput
                        
                        required
                        value={manualLogForm.check_in_time}
                        onChange={e => setManualLogForm({ ...manualLogForm, check_in_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.colFinish}</label>
                      <TimeInput
                        
                        required
                        value={manualLogForm.check_out_time}
                        onChange={e => setManualLogForm({ ...manualLogForm, check_out_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.colBreak}</label>
                      <input
                        type="number"
                        min="0"
                        value={manualLogForm.break_minutes}
                        onChange={e => setManualLogForm({ ...manualLogForm, break_minutes: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      placeholder={t.shiftNotesPlaceholder}
                      value={manualLogForm.notes}
                      onChange={e => setManualLogForm({ ...manualLogForm, notes: e.target.value })}
                    />
                    <button type="submit" className="btn-primary" style={{ flexShrink: 0 }}>
                      <Plus size={14} /> {lang === 'de' ? 'Eintragen' : 'Add'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Compact Working Hours Log */}
              <div className="glass-panel">
                <h3 style={{ fontSize: '0.86rem', marginBottom: '8px' }}>{t.myTimeLogsTitle}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
                  {timeLogs.map(l => {
                    const isEditing = editingLogId === l.id;
                    const isLocked = l.status === 'Approved';
                    return (
                      <div
                        key={l.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '10px',
                          background: 'rgba(255,255,255,0.52)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                        }}
                      >
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.7fr', gap: '5px' }}>
                              <DateInput  value={editLogForm.date} onChange={e => setEditLogForm({ ...editLogForm, date: e.target.value })} />
                              <TimeInput  value={editLogForm.check_in_time} onChange={e => setEditLogForm({ ...editLogForm, check_in_time: e.target.value })} />
                              <TimeInput  value={editLogForm.check_out_time} onChange={e => setEditLogForm({ ...editLogForm, check_out_time: e.target.value })} />
                              <input type="number" min="0" value={editLogForm.break_minutes} onChange={e => setEditLogForm({ ...editLogForm, break_minutes: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn-primary" style={{ flex: 1, padding: '5px 8px', minHeight: '28px' }} onClick={() => saveEditedTimeLog(l)}>
                                <Check size={12} /> {t.saveBtn}
                              </button>
                              <button className="btn-secondary" style={{ padding: '5px 8px', minHeight: '28px' }} onClick={() => setEditingLogId(null)}>
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-between" style={{ gap: '6px', flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong style={{ fontSize: '0.78rem' }}>{formatDate(l.date)}</strong>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {fmtTimeInput(l.check_in_time) || '—'} – {fmtTimeInput(l.check_out_time) || 'Active'} ({l.break_minutes || 0}m)
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>
                                {l.total_hours != null ? `${l.total_hours}h` : '—'}
                              </strong>
                              <span className="badge" style={{ fontSize: '0.64rem', padding: '2px 6px' }}>
                                {isLocked && <Lock size={9} />} {l.status}
                              </span>
                              {!isLocked && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: '3px 7px', minHeight: '24px', fontSize: '0.68rem' }}
                                    onClick={() => startEditingTimeLog(l)}
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: '3px 7px', minHeight: '24px', fontSize: '0.68rem', color: '#dc2626' }}
                                    onClick={() => handleDeleteTimeLog(l.id)}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 2: AUFGABEN & KALENDER (SLIDE LEFT/RIGHT + TAP TASK FOR POP-UP MODAL)
           ===================================================================== */}
        {activeTab === 'tasks' && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            onTouchStart={handleCalendarTouchStart}
            onTouchEnd={handleCalendarTouchEnd}
          >
            {/* Compact Calendar Controls & Slideable Day Strip */}
            <div className="glass-panel">
              <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={15} /> {t.weekOverviewTitle}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '0.66rem', fontWeight: 600 }}>
                    {Object.values(TASK_STATUS_CONFIG).map(st => (
                      <span key={st.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: st.hex || st.color, display: 'inline-block' }} />
                        {lang === 'de' ? st.de : st.en}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Date Slide Arrows & View Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '4px 8px', minHeight: '28px' }}
                    onClick={() => { navigateCalendar(-1); setMobileDayFilter('all'); }}
                    title="Slide Left"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '4px 9px', minHeight: '28px', fontSize: '0.7rem' }}
                    onClick={() => { setCursorDate(new Date()); setMobileDayFilter('all'); }}
                  >
                    {t.todayBtn}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '4px 8px', minHeight: '28px' }}
                    onClick={() => { navigateCalendar(1); setMobileDayFilter('all'); }}
                    title="Slide Right"
                  >
                    <ChevronRight size={14} />
                  </button>

                  <div
                    style={{
                      display: 'inline-flex',
                      padding: '3px',
                      borderRadius: '9px',
                      background: '#e6e9ef',
                      boxShadow: 'inset 2px 2px 5px #c5c9d2, inset -2px -2px 5px #ffffff',
                    }}
                  >
                    {[
                      { id: 'week', label: t.weekView },
                      { id: 'month', label: t.monthView },
                      { id: 'list', label: t.listView },
                    ].map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setCalView(v.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          border: 'none',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          background: calView === v.id ? '#2b2f38' : 'transparent',
                          color: calView === v.id ? '#ffffff' : '#5c6270',
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Horizontally Slideable Calendar Strip (User can slide left and right with finger or buttons) */}
              {calView === 'week' && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <span>← {lang === 'de' ? 'Kalender nach links/rechts wischen' : 'Slide calendar left / right'} →</span>
                    {mobileDayFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setMobileDayFilter('all')}
                        style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: '0.66rem', cursor: 'pointer' }}
                      >
                        {lang === 'de' ? 'Alle Tage zeigen' : 'Show all days'}
                      </button>
                    )}
                  </div>
                  <div className="neo-week-strip" ref={weekStripRef}>
                    {slidingDays.map(dayCol => {
                      const isSelected = mobileDayFilter === dayCol.iso;
                      const inCurrentWeek = weekDays.some(w => w.iso === dayCol.iso);
                      return (
                        <button
                          key={dayCol.iso}
                          type="button"
                          onClick={() => {
                            setCursorDate(dayCol.date);
                            setMobileDayFilter(prev => prev === dayCol.iso ? 'all' : dayCol.iso);
                          }}
                          className={`neo-week-strip-btn ${isSelected ? 'active' : ''} ${dayCol.isToday ? 'today' : ''}`}
                          style={{ opacity: inCurrentWeek || isSelected ? 1 : 0.65 }}
                        >
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            {dayCol.dayShort}
                          </span>
                          <span className="day-num" style={{ fontSize: '0.82rem', fontWeight: 800 }}>
                            {dayCol.dayNum}
                          </span>
                          <div style={{ display: 'flex', gap: '2px', minHeight: '6px', alignItems: 'center' }}>
                            {dayCol.tasks.length === 0 ? (
                              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(109,116,130,0.22)' }} />
                            ) : (
                              dayCol.tasks.slice(0, 4).map(tsk => {
                                const st = getStatusStyle(tsk.task_status);
                                return (
                                  <span
                                    key={tsk.id}
                                    style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.hex || st.color }}
                                  />
                                );
                              })
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* WEEK CALENDAR CARDS: Tap any task to open Pop-Up Modal */}
            {calView === 'week' && (
              <div className="neo-week-grid">
                {[...weekDays]
                  .filter(dayCol => mobileDayFilter === 'all' || dayCol.iso === mobileDayFilter)
                  .sort((a, b) => {
                    if (typeof window !== 'undefined' && window.innerWidth <= 960 && mobileDayFilter === 'all') {
                      if (a.isToday && !b.isToday) return -1;
                      if (!a.isToday && b.isToday) return 1;
                      if ((a.tasks.length > 0) !== (b.tasks.length > 0)) return b.tasks.length - a.tasks.length;
                    }
                    return 0;
                  })
                  .map(dayCol => (
                    <div
                      key={dayCol.iso}
                      className="glass-panel"
                      style={{
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px',
                        border: dayCol.isToday ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.6)',
                      }}
                    >
                      <div className="flex-between" style={{ borderBottom: '1px solid rgba(197,201,210,0.5)', paddingBottom: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: dayCol.isToday ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {dayCol.dayShort}
                          </span>
                          <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>
                            {dayCol.dayNum}. {dayCol.monthShort}
                          </span>
                        </div>
                        <span className="badge" style={{ fontSize: '0.64rem' }}>{dayCol.tasks.length}</span>
                      </div>

                      {dayCol.tasks.length === 0 ? (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 0', textAlign: 'center' }}>
                          {t.noTasksDay}
                        </div>
                      ) : (
                        dayCol.tasks.map(tsk => {
                          const st = getStatusStyle(tsk.task_status);
                          return (
                            <div
                              key={tsk.id}
                              onClick={() => setSelectedTask(tsk)}
                              style={{
                                padding: '9px 10px',
                                borderRadius: '10px',
                                background: st.bg,
                                borderLeft: `4px solid ${st.hex || st.color}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '5px',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.3 }}>
                                {tsk.title}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <MapPin size={11} style={{ flexShrink: 0 }} /> <span>{tsk.object_address}</span>
                              </div>
                              <div className="flex-between" style={{ marginTop: '2px' }}>
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: st.color }}>
                                  {lang === 'de' ? st.de : st.en}
                                </span>
                                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <span><MessageSquare size={10} /> {(tsk.comments || []).length}</span>
                                  <span><FolderOpen size={10} /> {tsk.media_count || 0}</span>
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* MONTH CALENDAR VIEW (Swipeable left/right + Tap task opens pop-up) */}
            {calView === 'month' && (
              <div className="glass-panel">
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.88rem' }}>
                    {cursorDate.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' })}
                  </strong>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                    ← {lang === 'de' ? 'Wischen für Monatswechsel' : 'Swipe to change month'} →
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                  {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                    <div key={d} style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', paddingBottom: '2px' }}>
                      {d}
                    </div>
                  ))}
                  {monthDays.map((cell, idx) =>
                    !cell ? (
                      <div key={`empty-${idx}`} style={{ minHeight: '50px', opacity: 0.25 }} />
                    ) : (
                      <div
                        key={cell.iso}
                        onClick={() => {
                          if (cell.tasks.length > 0) setSelectedTask(cell.tasks[0]);
                        }}
                        style={{
                          minHeight: '50px',
                          padding: '4px',
                          borderRadius: '9px',
                          background: '#e6e9ef',
                          boxShadow: cell.isToday
                            ? 'inset 2px 2px 5px #c5c9d2, inset -2px -2px 5px #ffffff'
                            : '2px 2px 5px #c5c9d2, -2px -2px 5px #ffffff',
                          border: cell.isToday ? '1.5px solid var(--accent)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          cursor: cell.tasks.length > 0 ? 'pointer' : 'default',
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, textAlign: 'center' }}>{cell.day}</div>
                        {cell.tasks.map(tsk => {
                          const st = getStatusStyle(tsk.task_status);
                          return (
                            <div
                              key={tsk.id}
                              onClick={e => { e.stopPropagation(); setSelectedTask(tsk); }}
                              style={{
                                fontSize: '0.58rem',
                                fontWeight: 700,
                                padding: '1px 3px',
                                borderRadius: '4px',
                                background: st.bg,
                                color: st.color,
                                borderLeft: `2px solid ${st.hex || st.color}`,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {tsk.title}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* COMPACT LIST VIEW: Tap any task to open Pop-Up Modal */}
            {calView === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tasks.map(tsk => {
                  const st = getStatusStyle(tsk.task_status);
                  return (
                    <div
                      key={tsk.id}
                      onClick={() => setSelectedTask(tsk)}
                      className="glass-panel"
                      style={{
                        borderLeft: `4px solid ${st.hex || st.color}`,
                        cursor: 'pointer',
                        padding: '10px 12px',
                      }}
                    >
                      <div className="flex-between" style={{ gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.82rem' }}>{tsk.title}</strong>
                        <span className="badge" style={{ fontSize: '0.65rem' }}>{formatDate(tsk.date)}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><MapPin size={11} /> {tsk.object_address}</span>
                        <span style={{ color: st.color, fontWeight: 700 }}>{lang === 'de' ? st.de : st.en}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 3: MEINE TEAMS (COMPACT VIEW)
           ===================================================================== */}
        {activeTab === 'teams' && (
          <div className="neo-grid-2">
            <div className="glass-panel">
              <h3 style={{ fontSize: '0.88rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={15} /> {t.createTeamTitle}
              </h3>
              <form onSubmit={handleSaveTeam} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  required
                  placeholder={t.teamNamePlaceholder}
                  value={teamForm.name}
                  onChange={e => setTeamForm({ ...teamForm, name: e.target.value })}
                />
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    {t.selectTeamMembers}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {employees.map(emp => {
                      const on = teamForm.member_ids.includes(emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => setTeamForm({ ...teamForm, member_ids: toggleArrayItem(teamForm.member_ids, emp.id) })}
                          style={{
                            padding: '4px 9px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            borderRadius: '999px',
                            border: 'none',
                            cursor: 'pointer',
                            background: on ? 'var(--accent)' : '#e6e9ef',
                            color: on ? '#ffffff' : '#2b2f38',
                            boxShadow: on ? 'inset 2px 2px 4px rgba(0,0,0,0.2)' : '2px 2px 5px #c5c9d2, -2px -2px 5px #ffffff',
                          }}
                        >
                          {emp.full_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <textarea
                  placeholder="Team notes..."
                  value={teamForm.notes}
                  onChange={e => setTeamForm({ ...teamForm, notes: e.target.value })}
                />
                <button type="submit" className="btn-primary">
                  <Plus size={14} /> {t.saveTeamBtn}
                </button>
              </form>
            </div>

            <div className="glass-panel">
              <h3 style={{ fontSize: '0.88rem', marginBottom: '8px' }}>{t.tabTeams} ({teams.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {teams.map(tm => (
                  <div
                    key={tm.id}
                    style={{
                      padding: '9px 11px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.5)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div className="flex-between">
                      <strong style={{ fontSize: '0.8rem' }}>{tm.name}</strong>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '3px 8px', minHeight: '24px', fontSize: '0.68rem' }}
                        onClick={() => setTeamForm({ id: tm.id, name: tm.name, member_ids: tm.member_ids || [], notes: tm.notes || '' })}
                      >
                        <Edit3 size={11} />
                      </button>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Lead: {tm.leader_name} • {(tm.members || []).map(m => m.name).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 4: URLAUB & KRANKMELDUNG (COMBINED COMPACT ABSENCE CENTER)
           ===================================================================== */}
        {(activeTab === 'absence' || activeTab === 'leave' || activeTab === 'sick') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="glass-panel" style={{ display: 'flex', gap: '6px', padding: '6px' }}>
              <button
                type="button"
                onClick={() => setAbsenceSubTab('leave')}
                className={absenceSubTab === 'leave' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, minHeight: '32px', fontSize: '0.74rem' }}
              >
                <Calendar size={13} /> {t.tabLeave} ({leaves.length})
              </button>
              <button
                type="button"
                onClick={() => setAbsenceSubTab('sick')}
                className={absenceSubTab === 'sick' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, minHeight: '32px', fontSize: '0.74rem' }}
              >
                <HeartPulse size={13} /> {t.tabSick} ({sickness.length})
              </button>
            </div>

            {absenceSubTab === 'leave' ? (
              <div className="neo-grid-2">
                <div className="glass-panel">
                  <h3 style={{ fontSize: '0.86rem', marginBottom: '8px' }}>{t.tabLeave}</h3>
                  <form onSubmit={handleSubmitLeave} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select value={leaveForm.type} onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value })}>
                      <option value="Daily">Ganzer Tag (Daily)</option>
                      <option value="Half-day">Halber Tag (0.5 Tage)</option>
                      <option value="Long-term">Mehrere Tage (Long-term)</option>
                    </select>
                    <div className="neo-form-2">
                      <DateInput  required value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                      <DateInput  required value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                    </div>
                    <textarea placeholder="Grund / Übergabenotiz..." value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                    <button type="submit" className="btn-primary">{lang === 'de' ? 'Urlaubsantrag senden' : 'Submit Request'}</button>
                  </form>
                </div>

                <div className="glass-panel">
                  <h3 style={{ fontSize: '0.86rem', marginBottom: '8px' }}>{t.tabLeaveSub}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {leaves.map(lv => (
                      <div key={lv.id} style={{ padding: '9px 10px', borderRadius: '9px', background: 'rgba(255,255,255,0.5)' }}>
                        <div className="flex-between">
                          <strong style={{ fontSize: '0.76rem' }}>{formatDate(lv.start_date)} → {formatDate(lv.end_date)}</strong>
                          <span className="badge" style={{ fontSize: '0.64rem' }}>{lv.status}</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{lv.type} • {lv.reason || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="neo-grid-2">
                <div className="glass-panel">
                  <h3 style={{ fontSize: '0.86rem', marginBottom: '8px' }}>{t.tabSick}</h3>
                  <form onSubmit={handleSubmitSickness} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="neo-form-2">
                      <DateInput  required value={sickForm.start_date} onChange={e => setSickForm({ ...sickForm, start_date: e.target.value })} />
                      <DateInput  required value={sickForm.end_date} onChange={e => setSickForm({ ...sickForm, end_date: e.target.value })} />
                    </div>
                    <textarea placeholder="Symptome / Notiz für HR..." value={sickForm.symptoms_note} onChange={e => setSickForm({ ...sickForm, symptoms_note: e.target.value })} />
                    <input type="file" accept="image/*,.pdf" onChange={e => setAuFile(e.target.files[0])} />
                    <button type="submit" className="btn-primary">{lang === 'de' ? 'Krankmeldung einreichen' : 'Submit Sickness Report'}</button>
                  </form>
                </div>

                <div className="glass-panel">
                  <h3 style={{ fontSize: '0.86rem', marginBottom: '8px' }}>Verlauf</h3>
                  {sickness.map(s => (
                    <div key={s.id} style={{ padding: '9px 10px', borderRadius: '9px', background: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                      <div className="flex-between">
                        <strong style={{ fontSize: '0.76rem' }}>{formatDate(s.start_date)} → {formatDate(s.end_date)}</strong>
                        <span className="badge" style={{ fontSize: '0.64rem' }}>{s.status}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{s.symptoms_note}</div>
                      {s.au_document_url && (
                        <a href={resolveMediaUrl(s.au_document_url)} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                          <FileText size={11} /> AU-Bescheinigung
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 5: LOHNABRECHNUNG BY MONTH (SLIDE-OPEN ACCORDION + GREYED OUT WHEN NOT UPLOADED)
           ===================================================================== */}
        {activeTab === 'payslips' && (
          <div className="glass-panel">
            <div className="flex-between" style={{ marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={16} /> {t.tabPayslips} ({payslipYear})
                </h3>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {lang === 'de'
                    ? 'Monat antippen zum Aufklappen der Details & Lohnabrechnung-Download.'
                    : 'Tap any month to slide open salary details & payslip download.'}
                </div>
              </div>

              <select
                value={payslipYear}
                onChange={e => setPayslipYear(e.target.value)}
                style={{ width: 'auto', padding: '5px 10px', fontSize: '0.74rem', fontWeight: 700 }}
              >
                {['2025', '2026', '2027'].map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[...MONTH_LIST_DE].reverse().map(mObj => {
                const slip = payslips.find(
                  p => Number(p.period_year) === Number(payslipYear) && Number(p.period_month) === mObj.num
                );
                const isUploaded = Boolean(slip && slip.document_url);
                const isOpen = expandedPayslipMonth === mObj.num;
                const monthTitle = `${String(mObj.num).padStart(2, '0')} · ${lang === 'de' ? mObj.labelDe : mObj.labelEn} ${payslipYear}`;

                return (
                  <div
                    key={mObj.num}
                    style={{
                      borderRadius: '11px',
                      background: '#e6e9ef',
                      boxShadow: isOpen ? 'var(--neo-inset)' : 'var(--neo-raised-sm)',
                      overflow: 'hidden',
                      transition: 'all 180ms ease',
                    }}
                  >
                    {/* Month Header Row — Tap to Slide Open */}
                    <button
                      type="button"
                      onClick={() => setExpandedPayslipMonth(prev => prev === mObj.num ? null : mObj.num)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: 'none',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'var(--text-main)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={14} style={{ color: isUploaded ? 'var(--accent)' : 'var(--text-muted)' }} />
                        <strong style={{ fontSize: '0.8rem' }}>{monthTitle}</strong>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.62rem',
                            color: isUploaded ? '#16a34a' : '#6d7482',
                          }}
                        >
                          {isUploaded
                            ? (lang === 'de' ? 'Bereitgestellt' : 'Uploaded')
                            : (lang === 'de' ? 'Noch nicht erstellt' : 'Not generated')}
                        </span>
                        <ChevronDown
                          size={15}
                          style={{
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 220ms ease',
                            color: 'var(--text-muted)',
                          }}
                        />
                      </div>
                    </button>

                    {/* Slide-Open Month Body */}
                    <div className={`neo-accordion-body ${isOpen ? 'open' : ''}`}>
                      <div className="neo-accordion-inner">
                        <div
                          style={{
                            padding: '0 12px 12px',
                            borderTop: '1px solid rgba(197,201,210,0.45)',
                            paddingTop: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '0.74rem' }}>
                            <div style={{ padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.5)' }}>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                {lang === 'de' ? 'Bruttogehalt' : 'Gross Salary'}
                              </div>
                              <strong>
                                {slip ? formatEuro(slip.gross_salary) : (myEmployeeProfile?.base_salary ? formatEuro(myEmployeeProfile.base_salary) : '—')}
                              </strong>
                            </div>
                            <div style={{ padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.5)' }}>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                {lang === 'de' ? 'Nettogehalt' : 'Net Salary'}
                              </div>
                              <strong>{slip ? formatEuro(slip.net_salary) : '—'}</strong>
                            </div>
                            <div style={{ padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.5)' }}>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                {lang === 'de' ? 'Provision / Bonus' : 'Commission'}
                              </div>
                              <strong>{slip ? formatEuro(slip.commission_bonus, { showPlus: true }) : '—'}</strong>
                            </div>
                            <div style={{ padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.5)' }}>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                {lang === 'de' ? 'Auszahlungsbetrag' : 'Total Payout'}
                              </div>
                              <strong style={{ color: isUploaded ? 'var(--accent)' : 'var(--text-main)' }}>
                                {slip ? formatEuro(slip.total_payout) : '—'}
                              </strong>
                            </div>
                          </div>

                          {/* Download Button: Active if uploaded by Manager, Greyed-out with message if not uploaded yet */}
                          {isUploaded ? (
                            <a
                              href={resolveMediaUrl(slip.document_url)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-primary"
                              style={{ width: '100%', textDecoration: 'none', fontSize: '0.76rem' }}
                            >
                              <Download size={14} /> {lang === 'de' ? 'Lohnabrechnung herunterladen' : 'Download Payslip'}
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '9px',
                                border: '1px dashed #b6bcc8',
                                background: '#d8dde6',
                                color: '#6d7482',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                cursor: 'not-allowed',
                                opacity: 0.78,
                              }}
                            >
                              <Lock size={13} />
                              <span>
                                {lang === 'de'
                                  ? 'Lohnabrechnung ist noch nicht generiert / vom Manager hochgeladen'
                                  : 'Payslip is still not generated / uploaded by manager'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =====================================================================
            TASK DETAILS POP-UP MODAL (OPENS WHEN TAPPING ANY TASK IN AUFGABEN)
           ===================================================================== */}
        {selectedTask && (
          <div
            className="modal-overlay"
            onClick={e => { if (e.target === e.currentTarget) setSelectedTask(null); }}
          >
            <div className="glass-panel" style={{ width: 'min(520px, 100%)', maxHeight: '86vh', overflowY: 'auto' }}>
              {(() => {
                const st = getStatusStyle(selectedTask.task_status);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="flex-between" style={{ gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className="badge">{formatDate(selectedTask.date)}</span>
                        <span className="badge">{selectedTask.priority}</span>
                        {selectedTask.team_name && (
                          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={11} /> {selectedTask.team_name}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 8px', minHeight: '28px' }}
                        onClick={() => setSelectedTask(null)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <h3 style={{ fontSize: '0.96rem', lineHeight: 1.3 }}>{selectedTask.title}</h3>

                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span><strong>{selectedTask.object_address}</strong> ({selectedTask.region_name}) — {selectedTask.project_name}</span>
                    </div>

                    {/* Status Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', borderRadius: '10px', background: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>{t.statusLabel}:</span>
                      <select
                        value={selectedTask.task_status}
                        onChange={e => handleTaskStatusChange(selectedTask.id, e.target.value)}
                        style={{
                          width: 'auto',
                          padding: '5px 10px',
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          color: st.color,
                          background: st.bg,
                        }}
                      >
                        {Object.values(TASK_STATUS_CONFIG).map(opt => (
                          <option key={opt.key} value={opt.key}>
                            {lang === 'de' ? opt.de : opt.en}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTask.instructions && (
                      <div style={{ fontSize: '0.76rem', padding: '9px 11px', borderRadius: '10px', background: 'rgba(255,255,255,0.55)' }}>
                        <strong style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                          {lang === 'de' ? 'Einsatzinformationen & Anweisungen' : 'Task Information & Instructions'}
                        </strong>
                        {selectedTask.instructions}
                      </div>
                    )}

                    {uploadProgress > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700 }}>
                        Uploading ({uploadProgress}%)...
                      </div>
                    )}

                    {/* Comments & Media Upload inside Pop-Up */}
                    <div style={{ paddingTop: '8px', borderTop: '1px solid rgba(197,201,210,0.6)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="flex-between">
                        <strong style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <MessageSquare size={13} /> {t.commentsLabel} ({(selectedTask.comments || []).length})
                        </strong>
                        <label className="btn-secondary" style={{ padding: '4px 9px', minHeight: '26px', fontSize: '0.7rem', cursor: 'pointer' }}>
                          <Upload size={11} /> {t.uploadMediaBtn}
                          <input
                            type="file"
                            accept="image/*,video/*,.pdf"
                            style={{ display: 'none' }}
                            onChange={e => handleUploadTaskMedia(e, selectedTask)}
                          />
                        </label>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '150px', overflowY: 'auto' }}>
                        {(selectedTask.comments || []).length === 0 ? (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {lang === 'de' ? 'Noch keine Kommentare vorhanden.' : 'No comments yet.'}
                          </div>
                        ) : (
                          (selectedTask.comments || []).map(c => (
                            <div
                              key={c.id}
                              style={{
                                padding: '6px 9px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.6)',
                                fontSize: '0.73rem',
                              }}
                            >
                              <div className="flex-between" style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                <strong>{c.author_name}</strong>
                                <span>{fmtDateTime(c.created_at)}</span>
                              </div>
                              <div>{c.text}</div>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={e => handleAddComment(e, selectedTask.id)} style={{ display: 'flex', gap: '6px' }}>
                        <input
                          placeholder={t.addCommentPlaceholder}
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                        />
                        <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}>
                          {t.postCommentBtn}
                        </button>
                      </form>

                      {(selectedTask.media || []).length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            {t.attachedFiles} ({selectedTask.media.length})
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {selectedTask.media.map(m => (
                              <a
                                key={m.id}
                                href={resolveMediaUrl(m.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.68rem', textDecoration: 'none' }}
                              >
                                <FileText size={11} /> {m.file_name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* =====================================================================
            USER PROFILE & ACCOUNT SETTINGS MODAL (READ-ONLY INFO, LANGUAGE, PASSWORD, LOGOUT)
           ===================================================================== */}
        {showUserModal && (
          <div
            className="modal-overlay"
            onClick={e => { if (e.target === e.currentTarget) setShowUserModal(false); }}
          >
            <div className="glass-panel" style={{ width: 'min(500px, 100%)', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="flex-between">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                    }}
                  >
                    {(myEmployeeProfile?.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.92rem' }}>
                      {myEmployeeProfile?.full_name || user?.email}
                    </h3>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {myEmployeeProfile?.employee_number || 'BRN-USER'} • {myEmployeeProfile?.role || user?.role}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '4px 8px', minHeight: '28px' }}
                  onClick={() => setShowUserModal(false)}
                >
                  <X size={14} />
                </button>
              </div>

              {/* 1. Language Switcher */}
              <div style={{ padding: '9px 11px', borderRadius: '10px', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Globe size={14} /> {lang === 'de' ? 'Sprache / Language' : 'Language / Sprache'}
                </span>
                <div style={{ display: 'inline-flex', gap: '4px' }}>
                  {['de', 'en'].map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleLanguageChange(code)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        borderRadius: '7px',
                        border: 'none',
                        cursor: 'pointer',
                        background: lang === code ? 'var(--accent)' : '#e6e9ef',
                        color: lang === code ? '#fff' : '#2b2f38',
                      }}
                    >
                      {code === 'de' ? 'DE · Deutsch' : 'EN · English'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Read-Only Personal & HR Information */}
              <div style={{ padding: '10px 12px', borderRadius: '11px', background: 'rgba(255,255,255,0.52)', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div className="flex-between">
                  <strong style={{ fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Shield size={13} style={{ color: 'var(--accent)' }} />
                    {lang === 'de' ? 'Meine Personaldaten (Nur Ansicht)' : 'My Employee Information (Read-Only)'}
                  </strong>
                  <span className="badge" style={{ fontSize: '0.6rem' }}>
                    <Lock size={9} /> {lang === 'de' ? 'Nicht bearbeitbar' : 'Read-only'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.72rem' }}>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Name</span>
                    <strong>{myEmployeeProfile?.full_name || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Personal-Nr.</span>
                    <strong>{myEmployeeProfile?.employee_number || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>E-Mail</span>
                    <strong>{myEmployeeProfile?.email || user?.email}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Telefon</span>
                    <strong>{myEmployeeProfile?.phone || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Abteilung & Rolle</span>
                    <strong>{myEmployeeProfile?.department || '—'} • {myEmployeeProfile?.role || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Vertragsart</span>
                    <strong>{myEmployeeProfile?.employment_type || '—'} ({empAttrs.weekly_hours || 40}h/Woche)</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Aktuelles Projekt</span>
                    <strong>{myEmployeeProfile?.assigned_project_name || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Urlaubsanspruch</span>
                    <strong>{myEmployeeProfile?.annual_leave_days ?? 30} Tage / Jahr</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Adresse</span>
                    <strong>
                      {[empAttrs.street, empAttrs.postal_code, empAttrs.city].filter(Boolean).join(', ') || '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Krankenkasse & Steuerkl.</span>
                    <strong>{empAttrs.health_insurance_name || '—'} (Kl. {empAttrs.tax_class || '—'})</strong>
                  </div>
                </div>
              </div>

              {/* 3. Change Password Section */}
              <form
                onSubmit={handleChangePassword}
                style={{ padding: '10px 12px', borderRadius: '11px', background: 'rgba(255,255,255,0.52)', display: 'flex', flexDirection: 'column', gap: '7px' }}
              >
                <strong style={{ fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <KeyRound size={13} style={{ color: 'var(--accent)' }} />
                  {lang === 'de' ? 'Passwort ändern' : 'Change Password'}
                </strong>
                <input
                  type="password"
                  required
                  placeholder={lang === 'de' ? 'Aktuelles Passwort' : 'Current password'}
                  value={pwForm.old_password}
                  onChange={e => setPwForm({ ...pwForm, old_password: e.target.value })}
                />
                <div className="neo-form-2">
                  <input
                    type="password"
                    required
                    placeholder={lang === 'de' ? 'Neues Passwort' : 'New password'}
                    value={pwForm.new_password}
                    onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })}
                  />
                  <input
                    type="password"
                    required
                    placeholder={lang === 'de' ? 'Passwort bestätigen' : 'Confirm password'}
                    value={pwForm.confirm_password}
                    onChange={e => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                  />
                </div>
                {pwStatus.text && (
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: pwStatus.type === 'error' ? '#dc2626' : '#16a34a' }}>
                    {pwStatus.text}
                  </div>
                )}
                <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>
                  {lang === 'de' ? 'Passwort speichern' : 'Update Password'}
                </button>
              </form>

              {/* Management Portal Shortcut for Tiers 1-3 */}
              {onSwitchToManagement && (
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    onSwitchToManagement();
                  }}
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #ff6b00, #ea580c)',
                    color: '#ffffff',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(255,107,0,0.25)',
                  }}
                >
                  <LayoutDashboard size={16} />
                  <span>{lang === 'de' ? 'Zum Management Portal wechseln' : 'Switch to Management Portal'}</span>
                </button>
              )}

              {/* 4. Logout & Land on Login Page */}
              <button
                type="button"
                onClick={handleLogoutToLogin}
                className="btn-secondary"
                style={{
                  width: '100%',
                  color: '#dc2626',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <LogOut size={15} />
                <span>{lang === 'de' ? 'Abmelden & zur Login-Seite' : 'Log out & return to Login'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Fixed Bottom Neomorphic Navigation Bar for On-Site Mobile Use
            Order: 1. Zeiten (Arbeitszeiten), 2. Aufgaben, 3. Teams, 4. Urlaub/AU, 5. Lohn, 6. Upsell (Inactive/Greyed-out) */}
        <nav className="neo-bottom-nav" aria-label="Mobile Field Navigation">
          {[
            { id: 'checkin', Icon: Clock, label: lang === 'de' ? 'Zeiten' : 'Hours' },
            { id: 'tasks', Icon: Calendar, label: lang === 'de' ? 'Aufgaben' : 'Tasks' },
            { id: 'teams', Icon: Users, label: 'Teams' },
            { id: 'absence', Icon: HeartPulse, label: lang === 'de' ? 'Urlaub/AU' : 'Leave' },
            { id: 'payslips', Icon: FileText, label: lang === 'de' ? 'Lohn' : 'Pay' },
            { id: 'sales', Icon: ShoppingBag, label: 'Upsell', disabled: true },
          ].map(item => {
            const IconComp = item.Icon;
            const isActive = activeTab === item.id || (item.id === 'absence' && (activeTab === 'leave' || activeTab === 'sick'));
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => !item.disabled && setActiveTab(item.id)}
                className={`neo-bottom-btn ${isActive ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                title={item.disabled ? (lang === 'de' ? 'Upsell (derzeit inaktiv)' : 'Upsell (currently inactive)') : item.label}
              >
                <IconComp size={16} strokeWidth={2.2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
