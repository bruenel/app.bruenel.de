import React, { useState, useEffect } from 'react';
import { Plus, ChevronRight, Users, ShieldCheck, CheckSquare } from 'lucide-react';
import { fetchWithToken, MODULE_CATALOG, TIER_LABELS } from '../core/api';
import { useParams } from 'react-router-dom';

export const SupplierMatrix = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ kst: 2000, supplier_name: '', status: 'Negotiating', price: '', moq: '' });

  const loadSuppliers = () => {
    setLoading(true);
    fetchWithToken('/api/supplier/')
      .then(setData)
      .catch(err => alert("Error loading suppliers: " + err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSuppliers(); }, []);

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
  };

  const columns = ['Negotiating', 'Samples Request', 'Production'];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>Supplier Network Pipelines</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Sourcing & manufacturing workflow segmented by KST cost center.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay">
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
  );
};

export const MailClient = ({ user }) => {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('INBOX');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeData, setComposeData] = useState({ to_email: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchWithToken('/api/mail/folders')
      .then(setFolders)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWithToken('/api/mail/folder/' + encodeURIComponent(selectedFolder))
      .then(data => { setEmails(data); if (data.length > 0) setSelected(data[0]); else setSelected(null); })
      .catch(err => { console.error(err); setError(err.message); setEmails([]); setSelected(null); })
      .finally(() => setLoading(false));
  }, [selectedFolder]);

  const runAiExtract = async () => {
    try {
      await fetchWithToken('/api/supplier/sync_ai', { method: 'POST' });
      alert("AI Processing triggers successfully queued for selected email context.");
    } catch (e) {
      alert("AI Processing Failed: " + e.message);
    }
  };

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

  if (!user.imap_host) {
    return (
      <div>
        <h2>Internal Mail Client</h2>
        <div className="glass-panel" style={{ marginTop: '24px', textAlign: 'center', padding: '48px' }}>
          <h3>Mail Not Configured</h3>
          <p style={{ marginTop: '8px' }}>Please visit User Settings to connect your Brünel IMAP/SMTP account securely.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>Internal Mail Client</h2>
          <p style={{ marginTop: '4px' }}>Connected securely to Brünel enterprise mail.</p>
        </div>
        <button className="btn-primary" onClick={runAiExtract} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none' }}>
          ✨ Extract Inbox (AI)
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '200px 300px 1fr', flex: 1, minHeight: '0', height: 'calc(100vh - 200px)', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ padding: '0 16px 16px 16px', borderBottom: '1px solid var(--border)' }}>
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => {setIsComposing(true); setSelected(null); setComposeData({to_email: '', subject: '', body: ''});}}>New Message</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {folders.map(folder => (
              <div key={folder} onClick={() => {setSelectedFolder(folder); setIsComposing(false);}}
                   style={{
                     padding: '12px 16px', cursor: 'pointer', fontSize: '0.9rem',
                     background: selectedFolder === folder ? 'var(--surface-hover)' : 'transparent',
                     borderLeft: selectedFolder === folder ? '3px solid var(--accent)' : '3px solid transparent'
                   }}>
                {folder}
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {loading ? <p style={{ padding: '16px' }}>Syncing...</p> : error ? <p style={{ padding: '16px', color: '#dc2626' }}>{error}</p> : emails.length === 0 ? <p style={{ padding: '16px', color: 'var(--text-muted)' }}>Folder empty.</p> : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {emails.map(email => (
                <div key={email.id} onClick={() => {setSelected(email); setIsComposing(false);}}
                     style={{
                       padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                       background: selected?.id === email.id ? 'var(--surface-hover)' : 'transparent'
                     }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.subject || '(No Subject)'}</h4>
                  <p style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.from}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{email.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {isComposing ? (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>Compose Message</h3>
            <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
              <input type="email" placeholder="To" required value={composeData.to_email} onChange={e => setComposeData({...composeData, to_email: e.target.value})} />
              <input type="text" placeholder="Subject" required value={composeData.subject} onChange={e => setComposeData({...composeData, subject: e.target.value})} />
              <textarea placeholder="Message body..." required value={composeData.body} onChange={e => setComposeData({...composeData, body: e.target.value})} style={{ flex: 1, minHeight: '200px' }} />
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="submit" disabled={sending} className="btn-primary">{sending ? 'Sending...' : 'Send Message'}</button>
                <button type="button" className="btn-secondary" onClick={() => setIsComposing(false)}>Discard</button>
              </div>
            </form>
          </div>
        ) : selected ? (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{selected.subject || '(No Subject)'}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem' }}><strong>From:</strong> {selected.from} • {selected.date}</p>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'var(--surface)', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
              {selected.body || 'No text body available.'}
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', height: '100%' }}>
            Select an email to read
          </div>
        )}
      </div>
    </div>
  );
};

export const LegalVault = () => {
  const { section } = useParams();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState({ kst: 1000, folder: 'Notary', file: null });

  const loadDocs = () => {
    setLoading(true);
    fetchWithToken('/api/vault/')
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs(); }, []);

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
  };

  const groups = section && section !== 'all' ? [section] : ['Notary', 'HRB', 'Invoices'];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2>Legal Archive & Encrypted Vault</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Files are strictly encrypted separate from webroot.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>Upload Document</button>
      </div>

      {showUpload && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Secure Upload</h3>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="number" placeholder="KST" required value={uploadData.kst} onChange={e => setUploadData({...uploadData, kst: parseInt(e.target.value)})} />
              <select value={uploadData.folder} onChange={e => setUploadData({...uploadData, folder: e.target.value})}>
                <option value="Notary">Notary Filings</option>
                <option value="HRB">HRB Extracts</option>
                <option value="Invoices">Invoices</option>
              </select>
              <input type="file" required onChange={e => setUploadData({...uploadData, file: e.target.files[0]})} />
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
                  <div style={{marginTop: '16px', background: 'var(--surface-2)', padding: '8px', borderRadius: '8px'}}>
                    {docs.filter(d => d.folder === g).map(d => (
                      <div key={d.id} style={{fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)'}}>
                        📄 {d.title} (KST {d.kst})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const BarChart = ({ data, labelKey, valueKey, color = 'var(--accent)' }) => {
  if (!data || data.length === 0) return <p style={{color:'var(--text-muted)'}}>No data.</p>;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '110px', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
            {String(item[labelKey])}
          </div>
          <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: '4px', height: '22px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max((item[valueKey] / max) * 100, 6)}%`,
              background: color,
              height: '100%',
              borderRadius: '4px',
              display: 'flex', alignItems: 'center', paddingLeft: '8px'
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>{item[valueKey]}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const BIDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    fetchWithToken('/api/bi/dashboard')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const seedDemo = async () => {
    try {
      await fetchWithToken('/api/bi/seed_demo', { method: 'POST' });
      loadData();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '16px' }}>
        <div>
          <h2>BI Telemetry Dashboard</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Live pipeline mapping website visitor behaviour to KST cost centres.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={seedDemo}>Seed Demo Events</button>
          <button className="btn-primary" onClick={loadData}>Refresh</button>
        </div>
      </div>

      {loading ? <p>Loading Matrix...</p> : !data ? <p>No telemetry data.</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel"><div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{data.unique_visitors}</div><div style={{ fontSize: '0.85rem' }}>Unique Visitors</div></div>
            <div className="glass-panel"><div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{data.total_hits}</div><div style={{ fontSize: '0.85rem' }}>Total Events</div></div>
            <div className="glass-panel"><div style={{ fontSize: '2rem', fontWeight: 700, color: '#059669' }}>{data.unique_sessions}</div><div style={{ fontSize: '0.85rem' }}>Sessions</div></div>
            <div className="glass-panel"><div style={{ fontSize: '2rem', fontWeight: 700, color: '#2563eb' }}>{data.device_breakdown?.[0]?.device || 'Desktop'}</div><div style={{ fontSize: '0.85rem' }}>Top Platform</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>KST Interest Breakdown</h3>
              <BarChart data={data.kst_breakdown} labelKey="kst" valueKey="count" />
            </div>
            <div className="glass-panel">
              <h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>Top Countries</h3>
              <BarChart data={data.country_breakdown} labelKey="country" valueKey="count" color="#059669" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const UserSettings = ({ user, onUpdate }) => {
  const [passwords, setPasswords] = useState({ old_password: '', new_password: '' });
  const [message, setMessage] = useState('');
  const [mailPassword, setMailPassword] = useState('');
  const [mailMessage, setMailMessage] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
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
  };

  const handleConfigureMail = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/mail/configure', {
        method: 'PUT',
        body: JSON.stringify({ email_password: mailPassword })
      });
      setMailMessage('IMAP/SMTP connected securely.');
      if (onUpdate) onUpdate({ imap_host: 'imap.strato.de' });
      setMailPassword('');
    } catch (err) {
      setMailMessage('Error: ' + err.message);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Account & Security Settings</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '16px' }}>Profile & RBAC Authority</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Email:</span>
            <strong>{user.email}</strong>
            <span style={{ color: 'var(--text-muted)' }}>Role:</span>
            <span><span className="badge">{user.role}</span></span>
            <span style={{ color: 'var(--text-muted)' }}>RBAC Tier:</span>
            <span>{TIER_LABELS[user.role_tier || 5]}</span>
            <span style={{ color: 'var(--text-muted)' }}>Employee UUID:</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{user.employee_id || '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Allowed KST:</span>
            <span>{user.allowed_kst ? user.allowed_kst.join(', ') : 'All KST'}</span>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
          <h4 style={{ marginBottom: '12px' }}>Change Password</h4>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" placeholder="Current Password" required value={passwords.old_password} onChange={e => setPasswords({...passwords, old_password: e.target.value})} />
            <input type="password" placeholder="New Password" required value={passwords.new_password} onChange={e => setPasswords({...passwords, new_password: e.target.value})} />
            <button type="submit" className="btn-primary">Update Password</button>
            {message && <p style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>{message}</p>}
          </form>
        </div>

        <div className="glass-panel">
          <h3 style={{ marginBottom: '12px' }}>Strato Enterprise Mail Connection</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>Connect your corporate IMAP/SMTP mailbox (`imap.strato.de` / `smtp.strato.de`).</p>
          <form onSubmit={handleConfigureMail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="email" value={user.email} disabled />
            <input type="password" placeholder="Strato Mail Password" required value={mailPassword} onChange={e => setMailPassword(e.target.value)} />
            <button type="submit" className="btn-primary">Connect Mail Account</button>
            {mailMessage && <p style={{ fontSize: '0.85rem', color: '#059669' }}>{mailMessage}</p>}
          </form>
        </div>
      </div>
    </div>
  );
};

export const SignatureSettings = () => {
  const [data, setData] = useState({
    name: 'Sam Rastegar',
    title: 'CEO / Geschäftsführer',
    phone: '+49 157 37 57 84 30',
    linkedin_url: 'https://www.linkedin.com/in/samrastegar/',
  });
  const [message, setMessage] = useState('');

  const htmlContent = `<div style="font-family:sans-serif;padding:16px;background:#fafafa;color:#111;border-left:4px solid #d13a1a;">
    <strong style="font-size:16px;">${data.name}</strong><br/>
    <span style="color:#d13a1a;font-weight:600;">${data.title}</span><br/>
    <small>Brünel Deutschland UG • Ramonville Str. 28, 61184 Karben • ${data.phone}</small>
  </div>`;

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/mail/signature', {
        method: 'PUT',
        body: JSON.stringify({ signature_html: htmlContent })
      });
      setMessage('Corporate signature saved.');
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>Mail Signature Generator</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <form onSubmit={handleSave} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input value={data.name} onChange={e => setData({...data, name: e.target.value})} placeholder="Full Name" />
          <input value={data.title} onChange={e => setData({...data, title: e.target.value})} placeholder="Job Title" />
          <input value={data.phone} onChange={e => setData({...data, phone: e.target.value})} placeholder="Phone" />
          <button type="submit" className="btn-primary">Save Signature</button>
          {message && <p style={{ fontSize: '0.85rem', color: '#059669' }}>{message}</p>}
        </form>
        <div className="glass-panel">
          <h4 style={{ marginBottom: '12px' }}>Preview</h4>
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      </div>
    </div>
  );
};

/**
 * Enhanced User & Granular Module Access Control Matrix
 * Allows Super Admin / Owner to assign 5-Tier RBAC roles, KST access,
 * Portal access (`app.bruenel.de` vs `portal.bruenel.de`), and individual module permissions per account.
 */
export const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const defaultNewUser = {
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'Field Employee',
    role_tier: 5,
    can_access_app: false,
    can_access_portal: true,
    allowed_kst: [1000],
    allowed_modules: [],
  };
  const [newUser, setNewUser] = useState(defaultNewUser);

  const loadUsers = () => {
    setLoading(true);
    fetchWithToken('/api/auth/users')
      .then(setUsers)
      .catch(err => alert("Error loading users: " + err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const roleOptions = [
    { role: 'Owner', tier: 1, label: 'Owner / Super Admin (Tier 1)' },
    { role: 'Project Manager', tier: 2, label: 'Project Manager / Projektleiter (Tier 2)' },
    { role: 'HR & Finance Admin', tier: 3, label: 'HR & Finance Admin (Tier 3)' },
    { role: 'Team Lead', tier: 4, label: 'Team Lead / Vorarbeiter (Tier 4)' },
    { role: 'Field Employee', tier: 5, label: 'Field Employee / Technician (Tier 5)' },
    { role: 'Partner', tier: 2, label: 'Partner / Representative (Tier 2)' },
    { role: 'Mitarbeiter', tier: 5, label: 'Mitarbeiter (Tier 5)' },
  ];

  const handleRoleSelect = (targetObj, setter, selectedRole) => {
    const found = roleOptions.find(r => r.role === selectedRole) || { tier: 5 };
    const defaultMods = found.tier === 1
      ? MODULE_CATALOG.map(m => m.key)
      : found.tier === 2
      ? ['mod_dashboard', 'mod_projects', 'mod_inventory', 'mod_fleet', 'mod_calendar', 'mod_hr', 'mod_sales']
      : found.tier === 3
      ? ['mod_dashboard', 'mod_hr', 'mod_accounting', 'mod_calendar', 'mod_sales', 'mod_vault']
      : found.tier === 4
      ? ['mod_dashboard', 'mod_projects', 'mod_inventory', 'mod_fleet', 'mod_calendar', 'mod_sales']
      : [];

    setter({
      ...targetObj,
      role: selectedRole,
      role_tier: found.tier,
      can_access_app: found.tier <= 4,
      allowed_modules: defaultMods,
    });
  };

  const toggleModule = (targetObj, setter, modKey) => {
    const current = targetObj.allowed_modules || targetObj.effective_modules || [];
    const next = current.includes(modKey)
      ? current.filter(k => k !== modKey)
      : [...current, modKey];
    setter({ ...targetObj, allowed_modules: next, can_access_app: next.length > 0 ? true : targetObj.can_access_app });
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setShowAdd(false);
      setNewUser(defaultNewUser);
      loadUsers();
    } catch (err) {
      alert("Failed to create user: " + err.message);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken(`/api/auth/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          email: editUser.email,
          role: editUser.role,
          role_tier: editUser.role_tier,
          allowed_kst: editUser.allowed_kst,
          allowed_modules: editUser.allowed_modules,
          can_access_app: editUser.can_access_app,
          can_access_portal: editUser.can_access_portal,
        }),
      });
      setEditUser(null);
      loadUsers();
    } catch (err) {
      alert("Failed to update user: " + err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken(`/api/auth/users/${resetModal.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ new_password: newPassword }),
      });
      setResetModal(null);
      setNewPassword('');
      alert("Password reset successfully.");
    } catch (err) {
      alert("Failed to reset password: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this user account?")) return;
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
          <h2>5-Tier RBAC & Module Access Matrix</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
            Configure account authority tiers, portal access (`app.bruenel.de` vs `portal.bruenel.de`), and granular module permissions.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={18} /> Create Account
        </button>
      </div>

      {/* Add / Edit Modal */}
      {(showAdd || editUser) && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {showAdd ? 'Create Account & Assign Module Access' : `Configure Access: ${editUser.email}`}
            </h3>
            <form onSubmit={showAdd ? handleAddUser : handleEditUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Email Address</label>
                  <input
                    type="email"
                    required
                    value={showAdd ? newUser.email : editUser.email}
                    onChange={e => showAdd ? setNewUser({...newUser, email: e.target.value}) : setEditUser({...editUser, email: e.target.value})}
                  />
                </div>
                {showAdd && (
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Initial Password</label>
                    <input
                      type="password"
                      required
                      value={newUser.password}
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                    />
                  </div>
                )}
              </div>

              {showAdd && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>First Name</label>
                    <input value={newUser.first_name} onChange={e => setNewUser({...newUser, first_name: e.target.value})} placeholder="e.g. Lukas" />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Last Name</label>
                    <input value={newUser.last_name} onChange={e => setNewUser({...newUser, last_name: e.target.value})} placeholder="e.g. Schmidt" />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>RBAC Role & Authority Tier</label>
                  <select
                    value={showAdd ? newUser.role : editUser.role}
                    onChange={e => showAdd ? handleRoleSelect(newUser, setNewUser, e.target.value) : handleRoleSelect(editUser, setEditUser, e.target.value)}
                  >
                    {roleOptions.map(o => <option key={o.role} value={o.role}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Tier Level (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={showAdd ? newUser.role_tier : (editUser.role_tier || 5)}
                    onChange={e => showAdd ? setNewUser({...newUser, role_tier: parseInt(e.target.value)}) : setEditUser({...editUser, role_tier: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              {/* Portal Access Switches */}
              <div style={{ display: 'flex', gap: '24px', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={showAdd ? newUser.can_access_app : !!editUser.can_access_app}
                    onChange={e => showAdd ? setNewUser({...newUser, can_access_app: e.target.checked}) : setEditUser({...editUser, can_access_app: e.target.checked})}
                  />
                  <strong>Allow Management Portal (`app.bruenel.de`)</strong>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={showAdd ? newUser.can_access_portal : (editUser.can_access_portal !== false)}
                    onChange={e => showAdd ? setNewUser({...newUser, can_access_portal: e.target.checked}) : setEditUser({...editUser, can_access_portal: e.target.checked})}
                  />
                  <strong>Allow Employee Portal (`portal.bruenel.de`)</strong>
                </label>
              </div>

              {/* Module Permissions Matrix */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                  Permitted Modules on `app.bruenel.de`:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {MODULE_CATALOG.map(mod => {
                    const target = showAdd ? newUser : editUser;
                    const activeList = target.allowed_modules || target.effective_modules || [];
                    const checked = target.role_tier === 1 || activeList.includes(mod.key);
                    return (
                      <label
                        key={mod.key}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px',
                          borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                          background: checked ? 'rgba(255,107,0,0.08)' : 'transparent',
                          cursor: 'pointer', fontSize: '0.8rem'
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ width: 'auto', marginTop: '2px' }}
                          checked={checked}
                          onChange={() => showAdd ? toggleModule(newUser, setNewUser, mod.key) : toggleModule(editUser, setEditUser, mod.key)}
                        />
                        <div>
                          <div style={{ fontWeight: 600 }}>{mod.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{mod.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => { setShowAdd(false); setEditUser(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>{showAdd ? 'Create Account' : 'Save Access Matrix'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Reset Password: {resetModal.email}</h3>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="password" placeholder="New Password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setResetModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <p>Loading Accounts...</p> : (
        <div className="glass-panel">
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Account</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Role & RBAC Tier</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Portals</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Granted Modules (`app.bruenel.de`)</th>
                <th style={{ padding: '10px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 8px', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600 }}>{u.email}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Emp: {u.employee_id?.slice(0, 8) || '—'}</div>
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '0.85rem' }}>
                    <span className="badge">{u.role}</span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Tier {u.role_tier || 5}</div>
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '0.8rem' }}>
                    {u.can_access_app && <span className="badge" style={{ marginRight: '4px', background: 'rgba(59,130,246,0.15)', color: '#2563eb' }}>app.bruenel.de</span>}
                    <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>portal.bruenel.de</span>
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '0.78rem' }}>
                    {u.role_tier === 1 ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>All 13 Modules (Super Admin)</span>
                    ) : (u.effective_modules?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {u.effective_modules.map(m => (
                          <span key={m} style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.7rem' }}>
                            {m.replace('mod_', '')}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Employee Portal Only</span>
                    ))}
                  </td>
                  <td style={{ padding: '12px 8px', display: 'flex', gap: '6px' }}>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => setEditUser({ ...u, allowed_modules: u.effective_modules || [] })}>
                      Access Matrix
                    </button>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => setResetModal(u)}>
                      Reset Pwd
                    </button>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#dc2626' }} onClick={() => handleDelete(u.id)}>
                      Delete
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
