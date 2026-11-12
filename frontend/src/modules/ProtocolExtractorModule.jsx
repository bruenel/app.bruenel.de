import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Download,
  FileSpreadsheet,
  Search,
  Sparkles,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Layers,
  ShieldCheck,
  RefreshCw,
  Edit3,
  X,
  Check,
  Filter,
} from 'lucide-react';
import { API_URL, fetchWithToken, getToken } from '../core/api';

const UNIT_STATUS_OPTIONS = [
  'Offen',
  'In Bearbeitung',
  'Restarbeit',
  'Abgeschlossen',
];

const STATUS_BADGE_STYLES = {
  Offen: {
    background: 'rgba(107, 114, 128, 0.12)',
    color: '#374151',
    border: '1px solid rgba(107, 114, 128, 0.25)',
  },
  'In Bearbeitung': {
    background: 'rgba(37, 99, 235, 0.12)',
    color: '#1d4ed8',
    border: '1px solid rgba(37, 99, 235, 0.28)',
  },
  Restarbeit: {
    background: 'rgba(217, 119, 6, 0.14)',
    color: '#b45309',
    border: '1px solid rgba(217, 119, 6, 0.3)',
  },
  Abgeschlossen: {
    background: 'rgba(22, 163, 74, 0.16)',
    color: '#15803d',
    border: '1px solid rgba(22, 163, 74, 0.35)',
  },
};

const getUnitRowStyle = (status) => {
  if (status === 'Abgeschlossen') {
    return {
      backgroundColor: 'rgba(22, 163, 74, 0.13)',
      transition: 'background-color 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms ease',
      boxShadow: 'inset 3px 0 0 #16a34a',
    };
  }
  if (status === 'Restarbeit') {
    return {
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      transition: 'background-color 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms ease',
      boxShadow: 'inset 3px 0 0 #d97706',
    };
  }
  if (status === 'In Bearbeitung') {
    return {
      backgroundColor: 'rgba(37, 99, 235, 0.06)',
      transition: 'background-color 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms ease',
      boxShadow: 'inset 3px 0 0 #2563eb',
    };
  }
  return {
    backgroundColor: 'transparent',
    transition: 'background-color 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms ease',
  };
};

/* =============================================================================
   CLIENT-SIDE CSV (UTF-8 BOM FOR EXCEL) FALLBACK HELPER
============================================================================= */
function exportAddressesToCsv(addresses, filename = 'UGG_Hausbegehungsprotokolle.csv') {
  const headers = [
    'Projektnummer',
    'Datum',
    'Hausbegeher',
    'PLZ',
    'Ort',
    'Straße',
    'Hausnummer',
    'Eigentümer Name',
    'Eigentümer Telefon',
    'Eigentümer E-Mail',
    'Gesamt WE',
    'NE3 Status',
    'Lösungsoption',
    'Etage',
    'Unit-ID',
    'Unit Status',
    'TA installiert',
    'Spleißen fertig',
    'Flexrohr',
  ];

  const rows = [];
  addresses.forEach((addr) => {
    const units = addr.units && addr.units.length > 0 ? addr.units : [null];
    units.forEach((u) => {
      rows.push([
        addr.projektnummer || '',
        addr.datum || '',
        addr.hausbegeher || '',
        addr.plz || '',
        addr.ort || '',
        addr.strasse || '',
        addr.hausnummer || '',
        addr.owner_name || '',
        addr.owner_telefon || '',
        addr.owner_email || '',
        addr.total_we ?? '',
        addr.ne3_status || '',
        addr.loesungsoption || '',
        u ? u.etage : '-',
        u ? u.unit_id : '-',
        u ? u.status : 'Offen',
        u ? (u.ta_installiert ? 'Ja' : 'Nein') : 'Nein',
        u ? (u.spleissen_fertig ? 'Ja' : 'Nein') : 'Nein',
        u ? (u.flexrohr ? 'Ja' : 'Nein') : 'Nein',
      ]);
    });
  });

  const escapeCell = (val) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  // Use semicolon delimiter for German Excel regional settings + UTF-8 BOM
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* =============================================================================
   COMPONENT 1: UPLOAD ZONE (Drag & Drop + Local AI Parser Telemetry)
============================================================================= */
export const ProtocolUploadZone = ({ onExtracted, onLoadSample, uploading, setUploading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const processPdfFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('Bitte wählen Sie eine gültige PDF-Datei (.pdf) aus.');
      return;
    }

    setErrorMsg('');
    setUploading(true);
    setUploadStep('Lese PDF-Dokument lokal im Arbeitsspeicher (DSGVO-konform)…');

    const stepTimer1 = setTimeout(() => {
      setUploadStep('Extrahiere Objekt-Adresse, Eigentümer & UGG-Projektnummer…');
    }, 350);
    const stepTimer2 = setTimeout(() => {
      setUploadStep('Analysiere Zählung-Tabelle (Etagen / WE) & NE3-Status…');
    }, 700);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const parsedData = await fetchWithToken('/api/v1/protocol/upload', {
        method: 'POST',
        body: formData,
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploading(false);
      setUploadStep('');
      onExtracted(parsedData, file.name);
    } catch (err) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploading(false);
      setUploadStep('');
      setErrorMsg(err.message || 'Fehler bei der PDF-Extraktion.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processPdfFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: 24,
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(246,246,248,0.82) 100%)',
        border: dragActive ? '2px dashed #FF6B00' : '1px solid var(--border)',
        boxShadow: dragActive
          ? '0 12px 36px rgba(255, 107, 0, 0.16)'
          : '0 4px 20px rgba(22, 22, 26, 0.05)',
        transition: 'all 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
              color: '#FF6B00',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 6px 16px rgba(17, 24, 39, 0.18)',
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                AI-Powered PDF Extractor — UGG Hausbegehungsprotokoll
              </h3>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(22, 163, 74, 0.12)',
                  color: '#15803d',
                  border: '1px solid rgba(22, 163, 74, 0.25)',
                }}
              >
                100% On-Premise • DSGVO-konform
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Laden Sie ein standardisiertes UGG Hausbegehungsprotokoll (PDF) hoch. Die Daten werden lokal extrahiert und vor dem Speichern zur Prüfung vorgelegt.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onLoadSample}
            disabled={uploading}
            title="Lädt ein standardisiertes UGG Muster-PDF direkt in den Extraktor"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} style={{ color: '#FF6B00' }} />
            <span>Muster-Protokoll testen</span>
          </button>
          <a
            href={`${API_URL}/api/v1/protocol/sample-pdf?projektnummer=N4E241593436`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <Download size={14} />
            <span>Beispiel-PDF (.pdf)</span>
          </a>
        </div>
      </div>

      {/* Drag & Drop Surface */}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          position: 'relative',
          border: dragActive ? '2px dashed #FF6B00' : '2px dashed #d4d4dc',
          borderRadius: 14,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          background: dragActive
            ? 'rgba(255, 107, 0, 0.06)'
            : 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(12px)',
          transition: 'all 200ms ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) {
              processPdfFile(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />

        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '3px solid rgba(255, 107, 0, 0.2)',
                borderTopColor: '#FF6B00',
                animation: 'spin 0.85s linear infinite',
              }}
            />
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-main)' }}>
              PDF wird lokal analysiert…
            </div>
            <div style={{ fontSize: 13, color: '#FF6B00', fontWeight: 500 }}>{uploadStep}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'rgba(255, 107, 0, 0.1)',
                color: '#FF6B00',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Upload size={24} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)' }}>
              UGG Hausbegehungsprotokoll PDF hierher ziehen oder{' '}
              <span style={{ color: '#FF6B00', textDecoration: 'underline' }}>Datei auswählen</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Unterstützt: Standardisierte UGG-Protokolle (.pdf) • Extrahiert Projektnummer, Eigentümer, Adresse, Zählung (WE) & NE3-Status
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            color: '#dc2626',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   COMPONENT 2: VERIFICATION MODAL (Human-in-the-Loop Inspection & Correction)
============================================================================= */
export const ProtocolVerificationModal = ({
  initialData,
  sourceFileName,
  isEditMode = false,
  editAddressId = null,
  onClose,
  onSaved,
}) => {
  const [form, setForm] = useState(() => ({
    projektnummer: initialData?.projektnummer || '',
    datum: initialData?.datum || new Date().toLocaleDateString('de-DE'),
    hausbegeher: initialData?.hausbegeher || '',
    plz: initialData?.plz || '',
    ort: initialData?.ort || '',
    strasse: initialData?.strasse || '',
    hausnummer: initialData?.hausnummer || '',
    owner_name: initialData?.owner_name || '',
    owner_telefon: initialData?.owner_telefon || '',
    owner_email: initialData?.owner_email || '',
    total_we: Number(initialData?.total_we || initialData?.units?.length || 1),
    ne3_status: initialData?.ne3_status || '',
    loesungsoption: initialData?.loesungsoption || '',
    units:
      initialData?.units && initialData.units.length > 0
        ? initialData.units.map((u) => ({
            etage: u.etage || 'EG',
            unit_id: u.unit_id || '001',
            status: u.status || 'Offen',
            ta_installiert: Boolean(u.ta_installiert),
            spleissen_fertig: Boolean(u.spleissen_fertig),
            flexrohr: Boolean(u.flexrohr),
          }))
        : [
            {
              etage: 'EG',
              unit_id: '001',
              status: 'Offen',
              ta_installiert: false,
              spleissen_fertig: false,
              flexrohr: false,
            },
          ],
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictDetected, setConflictDetected] = useState(false);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateUnitRow = (idx, key, value) => {
    setForm((prev) => {
      const nextUnits = prev.units.map((u, i) => (i === idx ? { ...u, [key]: value } : u));
      return { ...prev, units: nextUnits };
    });
  };

  const addUnitRow = () => {
    setForm((prev) => {
      const nextIdx = prev.units.length + 1;
      const nextUnit = {
        etage: nextIdx === 1 ? 'EG' : `OG${nextIdx - 1}`,
        unit_id: String(nextIdx).padStart(3, '0'),
        status: 'Offen',
        ta_installiert: false,
        spleissen_fertig: false,
        flexrohr: false,
      };
      const nextUnits = [...prev.units, nextUnit];
      return {
        ...prev,
        units: nextUnits,
        total_we: Math.max(Number(prev.total_we || 1), nextUnits.length),
      };
    });
  };

  const removeUnitRow = (idx) => {
    setForm((prev) => {
      if (prev.units.length <= 1) return prev;
      const nextUnits = prev.units.filter((_, i) => i !== idx);
      return {
        ...prev,
        units: nextUnits,
        total_we: nextUnits.length,
      };
    });
  };

  const handleConfirmSave = async (overwrite = false) => {
    setError('');
    if (!form.projektnummer.trim()) {
      setError('Bitte geben Sie eine gültige UGG-Projektnummer ein.');
      return;
    }
    if (!form.plz.trim() || !form.ort.trim() || !form.strasse.trim() || !form.hausnummer.trim()) {
      setError('Bitte vervollständigen Sie die Objekt-Adresse (PLZ, Ort, Straße, Hausnummer).');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        total_we: Math.max(1, Number(form.total_we) || form.units.length),
      };

      let savedRecord;
      if (isEditMode && editAddressId) {
        savedRecord = await fetchWithToken(`/api/v1/protocol/addresses/${editAddressId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        const query = overwrite ? '?overwrite=true' : '';
        savedRecord = await fetchWithToken(`/api/v1/protocol/confirm${query}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setSaving(false);
      onSaved(savedRecord);
    } catch (err) {
      setSaving(false);
      const msg = err.message || 'Speichern fehlgeschlagen.';
      setError(msg);
      if (msg.toLowerCase().includes('existiert bereits')) {
        setConflictDetected(true);
      }
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(17, 24, 39, 0.58)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-panel"
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 20,
          padding: 0,
          background: 'rgba(255, 255, 255, 0.96)',
          border: '1px solid rgba(255, 107, 0, 0.25)',
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.28)',
        }}
      >
        {/* Top Dark Glass Header */}
        <div
          style={{
            padding: '20px 26px',
            background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
            color: '#fff',
            borderBottom: '2px solid #FF6B00',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#FF6B00',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: 17 }}>
                  {isEditMode
                    ? 'Protokoll-Stammdaten bearbeiten'
                    : 'Human-in-the-Loop Verifizierung — Extrahierte PDF-Daten'}
                </h3>
                {sourceFileName && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(255, 107, 0, 0.2)',
                      color: '#ff984f',
                    }}
                  >
                    {sourceFileName}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>
                Bitte überprüfen und korrigieren Sie eventuelle OCR-/Parsing-Abweichungen vor dem Speichern in PostgreSQL.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              width: 34,
              height: 34,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
            title="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {initialData?.extraction_warnings?.length > 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#92400e',
                fontSize: 13,
              }}
            >
              <strong>Hinweise des lokalen PDF-Parsers:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {initialData.extraction_warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Section 1: Projekt & Begehung */}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#FF6B00',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={14} />
              <span>1. UGG-Projekt & Begehungsdaten</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
              }}
            >
              <div>
                <label>UGG-Projektnummer *</label>
                <input
                  value={form.projektnummer}
                  onChange={(e) => updateField('projektnummer', e.target.value)}
                  placeholder="z.B. N4E241593436"
                  style={{ fontWeight: 600 }}
                />
              </div>
              <div>
                <label>Datum / Uhrzeit</label>
                <input
                  value={form.datum}
                  onChange={(e) => updateField('datum', e.target.value)}
                  placeholder="z.B. 12.11.2026 14:30"
                />
              </div>
              <div>
                <label>Hausbegeher</label>
                <input
                  value={form.hausbegeher}
                  onChange={(e) => updateField('hausbegeher', e.target.value)}
                  placeholder="Name des Begehers"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Objekt-Adresse */}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#FF6B00',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <MapPin size={14} />
              <span>2. Objekt-Adresse & Wohneinheiten (WE)</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 1.2fr 110px 110px',
                gap: 12,
              }}
            >
              <div>
                <label>PLZ *</label>
                <input
                  value={form.plz}
                  onChange={(e) => updateField('plz', e.target.value)}
                  placeholder="73547"
                />
              </div>
              <div>
                <label>Ort *</label>
                <input
                  value={form.ort}
                  onChange={(e) => updateField('ort', e.target.value)}
                  placeholder="Lorch"
                />
              </div>
              <div>
                <label>Straße *</label>
                <input
                  value={form.strasse}
                  onChange={(e) => updateField('strasse', e.target.value)}
                  placeholder="AUSTRABE"
                />
              </div>
              <div>
                <label>Hausnr. *</label>
                <input
                  value={form.hausnummer}
                  onChange={(e) => updateField('hausnummer', e.target.value)}
                  placeholder="71"
                />
              </div>
              <div>
                <label>Gesamt WE *</label>
                <input
                  type="number"
                  min={1}
                  value={form.total_we}
                  onChange={(e) => updateField('total_we', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Eigentümer & NE3 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 18,
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#FF6B00',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <User size={14} />
                <span>3. Eigentümer (Kundendaten)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label>Vorname & Nachname</label>
                  <input
                    value={form.owner_name}
                    onChange={(e) => updateField('owner_name', e.target.value)}
                    placeholder="z.B. Thomas Schwaiger"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label>Telefon</label>
                    <input
                      value={form.owner_telefon}
                      onChange={(e) => updateField('owner_telefon', e.target.value)}
                      placeholder="+49 ..."
                    />
                  </div>
                  <div>
                    <label>E-Mail</label>
                    <input
                      value={form.owner_email}
                      onChange={(e) => updateField('owner_email', e.target.value)}
                      placeholder="name@domain.de"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#FF6B00',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Layers size={14} />
                <span>4. NE3-Status & Lösungsoption 1</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label>NE3 Status (Checkbox-Ergebnis)</label>
                  <input
                    value={form.ne3_status}
                    onChange={(e) => updateField('ne3_status', e.target.value)}
                    placeholder="z.B. Vorhanden / Geklärt"
                  />
                </div>
                <div>
                  <label>Lösungsoption 1 (Leitungsweg)</label>
                  <input
                    value={form.loesungsoption}
                    onChange={(e) => updateField('loesungsoption', e.target.value)}
                    placeholder="z.B. kabelkanal"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Zählung Table (Units) */}
          {!isEditMode && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#FF6B00',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Building2 size={14} />
                  <span>5. Extrahierte Zählung-Tabelle ({form.units.length} Wohneinheiten)</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={addUnitRow}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={14} />
                  <span>Wohneinheit (WE) hinzufügen</span>
                </button>
              </div>

              <div
                style={{
                  maxHeight: 240,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 5,
                        background: '#18181b',
                        color: '#fff',
                        textAlign: 'left',
                      }}
                    >
                      <th style={{ padding: '10px 12px' }}>Etage</th>
                      <th style={{ padding: '10px 12px' }}>Unit-ID</th>
                      <th style={{ padding: '10px 12px' }}>Initial-Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>TA installiert</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Spleißen fertig</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Flexrohr</th>
                      <th style={{ padding: '10px 12px', width: 50 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.units.map((u, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          ...getUnitRowStyle(u.status),
                        }}
                      >
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            value={u.etage}
                            onChange={(e) => updateUnitRow(idx, 'etage', e.target.value)}
                            placeholder="EG / OG1"
                            style={{ padding: '6px 8px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            value={u.unit_id}
                            onChange={(e) => updateUnitRow(idx, 'unit_id', e.target.value)}
                            placeholder="001"
                            style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <select
                            value={u.status}
                            onChange={(e) => updateUnitRow(idx, 'status', e.target.value)}
                            style={{ padding: '6px 8px' }}
                          >
                            {UNIT_STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={u.ta_installiert}
                            onChange={(e) => updateUnitRow(idx, 'ta_installiert', e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={u.spleissen_fertig}
                            onChange={(e) => updateUnitRow(idx, 'spleissen_fertig', e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={u.flexrohr}
                            onChange={(e) => updateUnitRow(idx, 'flexrohr', e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => removeUnitRow(idx)}
                            disabled={form.units.length <= 1}
                            title="Wohneinheit entfernen"
                            style={{ color: '#dc2626', padding: 4 }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.28)',
                color: '#dc2626',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
              {conflictDetected && (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => handleConfirmSave(true)}
                  disabled={saving}
                >
                  Bestehendes Protokoll überschreiben & aktualisieren
                </button>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleConfirmSave(false)}
              disabled={saving}
              style={{
                background: '#FF6B00',
                borderColor: '#FF6B00',
                padding: '10px 22px',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={17} />
              <span>
                {saving
                  ? 'Speichert in Datenbank…'
                  : isEditMode
                  ? 'Änderungen speichern'
                  : 'Confirm & Save (Bestätigen & Speichern)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   COMPONENT 3: MASTER-DETAIL LIST VIEW (The Accordion with Sticky Headers)
============================================================================= */
export const ProtocolMasterDetailAccordion = ({
  addresses,
  expandedIds,
  onToggleExpand,
  onUnitChange,
  onAddUnit,
  onDeleteUnit,
  onEditAddress,
  onDeleteAddress,
  onExportSingleExcel,
}) => {
  const [newUnitForms, setNewUnitForms] = useState({});

  const handleQuickAddUnit = async (addr) => {
    const draft = newUnitForms[addr.id] || {
      etage: `OG${(addr.units?.length || 0)}`,
      unit_id: String((addr.units?.length || 0) + 1).padStart(3, '0'),
    };
    await onAddUnit(addr.id, {
      etage: draft.etage || 'EG',
      unit_id: draft.unit_id || '001',
      status: 'Offen',
      ta_installiert: false,
      spleissen_fertig: false,
      flexrohr: false,
    });
    setNewUnitForms((prev) => ({
      ...prev,
      [addr.id]: {
        etage: `OG${(addr.units?.length || 0) + 1}`,
        unit_id: String((addr.units?.length || 0) + 2).padStart(3, '0'),
      },
    }));
  };

  if (!addresses || addresses.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: 48,
          textAlign: 'center',
          borderRadius: 16,
          color: 'var(--text-muted)',
        }}
      >
        <Building2 size={36} style={{ color: '#FF6B00', opacity: 0.7, marginBottom: 10 }} />
        <h3 style={{ marginBottom: 6, color: 'var(--text-main)' }}>
          Noch keine UGG Hausbegehungsprotokolle vorhanden
        </h3>
        <p style={{ maxWidth: 520, margin: '0 auto', fontSize: 13 }}>
          Laden Sie oben ein UGG Hausbegehungsprotokoll als PDF hoch oder klicken Sie auf{' '}
          <strong>„Muster-Protokoll testen“</strong>, um den Human-in-the-Loop Workflow und die Master-Detail Ansicht zu starten.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {addresses.map((addr) => {
        const isExpanded = Boolean(expandedIds[addr.id]);
        const units = addr.units || [];
        const completedCount = units.filter((u) => u.status === 'Abgeschlossen').length;
        const totalCount = Math.max(units.length, addr.total_we || 1);
        const pct = Math.round((completedCount / totalCount) * 100);
        const allCompleted = units.length > 0 && completedCount === units.length;

        return (
          <div
            key={addr.id}
            className="glass-panel"
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: isExpanded
                ? '1px solid rgba(255, 107, 0, 0.45)'
                : allCompleted
                ? '1px solid rgba(22, 163, 74, 0.4)'
                : '1px solid var(--border)',
              boxShadow: isExpanded
                ? '0 12px 32px rgba(22, 22, 26, 0.09)'
                : '0 2px 10px rgba(22, 22, 26, 0.04)',
              transition: 'all 250ms cubic-bezier(0.22, 1, 0.36, 1)',
              background: allCompleted
                ? 'linear-gradient(90deg, rgba(22, 163, 74, 0.06) 0%, rgba(255, 255, 255, 0.95) 35%)'
                : 'var(--surface)',
            }}
          >
            {/* Master Row Header (Clickable Accordion Trigger) */}
            <div
              onClick={() => onToggleExpand(addr.id)}
              style={{
                padding: '16px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                userSelect: 'none',
                background: isExpanded ? 'rgba(255, 107, 0, 0.04)' : 'transparent',
                borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                transition: 'background 200ms ease',
              }}
            >
              {/* Left: Chevron + Address & Projektnummer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260, flex: 1 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: isExpanded ? '#FF6B00' : 'var(--surface-2)',
                    color: isExpanded ? '#fff' : 'var(--text-main)',
                    display: 'grid',
                    placeItems: 'center',
                    transition: 'all 220ms ease',
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight
                    size={18}
                    style={{
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: '#18181b',
                        color: '#FF6B00',
                      }}
                    >
                      {addr.projektnummer}
                    </span>
                    <strong style={{ fontSize: 15, color: 'var(--text-main)' }}>
                      {addr.strasse} {addr.hausnummer}, {addr.plz} {addr.ort}
                    </strong>
                    {addr.loesungsoption && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(255, 107, 0, 0.1)',
                          color: '#FF6B00',
                        }}
                      >
                        Lösungsoption: {addr.loesungsoption}
                      </span>
                    )}
                    {addr.ne3_status && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        NE3: {addr.ne3_status}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap',
                      marginTop: 5,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {addr.owner_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <User size={12} /> {addr.owner_name}
                      </span>
                    )}
                    {addr.owner_telefon && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> {addr.owner_telefon}
                      </span>
                    )}
                    {addr.owner_email && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={12} /> {addr.owner_email}
                      </span>
                    )}
                    {addr.datum && <span>Datum: {addr.datum}</span>}
                    {addr.hausbegeher && <span>Begeher: {addr.hausbegeher}</span>}
                  </div>
                </div>
              </div>

              {/* Right: Progress & Quick Row Actions */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ minWidth: 140, textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>
                      {completedCount} / {units.length} WE fertig
                    </span>
                    <span style={{ color: pct === 100 ? '#16a34a' : '#FF6B00' }}>{pct}%</span>
                  </div>
                  <div
                    style={{
                      width: 140,
                      height: 7,
                      borderRadius: 999,
                      background: 'var(--surface-2)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: pct === 100 ? '#16a34a' : '#FF6B00',
                        transition: 'width 320ms ease',
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => onExportSingleExcel(addr)}
                  title="Dieses Gebäudeprotokoll als Excel (.xlsx) exportieren"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <FileSpreadsheet size={14} style={{ color: '#16a34a' }} />
                  <span>Excel</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => onEditAddress(addr)}
                  title="Stammdaten bearbeiten"
                >
                  <Edit3 size={14} />
                </button>

                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => onDeleteAddress(addr)}
                  title="Protokoll löschen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Accordion Animated Detail Body: Sticky-Header Units Data Table */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: isExpanded ? '1fr' : '0fr',
                transition: 'grid-template-rows 300ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px 20px', background: 'rgba(249, 250, 251, 0.65)' }}>
                  {/* Sticky-Header Scroll Container */}
                  <div
                    style={{
                      maxHeight: 340,
                      overflowY: 'auto',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr
                          style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            background: '#18181b',
                            color: '#ffffff',
                            textAlign: 'left',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                          }}
                        >
                          <th style={{ padding: '11px 14px', fontWeight: 600 }}>Etage</th>
                          <th style={{ padding: '11px 14px', fontWeight: 600 }}>Unit-ID (WE)</th>
                          <th style={{ padding: '11px 14px', fontWeight: 600 }}>Status</th>
                          <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'center' }}>
                            TA installiert
                          </th>
                          <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'center' }}>
                            Spleißen fertig
                          </th>
                          <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'center' }}>
                            Flexrohr
                          </th>
                          <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>
                            Aktion
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {units.map((unit) => {
                          const isDone = unit.status === 'Abgeschlossen';
                          return (
                            <tr
                              key={unit.id}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                ...getUnitRowStyle(unit.status),
                              }}
                            >
                              <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: isDone
                                      ? 'rgba(22, 163, 74, 0.18)'
                                      : 'var(--surface-2)',
                                    color: isDone ? '#14532d' : 'var(--text-main)',
                                    fontSize: 12,
                                  }}
                                >
                                  {unit.etage}
                                </span>
                              </td>

                              <td
                                style={{
                                  padding: '10px 14px',
                                  fontFamily: 'monospace',
                                  fontWeight: 700,
                                  fontSize: 13,
                                }}
                              >
                                WE-{unit.unit_id}
                              </td>

                              <td style={{ padding: '10px 14px', minWidth: 180 }}>
                                <select
                                  value={unit.status}
                                  onChange={(e) =>
                                    onUnitChange(addr.id, unit.id, { status: e.target.value })
                                  }
                                  style={{
                                    padding: '6px 10px',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    borderRadius: 8,
                                    width: 'auto',
                                    minWidth: 165,
                                    cursor: 'pointer',
                                    ...(STATUS_BADGE_STYLES[unit.status] || {}),
                                  }}
                                >
                                  {UNIT_STATUS_OPTIONS.map((st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                    color: unit.ta_installiert ? '#15803d' : 'var(--text-muted)',
                                    fontWeight: unit.ta_installiert ? 600 : 400,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(unit.ta_installiert)}
                                    onChange={(e) =>
                                      onUnitChange(addr.id, unit.id, {
                                        ta_installiert: e.target.checked,
                                      })
                                    }
                                    style={{ width: 17, height: 17, cursor: 'pointer' }}
                                  />
                                  <span>{unit.ta_installiert ? 'Ja' : 'Nein'}</span>
                                </label>
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                    color: unit.spleissen_fertig ? '#15803d' : 'var(--text-muted)',
                                    fontWeight: unit.spleissen_fertig ? 600 : 400,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(unit.spleissen_fertig)}
                                    onChange={(e) =>
                                      onUnitChange(addr.id, unit.id, {
                                        spleissen_fertig: e.target.checked,
                                      })
                                    }
                                    style={{ width: 17, height: 17, cursor: 'pointer' }}
                                  />
                                  <span>{unit.spleissen_fertig ? 'Ja' : 'Nein'}</span>
                                </label>
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                    color: unit.flexrohr ? '#15803d' : 'var(--text-muted)',
                                    fontWeight: unit.flexrohr ? 600 : 400,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(unit.flexrohr)}
                                    onChange={(e) =>
                                      onUnitChange(addr.id, unit.id, {
                                        flexrohr: e.target.checked,
                                      })
                                    }
                                    style={{ width: 17, height: 17, cursor: 'pointer' }}
                                  />
                                  <span>{unit.flexrohr ? 'Ja' : 'Nein'}</span>
                                </label>
                              </td>

                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  onClick={() => onDeleteUnit(addr.id, unit.id)}
                                  title="Wohneinheit löschen"
                                  style={{ color: '#dc2626', padding: '4px 8px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Quick Add Unit Bar inside Accordion */}
                  <div
                    style={{
                      marginTop: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Tipp: Wenn der Status einer Einheit auf <strong>„Abgeschlossen“</strong> gesetzt wird, färbt sich die Zeile automatisch grün.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        placeholder="Etage (z.B. OG3)"
                        value={
                          newUnitForms[addr.id]?.etage ??
                          `OG${addr.units?.length || 1}`
                        }
                        onChange={(e) =>
                          setNewUnitForms((prev) => ({
                            ...prev,
                            [addr.id]: {
                              ...(prev[addr.id] || {
                                unit_id: String((addr.units?.length || 0) + 1).padStart(3, '0'),
                              }),
                              etage: e.target.value,
                            },
                          }))
                        }
                        style={{ width: 120, padding: '6px 10px', fontSize: 12 }}
                      />
                      <input
                        placeholder="Unit-ID (z.B. 005)"
                        value={
                          newUnitForms[addr.id]?.unit_id ??
                          String((addr.units?.length || 0) + 1).padStart(3, '0')
                        }
                        onChange={(e) =>
                          setNewUnitForms((prev) => ({
                            ...prev,
                            [addr.id]: {
                              ...(prev[addr.id] || {
                                etage: `OG${addr.units?.length || 1}`,
                              }),
                              unit_id: e.target.value,
                            },
                          }))
                        }
                        style={{ width: 110, padding: '6px 10px', fontSize: 12, fontFamily: 'monospace' }}
                      />
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => handleQuickAddUnit(addr)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Plus size={14} style={{ color: '#FF6B00' }} />
                        <span>WE hinzufügen</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* =============================================================================
   MAIN MODULE CONTAINER: ProtocolExtractorModule
============================================================================= */
export function ProtocolExtractorModule() {
  const { section } = useParams();
  const navigate = useNavigate();
  const activeTab = section || 'manager';

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [toast, setToast] = useState(null);

  // Verification modal state
  const [verificationModal, setVerificationModal] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWithToken('/api/v1/protocol/addresses');
      setAddresses(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0 && Object.keys(expandedIds).length === 0) {
        setExpandedIds({ [data[0].id]: true });
      }
    } catch (err) {
      console.error('Failed to load protocol addresses:', err);
    } finally {
      setLoading(false);
    }
  }, [expandedIds]);

  useEffect(() => {
    loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleExpand = (addressId) => {
    setExpandedIds((prev) => ({ ...prev, [addressId]: !prev[addressId] }));
  };

  const handleExpandAll = (expand) => {
    if (!expand) {
      setExpandedIds({});
      return;
    }
    const next = {};
    addresses.forEach((a) => {
      next[a.id] = true;
    });
    setExpandedIds(next);
  };

  // Load sample UGG protocol directly into the Human-in-the-loop Verification Modal
  const handleLoadSampleProtocol = async () => {
    setUploading(true);
    try {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const sampleProjekt =
        addresses.length === 0 ? 'N4E241593436' : `N4E24${randomSuffix}`;
      const pdfRes = await fetch(
        `${API_URL}/api/v1/protocol/sample-pdf?projektnummer=${encodeURIComponent(sampleProjekt)}`
      );
      const pdfBlob = await pdfRes.blob();
      const sampleFile = new File(
        [pdfBlob],
        `UGG_Hausbegehungsprotokoll_${sampleProjekt}.pdf`,
        { type: 'application/pdf' }
      );

      const formData = new FormData();
      formData.append('file', sampleFile);

      const extracted = await fetchWithToken('/api/v1/protocol/upload', {
        method: 'POST',
        body: formData,
      });

      setUploading(false);
      setVerificationModal({
        data: extracted,
        fileName: sampleFile.name,
        isEditMode: false,
      });
    } catch (err) {
      setUploading(false);
      showToast(err.message || 'Fehler beim Laden des Muster-Protokolls', 'error');
    }
  };

  // Optimistic live update for unit status & checkboxes
  const handleUnitChange = async (addressId, unitId, patch) => {
    setAddresses((prev) =>
      prev.map((addr) => {
        if (addr.id !== addressId) return addr;
        return {
          ...addr,
          units: (addr.units || []).map((u) => (u.id === unitId ? { ...u, ...patch } : u)),
        };
      })
    );

    try {
      const updatedUnit = await fetchWithToken(`/api/v1/protocol/units/${unitId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setAddresses((prev) =>
        prev.map((addr) => {
          if (addr.id !== addressId) return addr;
          return {
            ...addr,
            units: (addr.units || []).map((u) => (u.id === unitId ? updatedUnit : u)),
          };
        })
      );
    } catch (err) {
      showToast(err.message || 'Aktualisierung fehlgeschlagen', 'error');
      loadAddresses();
    }
  };

  const handleAddUnit = async (addressId, unitPayload) => {
    try {
      const created = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}/units`, {
        method: 'POST',
        body: JSON.stringify(unitPayload),
      });
      setAddresses((prev) =>
        prev.map((addr) => {
          if (addr.id !== addressId) return addr;
          const nextUnits = [...(addr.units || []), created];
          return {
            ...addr,
            units: nextUnits,
            total_we: Math.max(addr.total_we || 1, nextUnits.length),
          };
        })
      );
      showToast(`Wohneinheit WE-${created.unit_id} hinzugefügt`);
    } catch (err) {
      showToast(err.message || 'Fehler beim Hinzufügen der Wohneinheit', 'error');
    }
  };

  const handleDeleteUnit = async (addressId, unitId) => {
    try {
      await fetchWithToken(`/api/v1/protocol/units/${unitId}`, { method: 'DELETE' });
      setAddresses((prev) =>
        prev.map((addr) => {
          if (addr.id !== addressId) return addr;
          return {
            ...addr,
            units: (addr.units || []).filter((u) => u.id !== unitId),
          };
        })
      );
      showToast('Wohneinheit gelöscht');
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

  const handleDeleteAddress = async (addr) => {
    if (
      !window.confirm(
        `Protokoll "${addr.projektnummer}" (${addr.strasse} ${addr.hausnummer}, ${addr.ort}) inklusive aller Wohneinheiten wirklich löschen?`
      )
    ) {
      return;
    }
    try {
      await fetchWithToken(`/api/v1/protocol/addresses/${addr.id}`, { method: 'DELETE' });
      setAddresses((prev) => prev.filter((a) => a.id !== addr.id));
      showToast(`Protokoll ${addr.projektnummer} wurde gelöscht`);
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

  // Server-side multi-sheet .xlsx download (with automatic fallback)
  const handleDownloadExcelWorkbook = async (singleAddress = null) => {
    setExportingExcel(true);
    try {
      const token = getToken();
      const query = singleAddress ? `?address_id=${encodeURIComponent(singleAddress.id)}` : '';
      const res = await fetch(`${API_URL}/api/v1/protocol/export/excel${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export fehlgeschlagen (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.download = singleAddress
        ? `UGG_Protokoll_${singleAddress.projektnummer}_${dateStamp}.xlsx`
        : `UGG_Hausbegehungsprotokolle_${dateStamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Excel-Arbeitsmappe (.xlsx) erfolgreich heruntergeladen');
    } catch (err) {
      // Fallback to CSV if offline
      exportAddressesToCsv(
        singleAddress ? [singleAddress] : filteredAddresses,
        singleAddress
          ? `UGG_Protokoll_${singleAddress.projektnummer}.csv`
          : 'UGG_Hausbegehungsprotokolle.csv'
      );
      showToast('Export als CSV-Datei für Excel heruntergeladen');
    } finally {
      setExportingExcel(false);
    }
  };

  // Filtered addresses
  const filteredAddresses = useMemo(() => {
    return addresses.filter((addr) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (addr.projektnummer || '').toLowerCase().includes(q) ||
        (addr.strasse || '').toLowerCase().includes(q) ||
        (addr.ort || '').toLowerCase().includes(q) ||
        (addr.plz || '').toLowerCase().includes(q) ||
        (addr.owner_name || '').toLowerCase().includes(q) ||
        (addr.loesungsoption || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (statusFilter === 'ALL') return true;

      const units = addr.units || [];
      if (statusFilter === 'COMPLETED_BUILDING') {
        return units.length > 0 && units.every((u) => u.status === 'Abgeschlossen');
      }
      return units.some((u) => u.status === statusFilter);
    });
  }, [addresses, searchQuery, statusFilter]);

  // KPI metrics
  const kpis = useMemo(() => {
    let totalUnits = 0;
    let completedUnits = 0;
    let inProgressUnits = 0;
    let restarbeitUnits = 0;
    let taInstalled = 0;
    let spliced = 0;

    addresses.forEach((a) => {
      const uList = a.units || [];
      totalUnits += uList.length;
      uList.forEach((u) => {
        if (u.status === 'Abgeschlossen') completedUnits += 1;
        if (u.status === 'In Bearbeitung') inProgressUnits += 1;
        if (u.status === 'Restarbeit') restarbeitUnits += 1;
        if (u.ta_installiert) taInstalled += 1;
        if (u.spleissen_fertig) spliced += 1;
      });
    });

    const completionRate = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
    return {
      totalAddresses: addresses.length,
      totalUnits,
      completedUnits,
      inProgressUnits,
      restarbeitUnits,
      taInstalled,
      spliced,
      completionRate,
    };
  }, [addresses]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 120,
            padding: '12px 18px',
            borderRadius: 12,
            background: toast.type === 'error' ? '#dc2626' : '#18181b',
            color: '#fff',
            borderLeft: `4px solid ${toast.type === 'error' ? '#fca5a5' : '#FF6B00'}`,
            boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={16} style={{ color: '#FF6B00' }} />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Top Module Header & Sub-Navigation */}
      <div
        className="glass-panel"
        style={{
          padding: '18px 24px',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>UGG Hausbegehungsprotokoll & Master-Detail Manager</h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255, 107, 0, 0.12)',
                color: '#FF6B00',
              }}
            >
              Brünel AI Extractor v2.0
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            Lokale PDF-Datenextraktion (PyMuPDF), Human-in-the-Loop Verifizierung, Master-Detail Einheitenverwaltung & Excel-Export (.xlsx)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 4,
              borderRadius: 10,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
          >
            {[
              { id: 'manager', label: 'Master-Detail & Upload' },
              { id: 'upload', label: 'PDF KI-Extraktor' },
              { id: 'export', label: 'Excel Export Center' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(`/protocol/${tab.id}`)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === tab.id ? '#FF6B00' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                  transition: 'all 150ms ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => handleDownloadExcelWorkbook(null)}
            disabled={exportingExcel || addresses.length === 0}
            style={{
              background: '#16a34a',
              borderColor: '#16a34a',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <FileSpreadsheet size={16} />
            <span>{exportingExcel ? 'Exportiert…' : 'Excel Export (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* KPI Telemetry Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: 14,
        }}
      >
        <div className="glass-panel" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            Erfasste Gebäude (Master)
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{kpis.totalAddresses}</div>
          <div style={{ fontSize: 11, color: '#FF6B00', marginTop: 2 }}>
            Standardisierte UGG-Protokolle
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            Wohneinheiten Gesamt (Units)
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{kpis.totalUnits}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            TA: {kpis.taInstalled} • Spleißen: {kpis.spliced}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            Abgeschlossene Einheiten
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
            {kpis.completedUnits}
          </div>
          <div style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
            {kpis.completionRate}% Abschlussquote
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            In Bearbeitung / Restarbeit
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706', marginTop: 4 }}>
            {kpis.inProgressUnits + kpis.restarbeitUnits}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {kpis.inProgressUnits} aktiv • {kpis.restarbeitUnits} Restarbeit
          </div>
        </div>
      </div>

      {/* Component 1: Upload Zone (shown on 'manager' and 'upload' tabs) */}
      {(activeTab === 'manager' || activeTab === 'upload') && (
        <ProtocolUploadZone
          uploading={uploading}
          setUploading={setUploading}
          onLoadSample={handleLoadSampleProtocol}
          onExtracted={(extractedData, fileName) => {
            setVerificationModal({
              data: extractedData,
              fileName,
              isEditMode: false,
            });
          }}
        />
      )}

      {/* Excel Export Center Tab */}
      {activeTab === 'export' && (
        <div className="glass-panel" style={{ padding: 24, borderRadius: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={20} style={{ color: '#16a34a' }} />
                <span>Excel-Datenexport (.xlsx & .csv)</span>
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Exportieren Sie alle Master-Adressen und Detail-Wohneinheiten als mehrblättrige Excel-Arbeitsmappe (.xlsx) oder als CSV-Tabelle.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleDownloadExcelWorkbook(null)}
                disabled={exportingExcel || addresses.length === 0}
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
              >
                <FileSpreadsheet size={16} />
                <span>Komplette Excel-Arbeitsmappe (.xlsx) herunterladen</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => exportAddressesToCsv(filteredAddresses)}
                disabled={filteredAddresses.length === 0}
              >
                <Download size={16} />
                <span>Gefilterte Ansicht als Excel-CSV (.csv)</span>
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 14,
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <strong>Tabellenblatt 1: Master-Detail Gesamtübersicht</strong>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Kombinierte Zeile pro Wohneinheit (Projektnummer, Adresse, Eigentümer, NE3-Status, Lösungsoption, Etage, Unit-ID, Status, TA, Spleißen, Flexrohr) inkl. grüner Farbcodierung für abgeschlossene Einheiten.
              </p>
            </div>
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <strong>Tabellenblatt 2: Adressen (Master)</strong>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Alle Gebäude-Stammdaten, Eigentümer-Kontaktdaten, Gesamt-WE sowie prozentualer Baufortschritt pro Adresse.
              </p>
            </div>
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <strong>Tabellenblatt 3: Wohneinheiten (Units)</strong>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Reine Detail-Tabelle aller Wohneinheiten zur schnellen Weiterverarbeitung in Pivot-Tabellen oder UGG-Reporting-Listen.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search, Filter & Accordion Controls */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 18px',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suche nach Projektnummer, Straße, PLZ, Ort, Eigentümer…"
              style={{ paddingLeft: 34 }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', minWidth: 190 }}
          >
            <option value="ALL">Alle Status ({addresses.length})</option>
            <option value="Offen">Mit offenen Einheiten</option>
            <option value="In Bearbeitung">In Bearbeitung</option>
            <option value="Restarbeit">Mit Restarbeit</option>
            <option value="Abgeschlossen">Mit abgeschlossenen WE</option>
            <option value="COMPLETED_BUILDING">Komplett abgeschlossen (100%)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => handleExpandAll(true)}
            disabled={filteredAddresses.length === 0}
          >
            Alle ausklappen
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => handleExpandAll(false)}
            disabled={filteredAddresses.length === 0}
          >
            Alle einklappen
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => exportAddressesToCsv(filteredAddresses)}
            disabled={filteredAddresses.length === 0}
            title="Schneller CSV-Export für Excel"
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={loadAddresses}
            title="Aktualisieren"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Component 3: Master-Detail Accordion List */}
      {loading ? (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center', borderRadius: 16 }}>
          Lade UGG-Protokolle und Wohneinheiten…
        </div>
      ) : (
        <ProtocolMasterDetailAccordion
          addresses={filteredAddresses}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          onUnitChange={handleUnitChange}
          onAddUnit={handleAddUnit}
          onDeleteUnit={handleDeleteUnit}
          onExportSingleExcel={(addr) => handleDownloadExcelWorkbook(addr)}
          onEditAddress={(addr) =>
            setVerificationModal({
              data: addr,
              fileName: addr.projektnummer,
              isEditMode: true,
              editAddressId: addr.id,
            })
          }
          onDeleteAddress={handleDeleteAddress}
        />
      )}

      {/* Component 2: Human-in-the-Loop Verification Modal */}
      {verificationModal && (
        <ProtocolVerificationModal
          initialData={verificationModal.data}
          sourceFileName={verificationModal.fileName}
          isEditMode={verificationModal.isEditMode}
          editAddressId={verificationModal.editAddressId}
          onClose={() => setVerificationModal(null)}
          onSaved={(savedAddr) => {
            setVerificationModal(null);
            setAddresses((prev) => {
              const exists = prev.some((a) => a.id === savedAddr.id);
              if (exists) {
                return prev.map((a) => (a.id === savedAddr.id ? savedAddr : a));
              }
              return [savedAddr, ...prev];
            });
            setExpandedIds((prev) => ({ ...prev, [savedAddr.id]: true }));
            showToast(
              `Protokoll ${savedAddr.projektnummer} (${savedAddr.strasse} ${savedAddr.hausnummer}) erfolgreich gespeichert!`
            );
            if (activeTab === 'upload') {
              navigate('/protocol/manager');
            }
          }}
        />
      )}
    </div>
  );
}
export default ProtocolExtractorModule;
