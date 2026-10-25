import React, { useState } from 'react';
import {
  Briefcase, User, FileText, MapPin, ShieldCheck, Upload, CheckCircle2,
  ArrowRight, ArrowLeft, X, Sparkles, Globe, Building2, Check,
} from 'lucide-react';
import { API_URL } from '../core/api';

const PROJECT_DOMAINS = [
  'FTTH & Glasfaser Engineering (NE3 / NE4)',
  'Enterprise Cloud & IT Infrastructure',
  'Network Security, Routing & Carrier Backbone',
  'Smart Building, IoT & Elektrotechnik',
  'Software Engineering, DevOps & ERP Automation',
  'IT-Projektleitung, Bauleitung & Rollout Management',
];

const PAGES = [
  { id: 1, title: 'Page 1 · Personal Information', short: '1. Personal Info', icon: User },
  { id: 2, title: 'Page 2 · Working History & CV', short: '2. Work History & CV', icon: FileText },
  { id: 3, title: 'Page 3 · Project Interests & Location', short: '3. Projects & Location', icon: MapPin },
  { id: 4, title: 'Page 4 · DSGVO & Datenschutzerklärung', short: '4. DSGVO & Submit', icon: ShieldCheck },
];

export function ITProjectCandidateModal({ onClose, onRegistered }) {
  // 4 Pages, each with focused one-question-at-a-time steps
  const [page, setPage] = useState(1);
  const [subStep, setSubStep] = useState(0);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    birth_date: '',
    nationality: 'Deutsch',
    role: '',
    department: 'IT & Engineering Projects',
    experience_years: '5–8 Jahre',
    work_history_summary: '',
    skills: '',
    cv_file_url: '',
    cv_file_name: '',
    linkedin_url: '',
    interested_projects: ['FTTH & Glasfaser Engineering (NE3 / NE4)', 'Enterprise Cloud & IT Infrastructure'],
    city: '',
    postal_code: '',
    country: 'Deutschland',
    remote_preference: 'Hybrid (Vor Ort & Remote)',
    preferred_contract_model: 'Freelancer',
    availability_date: 'Ab sofort',
    tagessatz: '680',
    stundensatz: '85',
    dsgvo_accepted: false,
    datenschutz_accepted: false,
    talent_pool_accepted: false,
  });

  // Sub-questions per page (One-Question-Per-Form-Card inside the 4 Pages)
  const pageQuestions = {
    1: [
      { key: 'name', label: 'How should we address you?', subtitle: 'Please enter your legal first and last name.' },
      { key: 'contact', label: 'How can our project team reach you?', subtitle: 'Your direct email address and mobile phone number.' },
      { key: 'origin', label: 'Nationality & Date of Birth', subtitle: 'Used for project clearance & German compliance.' },
    ],
    2: [
      { key: 'role_exp', label: 'What is your primary IT / Engineering role & experience level?', subtitle: 'Tell us your current specialization and years in the field.' },
      { key: 'history', label: 'Briefly describe your working history & core technologies', subtitle: 'Highlight key projects, certifications, or technical stack.' },
      { key: 'cv', label: 'Upload your CV / Lebenslauf (optional or add above)', subtitle: 'PDF, DOCX or image up to 15 MB — directly attached to your HR dossier.' },
    ],
    3: [
      { key: 'projects', label: 'Which IT & Engineering projects are you interested in?', subtitle: 'Select one or more project domains at Brünel Deutschland.' },
      { key: 'location', label: 'Where are you currently located & how flexible are you?', subtitle: 'City, postal code, and travel / remote readiness.' },
      { key: 'model_rates', label: 'Preferred collaboration model & rate expectations', subtitle: 'Freelancer, Full-time, or Subunternehmer — plus Tagessatz / Stundensatz.' },
    ],
    4: [
      { key: 'dsgvo', label: 'DSGVO, Datenschutzerklärung & HR Database Registration', subtitle: 'Please review and accept our data protection terms to complete your registration.' },
    ],
  };

  const currentQuestions = pageQuestions[page] || [];
  const totalSubSteps = currentQuestions.length;

  const goToPage = (targetPage, targetSub = 0) => {
    setError('');
    setPage(targetPage);
    setSubStep(targetSub);
  };

  const handleNext = () => {
    setError('');
    // Validate required fields on Page 1
    if (page === 1 && subStep === 0 && (!form.first_name.trim() || !form.last_name.trim())) {
      setError('Bitte Vorname und Nachname eingeben (Please enter your first and last name).');
      return;
    }
    if (page === 1 && subStep === 1 && !form.email.trim()) {
      setError('Bitte eine gültige E-Mail-Adresse eingeben (Please enter your email address).');
      return;
    }
    if (subStep < totalSubSteps - 1) {
      setSubStep(subStep + 1);
    } else if (page < 4) {
      setPage(page + 1);
      setSubStep(0);
    }
  };

  const handlePrev = () => {
    setError('');
    if (subStep > 0) {
      setSubStep(subStep - 1);
    } else if (page > 1) {
      const prevPage = page - 1;
      setPage(prevPage);
      setSubStep((pageQuestions[prevPage]?.length || 1) - 1);
    }
  };

  const handleCvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCv(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_URL}/api/v1/hr/candidates/upload-cv`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'CV upload failed');
      setForm((prev) => ({
        ...prev,
        cv_file_url: data.file_url,
        cv_file_name: data.file_name || file.name,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingCv(false);
    }
  };

  const toggleProjectInterest = (domain) => {
    setForm((prev) => {
      const exists = prev.interested_projects.includes(domain);
      return {
        ...prev,
        interested_projects: exists
          ? prev.interested_projects.filter((d) => d !== domain)
          : [...prev.interested_projects, domain],
      };
    });
  };

  const handleSubmitCandidate = async () => {
    setError('');
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError('Please complete your name and email on Page 1.');
      setPage(1);
      setSubStep(0);
      return;
    }
    if (!form.dsgvo_accepted || !form.datenschutz_accepted || !form.talent_pool_accepted) {
      setError('Bitte akzeptieren Sie alle DSGVO- und Datenschutzerklärungen, um fortzufahren.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        tagessatz: Number(form.tagessatz || 0),
        stundensatz: Number(form.stundensatz || 0),
      };
      const res = await fetch(`${API_URL}/api/v1/hr/candidates/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Registration failed');
      setSubmittedResult(data.candidate);
      window.dispatchEvent(new CustomEvent('bruenel-candidate-registered', { detail: data.candidate }));
      if (onRegistered) onRegistered(data.candidate);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const curQ = currentQuestions[subStep] || currentQuestions[0];

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 9999, backdropFilter: 'blur(12px)', background: 'rgba(15, 23, 42, 0.55)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-panel"
        style={{
          width: 'min(760px, 96vw)',
          height: '660px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 18,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.28)',
        }}
      >
        {/* Top Fixed Header */}
        <div
          style={{
            padding: '18px 26px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#ff6b00',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
              }}
            >
              <Briefcase size={19} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 16, color: '#0f172a' }}>Register for IT & Engineering Projects</strong>
                <span className="badge info" style={{ fontSize: 10 }}>Brünel Talent & Partner Pool</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                4-Page Interactive Registration · Connected directly to Brünel HR & Project Management
              </div>
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            <X size={15} /> Close
          </button>
        </div>

        {/* 4-Page Stepper Bar */}
        {!submittedResult && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              padding: '12px 26px',
              background: '#ffffff',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            {PAGES.map((p) => {
              const Icon = p.icon;
              const isCurrent = page === p.id;
              const isDone = page > p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => goToPage(p.id, 0)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: isCurrent ? '1.5px solid #ff6b00' : isDone ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                    background: isCurrent ? '#fff7ed' : isDone ? '#f0fdf4' : '#f8fafc',
                    color: isCurrent ? '#c2410c' : isDone ? '#15803d' : '#475569',
                    fontWeight: isCurrent ? 700 : 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      background: isCurrent ? '#ff6b00' : isDone ? '#16a34a' : '#e2e8f0',
                      color: isCurrent || isDone ? '#fff' : '#475569',
                      flexShrink: 0,
                    }}
                  >
                    {isDone ? <Check size={12} /> : p.id}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.short}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Static-Height Interactive Question Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {submittedResult ? (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 520, padding: '20px 0' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h2 style={{ fontSize: 22, color: '#0f172a', marginBottom: 8 }}>
                Registration Confirmed ({submittedResult.employee_number})
              </h2>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
                Thank you, <strong>{submittedResult.first_name} {submittedResult.last_name}</strong>! Your profile and project preferences have been registered in the <strong>Brünel HR & IT Project Database</strong> in compliance with DSGVO.
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 16,
                  textAlign: 'left',
                  fontSize: 13,
                  marginBottom: 24,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                <div><span style={{ color: '#64748b' }}>Candidate ID:</span> <strong>{submittedResult.employee_number}</strong></div>
                <div><span style={{ color: '#64748b' }}>Status in HR:</span> <span className="badge info">Candidate (IT Projects)</span></div>
                <div><span style={{ color: '#64748b' }}>Role:</span> <strong>{submittedResult.role}</strong></div>
                <div><span style={{ color: '#64748b' }}>Location:</span> <strong>{submittedResult.attributes?.city || '—'}</strong></div>
              </div>
              <button type="button" className="btn-primary" onClick={onClose} style={{ padding: '10px 28px' }}>
                Done & Return
              </button>
            </div>
          ) : (
            <div>
              {/* Sub-Question Indicator Pill Bar within current Page */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#ff6b00',
                      background: '#fff7ed',
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: '1px solid #fed7aa',
                    }}
                  >
                    Page {page} of 4 · Question {subStep + 1} of {totalSubSteps}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {currentQuestions.map((q, idx) => (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => setSubStep(idx)}
                      style={{
                        width: idx === subStep ? 28 : 10,
                        height: 8,
                        borderRadius: 99,
                        border: 'none',
                        background: idx === subStep ? '#ff6b00' : idx < subStep ? '#fdba74' : '#e2e8f0',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      title={q.label}
                    />
                  ))}
                </div>
              </div>

              {/* Focused Question Header */}
              <div style={{ marginBottom: 22 }}>
                <h3 style={{ fontSize: 21, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                  {curQ?.label}
                </h3>
                <p style={{ fontSize: 13.5, color: '#64748b', margin: 0 }}>{curQ?.subtitle}</p>
              </div>

              {error && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: 13,
                    marginBottom: 16,
                    fontWeight: 500,
                  }}
                >
                  {error}
                </div>
              )}

              {/* PAGE 1: PERSONAL INFORMATION */}
              {page === 1 && subStep === 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label>First Name (Vorname) *</label>
                    <input
                      autoFocus
                      placeholder="e.g. Jonas"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                  <div>
                    <label>Last Name (Nachname) *</label>
                    <input
                      placeholder="e.g. Bergmann"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                </div>
              )}

              {page === 1 && subStep === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label>Email Address (E-Mail) *</label>
                    <input
                      autoFocus
                      type="email"
                      placeholder="name@domain.de"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                  <div>
                    <label>Mobile / Phone (Telefonnummer) *</label>
                    <input
                      placeholder="+49 151 ..."
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                </div>
              )}

              {page === 1 && subStep === 2 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label>Nationality (Staatsangehörigkeit)</label>
                    <input
                      autoFocus
                      placeholder="Deutsch / EU / ..."
                      value={form.nationality}
                      onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                  <div>
                    <label>Date of Birth (Geburtsdatum)</label>
                    <input
                      type="date"
                      value={form.birth_date}
                      onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                </div>
              )}

              {/* PAGE 2: WORKING HISTORY & CV */}
              {page === 2 && subStep === 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                  <div>
                    <label>Current Role / Specialization (Aktuelle Position) *</label>
                    <input
                      autoFocus
                      placeholder="e.g. Senior Network & Cloud Engineer / FTTH Bauleiter"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    />
                  </div>
                  <div>
                    <label>Years of Experience (Berufserfahrung)</label>
                    <select
                      value={form.experience_years}
                      onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                      style={{ fontSize: 15, padding: '12px 14px' }}
                    >
                      <option value="1–2 Jahre">1–2 Jahre (Junior)</option>
                      <option value="3–5 Jahre">3–5 Jahre (Mid-Level)</option>
                      <option value="5–8 Jahre">5–8 Jahre (Senior)</option>
                      <option value="8+ Jahre">8+ Jahre (Lead / Principal)</option>
                    </select>
                  </div>
                </div>
              )}

              {page === 2 && subStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label>Brief Working History & Project Experience (Kurze Berufserfahrung)</label>
                    <textarea
                      rows={3}
                      placeholder="Briefly describe your past projects, roles, or achievements..."
                      value={form.work_history_summary}
                      onChange={(e) => setForm({ ...form, work_history_summary: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Key Skills & Certifications (Technologien, Zertifikate, Führerschein)</label>
                    <input
                      placeholder="e.g. FTTH NE3/NE4, Cisco, Linux, Cloud, Projektleitung, OTDR..."
                      value={form.skills}
                      onChange={(e) => setForm({ ...form, skills: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {page === 2 && subStep === 2 && (
                <div
                  style={{
                    border: '2px dashed #cbd5e1',
                    borderRadius: 14,
                    padding: 24,
                    textAlign: 'center',
                    background: '#f8fafc',
                  }}
                >
                  <Upload size={28} style={{ color: '#ff6b00', marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    Upload CV / Lebenslauf / Portfolio (PDF, DOCX, JPG)
                  </div>
                  <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: 14 }}>
                    Your uploaded CV is automatically attached to your candidate card in the Brünel HR Portal.
                  </p>
                  <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={15} />
                    {uploadingCv ? 'Uploading CV…' : form.cv_file_name ? 'Replace CV File' : 'Select CV File'}
                    <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleCvUpload} />
                  </label>
                  {form.cv_file_name && (
                    <div style={{ marginTop: 12, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                      ✓ Uploaded: {form.cv_file_name}
                    </div>
                  )}
                </div>
              )}

              {/* PAGE 3: PROJECT INTERESTS & LOCATION */}
              {page === 3 && subStep === 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {PROJECT_DOMAINS.map((dom) => {
                    const active = form.interested_projects.includes(dom);
                    return (
                      <button
                        key={dom}
                        type="button"
                        onClick={() => toggleProjectInterest(dom)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: active ? '2px solid #ff6b00' : '1px solid #cbd5e1',
                          background: active ? '#fff7ed' : '#ffffff',
                          color: active ? '#9a3412' : '#1e293b',
                          fontWeight: active ? 700 : 500,
                          fontSize: 13,
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span>{dom}</span>
                        {active && <Check size={16} style={{ color: '#ff6b00', flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {page === 3 && subStep === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label>Current City / Region (Standort / Stadt) *</label>
                    <input
                      autoFocus
                      placeholder="e.g. Frankfurt am Main / Berlin / München"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Postal Code (PLZ)</label>
                    <input
                      placeholder="e.g. 60311"
                      value={form.postal_code}
                      onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Work Mode & Travel Readiness (Einsatzbereitschaft)</label>
                    <select
                      value={form.remote_preference}
                      onChange={(e) => setForm({ ...form, remote_preference: e.target.value })}
                    >
                      <option value="Hybrid (Vor Ort & Remote)">Hybrid (Vor Ort & Remote)</option>
                      <option value="100% Vor Ort / Bundesweite Montage">100% Vor Ort / Bundesweite Projekt-Einsätze</option>
                      <option value="Rhein-Main Region (Vor Ort)">Rhein-Main Region (Vor Ort)</option>
                      <option value="100% Remote (IT / Cloud)">100% Remote (IT / Cloud)</option>
                    </select>
                  </div>
                  <div>
                    <label>Earliest Availability (Verfügbarkeit ab)</label>
                    <input
                      placeholder="e.g. Ab sofort / 01.11.2026"
                      value={form.availability_date}
                      onChange={(e) => setForm({ ...form, availability_date: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {page === 3 && subStep === 2 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <label>Preferred Contract Model</label>
                    <select
                      value={form.preferred_contract_model}
                      onChange={(e) => setForm({ ...form, preferred_contract_model: e.target.value })}
                    >
                      <option value="Freelancer">Freelancer (Freiberufler)</option>
                      <option value="Full-time">Festanstellung (Full-time)</option>
                      <option value="Subunternehmer">Subunternehmer (GmbH / UG)</option>
                      <option value="Part-time">Teilzeit / Projektbasis</option>
                    </select>
                  </div>
                  <div>
                    <label>Expected Tagessatz (€ / Tag)</label>
                    <input
                      type="number"
                      placeholder="e.g. 680"
                      value={form.tagessatz}
                      onChange={(e) => setForm({ ...form, tagessatz: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Expected Stundensatz (€ / Std.)</label>
                    <input
                      type="number"
                      placeholder="e.g. 85"
                      value={form.stundensatz}
                      onChange={(e) => setForm({ ...form, stundensatz: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* PAGE 4: DSGVO & DATENSCHUTZERKLÄRUNG CONSENT */}
              {page === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 12,
                      padding: '12px 16px',
                      fontSize: 12.5,
                      color: '#334155',
                      lineHeight: 1.55,
                    }}
                  >
                    <strong>Hinweis zur Registrierung in unserer HR- & Projektdatenbank (Art. 13 DSGVO):</strong><br />
                    Mit dem Absenden dieses Formulars werden Ihre personenbezogenen Daten, Qualifikationen und hochgeladenen Dokumente (CV) in der zentralen Personal- und Projektdatenbank der <strong>Brünel Deutschland UG (haftungsbeschränkt)</strong> gespeichert, um Sie für aktuelle und künftige IT-, Glasfaser- und Engineering-Projekte (als Mitarbeiter, Freelancer oder Subunternehmer) zu berücksichtigen.
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: form.dsgvo_accepted ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
                      background: form.dsgvo_accepted ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.dsgvo_accepted}
                      onChange={(e) => setForm({ ...form, dsgvo_accepted: e.target.checked })}
                      style={{ width: 18, height: 18, marginTop: 2 }}
                    />
                    <span>
                      <strong>1. Einwilligung gemäß Art. 6 Abs. 1 lit. a & Art. 88 DSGVO / § 26 BDSG:</strong> Ich willige ein, dass die Brünel Deutschland UG meine Bewerber- und Profildaten zum Zwecke der Projektvermittlung und Personalauswahl verarbeitet. *
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: form.datenschutz_accepted ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
                      background: form.datenschutz_accepted ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.datenschutz_accepted}
                      onChange={(e) => setForm({ ...form, datenschutz_accepted: e.target.checked })}
                      style={{ width: 18, height: 18, marginTop: 2 }}
                    />
                    <span>
                      <strong>2. Datenschutzerklärung & Privacy Policy:</strong> Ich habe die Datenschutzerklärung der Brünel Deutschland UG gelesen und akzeptiere die Richtlinien zur vertraulichen Datenverarbeitung. *
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: form.talent_pool_accepted ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
                      background: form.talent_pool_accepted ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.talent_pool_accepted}
                      onChange={(e) => setForm({ ...form, talent_pool_accepted: e.target.checked })}
                      style={{ width: 18, height: 18, marginTop: 2 }}
                    />
                    <span>
                      <strong>3. Aufnahme in den Brünel IT-Projekt- & Talent-Pool:</strong> Ich bin damit einverstanden, dass mein Profil im HR-Dashboard für zukünftige IT- und Infrastrukturprojekte gespeichert wird (Widerruf jederzeit möglich). *
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Bottom Fixed Navigation Footer */}
          {!submittedResult && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 18,
                marginTop: 18,
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                disabled={page === 1 && subStep === 0}
                onClick={handlePrev}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ArrowLeft size={15} /> Previous
              </button>

              <div style={{ fontSize: 12, color: '#64748b' }}>
                {page < 4 ? (
                  <span>
                    Step {subStep + 1}/{totalSubSteps} on Page {page}
                  </span>
                ) : (
                  <span style={{ color: '#15803d', fontWeight: 600 }}>Ready to submit to HR Database</span>
                )}
              </div>

              {page < 4 ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 22px' }}
                >
                  {subStep < totalSubSteps - 1 ? 'Next Question' : `Continue to Page ${page + 1}`} <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={submitting}
                  onClick={handleSubmitCandidate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 26px', background: '#16a34a' }}
                >
                  <ShieldCheck size={16} />
                  {submitting ? 'Submitting Registration…' : 'Accept All & Submit Registration'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
