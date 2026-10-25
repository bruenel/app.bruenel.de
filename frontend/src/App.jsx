import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Link,
  useLocation,
  useNavigate,
  Navigate,
} from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, Package, Truck, Calendar, Receipt, ShoppingBag,
  Briefcase, Mail, Lock, BarChart as BarChartIcon, Settings, ShieldCheck, LogOut,
  Smartphone, ChevronRight, ChevronsLeft, ChevronsRight, Search, Plus, Bell,
  UserPlus, ClipboardList, ArrowRightLeft, FilePlus2, CornerDownLeft,
} from 'lucide-react';

import { useAuth, TIER_LABELS, fetchWithToken } from './core/api';
import {
  SupplierMatrix, MailClient, LegalVault, BIDashboard, UserSettings, SignatureSettings, UserManagement,
} from './modules/LegacyModules';
import { ExecutiveDashboard, HRManagementModule, ProjectsObjectsModule } from './modules/ErpCoreModules';
import {
  InventoryLedgerModule, FleetEquipmentModule, MasterCalendarModule, AccountingModule, FieldSalesAdminModule,
} from './modules/ErpOperationsModules';
import { EmployeePortalPWA } from './portals/EmployeePortalPWA';

/* -----------------------------------------------------------------------------
   Navigation model: every module owns a dropdown with detailed sub-sections.
   `children[].to` are absolute routes; modules read the last path segment.
----------------------------------------------------------------------------- */
export const NAV = [
  { group: 'Overview' },
  { id: 'dash', label: 'Executive Overview', icon: LayoutDashboard, to: '/', mod: 'mod_dashboard' },

  { group: 'Operations' },
  {
    id: 'projects', label: 'Projects & Objects', icon: Building2, base: '/projects', mod: 'mod_projects',
    children: [
      { to: '/projects/objects', label: 'Building Objects' },
      { to: '/projects/tasks', label: 'Task Calendar & Assignments' },
      { to: '/projects/teams', label: 'Field Teams' },
      { to: '/projects/projects', label: 'Projects & Regions' },
      { to: '/projects/delegation', label: 'Vertretung (Delegation)' },
    ],
  },
  {
    id: 'inventory', label: 'Inventory & Material', icon: Package, base: '/inventory', mod: 'mod_inventory',
    children: [
      { to: '/inventory/stock', label: 'Stock Balances' },
      { to: '/inventory/ledger', label: 'Transaction Ledger' },
      { to: '/inventory/catalog', label: 'Material Catalog (SKU)' },
      { to: '/inventory/lagers', label: 'Warehouses & Vehicle Lagers' },
    ],
  },
  {
    id: 'fleet', label: 'Fleet & Equipment', icon: Truck, base: '/fleet', mod: 'mod_fleet',
    children: [
      { to: '/fleet/vehicles', label: 'Vehicles' },
      { to: '/fleet/equipment', label: 'Tools & Equipment' },
    ],
  },
  {
    id: 'calendar', label: 'Master Calendar', icon: Calendar, base: '/calendar', mod: 'mod_calendar',
    children: [
      { to: '/calendar/all', label: 'All Events' },
      { to: '/calendar/assignments', label: 'Site Assignments' },
      { to: '/calendar/leave', label: 'Holiday (Urlaub)' },
      { to: '/calendar/sickness', label: 'Sickness (Krankmeldung)' },
      { to: '/calendar/objects', label: 'Object Milestones' },
    ],
  },

  { group: 'People & Finance' },
  {
    id: 'hr', label: 'HR & Workforce', icon: Users, base: '/hr', mod: 'mod_hr',
    children: [
      { to: '/hr/employees', label: 'Employee Directory' },
      { to: '/hr/timelogs', label: 'Working Hours' },
      { to: '/hr/leaves', label: 'Holiday Requests' },
      { to: '/hr/sickness', label: 'Sickness Reports' },
      { to: '/hr/payslips', label: 'Payslips (Lohnabrechnung)' },
    ],
  },
  {
    id: 'accounting', label: 'Accounting', icon: Receipt, base: '/accounting', mod: 'mod_accounting',
    children: [
      { to: '/accounting/overview', label: 'Financial Overview' },
      { to: '/accounting/expenses', label: 'Expense Approvals' },
      { to: '/accounting/export', label: 'DATEV Export' },
      { to: '/accounting/audit', label: 'Audit Trail' },
    ],
  },
  {
    id: 'sales', label: 'Field Sales', icon: ShoppingBag, base: '/sales', mod: 'mod_sales',
    children: [
      { to: '/sales/feed', label: 'Live Sales Feed' },
      { to: '/sales/leaderboard', label: 'Provision Leaderboard' },
      { to: '/sales/catalog', label: 'Hardware Catalog' },
    ],
  },

  { group: 'Business' },
  { id: 'suppliers', label: 'Supplier Matrix', icon: Briefcase, to: '/suppliers', mod: 'mod_suppliers' },
  {
    id: 'mail', label: 'Mail & Signature', icon: Mail, base: '/mail', mod: 'mod_mail',
    children: [
      { to: '/mail', label: 'Inbox & Compose' },
      { to: '/signature', label: 'Signature Generator' },
    ],
    activeBases: ['/mail', '/signature'],
  },
  {
    id: 'vault', label: 'Legal Vault', icon: Lock, base: '/vault', mod: 'mod_vault',
    children: [
      { to: '/vault/all', label: 'All Documents' },
      { to: '/vault/Notary', label: 'Notary Filings' },
      { to: '/vault/HRB', label: 'HRB Extracts' },
      { to: '/vault/Invoices', label: 'Invoices' },
    ],
  },
  { id: 'bi', label: 'BI Telemetry', icon: BarChartIcon, to: '/bi', mod: 'mod_bi' },

  { group: 'Administration' },
  {
    id: 'users', label: 'Access Control', icon: ShieldCheck, base: '/users', mod: 'mod_users',
    children: [{ to: '/users', label: 'Accounts & Module Matrix' }],
    activeBases: ['/users'],
  },
  { id: 'settings', label: 'Account Settings', icon: Settings, to: '/settings', mod: null },
];

const QUICK_ACTIONS = [
  { label: 'New Employee', icon: UserPlus, to: '/hr/employees', action: 'add-employee', mod: 'mod_hr' },
  { label: 'Assign Task', icon: ClipboardList, to: '/projects/tasks', action: 'add-task', mod: 'mod_projects' },
  { label: 'New Building Object', icon: Building2, to: '/projects/objects', action: 'add-object', mod: 'mod_projects' },
  { label: 'Material Buchen / Schwund', icon: ArrowRightLeft, to: '/inventory/stock', action: 'buchen', mod: 'mod_inventory' },
  { label: 'Record Expense', icon: FilePlus2, to: '/accounting/expenses', action: 'add-expense', mod: 'mod_accounting' },
  { label: 'Issue Payslip', icon: Receipt, to: '/hr/payslips', action: 'add-payslip', mod: 'mod_hr' },
];

const LoginScreen = ({ onLogin, isPortalDomain }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try { await onLogin(email, password); } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const demo = [
    ['Owner · Tier 1', 'sam.rastegar@bruenel.de'],
    ['Project Mgr · Tier 2', 'markus.weber@bruenel.de'],
    ['HR & Finance · Tier 3', 'sabine.keller@bruenel.de'],
    ['Team Lead · Tier 4', 'lukas.schmidt@bruenel.de'],
    ['Field Tech · Tier 5', 'ali.yilmaz@bruenel.de'],
  ];

  return (
    <div className={isPortalDomain ? 'neo' : 'login-wrap'} style={isPortalDomain ? { display: 'grid', placeItems: 'center' } : undefined}>
      <div className="glass-panel" style={{ width: 'min(440px, 100%)', padding: 32 }}>
        <div className="brand" style={{ padding: '0 0 20px' }}>
          <img src="/bruenel-dark.svg" alt="Brünel" style={{ height: 26, width: 'auto' }} />
          <div className="brand-text">
            <span>{isPortalDomain ? 'portal.bruenel.de' : 'app.bruenel.de'}</span>
          </div>
        </div>
        <h2 style={{ marginBottom: 4 }}>Welcome back</h2>
        <p style={{ marginBottom: 24 }}>
          {isPortalDomain ? 'Tasks, working hours, holidays and payslips in one place.' : 'Sign in to the management & project operations console.'}
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="email" placeholder="Corporate email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Authenticating…' : 'Sign in'}</button>
        </form>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <label>Local demo accounts (click to fill)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {demo.map(([t, e]) => (
              <button key={e} type="button" className="btn-secondary btn-sm" onClick={() => { setEmail(e); setPassword(e.startsWith('sam') ? 'Lattel-Macchiato!986' : 'Bruenel2026!'); }}>{t}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CommandPalette = ({ items, onClose, onGo }) => {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()) || (i.parent || '').toLowerCase().includes(q.toLowerCase()));

  useEffect(() => setIdx(0), [q]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[idx]) onGo(filtered[idx]);
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '14vh' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-panel palette">
        <input autoFocus placeholder="Search modules, sections and quick actions…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        <div className="palette-list">
          {filtered.length === 0 && <p style={{ padding: 16 }}>No results.</p>}
          {filtered.map((i, n) => (
            <button key={i.key} className="popover-item" style={{ background: n === idx ? 'var(--accent-soft)' : undefined, color: n === idx ? 'var(--accent)' : undefined }} onMouseEnter={() => setIdx(n)} onClick={() => onGo(i)}>
              {i.icon ? <i.icon size={16} /> : <ChevronRight size={16} />}
              <span style={{ flex: 1 }}>{i.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.parent || i.kind}</span>
              {n === idx && <CornerDownLeft size={14} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const ManagementLayout = ({ user, logout, onSwitchToPortal, children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(localStorage.getItem('sidebar_collapsed') === '1');
  const [openGroups, setOpenGroups] = useState({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menu, setMenu] = useState(null); // 'create' | 'user' | 'bell'
  const menuRef = useRef(null);

  useEffect(() => { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);

  // force light enterprise theme for management
  useEffect(() => { document.documentElement.removeAttribute('data-theme'); }, []);

  const hasMod = (modKey) => {
    if (!modKey) return true;
    if (user.role_tier === 1 || user.role === 'Owner') return true;
    return (user.effective_modules || user.allowed_modules || []).includes(modKey);
  };

  const isActiveItem = (item) => {
    const bases = item.activeBases || (item.base ? [item.base] : []);
    if (item.to) return item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
    return bases.some((b) => location.pathname.startsWith(b));
  };

  // auto-open the group of the current route
  useEffect(() => {
    NAV.forEach((n) => { if (n.children && isActiveItem(n)) setOpenGroups((g) => ({ ...g, [n.id]: true })); });
    // eslint-disable-next-line
  }, [location.pathname]);

  // close popovers when clicking outside
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Cmd/Ctrl+K palette + Escape closes any modal; overlay click closes modal
  useEffect(() => {
    const closeTopModal = () => {
      const overlays = document.querySelectorAll('.modal-overlay');
      const top = overlays[overlays.length - 1];
      if (!top) return false;
      const btn = [...top.querySelectorAll('button')].find((b) => /^(cancel|close|discard)$/i.test(b.textContent.trim()));
      if (btn) { btn.click(); return true; }
      return false;
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((p) => !p); }
      if (e.key === 'Escape') { setPaletteOpen(false); setMenu(null); closeTopModal(); }
    };
    const onDown = (e) => {
      if (e.target.classList && e.target.classList.contains('modal-overlay') && !e.target.querySelector('.palette')) {
        const btn = [...e.target.querySelectorAll('button')].find((b) => /^(cancel|close|discard)$/i.test(b.textContent.trim()));
        if (btn) btn.click();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, []);

  const visibleNav = NAV.filter((n) => n.group || hasMod(n.mod));
  // hide section titles with no visible items
  const compactNav = visibleNav.filter((n, i) => !n.group || (visibleNav[i + 1] && !visibleNav[i + 1].group));

  const paletteItems = useMemo(() => {
    const out = [];
    NAV.filter((n) => !n.group && hasMod(n.mod)).forEach((n) => {
      if (n.children) n.children.forEach((c) => out.push({ key: c.to, label: c.label, parent: n.label, to: c.to, icon: n.icon }));
      else out.push({ key: n.to, label: n.label, kind: 'Page', to: n.to, icon: n.icon });
    });
    QUICK_ACTIONS.filter((a) => hasMod(a.mod)).forEach((a) => out.push({ key: `qa-${a.action}`, label: a.label, kind: 'Quick action', to: a.to, action: a.action, icon: a.icon }));
    return out;
    // eslint-disable-next-line
  }, [user]);

  const go = (item) => {
    setPaletteOpen(false); setMenu(null);
    navigate(item.to, { state: item.action ? { action: item.action, t: Date.now() } : undefined });
  };

  // breadcrumbs
  const crumbs = useMemo(() => {
    for (const n of NAV) {
      if (n.group) continue;
      if (n.children) {
        const child = n.children.find((c) => c.to === location.pathname) || n.children.find((c) => location.pathname.startsWith(c.to));
        if (child) return [n.label, child.label];
        if (isActiveItem(n)) return [n.label];
      } else if (isActiveItem(n)) return [n.label];
    }
    return ['Overview'];
    // eslint-disable-next-line
  }, [location.pathname]);

  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="app-container">
      <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-text"><strong>Brünel OS</strong><span>app.bruenel.de</span></div>
        </div>

        {compactNav.map((n, i) => {
          if (n.group) return <div key={`g${i}`} className="nav-section-title">{n.group}</div>;
          const Icon = n.icon;
          const active = isActiveItem(n);
          if (!n.children) {
            return (
              <NavLink key={n.id} to={n.to} end={n.to === '/'} className={`nav-item ${active ? 'active' : ''}`} title={collapsed ? n.label : undefined}>
                <Icon size={18} /><span className="nav-label">{n.label}</span>
              </NavLink>
            );
          }
          const open = !!openGroups[n.id];
          return (
            <div key={n.id} className={`nav-group ${open ? 'open' : ''}`}>
              <button
                className={`nav-group-header ${active ? 'active' : ''}`}
                title={collapsed ? n.label : undefined}
                onClick={() => {
                  if (collapsed) { setCollapsed(false); setOpenGroups((g) => ({ ...g, [n.id]: true })); navigate(n.children[0].to); return; }
                  setOpenGroups((g) => ({ ...g, [n.id]: !g[n.id] }));
                }}
              >
                <Icon size={18} /><span className="nav-label">{n.label}</span>
                <ChevronRight size={15} className="nav-chevron" />
              </button>
              <div className="nav-sub">
                <div className="nav-sub-inner">
                  {n.children.map((c) => (
                    <NavLink key={c.to} to={c.to} className={({ isActive }) => `nav-sub-link ${isActive ? 'active' : ''}`}>
                      <span className="dot" />{c.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        <div className="sidebar-foot">
          <button className="nav-item" onClick={onSwitchToPortal} title="Open employee portal">
            <Smartphone size={18} /><span className="nav-label">Employee Portal</span>
          </button>
          <button className="nav-item" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}<span className="nav-label">Collapse sidebar</span>
          </button>
        </div>
      </nav>

      <div className="main-shell">
        <header className="topbar">
          <div className="crumbs">
            <span>Brünel OS</span>
            {crumbs.map((c, i) => (<React.Fragment key={c}><ChevronRight size={14} />{i === crumbs.length - 1 ? <strong>{c}</strong> : <span>{c}</span>}</React.Fragment>))}
          </div>

          <div className="topbar-actions" ref={menuRef}>
            <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
              <Search size={16} /><span>Search or jump to…</span><span className="kbd">⌘K</span>
            </button>

            <div className="popover-wrap">
              <button className="btn-primary" onClick={() => setMenu(menu === 'create' ? null : 'create')}><Plus size={16} />Create</button>
              {menu === 'create' && (
                <div className="popover">
                  <div className="popover-label">Quick actions</div>
                  {QUICK_ACTIONS.filter((a) => hasMod(a.mod)).map((a) => (
                    <button key={a.action} className="popover-item" onClick={() => go(a)}><a.icon size={16} />{a.label}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="popover-wrap">
              <button className="btn-secondary btn-icon" onClick={() => setMenu(menu === 'bell' ? null : 'bell')} aria-label="Notifications"><Bell size={16} /></button>
              {menu === 'bell' && (
                <div className="popover" style={{ minWidth: 300 }}>
                  <div className="popover-label">Needs attention</div>
                  <button className="popover-item" onClick={() => go({ to: '/hr/leaves' })}>Pending holiday requests</button>
                  <button className="popover-item" onClick={() => go({ to: '/accounting/expenses' })}>Expenses awaiting approval</button>
                  <button className="popover-item" onClick={() => go({ to: '/inventory/stock' })}>Low-stock SKUs</button>
                </div>
              )}
            </div>

            <div className="popover-wrap">
              <button className="avatar" style={{ cursor: 'pointer' }} onClick={() => setMenu(menu === 'user' ? null : 'user')}>{initials}</button>
              {menu === 'user' && (
                <div className="popover">
                  <div style={{ padding: '8px 12px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{user.email}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TIER_LABELS[user.role_tier || 1]}</div>
                  </div>
                  <hr />
                  <Link to="/settings" className="popover-item" style={{ textDecoration: 'none' }} onClick={() => setMenu(null)}><Settings size={16} />Account settings</Link>
                  <button className="popover-item" onClick={onSwitchToPortal}><Smartphone size={16} />Open employee portal</button>
                  <button className="popover-item" onClick={logout}><LogOut size={16} />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main-content" key={location.pathname.split('/')[1]}>{children}</main>
      </div>

      {paletteOpen && <CommandPalette items={paletteItems} onClose={() => setPaletteOpen(false)} onGo={go} />}
    </div>
  );
};

export default function App() {
  const { user, login, logout, loading, updateProfile } = useAuth();

  const isPortalHostname = window.location.hostname.startsWith('portal.');
  const [portalModeOverride, setPortalModeOverride] = useState(localStorage.getItem('bruenel_portal_mode') === 'portal');
  const togglePortalMode = (mode) => {
    localStorage.setItem('bruenel_portal_mode', mode);
    setPortalModeOverride(mode === 'portal');
  };

  if (loading) {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Loading Brünel session…</div>;
  }
  if (!user) return <LoginScreen onLogin={login} isPortalDomain={isPortalHostname || portalModeOverride} />;

  // Force first-login password change when user logs in with an Admin-generated One-Time Password (OTP)
  if (user.must_change_password) {
    return (
      <div className={isPortalHostname ? 'neo' : 'login-wrap'} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
        <div className="glass-panel" style={{ width: 'min(440px, 100%)', padding: 28 }}>
          <div className="brand" style={{ padding: '0 0 18px' }}>
            <div className="brand-mark">B</div>
            <div className="brand-text">
              <strong>Brünel Security</strong>
              <span>First Login — Set Personal Password</span>
            </div>
          </div>
          <h3 style={{ marginBottom: 6 }}>Set Your Personal Password</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
            You signed in using a one-time password generated by HR/Management. Please choose your own personal password to activate your account ({user.email}).
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const pw1 = String(fd.get('pw1') || '');
              const pw2 = String(fd.get('pw2') || '');
              if (pw1.length < 6) {
                alert('Password must be at least 6 characters.');
                return;
              }
              if (pw1 !== pw2) {
                alert('Passwords do not match.');
                return;
              }
              try {
                await fetchWithToken('/api/v1/auth/me/first-login-password', {
                  method: 'POST',
                  body: JSON.stringify({ new_password: pw1 }),
                });
                updateProfile({ must_change_password: false });
              } catch (err) {
                alert(err.message);
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <input name="pw1" type="password" required placeholder="New personal password (min. 6 chars)" />
            <input name="pw2" type="password" required placeholder="Confirm new personal password" />
            <button type="submit" className="btn-primary">Save Password & Continue</button>
            <button type="button" className="btn-secondary" onClick={logout}>Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  const showEmployeePortal = isPortalHostname || !user.can_access_app || portalModeOverride;
  if (showEmployeePortal) {
    return (
      <EmployeePortalPWA
        user={user}
        logout={logout}
        onSwitchToManagement={user.can_access_app && !isPortalHostname ? () => togglePortalMode('management') : null}
      />
    );
  }

  return (
    <Router>
      <ManagementLayout user={user} logout={logout} onSwitchToPortal={() => togglePortalMode('portal')}>
        <Routes>
          <Route path="/" element={<ExecutiveDashboard user={user} />} />
          <Route path="/projects/:section?" element={<ProjectsObjectsModule user={user} />} />
          <Route path="/hr/:section?" element={<HRManagementModule user={user} />} />
          <Route path="/inventory/:section?" element={<InventoryLedgerModule user={user} />} />
          <Route path="/fleet/:section?" element={<FleetEquipmentModule user={user} />} />
          <Route path="/calendar/:section?" element={<MasterCalendarModule user={user} />} />
          <Route path="/accounting/:section?" element={<AccountingModule user={user} />} />
          <Route path="/sales/:section?" element={<FieldSalesAdminModule user={user} />} />
          <Route path="/suppliers" element={<SupplierMatrix />} />
          <Route path="/mail" element={<MailClient user={user} />} />
          <Route path="/signature" element={<SignatureSettings user={user} />} />
          <Route path="/vault/:section?" element={<LegalVault />} />
          <Route path="/bi" element={<BIDashboard />} />
          <Route path="/settings" element={<UserSettings user={user} onUpdate={updateProfile} />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ManagementLayout>
    </Router>
  );
}
