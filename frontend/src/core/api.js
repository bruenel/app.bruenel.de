import React, { useState, useEffect } from 'react';
export { formatEuro, formatDate, formatDateTime, formatDateRange } from './formatters';

let API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
if (API_BASE && !API_BASE.startsWith('http')) {
  API_BASE = `https://${API_BASE}`;
}
export const API_URL = API_BASE.replace(/\/$/, "");

export const MODULE_CATALOG = [
  { key: 'mod_dashboard', label: 'Executive & ERP Overview', desc: 'KPI telemetry across projects, workforce, inventory & sales' },
  { key: 'mod_projects', label: 'Projects, Objects & Tasks', desc: 'Regions (PLZ), Projects, Building Objects, Media & Delegation' },
  { key: 'mod_hr', label: 'HR, Time, Leave & Payslips', desc: 'Employee profiles, working hours, Urlaub, Krankmeldung & Lohnabrechnung' },
  { key: 'mod_inventory', label: 'Inventory & Material Ledger', desc: 'Static & Vehicle Lagers, Materials, Buchen & Schwund audit' },
  { key: 'mod_fleet', label: 'Vehicles & Equipment Fleet', desc: 'Sprinter/Van fleet & exclusive tool possession tracking' },
  { key: 'mod_calendar', label: 'Master Interactive Calendar', desc: 'Unified color-coded schedule (Tasks, Urlaub, Sickness, Objects)' },
  { key: 'mod_accounting', label: 'Accounting & Expenses', desc: 'Receipts, expense approvals, payroll commissions & DATEV export' },
  { key: 'mod_sales', label: 'Field Sales & Upselling', desc: 'Hardware catalog, live technician sales & Provision analytics' },
  { key: 'mod_suppliers', label: 'Supplier Matrix (KST)', desc: 'Sourcing & manufacturing pipeline by cost center' },
  { key: 'mod_vault', label: 'Legal & Encrypted Vault', desc: 'Notary, HRB & corporate archive' },
  { key: 'mod_bi', label: 'BI Website Telemetry', desc: 'Live visitor & KST interest analytics' },
  { key: 'mod_mail', label: 'Internal Mail & Signatures', desc: 'Strato IMAP/SMTP client & HTML signature generator' },
  { key: 'mod_users', label: 'User & Access Control', desc: '5-Tier RBAC & per-account module permission matrix' },
];

export const TIER_LABELS = {
  1: 'Tier 1 — Super Admin / Managing Director',
  2: 'Tier 2 — Project Manager (Projektleiter)',
  3: 'Tier 3 — HR & Finance Admin',
  4: 'Tier 4 — Team Lead (Vorarbeiter)',
  5: 'Tier 5 — Field Employee (Technician/Worker)',
};

export const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');

export const fetchWithToken = async (url, options = {}) => {
  const token = getToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  } else {
    delete headers['Content-Type'];
  }

  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  let res;
  try {
    res = await fetch(fullUrl, { ...options, headers });
  } catch (netErr) {
    console.error('Fetch request failed for', fullUrl, netErr);
    if (netErr?.name === 'TypeError' && (netErr.message === 'Load failed' || netErr.message === 'Failed to fetch')) {
      throw new Error(
        'Verbindung zum Server fehlgeschlagen (Load failed / Netzwerkfehler). Bitte überprüfen Sie Ihre Internetverbindung oder wenden Sie sich an die Administration.'
      );
    }
    throw netErr;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
};

export const resolveMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
};

/**
 * Upload a photo, PDF, or large video using either Pre-Signed S3 PUT streaming
 * or direct multipart upload, returning the created DocumentRecord.
 */
export const uploadMediaFile = async ({ file, referenceType = 'ObjectMedia', referenceId = null, title = null, onProgress = null }) => {
  if (!file) throw new Error('No file selected');

  // Step 1: Request Pre-Signed PUT URL from /api/v1/media/presign
  const presign = await fetchWithToken('/api/v1/media/presign', {
    method: 'POST',
    body: JSON.stringify({
      reference_type: referenceType,
      reference_id: referenceId,
      file_name: file.name,
      title: title || file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size || 0,
    }),
  });

  const targetUrl = presign.upload_url.startsWith('http')
    ? presign.upload_url
    : `${API_URL}${presign.upload_url}`;

  // Step 2: Stream file directly via PUT (with progress tracking via XMLHttpRequest)
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(presign.method || 'PUT', targetUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during file upload'));
    xhr.send(file);
  });

  return presign;
};

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async (token) => {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Token expired');
    return res.json();
  };

  useEffect(() => {
    const token = getToken();
    if (token) {
      loadMe(token)
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          sessionStorage.removeItem('token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password, rememberMe = true) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Invalid credentials');
    }

    const data = await response.json();
    if (rememberMe) {
      localStorage.setItem('token', data.access_token);
      sessionStorage.removeItem('token');
    } else {
      sessionStorage.setItem('token', data.access_token);
      localStorage.removeItem('token');
    }
    const userData = await loadMe(data.access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setUser(null);
  };

  const updateProfile = (newData) => {
    setUser((prev) => ({ ...prev, ...newData }));
  };

  const refreshProfile = async () => {
    const token = getToken();
    if (token) {
      const u = await loadMe(token);
      setUser(u);
    }
  };

  return { user, login, logout, updateProfile, refreshProfile, loading };
};
