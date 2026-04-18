import React, { useState, useEffect } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate
} from 'react-router-dom'
import { 
  Briefcase, 
  Mail, 
  Lock, 
  BarChart as BarChartIcon, 
  Settings, 
  LogOut,
  ChevronRight,
  Plus,
  Users,
  PenTool,
  Sun,
  Moon
} from 'lucide-react'

let API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// Production URL Sanitization
if (API_BASE && !API_BASE.startsWith('http')) {
  API_BASE = `https://${API_BASE}`;
}
API_BASE = API_BASE.replace(/\/$/, ""); // Remove trailing slash

// Auth Logic
const useAuth = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error('Token expired')
        return res.json()
      })
      .then(data => setUser(data))
      .catch(() => {
        localStorage.removeItem('token')
        setUser(null)
      })
      .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])
  
  const login = async (email, password) => {
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Authentication failed');
      
      const data = await response.json();
      localStorage.setItem('token', data.access_token);
      
      const profRes = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${data.access_token}` }
      });
      const userData = await profRes.json();
      setUser(userData);
    } catch (err) {
      alert(`Verification failed: ${err.message} (Target: ${API_BASE})`);
    }
  }
  
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  }
  
  return { user, login, logout, loading }
}

const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(email, password);
    setLoading(false);
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ width: '400px' }}>
        <h2 style={{ marginBottom: '8px' }}>Brünel OS</h2>
        <p style={{ marginBottom: '24px' }}>System Access Terminal</p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '8px' }}>
            {loading ? 'Authenticating...' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  )
}

const fetchWithToken = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  } else {
    delete headers['Content-Type']; // Let browser set multipart boundary
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

const Layout = ({ user, logout, children }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="app-container">
      <nav className="sidebar">
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.25rem' }}>Brünel<span style={{ color: 'var(--accent)' }}>.OS</span></h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{user.email.split('@')[0]} ({user.role})</div>
        </div>
        
        <Link to="/" className="nav-item">
          <Briefcase size={20} />
          Supplier Matrix
        </Link>
        <Link to="/mail" className="nav-item">
          <Mail size={20} />
          Internal Mail
        </Link>
        
        {user.role !== 'Mitarbeiter' && (
          <>
            <Link to="/vault" className="nav-item">
              <Lock size={20} />
              Legal Vault
            </Link>
            <Link to="/bi" className="nav-item">
              <BarChartIcon size={20} />
              BI Dashboard
            </Link>
          </>
        )}
        
        {user.role === 'Owner' && (
          <Link to="/users" className="nav-item">
            <Users size={20} />
            User Management
          </Link>
        )}

        <Link to="/settings" className="nav-item">
          <Settings size={20} />
          User Settings
        </Link>
        <Link to="/signature" className="nav-item">
          <PenTool size={20} />
          Mail Signature
        </Link>
        
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="nav-item" onClick={toggleTheme} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button className="nav-item" onClick={logout} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}>
            <LogOut size={20} />
            Secure Logout
          </button>
        </div>
      </nav>
      
      <main className="main-content">
        <header className="flex-between">
          <div>
            <h1 style={{ fontSize: '1.5rem' }}>Overview Console.</h1>
            <p style={{marginTop: '4px', fontSize: '0.85rem'}}>Access Control: KST {user.allowed_kst ? user.allowed_kst.join(', ') : 'All'}</p>
          </div>
          <div className="flex-row">
            <span className="badge">Connection Secure</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

const SupplierMatrix = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ kst: 2000, supplier_name: '', status: 'Negotiating', price: '', moq: '' });

  const loadSuppliers = () => {
    setLoading(true);
    fetchWithToken('/api/supplier/')
      .then(setData)
      .catch(err => alert("Error loading suppliers: " + err.message))
      .finally(() => setLoading(false))
  };

  useEffect(() => { loadSuppliers() }, []);

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/supplier/', {
        method: 'POST',
        body: JSON.stringify(newSupplier)
      });
      setShowModal(false);
      loadSuppliers();
    } catch (err) {
      alert("Failed to add supplier: " + err.message);
    }
  }

  const columns = ['Negotiating', 'Samples Request', 'Production'];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <h2>Supplier Network Pipelines</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>New Supplier Record</h3>
            <form onSubmit={handleAddSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Supplier Name" required value={newSupplier.supplier_name} onChange={e => setNewSupplier({...newSupplier, supplier_name: e.target.value})} />
              <input type="number" placeholder="KST (e.g. 2000)" required value={newSupplier.kst} onChange={e => setNewSupplier({...newSupplier, kst: parseInt(e.target.value)})} />
              <select value={newSupplier.status} onChange={e => setNewSupplier({...newSupplier, status: e.target.value})}>
                <option value="Negotiating">Negotiating</option>
                <option value="Samples Request">Samples Request</option>
                <option value="Production">Production</option>
              </select>
              <input placeholder="Pricing Info" value={newSupplier.price} onChange={e => setNewSupplier({...newSupplier, price: e.target.value})} />
              <input type="number" placeholder="MoQ" value={newSupplier.moq} onChange={e => setNewSupplier({...newSupplier, moq: e.target.value})} />
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <p>Loading Data Pipeline...</p> : (
        <div className="kanban-board">
          {columns.map(col => (
            <div key={col} className="kanban-column">
              <h3 style={{ marginBottom: '16px' }}>{col}</h3>
              {data.filter(d => (d.status === col || (col === 'Samples Request' && d.status === 'Samples'))).length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                  <p>Empty Queue.</p>
                </div>
              )}
              {data.filter(d => (d.status === col || (col === 'Samples Request' && d.status === 'Samples'))).map((item) => (
                <div key={item.id} className="kanban-card">
                  <div className="badge" style={{ marginBottom: '8px' }}>KST {item.kst}</div>
                  <h4>{item.supplier_name}</h4>
                  <div className="flex-between" style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>{item.pricing || 'TBD'}</span>
                    <span>MoQ: {item.moq || 'TBD'}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MailClient = () => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeData, setComposeData] = useState({ to_email: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchWithToken('/api/mail/inbox')
      .then(data => { setEmails(data); if(data.length > 0) setSelected(data[0]); })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, []);

  const runAiExtract = async () => {
    try {
      await fetchWithToken('/api/supplier/sync_ai', { method: 'POST' });
      alert("AI Processing triggers successfully queued for selected email context.");
    } catch (e) {
      alert("AI Processing Failed: " + e.message);
    }
  }

  const handleSendEmail = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await fetchWithToken('/api/mail/send', {
        method: 'POST',
        body: JSON.stringify(composeData)
      });
      alert('Email sent successfully.');
      setIsComposing(false);
      setComposeData({ to_email: '', subject: '', body: '' });
    } catch (err) {
      alert('Failed to send email: ' + err.message);
    }
    setSending(false);
  };

  return (
    <div>
      <h2>Internal Mail Client</h2>
      <p style={{ marginBottom: '24px' }}>Connected to corporate IMAP services securely.</p>
      
      {loading ? <p>Syncing Inbox...</p> : (
        <div className="grid grid-cols-3" style={{ gridTemplateColumns: '300px 1fr' }}>
          <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => {setIsComposing(true); setSelected(null);}}>Compose</button>
            </div>
            {emails.map(email => (
              <div key={email.id} onClick={() => {setSelected(email); setIsComposing(false);}} 
                   style={{ 
                     padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                     background: selected?.id === email.id ? 'var(--surface-hover)' : 'transparent' 
                   }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '4px' }}>{email.subject}</h4>
                <p style={{ fontSize: '0.8rem' }}>{email.from}</p>
              </div>
            ))}
          </div>
          
          {isComposing && (
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>Compose New Message</h3>
              <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                <input type="email" placeholder="To" required value={composeData.to_email} onChange={e => setComposeData({...composeData, to_email: e.target.value})} />
                <input type="text" placeholder="Subject" required value={composeData.subject} onChange={e => setComposeData({...composeData, subject: e.target.value})} />
                <textarea placeholder="Message body..." required value={composeData.body} onChange={e => setComposeData({...composeData, body: e.target.value})} style={{ flex: 1, minHeight: '300px', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', resize: 'vertical' }} />
                <button type="submit" disabled={sending} className="btn-primary" style={{ alignSelf: 'flex-start', padding: '10px 24px', marginTop: '8px' }}>
                  {sending ? 'Sending...' : 'Send Email'}
                </button>
              </form>
            </div>
          )}
          
          {selected && !isComposing && (
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div>
                  <h3>{selected.subject}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>From: {selected.from}</p>
                </div>
                <button className="btn-secondary" onClick={runAiExtract} style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                  Extract to Kanban (AI)
                </button>
              </div>
              <div style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {selected.body || 'No message body.'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const LegalVault = () => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState({ kst: 1000, folder: 'Notary', file: null });

  const loadDocs = () => {
    setLoading(true);
    fetchWithToken('/api/vault/')
      .then(setDocs)
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs() }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) return alert("Select a file");
    
    const formData = new FormData();
    formData.append('file', uploadData.file);
    
    try {
      await fetchWithToken(`/api/vault/upload?kst=${uploadData.kst}&folder=${uploadData.folder}`, {
        method: 'POST',
        body: formData
      });
      setShowUpload(false);
      setUploadData({...uploadData, file: null});
      loadDocs();
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
  }

  const groups = ['Notary', 'HRB', 'Invoices'];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>Legal Archive & Encrypted Vault</h2>
          <p>Files are strictly encrypted separate from webroot.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>Upload Document</button>
      </div>
      
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Secure Upload</h3>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="number" placeholder="KST" required value={uploadData.kst} onChange={e => setUploadData({...uploadData, kst: parseInt(e.target.value)})} />
              <select value={uploadData.folder} onChange={e => setUploadData({...uploadData, folder: e.target.value})}>
                <option value="Notary">Notary Filings</option>
                <option value="HRB">HRB Extracts</option>
                <option value="Invoices">Invoices</option>
              </select>
              <input type="file" required onChange={e => setUploadData({...uploadData, file: e.target.files[0]})} style={{background: 'transparent'}} />
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowUpload(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Upload</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <p>Decrypting vault index...</p> : (
        <div className="grid grid-cols-3">
          {groups.map(g => {
            const count = docs.filter(d => d.folder === g).length;
            return (
              <div key={g} className="glass-panel interactive">
                <div className="flex-between" style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>{g}</h3>
                  <ChevronRight size={18} color="var(--text-muted)" />
                </div>
                <p style={{ fontSize: '0.85rem' }}>{count} Document{count !== 1 ? 's' : ''}</p>
                {count > 0 && (
                  <div style={{marginTop: '16px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px'}}>
                    {docs.filter(d => d.folder === g).map(d => (
                      <div key={d.id} style={{fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)'}}>
                        📄 {d.title} (KST {d.kst})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Simple bar chart using pure CSS/divs — no external library needed
const BarChart = ({ data, labelKey, valueKey, color = 'var(--accent)' }) => {
  const [hovered, setHovered] = useState(null);

  if (!data || data.length === 0) return <p style={{color:'var(--text-muted)'}}>No data.</p>;
  const max = Math.max(...data.map(d => d[valueKey]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((item, i) => (
        <div 
          key={i} 
          style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', cursor: 'pointer' }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          <div style={{ width: '100px', fontSize: '0.78rem', color: hovered === i ? 'var(--text-main)' : 'var(--text-muted)', textAlign: 'right', flexShrink: 0, transition: 'color 0.2s' }}>
            {String(item[labelKey])}
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '22px', overflow: 'hidden' }}>
            <div style={{
              width: `${(item[valueKey] / max) * 100}%`,
              background: hovered === i ? 'var(--accent-hover)' : color,
              opacity: hovered === i ? 1 : 0.9,
              height: '100%',
              borderRadius: '4px',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex', alignItems: 'center', paddingLeft: '8px'
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: hovered === i ? '#fff' : '#000', transition: 'color 0.3s' }}>
                {item[valueKey]}
              </span>
            </div>
          </div>
          {/* Tooltip */}
          {hovered === i && (
            <div style={{
              position: 'absolute',
              left: `calc(100px + ${(item[valueKey] / max) * 100}% + 15px)`,
              background: 'var(--surface-hover)',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              pointerEvents: 'none',
              zIndex: 10,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
              {item[labelKey]}: <strong>{item[valueKey]}</strong>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ label, value, sub }) => (
  <div className="glass-panel" style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '0.9rem', marginTop: '8px', fontWeight: 600 }}>{label}</div>
    {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
  </div>
);

const BIDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [kstFilter, setKstFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = () => {
    setLoading(true);
    let url = '/api/bi/dashboard';
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (kstFilter) params.append('kst', kstFilter);
    if (params.toString()) url += `?${params.toString()}`;

    fetchWithToken(url)
      .then(setData)
      .catch(err => console.error('BI load error:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const setPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  };

  const topReferral = data?.referral_breakdown?.[0]?.referral || '—';
  const topDevice = data?.device_breakdown?.[0]?.device || '—';
  const topKst = data?.kst_breakdown?.sort((a,b) => b.count - a.count)?.[0];
  
  const filteredRawData = data?.raw_data?.filter(r => 
    !searchTerm || 
    r.ip_address?.includes(searchTerm) || 
    r.page_url?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.country?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(r.mapped_kst_interest).includes(searchTerm)
  ) || [];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '16px' }}>
        <div>
          <h2>BI Telemetry Dashboard</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Live pipeline mapping website visitor behaviour to KST cost centres.</p>
        </div>
      </div>

      {/* Interactive Filters Bar */}
      <div className="glass-panel" style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setPreset(0)}>Today</button>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setPreset(7)}>7D</button>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setPreset(30)}>30D</button>
        </div>
        <div style={{ height: '24px', width: '1px', background: 'var(--border)' }}></div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.85rem' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.85rem' }} />
        </div>
        <div style={{ height: '24px', width: '1px', background: 'var(--border)' }}></div>
        <select value={kstFilter} onChange={e => setKstFilter(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.85rem' }}>
          <option value="">All KST</option>
          <option value="1000">KST 1000 (IT)</option>
          <option value="2000">KST 2000 (Home)</option>
          <option value="3000">KST 3000 (Clothing)</option>
          <option value="4000">KST 4000 (Services)</option>
        </select>
        <button className="btn-primary" onClick={loadData} style={{ padding: '6px 16px', marginLeft: 'auto' }}>
          Apply Filters
        </button>
      </div>

      {loading ? (
        <p>Loading Matrix...</p>
      ) : !data ? (
        <p>Error loading data.</p>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard label="Total Visitors" value={data.total_hits} sub="All time" />
            <StatCard label="Top Source" value={topReferral} sub="Referral channel" />
            <StatCard label="Top Device" value={topDevice} sub="Platform share" />
            <StatCard label="Top KST Interest" value={topKst ? `KST ${topKst.kst}` : '—'} sub={topKst ? `${topKst.count} hits` : 'No data'} />
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>KST Interest Breakdown</h3>
              <BarChart
                data={data.kst_breakdown}
                labelKey="kst"
                valueKey="count"
                color="var(--accent)"
              />
            </div>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Device Breakdown</h3>
              <BarChart
                data={data.device_breakdown}
                labelKey="device"
                valueKey="count"
                color="#6ee7b7"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Top Referral Sources</h3>
              <BarChart
                data={data.referral_breakdown}
                labelKey="referral"
                valueKey="count"
                color="#a78bfa"
              />
            </div>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Daily Trend (Last 14 Days)</h3>
              <BarChart
                data={data.daily_trend}
                labelKey="date"
                valueKey="count"
                color="#fb923c"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>🌍 Top Countries</h3>
              <BarChart
                data={data.country_breakdown}
                labelKey="country"
                valueKey="count"
                color="#34d399"
              />
            </div>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>🏙 Top Cities</h3>
              <BarChart
                data={data.city_breakdown}
                labelKey="city"
                valueKey="count"
                color="#06b6d4"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Most Viewed Contents</h3>
              <BarChart
                data={data.page_breakdown}
                labelKey="page"
                valueKey="count"
                color="#fb923c"
              />
            </div>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>⏱ Average Time Spent (Sec)</h3>
              <BarChart
                data={data.page_avg_durations}
                labelKey="page"
                valueKey="avg_seconds"
                color="#f43f5e"
              />
            </div>
          </div>

          {/* Raw Data Table */}
          <div className="glass-panel">
            <div className="flex-between" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1rem' }}>Latest Raw Events</h3>
              <input 
                type="text" 
                placeholder="Search IP, Page, KST, or Location..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                style={{ padding: '8px 12px', width: '300px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.85rem' }} 
              />
            </div>
            {filteredRawData.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                No telemetry drops found matching your criteria.
              </p>
            ) : (
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>IP Address</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Platform</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Referral</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Country</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>City</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Page / Action</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Consent</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Duration</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRawData.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 8px', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                        {r.ip_address || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{r.device_type || '—'}</td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{r.referral || 'direct'}</td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem', fontWeight: 500 }}>{r.country || '—'}</td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{r.city || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span className="badge">KST {r.mapped_kst_interest || '?'}</span>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>
                        <div style={{fontWeight: 600}}>{r.page_url}</div>
                        <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{r.event_type}</div>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>
                        {r.consent_given ? <span style={{color: '#34d399'}}>Yes</span> : <span style={{color: '#f87171'}}>No</span>}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>
                        {r.duration_seconds ? `${r.duration_seconds}s` : '—'}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString('de-DE') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const UserSettings = ({ user }) => {
  const [passwords, setPasswords] = useState({ old_password: '', new_password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [mailPassword, setMailPassword] = useState('');
  const [mailLoading, setMailLoading] = useState(false);
  const [mailMessage, setMailMessage] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await fetchWithToken('/api/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify(passwords)
      });
      setMessage('Password updated successfully.');
      setPasswords({ old_password: '', new_password: '' });
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
    setLoading(false);
  };

  const handleConfigureMail = async (e) => {
    e.preventDefault();
    setMailLoading(true);
    setMailMessage('');
    try {
      await fetchWithToken('/api/mail/configure', {
        method: 'PUT',
        body: JSON.stringify({ email_password: mailPassword })
      });
      setMailMessage('IMAP/SMTP settings are connected successfully to Strato servers.');
      setMailPassword('');
    } catch (err) {
      setMailMessage('Error: ' + err.message);
    }
    setMailLoading(false);
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>User Settings</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Manage your account security and integrations.</p>
        </div>
      </div>
      
      <div className="glass-panel" style={{ maxWidth: '500px', marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Account Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', fontSize: '0.9rem' }}>
          <div style={{ color: 'var(--text-muted)' }}>Email:</div>
          <div style={{ fontWeight: 600 }}>{user.email}</div>
          <div style={{ color: 'var(--text-muted)' }}>Role:</div>
          <div><span className="badge" style={{ fontSize: '0.75rem' }}>{user.role}</span></div>
          <div style={{ color: 'var(--text-muted)' }}>System ID:</div>
          <div style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{user.id}</div>
          <div style={{ color: 'var(--text-muted)' }}>Allowed KST:</div>
          <div>{user.allowed_kst ? user.allowed_kst.map(k => `KST ${k}`).join(', ') : 'All Access (Admin)'}</div>
        </div>
      </div>

      <div className="glass-panel" style={{ maxWidth: '500px', marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Mail Server Configuration</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Connect your IMAP/SMTP corporate mail account. Servers are pre-configured to Brünel's Strato enterprise cluster (imap.strato.de / smtp.strato.de with SSL).
        </p>
        <form onSubmit={handleConfigureMail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="email" value={user.email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
          <input type="password" placeholder="Mail Password" required value={mailPassword} onChange={e => setMailPassword(e.target.value)} />
          <button type="submit" disabled={mailLoading} className="btn-primary" style={{ marginTop: '8px' }}>
            {mailLoading ? 'Connecting...' : 'Connect Mail System'}
          </button>
          {mailMessage && <p style={{ fontSize: '0.85rem', color: mailMessage.startsWith('Error') ? 'var(--error)' : '#34d399', marginTop: '8px' }}>{mailMessage}</p>}
        </form>
      </div>

      <div className="glass-panel" style={{ maxWidth: '500px' }}>
        <h3 style={{ marginBottom: '16px' }}>Change Password</h3>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="password" placeholder="Current Password" required value={passwords.old_password} onChange={e => setPasswords({...passwords, old_password: e.target.value})} />
          <input type="password" placeholder="New Password" required value={passwords.new_password} onChange={e => setPasswords({...passwords, new_password: e.target.value})} />
          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '8px' }}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
          {message && <p style={{ fontSize: '0.85rem', color: message.startsWith('Error') ? 'var(--error)' : 'var(--accent)', marginTop: '8px' }}>{message}</p>}
        </form>
      </div>
    </div>
  );
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'Mitarbeiter', allowed_kst: [] });
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = () => {
    setLoading(true);
    fetchWithToken('/api/auth/users')
      .then(setUsers)
      .catch(err => alert("Error loading users: " + err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const allowed_kst = newUser.allowed_kst.length > 0 ? newUser.allowed_kst : null;
      await fetchWithToken('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({ ...newUser, allowed_kst })
      });
      setShowAdd(false);
      setNewUser({ email: '', password: '', role: 'Mitarbeiter', allowed_kst: [] });
      loadUsers();
    } catch (err) {
      alert("Failed to add user: " + err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken(`/api/auth/users/${resetModal.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ new_password: newPassword })
      });
      setResetModal(null);
      setNewPassword('');
      alert("Password reset successfully.");
    } catch (err) {
      alert("Failed to reset password: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await fetchWithToken(`/api/auth/users/${id}`, { method: 'DELETE' });
      loadUsers();
    } catch (err) {
      alert("Failed to delete user: " + err.message);
    }
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>User Management</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Admin access to manage system accounts.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={18} /> Add User
        </button>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>New User</h3>
            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="email" placeholder="Email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
              <input type="password" placeholder="Password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
              <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                <option value="Owner">Owner</option>
                <option value="Manager">Manager</option>
                <option value="Mitarbeiter">Mitarbeiter</option>
              </select>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Allowed KST (Leave all unchecked for full access)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  {[1000, 2000, 3000, 4000].map(kst => (
                    <label key={kst} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                      <input 
                        type="checkbox" 
                        checked={newUser.allowed_kst.includes(kst)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewUser({...newUser, allowed_kst: [...newUser.allowed_kst, kst]});
                          } else {
                            setNewUser({...newUser, allowed_kst: newUser.allowed_kst.filter(k => k !== kst)});
                          }
                        }}
                      />
                      KST {kst}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Reset Password for {resetModal.email}</h3>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="password" placeholder="New Password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => { setResetModal(null); setNewPassword(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <p>Loading Users...</p> : (
        <div className="glass-panel">
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Email</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Role</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Allowed KST</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{u.id}</td>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{u.email}</td>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}><span className="badge">{u.role}</span></td>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{u.allowed_kst ? u.allowed_kst.join(', ') : 'All'}</td>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setResetModal(u)}>Reset Pwd</button>
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--error)', color: 'var(--error)' }} onClick={() => handleDelete(u.id)}>Delete</button>
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

const generateSignature = (data) => `
<meta charset="UTF-8">
<table cellpadding="0" cellspacing="0" border="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #333333; width: 650px; background-color: #FAFAFA;">
  <tr>
    <td style="padding: 20px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="115" valign="top" style="padding-right: 20px; border-right: 2px solid #d13a1a;">
            <img src="${data.photo_url || 'https://media.licdn.com/dms/image/v2/D4E03AQEkDFFEDSfGQQ/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1727683725283?e=1778112000&v=beta&t=4YSKkUu6ByY9QVM9TzqfjGP1PP5851mT_6QKBSZNNkk'}" alt="${data.name}" width="100" height="100" style="display: block; border-radius: 50%; object-fit: cover;">
          </td>
          <td valign="top" style="padding-left: 20px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="top">
                  <h3 style="margin: 0; font-size: 20px; color: #111111; font-weight: bold;">${data.name}</h3>
                  <p style="margin: 2px 0 0 0; font-size: 14px; color: #d13a1a; font-weight: bold;">${data.title}</p>
                </td>
                <td valign="top" align="right">
                   <a href="https://www.bruenel.de" target="_blank" style="text-decoration: none;">
                     <img src="https://www.bruenel.de/bruenel-dark.svg" alt="Brünel" width="110" style="display: block; border: none;">
                   </a>
                </td>
              </tr>
            </table>
            <p style="margin: 10px 0 12px 0; font-size: 13px; color: #444444; line-height: 1.4;">
              <strong style="color: #111111;">Brünel Deutschland UG</strong><br>
              Ramonville Str. 28, 61184 Karben, Germany
            </p>
            <table cellpadding="0" cellspacing="0" border="0" style="font-size: 13px; color: #555555; line-height: 1.8;">
               <tr>
                  <td style="padding-right: 20px; padding-bottom: 4px;">
                     <a href="${data.linkedin_url}" style="text-decoration: none; color: #555555;">
                       <img src="https://img.icons8.com/ios-filled/20/d13a1a/linkedin.png" alt="in" width="14" height="14" style="vertical-align: middle; margin-right: 4px; border: none;"> linkedin.com/in/${data.linkedin_url.split('linkedin.com/in/')[1] || ''}
                     </a>
                  </td>
                  <td style="padding-bottom: 4px;">
                     <a href="https://wa.me/${data.phone.replace(/[^0-9]/g, '')}" style="text-decoration: none; color: #555555;">
                       <img src="https://img.icons8.com/ios-filled/20/d13a1a/whatsapp--v1.png" alt="wa" width="14" height="14" style="vertical-align: middle; margin-right: 4px; border: none;"> ${data.phone}
                     </a>
                  </td>
               </tr>
               <tr>
                  <td colspan="2" style="padding-bottom: 4px;">
                     <a href="https://www.bruenel.de" style="text-decoration: none; color: #555555;">
                       <img src="https://img.icons8.com/ios-filled/20/d13a1a/domain.png" alt="web" width="14" height="14" style="vertical-align: middle; margin-right: 4px; border: none;"> www.bruenel.de
                     </a>
                  </td>
               </tr>
            </table>
            <div style="font-size: 11px; color: #111111; font-weight: bold; padding-top: 10px; margin-top: 8px; border-top: 1px solid #EAEAEA;">
              Data Protection & Privacy: 
              <span style="font-weight: normal; margin-left: 4px;">
                <a href="https://www.bruenel.de/datenschutz" style="color: #d13a1a; text-decoration: none;">English</a> &nbsp;|&nbsp; 
                <a href="https://www.bruenel.de/datenschutz" style="color: #d13a1a; text-decoration: none;">Deutsch</a> &nbsp;|&nbsp; 
                <a href="https://www.bruenel.de/datenschutz" style="color: #d13a1a; text-decoration: none;">中文</a> &nbsp;|&nbsp; 
                <a href="https://www.bruenel.de/datenschutz" style="color: #d13a1a; text-decoration: none;">فارسی</a> &nbsp;|&nbsp; 
                <a href="https://www.bruenel.de/datenschutz" style="color: #d13a1a; text-decoration: none;">العربية</a>
              </span>
            </div>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 20px; background-color: #2A2A2A; background-image: url('https://www.bruenel.de/assets/branding.png'); background-size: cover; background-position: center; border-radius: 12px; overflow: hidden;">
        <tr>
          <td style="padding: 28px 24px; background: rgba(20, 20, 20, 0.6);">
            <h4 style="margin: 0 0 16px 0; color: #ffffff; font-size: 18px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">Brünel Future | Establishing Digital Pipelines</h4>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color: #d13a1a; border-radius: 20px; padding: 10px 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                  <a href="https://www.bruenel.de" target="_blank" style="color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; display: block;">Learn more</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

const SignatureSettings = ({ user }) => {
  const [data, setData] = useState({
    name: 'Sam Rastegar',
    title: 'CEO / Geschäftsführer',
    phone: '+49 157 37 57 84 30',
    linkedin_url: 'https://www.linkedin.com/in/samrastegar/',
    photo_url: 'https://media.licdn.com/dms/image/v2/D4E03AQEkDFFEDSfGQQ/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1727683725283?e=1778112000&v=beta&t=4YSKkUu6ByY9QVM9TzqfjGP1PP5851mT_6QKBSZNNkk'
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const htmlContent = generateSignature(data);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetchWithToken('/api/mail/signature', {
        method: 'PUT',
        body: JSON.stringify({ signature_html: htmlContent })
      });
      setMessage('Signature saved successfully and applied to your email account.');
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>Mail Signature</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Customize your outgoing corporate email signature.</p>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '16px' }}>Personal Information</h3>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Full Name</label>
              <input type="text" placeholder="e.g. Sam Rastegar" required value={data.name} onChange={e => setData({...data, name: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Job Title</label>
              <input type="text" placeholder="e.g. CEO / Geschäftsführer" required value={data.title} onChange={e => setData({...data, title: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Phone Number</label>
              <input type="text" placeholder="e.g. +49 157 37 57 84 30" required value={data.phone} onChange={e => setData({...data, phone: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>LinkedIn Profile URL</label>
              <input type="url" placeholder="https://linkedin.com/in/..." required value={data.linkedin_url} onChange={e => setData({...data, linkedin_url: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Profile Photo URL</label>
              <input type="url" placeholder="https://..." required value={data.photo_url} onChange={e => setData({...data, photo_url: e.target.value})} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '8px' }}>
              {loading ? 'Saving...' : 'Save Signature'}
            </button>
            {message && <p style={{ fontSize: '0.85rem', color: message.startsWith('Error') ? 'var(--error)' : '#34d399', marginTop: '8px' }}>{message}</p>}
          </form>
        </div>
        
        <div className="glass-panel" style={{ background: '#FAFAFA' }}>
          <h3 style={{ marginBottom: '16px', color: '#111' }}>Live Preview</h3>
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} style={{ transform: 'scale(0.8)', transformOrigin: 'top left' }} />
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const { user, login, logout, loading } = useAuth()

  if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Authenticating...</div>
  
  if (!user) {
    return <LoginScreen onLogin={login} />
  }

  return (
    <Router>
      <Layout user={user} logout={logout}>
        <Routes>
          <Route path="/" element={<SupplierMatrix />} />
          <Route path="/mail" element={<MailClient />} />
          <Route path="/vault" element={<LegalVault />} />
          <Route path="/bi" element={<BIDashboard />} />
          <Route path="/settings" element={<UserSettings user={user} />} />
          <Route path="/signature" element={<SignatureSettings user={user} />} />
          <Route path="/users" element={user.role === 'Owner' ? <UserManagement /> : <div>Unauthorized</div>} />
        </Routes>
      </Layout>
    </Router>
  )
}
