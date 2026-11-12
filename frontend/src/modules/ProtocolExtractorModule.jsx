import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
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
  Star,
  Eye,
  MessageSquare,
  Calendar,
  Filter,
  ExternalLink,
  Check,
  Send,
} from 'lucide-react';
import { API_URL, fetchWithToken, getToken } from '../core/api';

export const AUSBAU_TYP_OPTIONS = [
  'Metalkanal',
  'Leerrohr-Kamin',
  'Kabelkanal',
  'Fassade',
  'Bestand',
];

export const BUILDING_STATUS_OPTIONS = [
  'Ausbau terminiert',
  'Offen',
  'In Bearbeitung',
  'Restarbeiten',
  'Abgeschlossen',
];

export const UNIT_STATUS_OPTIONS = [
  'Offen',
  'In Bearbeitung',
  'Restarbeit',
  'Abgeschlossen',
];

export const WE_AUSBAU_ART_OPTIONS = [
  'TA Installation',
  'Reserve',
  'Ohne',
];

const BUILDING_STATUS_PILL = {
  'Ausbau terminiert': {
    background: 'rgba(168, 85, 247, 0.16)',
    color: '#7e22ce',
    border: '1px solid rgba(168, 85, 247, 0.35)',
  },
  Offen: {
    background: 'rgba(107, 114, 128, 0.14)',
    color: '#374151',
    border: '1px solid rgba(107, 114, 128, 0.3)',
  },
  'In Bearbeitung': {
    background: 'rgba(37, 99, 235, 0.14)',
    color: '#1d4ed8',
    border: '1px solid rgba(37, 99, 235, 0.32)',
  },
  Restarbeiten: {
    background: 'rgba(234, 88, 12, 0.16)',
    color: '#c2410c',
    border: '1px solid rgba(234, 88, 12, 0.35)',
  },
  Abgeschlossen: {
    background: 'rgba(22, 163, 74, 0.16)',
    color: '#15803d',
    border: '1px solid rgba(22, 163, 74, 0.35)',
  },
};

const UNIT_STATUS_BADGE = {
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

/** Extracts YYYY-MM from German date "15.11.2026 08:01" or ISO "2026-11-15" */
function extractYearMonths(addr) {
  const candidates = [
    addr.ausbautermin,
    addr.restarbeit_termin,
    addr.datum,
    addr.created_at ? String(addr.created_at).slice(0, 10) : '',
  ];
  const months = new Set();
  candidates.forEach((raw) => {
    if (!raw) return;
    const str = String(raw).trim();
    // ISO YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) {
      months.add(`${isoMatch[1]}-${isoMatch[2]}`);
    }
    // German DD.MM.YYYY or DD.MM.YY
    const deMatch = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (deMatch) {
      const mm = deMatch[2].padStart(2, '0');
      let yyyy = deMatch[3];
      if (yyyy.length === 2) yyyy = `20${yyyy}`;
      months.add(`${yyyy}-${mm}`);
    }
  });
  return Array.from(months);
}

function formatGermanDateDisplay(val) {
  if (!val) return '—';
  const str = String(val).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}${iso[4] || ''}`;
  }
  return str;
}

/* =============================================================================
   CLIENT-SIDE CSV (UTF-8 BOM FOR EXCEL) FALLBACK HELPER
============================================================================= */
function exportAddressesToCsv(addresses, filename = 'UGG_Ausbau_Tracking.csv') {
  const headers = [
    'Ausbau-Typ',
    'Status',
    'AB-Termin',
    'Restarbeit Termin',
    'Adress ID2',
    'WE Nummer',
    'PLZ',
    'Ort',
    'Straße',
    'Etage',
    'Wohnung',
    'TA Installation',
    'Reserve',
    'Ohne',
    'Flexrohr',
    'HÜP installiert',
    'Spleißen fertig',
    'Upload',
    'Genehmigt',
    'Rechnung erstellt',
    'Rechnung bezahlt',
  ];

  const rows = [];
  addresses.forEach((addr) => {
    const units = addr.units && addr.units.length > 0 ? addr.units : [null];
    units.forEach((u) => {
      const weArt = u
        ? u.we_ausbau_art ||
          (u.ta_installiert ? 'TA Installation' : u.reserve ? 'Reserve' : 'Ohne')
        : 'Ohne';
      rows.push([
        addr.ausbau_typ || 'Metalkanal',
        addr.building_status || 'Ausbau terminiert',
        addr.ausbautermin || '',
        addr.restarbeit_termin || '',
        addr.adress_id || '',
        addr.projektnummer || '',
        addr.plz || '',
        addr.ort || '',
        `${addr.strasse || ''} ${addr.hausnummer || ''}`.trim(),
        u ? u.etage : '-',
        u ? u.unit_id : '-',
        weArt === 'TA Installation' ? 'Ja' : 'Nein',
        weArt === 'Reserve' ? 'Ja' : 'Nein',
        weArt === 'Ohne' ? 'Ja' : 'Nein',
        addr.flexrohr ? 'Ja' : 'Nein',
        addr.huep_installiert ? 'Ja' : 'Nein',
        addr.spleissen_fertig ? 'Ja' : 'Nein',
        addr.upload_done ? 'Ja' : 'Nein',
        addr.genehmigt ? 'Ja' : 'Nein',
        addr.rechnung_erstellt ? 'Ja' : 'Nein',
        addr.rechnung_bezahlt ? 'Ja' : 'Nein',
      ]);
    });
  });

  const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
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
      setUploadStep('Extrahiere Adress-ID, Objekt-Adresse, Eigentümer & UGG-Projektnummer…');
    }, 350);
    const stepTimer2 = setTimeout(() => {
      setUploadStep('Analysiere Zählung-Tabelle (Wohnungen) & speichere Original-PDF…');
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
        padding: 20,
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(246,246,248,0.85) 100%)',
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
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
              color: '#FF6B00',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 6px 16px rgba(17, 24, 39, 0.18)',
            }}
          >
            <Sparkles size={19} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                UGG Hausbegehungsprotokoll (PDF) Drag & Drop Import
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
                Original-PDF wird am Gebäude gespeichert
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Ziehen Sie das PDF-Protokoll hierher. Alle Gebäudedaten, Termine, Ausbau-Typ & Wohnungen werden extrahiert und das PDF dauerhaft am Objekt hinterlegt.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onLoadSample}
            disabled={uploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} style={{ color: '#FF6B00' }} />
            <span>Muster-Protokoll testen</span>
          </button>
          <a
            href={`${API_URL}/api/v1/protocol/sample-pdf?projektnummer=N4E241593436&adress_id=ABW007413530`}
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
          border: dragActive ? '2px dashed #FF6B00' : '2px dashed #d4d4dc',
          borderRadius: 12,
          padding: '22px 20px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          background: dragActive ? 'rgba(255, 107, 0, 0.06)' : 'rgba(255, 255, 255, 0.7)',
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '3px solid rgba(255, 107, 0, 0.2)',
                borderTopColor: '#FF6B00',
                animation: 'spin 0.85s linear infinite',
              }}
            />
            <div style={{ fontWeight: 600, fontSize: 14 }}>PDF wird lokal analysiert…</div>
            <div style={{ fontSize: 12, color: '#FF6B00', fontWeight: 500 }}>{uploadStep}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: 'rgba(255, 107, 0, 0.1)',
                color: '#FF6B00',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Upload size={20} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>
                UGG Hausbegehungsprotokoll PDF hierher ziehen oder{' '}
                <span style={{ color: '#FF6B00', textDecoration: 'underline' }}>Datei auswählen</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Extrahiert Adress-ID, WE-Nummer, Ausbau-Typ (Metalkanal / Leerrohr-Kamin), Termine & Wohnungen (TA Installation / Reserve / Ohne)
              </div>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            marginTop: 10,
            padding: '9px 12px',
            borderRadius: 10,
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            color: '#dc2626',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   COMPONENT 2: VERIFICATION & BUILDING EDIT MODAL (Human-in-the-Loop)
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
    adress_id: initialData?.adress_id || '',
    projektnummer: initialData?.projektnummer || '',
    datum: initialData?.datum || new Date().toLocaleDateString('de-DE'),
    hausbegeher: initialData?.hausbegeher || '',
    team: initialData?.team || (initialData?.ort ? `Techno(${initialData.ort})` : 'Techno(Lorch)'),
    building_status: initialData?.building_status || 'Ausbau terminiert',
    is_priority: Boolean(initialData?.is_priority),
    ausbau_typ: initialData?.ausbau_typ || 'Metalkanal',
    ausbautermin: initialData?.ausbautermin || '',
    restarbeit_termin: initialData?.restarbeit_termin || '',
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
    // Whole-building checkboxes
    flexrohr: Boolean(initialData?.flexrohr),
    huep_installiert: Boolean(initialData?.huep_installiert),
    spleissen_fertig: Boolean(initialData?.spleissen_fertig),
    upload_done: initialData?.upload_done !== undefined ? Boolean(initialData.upload_done) : true,
    genehmigt: Boolean(initialData?.genehmigt),
    rechnung_erstellt: Boolean(initialData?.rechnung_erstellt),
    rechnung_bezahlt: Boolean(initialData?.rechnung_bezahlt),
    pdf_filename: initialData?.pdf_filename || sourceFileName || null,
    pdf_base64: initialData?.pdf_base64 || null,
    units:
      initialData?.units && initialData.units.length > 0
        ? initialData.units.map((u) => {
            const art =
              u.we_ausbau_art ||
              (u.reserve ? 'Reserve' : u.ohne ? 'Ohne' : 'TA Installation');
            return {
              etage: u.etage || 'EG',
              unit_id: u.unit_id || '001',
              status: u.status || 'Offen',
              we_ausbau_art: art,
              ta_installiert: art === 'TA Installation',
              reserve: art === 'Reserve',
              ohne: art === 'Ohne',
            };
          })
        : [
            {
              etage: 'EG',
              unit_id: '001',
              status: 'Offen',
              we_ausbau_art: 'TA Installation',
              ta_installiert: true,
              reserve: false,
              ohne: false,
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
      const nextUnits = prev.units.map((u, i) => {
        if (i !== idx) return u;
        if (key === 'we_ausbau_art') {
          return {
            ...u,
            we_ausbau_art: value,
            ta_installiert: value === 'TA Installation',
            reserve: value === 'Reserve',
            ohne: value === 'Ohne',
          };
        }
        return { ...u, [key]: value };
      });
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
        we_ausbau_art: 'TA Installation',
        ta_installiert: true,
        reserve: false,
        ohne: false,
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
      setError('Bitte geben Sie eine gültige WE-Nummer / UGG-Projektnummer ein.');
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
        background: 'rgba(17, 24, 39, 0.62)',
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
          width: 'min(1020px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: 20,
          padding: 0,
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1px solid rgba(255, 107, 0, 0.3)',
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.32)',
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            padding: '18px 24px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>
                  {isEditMode
                    ? 'Gebäude-Stammdaten & Ausbau-Details bearbeiten'
                    : 'Human-in-the-Loop Verifizierung — Gebäude & Wohnungen'}
                </h3>
                {form.pdf_filename && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(22, 163, 74, 0.25)',
                      color: '#86efac',
                    }}
                  >
                    PDF angehängt: {form.pdf_filename}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>
                Prüfen Sie Adress-ID, Ausbau-Typ (Metalkanal / Leerrohr-Kamin), Termine, Gebäude-Checkliste und die Wohnungen (TA Installation / Reserve / Ohne).
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

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 1. Identifikation, Ausbau-Typ & Kalender-Termine */}
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
              <Calendar size={14} />
              <span>1. Adress-ID, Ausbau-Typ, Status & Termine (Kalenderauswahl)</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label>Adress-ID (z.B. ABW007413530)</label>
                <input
                  value={form.adress_id}
                  onChange={(e) => updateField('adress_id', e.target.value)}
                  placeholder="ABW007413530"
                  style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}
                />
              </div>

              <div>
                <label>WE Nummer / Projektnummer *</label>
                <input
                  value={form.projektnummer}
                  onChange={(e) => updateField('projektnummer', e.target.value)}
                  placeholder="N4E241593436"
                  style={{ fontFamily: 'monospace', fontWeight: 600 }}
                />
              </div>

              <div>
                <label>Ausbau-Typ *</label>
                <select
                  value={form.ausbau_typ}
                  onChange={(e) => updateField('ausbau_typ', e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  {AUSBAU_TYP_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Gebäude-Status *</label>
                <select
                  value={form.building_status}
                  onChange={(e) => updateField('building_status', e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  {BUILDING_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Ausbautermin (AB-Termin) 📅</label>
                <input
                  type="date"
                  value={form.ausbautermin ? String(form.ausbautermin).slice(0, 10) : ''}
                  onChange={(e) => updateField('ausbautermin', e.target.value)}
                />
              </div>

              <div>
                <label>Restarbeit Termin 📅</label>
                <input
                  type="date"
                  value={form.restarbeit_termin ? String(form.restarbeit_termin).slice(0, 10) : ''}
                  onChange={(e) => updateField('restarbeit_termin', e.target.value)}
                />
              </div>

              <div>
                <label>HBG Datum / Uhrzeit</label>
                <input
                  value={form.datum}
                  onChange={(e) => updateField('datum', e.target.value)}
                  placeholder="15.11.2026 08:01"
                />
              </div>

              <div>
                <label>Team / Auftragnehmer</label>
                <input
                  value={form.team}
                  onChange={(e) => updateField('team', e.target.value)}
                  placeholder="z.B. Techno(Lorch)"
                />
              </div>
            </div>
          </div>

          {/* 2. Objekt-Adresse & Eigentümer */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 14,
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
                <MapPin size={14} />
                <span>2. Objekt-Adresse & Einheiten</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 75px', gap: 10, marginBottom: 10 }}>
                <div>
                  <label>PLZ *</label>
                  <input value={form.plz} onChange={(e) => updateField('plz', e.target.value)} placeholder="73547" />
                </div>
                <div>
                  <label>Gemeinde / Ort *</label>
                  <input value={form.ort} onChange={(e) => updateField('ort', e.target.value)} placeholder="Lorch" />
                </div>
                <div>
                  <label>WE *</label>
                  <input
                    type="number"
                    min={1}
                    value={form.total_we}
                    onChange={(e) => updateField('total_we', Number(e.target.value))}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div>
                  <label>Straße *</label>
                  <input
                    value={form.strasse}
                    onChange={(e) => updateField('strasse', e.target.value)}
                    placeholder="Zollgasse"
                  />
                </div>
                <div>
                  <label>Hausnr. *</label>
                  <input
                    value={form.hausnummer}
                    onChange={(e) => updateField('hausnummer', e.target.value)}
                    placeholder="2"
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 14,
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
                <span>3. Eigentümer & Kontakt</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label>Eigentümer (Name, Vorname)</label>
                  <input
                    value={form.owner_name}
                    onChange={(e) => updateField('owner_name', e.target.value)}
                    placeholder="Burgstaller-Pflüger, Heiko"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label>Telefon</label>
                    <input
                      value={form.owner_telefon}
                      onChange={(e) => updateField('owner_telefon', e.target.value)}
                      placeholder="071729349333"
                    />
                  </div>
                  <div>
                    <label>E-Mail</label>
                    <input
                      value={form.owner_email}
                      onChange={(e) => updateField('owner_email', e.target.value)}
                      placeholder="hb@km-hausverwaltung.de"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Whole-Building Checkboxes (Flexrohr, HÜP, Spleißen, Upload, Genehmigt, Rechnung erstellt, Rechnung bezahlt) */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(24,24,27,0.03) 0%, rgba(255,107,0,0.05) 100%)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#18181b',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>4. Gebäude-Status & Abrechnung (Gilt für das gesamte Gebäude)</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none' }}>
                Flexrohr, HÜP, Spleißen, Upload, Genehmigt & Rechnungen werden zentral für das Gebäude ausgewählt
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: 10,
              }}
            >
              {[
                { key: 'flexrohr', label: 'Flexrohr', groupColor: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
                { key: 'huep_installiert', label: 'HÜP installiert', groupColor: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
                { key: 'spleissen_fertig', label: 'Spleißen fertig', groupColor: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
                { key: 'upload_done', label: 'Upload', groupColor: '#ea580c', bg: 'rgba(234,88,12,0.09)' },
                { key: 'genehmigt', label: 'Genehmigt', groupColor: '#ea580c', bg: 'rgba(234,88,12,0.09)' },
                { key: 'rechnung_erstellt', label: 'Rechnung erstellt', groupColor: '#0284c7', bg: 'rgba(2,132,199,0.09)' },
                { key: 'rechnung_bezahlt', label: 'Rechnung bezahlt', groupColor: '#0284c7', bg: 'rgba(2,132,199,0.09)' },
              ].map((item) => {
                const checked = Boolean(form[item.key]);
                return (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: checked ? item.bg : '#fff',
                      border: checked ? `1.5px solid ${item.groupColor}` : '1px solid var(--border)',
                      color: checked ? item.groupColor : 'var(--text-main)',
                      fontWeight: 600,
                      fontSize: 12,
                      transition: 'all 150ms ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => updateField(item.key, e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 5. Wohnungen (Units) Table — ONLY TA Installation, Reserve, and Ohne per Wohnung */}
          {!isEditMode && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  flexWrap: 'wrap',
                  gap: 8,
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
                  <span>
                    5. Wohnungen unter diesem Gebäude ({form.units.length} WE) — Nur TA Installation / Reserve / Ohne
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={addUnitRow}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={14} />
                  <span>Wohnung hinzufügen</span>
                </button>
              </div>

              <div
                style={{
                  maxHeight: 250,
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
                      <th style={{ padding: '10px 12px' }}>Wohnung (Unit-ID)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', background: '#991b1b' }}>
                        TA Installation
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', background: '#991b1b' }}>
                        Reserve
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', background: '#374151' }}>
                        Ohne
                      </th>
                      <th style={{ padding: '10px 12px' }}>WE-Status</th>
                      <th style={{ padding: '10px 12px', width: 46 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.units.map((u, idx) => {
                      const art =
                        u.we_ausbau_art ||
                        (u.reserve ? 'Reserve' : u.ohne ? 'Ohne' : 'TA Installation');
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            ...getUnitRowStyle(u.status),
                          }}
                        >
                          <td style={{ padding: '7px 10px' }}>
                            <input
                              value={u.etage}
                              onChange={(e) => updateUnitRow(idx, 'etage', e.target.value)}
                              placeholder="EG / OG1"
                              style={{ padding: '6px 8px' }}
                            />
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <input
                              value={u.unit_id}
                              onChange={(e) => updateUnitRow(idx, 'unit_id', e.target.value)}
                              placeholder="001"
                              style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}
                            />
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={`modal-we-art-${idx}`}
                              checked={art === 'TA Installation'}
                              onChange={() => updateUnitRow(idx, 'we_ausbau_art', 'TA Installation')}
                              style={{ width: 17, height: 17, cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={`modal-we-art-${idx}`}
                              checked={art === 'Reserve'}
                              onChange={() => updateUnitRow(idx, 'we_ausbau_art', 'Reserve')}
                              style={{ width: 17, height: 17, cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={`modal-we-art-${idx}`}
                              checked={art === 'Ohne'}
                              onChange={() => updateUnitRow(idx, 'we_ausbau_art', 'Ohne')}
                              style={{ width: 17, height: 17, cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '7px 10px' }}>
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
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              onClick={() => removeUnitRow(idx)}
                              disabled={form.units.length <= 1}
                              style={{ color: '#dc2626', padding: 4 }}
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
                  Bestehendes Gebäude überschreiben & aktualisieren
                </button>
              )}
            </div>
          )}

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
                  ? 'Speichert…'
                  : isEditMode
                  ? 'Änderungen speichern'
                  : 'Confirm & Save (Gebäude + PDF speichern)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   COMPONENT 3: DEDICATED BUILDING DETAIL VIEW (Entered when clicking a building)
============================================================================= */
export const BuildingDetailView = ({
  building,
  user,
  onBack,
  onPatchBuilding,
  onUnitChange,
  onAddUnit,
  onDeleteUnit,
  onAddComment,
  onDeleteComment,
  onUploadPdf,
  onEditModal,
  onDeleteBuilding,
  onExportSingleExcel,
}) => {
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [newUnit, setNewUnit] = useState({
    etage: `OG${building.units?.length || 1}`,
    unit_id: String((building.units?.length || 0) + 1).padStart(3, '0'),
    we_ausbau_art: 'TA Installation',
  });
  const pdfInputRef = useRef(null);

  const units = building.units || [];
  const comments = building.comments || [];
  const pdfViewUrl = `${API_URL}/api/v1/protocol/addresses/${building.id}/pdf?download=false`;
  const pdfDownloadUrl = `${API_URL}/api/v1/protocol/addresses/${building.id}/pdf?download=true`;

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await onAddComment(building.id, commentText.trim(), user?.email || 'Brünel Team');
      setCommentText('');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handlePdfFileSelect = async (file) => {
    if (!file) return;
    setUploadingPdf(true);
    try {
      await onUploadPdf(building.id, file);
    } finally {
      setUploadingPdf(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Action & Back Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 22px',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <ArrowLeft size={16} />
            <span>Zurück zur Übersicht</span>
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onPatchBuilding(building.id, { is_priority: !building.is_priority })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: building.is_priority ? '#facc15' : '#71717a',
                }}
                title="Priorität umschalten"
              >
                <Star size={20} fill={building.is_priority ? '#facc15' : 'none'} />
              </button>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.22)',
                  color: '#93c5fd',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                }}
              >
                {building.adress_id || 'ABW—'}
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 6,
                  background: 'rgba(255, 107, 0, 0.22)',
                  color: '#fdba74',
                }}
              >
                WE-Nr: {building.projektnummer}
              </span>
              <h2 style={{ margin: 0, color: '#fff', fontSize: 19 }}>
                {building.strasse} {building.hausnummer}, {building.plz} {building.ort}
              </h2>
            </div>
            <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4 }}>
              Eigentümer: <strong style={{ color: '#e4e4e7' }}>{building.owner_name || '—'}</strong> • Tel:{' '}
              {building.owner_telefon || '—'} • E-Mail: {building.owner_email || '—'} • Team:{' '}
              <strong style={{ color: '#fdba74' }}>{building.team || '—'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {building.has_pdf && (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowPdfPreview((p) => !p)}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                <Eye size={14} />
                <span>{showPdfPreview ? 'PDF-Vorschau schließen' : 'PDF ansehen'}</span>
              </button>
              <a
                href={pdfDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary btn-sm"
                style={{
                  background: 'rgba(22, 163, 74, 0.25)',
                  color: '#86efac',
                  borderColor: 'rgba(22, 163, 74, 0.45)',
                  textDecoration: 'none',
                }}
              >
                <Download size={14} />
                <span>PDF Download</span>
              </a>
            </>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onExportSingleExcel(building)}
            style={{
              background: '#16a34a',
              color: '#fff',
              borderColor: '#16a34a',
            }}
          >
            <FileSpreadsheet size={14} />
            <span>Excel Export (.xlsx)</span>
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onEditModal(building)}
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <Edit3 size={14} />
            <span>Alle Felder bearbeiten</span>
          </button>
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() => onDeleteBuilding(building)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Inline Embedded PDF Viewer (when toggled) */}
      {showPdfPreview && building.has_pdf && (
        <div className="glass-panel" style={{ padding: 18, borderRadius: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: '#FF6B00' }} />
              <strong>Gespeichertes Original-PDF: {building.pdf_filename || 'UGG_Protokoll.pdf'}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={pdfDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary btn-sm"
                style={{ textDecoration: 'none' }}
              >
                <Download size={14} />
                <span>Herunterladen</span>
              </a>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowPdfPreview(false)}
              >
                Schließen
              </button>
            </div>
          </div>
          <iframe
            src={pdfViewUrl}
            title="UGG Hausbegehungsprotokoll PDF"
            style={{
              width: '100%',
              height: 560,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: '#f8fafc',
            }}
          />
        </div>
      )}

      {/* Row 1: Building Controls (Ausbau-Typ, Status, Calendar Dates) + Whole-Building Checkboxes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 18,
        }}
      >
        {/* Left Card: Ausbau-Typ, Status, AB-Termin & Restarbeit Termin Calendar Pickers */}
        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={17} style={{ color: '#FF6B00' }} />
            <span>Gebäude-Steuerung: Ausbau-Typ & Kalender-Termine</span>
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label>Adress-ID</label>
              <input
                value={building.adress_id || ''}
                onChange={(e) => onPatchBuilding(building.id, { adress_id: e.target.value })}
                placeholder="ABW007413530"
                style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}
              />
            </div>

            <div>
              <label>Ausbau-Typ (Metalkanal / Leerrohr-Kamin)</label>
              <select
                value={building.ausbau_typ || 'Metalkanal'}
                onChange={(e) => onPatchBuilding(building.id, { ausbau_typ: e.target.value })}
                style={{ fontWeight: 700, color: '#1e3a8a', background: 'rgba(30, 58, 138, 0.06)' }}
              >
                {AUSBAU_TYP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Ausbautermin (AB-Termin) 📅</label>
              <input
                type="date"
                value={building.ausbautermin ? String(building.ausbautermin).slice(0, 10) : ''}
                onChange={(e) => onPatchBuilding(building.id, { ausbautermin: e.target.value })}
              />
            </div>

            <div>
              <label>Restarbeit Termin 📅</label>
              <input
                type="date"
                value={building.restarbeit_termin ? String(building.restarbeit_termin).slice(0, 10) : ''}
                onChange={(e) => onPatchBuilding(building.id, { restarbeit_termin: e.target.value })}
              />
            </div>

            <div>
              <label>Gebäude-Status</label>
              <select
                value={building.building_status || 'Ausbau terminiert'}
                onChange={(e) => onPatchBuilding(building.id, { building_status: e.target.value })}
                style={{
                  fontWeight: 700,
                  ...(BUILDING_STATUS_PILL[building.building_status] || {}),
                }}
              >
                {BUILDING_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Team / Auftragnehmer</label>
              <input
                value={building.team || ''}
                onChange={(e) => onPatchBuilding(building.id, { team: e.target.value })}
                placeholder="Techno(Lorch)"
              />
            </div>
          </div>
        </div>

        {/* Right Card: Whole-Building Selective Checkboxes (Flexrohr, HÜP, Spleißen, Upload, Genehmigt, Rechnung erstellt, Rechnung bezahlt) */}
        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={17} style={{ color: '#FF6B00' }} />
            <span>Gebäude-Checkliste (Gilt für das gesamte Gebäude)</span>
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Flexrohr, HÜP, Spleißen, Upload, Genehmigt sowie Rechnung erstellt & bezahlt werden hier direkt für das gesamte Gebäude geschaltet.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            {[
              { key: 'flexrohr', label: 'Flexrohr', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
              { key: 'huep_installiert', label: 'HÜP installiert', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
              { key: 'spleissen_fertig', label: 'Spleißen fertig', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
              { key: 'upload_done', label: 'Upload', color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
              { key: 'genehmigt', label: 'Genehmigt', color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
              { key: 'rechnung_erstellt', label: 'Rechnung erstellt', color: '#0284c7', bg: 'rgba(2,132,199,0.12)' },
              { key: 'rechnung_bezahlt', label: 'Rechnung bezahlt', color: '#0284c7', bg: 'rgba(2,132,199,0.12)' },
            ].map((item) => {
              const active = Boolean(building[item.key]);
              return (
                <label
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 13px',
                    borderRadius: 11,
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: active ? item.bg : 'var(--surface-2)',
                    border: active ? `2px solid ${item.color}` : '1px solid var(--border)',
                    color: active ? item.color : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: 13,
                    transition: 'all 160ms ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) =>
                      onPatchBuilding(building.id, { [item.key]: e.target.checked })
                    }
                    style={{ width: 17, height: 17, cursor: 'pointer' }}
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Wohnungen (Units) Table — ONLY TA Installation, Reserve, and Ohne per Wohnung */}
      <div className="glass-panel" style={{ padding: 22, borderRadius: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} style={{ color: '#FF6B00' }} />
              <span>Wohnungen im Gebäude ({units.length} Einheiten)</span>
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Pro Wohnung wird ausschließlich zwischen <strong>TA Installation</strong>, <strong>Reserve</strong> und <strong>Ohne</strong> gewählt.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Etage (z.B. OG2)"
              value={newUnit.etage}
              onChange={(e) => setNewUnit((p) => ({ ...p, etage: e.target.value }))}
              style={{ width: 110, padding: '7px 10px', fontSize: 12 }}
            />
            <input
              placeholder="Wohnung (z.B. 005)"
              value={newUnit.unit_id}
              onChange={(e) => setNewUnit((p) => ({ ...p, unit_id: e.target.value }))}
              style={{ width: 120, padding: '7px 10px', fontSize: 12, fontFamily: 'monospace' }}
            />
            <select
              value={newUnit.we_ausbau_art}
              onChange={(e) => setNewUnit((p) => ({ ...p, we_ausbau_art: e.target.value }))}
              style={{ width: 150, padding: '7px 10px', fontSize: 12 }}
            >
              {WE_AUSBAU_ART_OPTIONS.map((art) => (
                <option key={art} value={art}>
                  {art}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={async () => {
                await onAddUnit(building.id, {
                  etage: newUnit.etage || 'EG',
                  unit_id: newUnit.unit_id || '001',
                  we_ausbau_art: newUnit.we_ausbau_art,
                  ta_installiert: newUnit.we_ausbau_art === 'TA Installation',
                  reserve: newUnit.we_ausbau_art === 'Reserve',
                  ohne: newUnit.we_ausbau_art === 'Ohne',
                  status: 'Offen',
                });
                setNewUnit({
                  etage: `OG${units.length + 1}`,
                  unit_id: String(units.length + 2).padStart(3, '0'),
                  we_ausbau_art: 'TA Installation',
                });
              }}
            >
              <Plus size={14} />
              <span>Wohnung hinzufügen</span>
            </button>
          </div>
        </div>

        <div
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: '#1f4e78',
                  color: '#fff',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '11px 14px' }}>Etage</th>
                <th style={{ padding: '11px 14px' }}>Wohnung (Unit-ID)</th>
                <th style={{ padding: '11px 14px', background: '#dc2626', textAlign: 'center' }}>
                  TA Installation
                </th>
                <th style={{ padding: '11px 14px', background: '#dc2626', textAlign: 'center' }}>
                  Reserve
                </th>
                <th style={{ padding: '11px 14px', background: '#374151', textAlign: 'center' }}>
                  Ohne
                </th>
                <th style={{ padding: '11px 14px', background: '#ca8a04', color: '#fff' }}>
                  WE-Status
                </th>
                <th style={{ padding: '11px 14px', textAlign: 'right' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const currentArt =
                  u.we_ausbau_art ||
                  (u.reserve ? 'Reserve' : u.ohne ? 'Ohne' : 'TA Installation');
                return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      ...getUnitRowStyle(u.status),
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{u.etage}</td>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      WE-{u.unit_id}
                    </td>

                    {/* TA Installation */}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          onUnitChange(building.id, u.id, {
                            we_ausbau_art: 'TA Installation',
                            ta_installiert: true,
                            reserve: false,
                            ohne: false,
                          })
                        }
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 12,
                          border:
                            currentArt === 'TA Installation'
                              ? '2px solid #dc2626'
                              : '1px solid var(--border)',
                          background:
                            currentArt === 'TA Installation'
                              ? 'rgba(220, 38, 38, 0.14)'
                              : 'var(--surface)',
                          color: currentArt === 'TA Installation' ? '#b91c1c' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {currentArt === 'TA Installation' && <Check size={14} />}
                        <span>TA Installation</span>
                      </button>
                    </td>

                    {/* Reserve */}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          onUnitChange(building.id, u.id, {
                            we_ausbau_art: 'Reserve',
                            ta_installiert: false,
                            reserve: true,
                            ohne: false,
                          })
                        }
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 12,
                          border:
                            currentArt === 'Reserve'
                              ? '2px solid #d97706'
                              : '1px solid var(--border)',
                          background:
                            currentArt === 'Reserve'
                              ? 'rgba(245, 158, 11, 0.16)'
                              : 'var(--surface)',
                          color: currentArt === 'Reserve' ? '#b45309' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {currentArt === 'Reserve' && <Check size={14} />}
                        <span>Reserve</span>
                      </button>
                    </td>

                    {/* Ohne */}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          onUnitChange(building.id, u.id, {
                            we_ausbau_art: 'Ohne',
                            ta_installiert: false,
                            reserve: false,
                            ohne: true,
                          })
                        }
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 12,
                          border:
                            currentArt === 'Ohne'
                              ? '2px solid #374151'
                              : '1px solid var(--border)',
                          background:
                            currentArt === 'Ohne'
                              ? 'rgba(55, 65, 81, 0.14)'
                              : 'var(--surface)',
                          color: currentArt === 'Ohne' ? '#1f2937' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {currentArt === 'Ohne' && <Check size={14} />}
                        <span>Ohne</span>
                      </button>
                    </td>

                    <td style={{ padding: '10px 14px', minWidth: 165 }}>
                      <select
                        value={u.status}
                        onChange={(e) =>
                          onUnitChange(building.id, u.id, { status: e.target.value })
                        }
                        style={{
                          padding: '6px 10px',
                          fontWeight: 600,
                          fontSize: 12,
                          borderRadius: 8,
                          width: 'auto',
                          minWidth: 155,
                          cursor: 'pointer',
                          ...(UNIT_STATUS_BADGE[u.status] || {}),
                        }}
                      >
                        {UNIT_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => onDeleteUnit(building.id, u.id)}
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
      </div>

      {/* Row 3: Saved PDF Document Card + Building Comments & Updates Feed */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 18,
        }}
      >
        {/* PDF Object Attachment Card */}
        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={17} style={{ color: '#FF6B00' }} />
            <span>Hinterlegtes UGG Hausbegehungsprotokoll (PDF)</span>
          </h3>

          {building.has_pdf ? (
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'rgba(22, 163, 74, 0.08)',
                border: '1px solid rgba(22, 163, 74, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>
                  {building.pdf_filename || `UGG_${building.projektnummer}.pdf`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Original-PDF dauerhaft an diesem Gebäude gespeichert
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setShowPdfPreview((p) => !p)}
                >
                  <Eye size={14} />
                  <span>{showPdfPreview ? 'Vorschau ausblenden' : 'Ansehen'}</span>
                </button>
                <a
                  href={pdfDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <Download size={14} />
                  <span>Download</span>
                </a>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              Noch kein PDF für dieses Gebäude hinterlegt.
            </div>
          )}

          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handlePdfFileSelect(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={uploadingPdf}
            onClick={() => pdfInputRef.current?.click()}
            style={{ width: '100%' }}
          >
            <Upload size={14} />
            <span>
              {uploadingPdf
                ? 'Lädt PDF hoch…'
                : building.has_pdf
                ? 'Neues / Aktualisiertes PDF hochladen & ersetzen'
                : 'PDF-Datei jetzt anhängen'}
            </span>
          </button>
        </div>

        {/* Building Comments & Updates Card */}
        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={17} style={{ color: '#FF6B00' }} />
            <span>Kommentare & Updates zum Gebäude ({comments.length})</span>
          </h3>

          <form
            onSubmit={handleSubmitComment}
            style={{ display: 'flex', gap: 8, marginBottom: 14 }}
          >
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Kommentar, Notiz oder Bau-Update für dieses Gebäude schreiben…"
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={submittingComment || !commentText.trim()}
            >
              <Send size={14} />
              <span>Posten</span>
            </button>
          </form>

          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {comments.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                Noch keine Kommentare vorhanden. Schreiben Sie oben das erste Update.
              </div>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                      <strong style={{ color: 'var(--text-main)' }}>{c.author || 'Team'}</strong> •{' '}
                      {c.created_at}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                      {c.text}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => onDeleteComment(building.id, c.id)}
                    style={{ color: '#dc2626', padding: 4 }}
                    title="Kommentar löschen"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   MAIN MODULE CONTAINER: ProtocolExtractorModule
============================================================================= */
export function ProtocolExtractorModule({ user }) {
  const { section } = useParams();
  const navigate = useNavigate();
  const activeTab = section || 'manager';

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [toast, setToast] = useState(null);

  // Modals
  const [verificationModal, setVerificationModal] = useState(null);
  const [quickCommentBuilding, setQuickCommentBuilding] = useState(null);
  const [quickCommentText, setQuickCommentText] = useState('');
  const [quickPdfBuilding, setQuickPdfBuilding] = useState(null);

  // Comprehensive Filters (Top Bar + Column Filters)
  const [globalSearch, setGlobalSearch] = useState('');
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [ausbauTypFilter, setAusbauTypFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [ortFilter, setOrtFilter] = useState('ALL');
  const [buildingFlagFilter, setBuildingFlagFilter] = useState('ALL');

  // Column-specific inline filters (matching Image 2)
  const [colAdressId, setColAdressId] = useState('');
  const [colGemeinde, setColGemeinde] = useState('');
  const [colStrasse, setColStrasse] = useState('');
  const [colHausVon, setColHausVon] = useState('');
  const [colHausBis, setColHausBis] = useState('');
  const [colEmail, setColEmail] = useState('');
  const [colOwner, setColOwner] = useState('');
  const [colDateSearch, setColDateSearch] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWithToken('/api/v1/protocol/addresses');
      setAddresses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load protocol addresses:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const resetAllFilters = () => {
    setGlobalSearch('');
    setOnlyPriority(false);
    setMonthFilter('ALL');
    setAusbauTypFilter('ALL');
    setStatusFilter('ALL');
    setTeamFilter('ALL');
    setOrtFilter('ALL');
    setBuildingFlagFilter('ALL');
    setColAdressId('');
    setColGemeinde('');
    setColStrasse('');
    setColHausVon('');
    setColHausBis('');
    setColEmail('');
    setColOwner('');
    setColDateSearch('');
  };

  // Dynamic options for Team, Ort, and Month dropdowns
  const filterOptions = useMemo(() => {
    const teams = new Set();
    const orte = new Set();
    const months = new Set();

    addresses.forEach((a) => {
      if (a.team) teams.add(a.team);
      if (a.ort) orte.add(a.ort);
      extractYearMonths(a).forEach((m) => months.add(m));
    });

    // Always include all 12 months of 2026 so user can filter by any month immediately
    for (let m = 1; m <= 12; m += 1) {
      months.add(`2026-${String(m).padStart(2, '0')}`);
    }

    return {
      teams: Array.from(teams).sort(),
      orte: Array.from(orte).sort(),
      months: Array.from(months).sort(),
    };
  }, [addresses]);

  // Filtered buildings
  const filteredAddresses = useMemo(() => {
    return addresses.filter((addr) => {
      if (onlyPriority && !addr.is_priority) return false;
      if (ausbauTypFilter !== 'ALL' && (addr.ausbau_typ || 'Metalkanal') !== ausbauTypFilter) {
        return false;
      }
      if (
        statusFilter !== 'ALL' &&
        (addr.building_status || 'Ausbau terminiert') !== statusFilter
      ) {
        return false;
      }
      if (teamFilter !== 'ALL' && (addr.team || '') !== teamFilter) return false;
      if (ortFilter !== 'ALL' && (addr.ort || '') !== ortFilter) return false;

      if (monthFilter !== 'ALL') {
        const addrMonths = extractYearMonths(addr);
        if (!addrMonths.includes(monthFilter)) return false;
      }

      if (buildingFlagFilter !== 'ALL') {
        if (buildingFlagFilter === 'HAS_PDF' && !addr.has_pdf) return false;
        if (buildingFlagFilter === 'FLEXROHR_YES' && !addr.flexrohr) return false;
        if (buildingFlagFilter === 'FLEXROHR_NO' && addr.flexrohr) return false;
        if (buildingFlagFilter === 'HUEP_YES' && !addr.huep_installiert) return false;
        if (buildingFlagFilter === 'HUEP_NO' && addr.huep_installiert) return false;
        if (buildingFlagFilter === 'SPLEISSEN_YES' && !addr.spleissen_fertig) return false;
        if (buildingFlagFilter === 'SPLEISSEN_NO' && addr.spleissen_fertig) return false;
        if (buildingFlagFilter === 'UPLOAD_YES' && !addr.upload_done) return false;
        if (buildingFlagFilter === 'GENEHMIGT_YES' && !addr.genehmigt) return false;
        if (buildingFlagFilter === 'RECHNUNG_ERSTELLT_YES' && !addr.rechnung_erstellt) return false;
        if (buildingFlagFilter === 'RECHNUNG_BEZAHLT_YES' && !addr.rechnung_bezahlt) return false;
        if (buildingFlagFilter === 'RECHNUNG_OFFEN' && addr.rechnung_bezahlt) return false;
      }

      // Column-level filters
      if (colAdressId.trim()) {
        const q = colAdressId.trim().toLowerCase();
        if (
          !(addr.adress_id || '').toLowerCase().includes(q) &&
          !(addr.projektnummer || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (colGemeinde.trim()) {
        const q = colGemeinde.trim().toLowerCase();
        if (
          !(addr.ort || '').toLowerCase().includes(q) &&
          !(addr.plz || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (colStrasse.trim()) {
        const q = colStrasse.trim().toLowerCase();
        if (!(addr.strasse || '').toLowerCase().includes(q)) return false;
      }
      if (colHausVon.trim() || colHausBis.trim()) {
        const num = parseInt(String(addr.hausnummer || '').replace(/\D/g, ''), 10);
        if (!Number.isNaN(num)) {
          if (colHausVon.trim() && num < parseInt(colHausVon.trim(), 10)) return false;
          if (colHausBis.trim() && num > parseInt(colHausBis.trim(), 10)) return false;
        }
      }
      if (colEmail.trim()) {
        if (!(addr.owner_email || '').toLowerCase().includes(colEmail.trim().toLowerCase())) {
          return false;
        }
      }
      if (colOwner.trim()) {
        if (!(addr.owner_name || '').toLowerCase().includes(colOwner.trim().toLowerCase())) {
          return false;
        }
      }
      if (colDateSearch.trim()) {
        const q = colDateSearch.trim().toLowerCase();
        const combinedDates = `${addr.datum || ''} ${addr.ausbautermin || ''} ${addr.restarbeit_termin || ''}`.toLowerCase();
        if (!combinedDates.includes(q)) return false;
      }

      // Global search
      if (globalSearch.trim()) {
        const q = globalSearch.trim().toLowerCase();
        const hay = [
          addr.adress_id,
          addr.projektnummer,
          addr.plz,
          addr.ort,
          addr.strasse,
          addr.hausnummer,
          addr.owner_name,
          addr.owner_email,
          addr.owner_telefon,
          addr.team,
          addr.ausbau_typ,
          addr.building_status,
          addr.ausbautermin,
          addr.restarbeit_termin,
          ...(addr.comments || []).map((c) => c.text),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    addresses,
    onlyPriority,
    ausbauTypFilter,
    statusFilter,
    teamFilter,
    ortFilter,
    monthFilter,
    buildingFlagFilter,
    colAdressId,
    colGemeinde,
    colStrasse,
    colHausVon,
    colHausBis,
    colEmail,
    colOwner,
    colDateSearch,
    globalSearch,
  ]);

  // Sample protocol loader
  const handleLoadSampleProtocol = async () => {
    setUploading(true);
    try {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const sampleProjekt =
        addresses.length === 0 ? 'N4E241593436' : `N4E24${randomSuffix}`;
      const sampleAdrId =
        addresses.length === 0 ? 'ABW007413530' : `ABW00${randomSuffix}`;
      const pdfRes = await fetch(
        `${API_URL}/api/v1/protocol/sample-pdf?projektnummer=${encodeURIComponent(
          sampleProjekt
        )}&adress_id=${encodeURIComponent(sampleAdrId)}`
      );
      const pdfBlob = await pdfRes.blob();
      const sampleFile = new File(
        [pdfBlob],
        `UGG_Hausbegehungsprotokoll_${sampleAdrId}.pdf`,
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

  // Building PATCH handler
  const handlePatchBuilding = async (addressId, patch) => {
    setAddresses((prev) =>
      prev.map((a) => (a.id === addressId ? { ...a, ...patch } : a))
    );
    try {
      const updated = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
    } catch (err) {
      showToast(err.message || 'Gebäude-Update fehlgeschlagen', 'error');
      loadAddresses();
    }
  };

  // Unit PATCH handler
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
      showToast(err.message || 'Wohnung-Update fehlgeschlagen', 'error');
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
      showToast(`Wohnung WE-${created.unit_id} hinzugefügt`);
    } catch (err) {
      showToast(err.message || 'Fehler beim Hinzufügen der Wohnung', 'error');
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
      showToast('Wohnung gelöscht');
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

  const handleAddComment = async (addressId, text, author) => {
    try {
      const updated = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text, author }),
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      showToast('Kommentar gespeichert');
    } catch (err) {
      showToast(err.message || 'Kommentar konnte nicht gespeichert werden', 'error');
    }
  };

  const handleDeleteComment = async (addressId, commentId) => {
    try {
      const updated = await fetchWithToken(
        `/api/v1/protocol/addresses/${addressId}/comments/${commentId}`,
        { method: 'DELETE' }
      );
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      showToast('Kommentar gelöscht');
    } catch (err) {
      showToast(err.message || 'Kommentar konnte nicht gelöscht werden', 'error');
    }
  };

  const handleUploadBuildingPdf = async (addressId, file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await fetchWithToken(`/api/v1/protocol/addresses/${addressId}/pdf`, {
        method: 'POST',
        body: fd,
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      showToast(`PDF "${file.name}" am Gebäude gespeichert!`);
    } catch (err) {
      showToast(err.message || 'PDF-Upload fehlgeschlagen', 'error');
    }
  };

  const handleDeleteAddress = async (addr) => {
    if (
      !window.confirm(
        `Gebäude "${addr.adress_id || addr.projektnummer}" (${addr.strasse} ${addr.hausnummer}, ${addr.ort}) inklusive aller Wohnungen wirklich löschen?`
      )
    ) {
      return;
    }
    try {
      await fetchWithToken(`/api/v1/protocol/addresses/${addr.id}`, { method: 'DELETE' });
      setAddresses((prev) => prev.filter((a) => a.id !== addr.id));
      if (selectedBuildingId === addr.id) {
        setSelectedBuildingId(null);
      }
      showToast(`Gebäude ${addr.adress_id || addr.projektnummer} gelöscht`);
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

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
        ? `UGG_Gebaeude_${singleAddress.adress_id || singleAddress.projektnummer}_${dateStamp}.xlsx`
        : `UGG_Ausbau_Tracking_${dateStamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Excel-Arbeitsmappe (.xlsx) erfolgreich heruntergeladen');
    } catch (err) {
      exportAddressesToCsv(
        singleAddress ? [singleAddress] : filteredAddresses,
        singleAddress
          ? `UGG_Gebaeude_${singleAddress.adress_id || singleAddress.projektnummer}.csv`
          : 'UGG_Ausbau_Tracking.csv'
      );
      showToast('Export als CSV-Datei für Excel heruntergeladen');
    } finally {
      setExportingExcel(false);
    }
  };

  const selectedBuilding = useMemo(
    () => addresses.find((a) => a.id === selectedBuildingId) || null,
    [addresses, selectedBuildingId]
  );

  // If a building is clicked, show the full BuildingDetailView
  if (selectedBuilding) {
    return (
      <>
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

        <BuildingDetailView
          building={selectedBuilding}
          user={user}
          onBack={() => setSelectedBuildingId(null)}
          onPatchBuilding={handlePatchBuilding}
          onUnitChange={handleUnitChange}
          onAddUnit={handleAddUnit}
          onDeleteUnit={handleDeleteUnit}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onUploadPdf={handleUploadBuildingPdf}
          onEditModal={(b) =>
            setVerificationModal({
              data: b,
              fileName: b.pdf_filename || b.projektnummer,
              isEditMode: true,
              editAddressId: b.id,
            })
          }
          onDeleteBuilding={handleDeleteAddress}
          onExportSingleExcel={(b) => handleDownloadExcelWorkbook(b)}
        />

        {verificationModal && (
          <ProtocolVerificationModal
            initialData={verificationModal.data}
            sourceFileName={verificationModal.fileName}
            isEditMode={verificationModal.isEditMode}
            editAddressId={verificationModal.editAddressId}
            onClose={() => setVerificationModal(null)}
            onSaved={(savedAddr) => {
              setVerificationModal(null);
              setAddresses((prev) =>
                prev.map((a) => (a.id === savedAddr.id ? savedAddr : a))
              );
              showToast('Gebäudedaten aktualisiert!');
            }}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

      {/* Top Module Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 22px',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>UGG Ausbau-Manager & KI-Protokoll Extraktor</h2>
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
              {filteredAddresses.length} / {addresses.length} Gebäude
            </span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12 }}>
            Klicken Sie auf ein Gebäude in der Liste, um die vollständige Gebäude-Detailansicht, Wohnungen (TA / Reserve / Ohne), Original-PDF & Kommentare zu öffnen.
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
              { id: 'manager', label: 'Übersicht & Import' },
              { id: 'upload', label: 'PDF KI-Extraktor' },
              { id: 'export', label: 'Excel Export (.xlsx)' },
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
              gap: 7,
            }}
          >
            <FileSpreadsheet size={16} />
            <span>{exportingExcel ? 'Exportiert…' : 'Excel'}</span>
          </button>
        </div>
      </div>

      {/* Component 1: Upload Zone */}
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

      {/* Excel Export Info Panel when on 'export' tab */}
      {activeTab === 'export' && (
        <div className="glass-panel" style={{ padding: 22, borderRadius: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 14,
            }}
          >
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={20} style={{ color: '#16a34a' }} />
                <span>UGG Ausbau-Tracking Excel-Export (.xlsx & .csv)</span>
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Exportiert alle Spalten exakt nach UGG-Standard: Ausbau-Typ, Status, AB-Termin, Restarbeit Termin, Adress ID2, WE Nummer, PLZ, Ort, Straße, Etage, Wohnung, TA Installation, Reserve, Ohne, Flexrohr, HÜP installiert, Spleißen fertig, Upload, Genehmigt, Rechnung erstellt & bezahlt.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleDownloadExcelWorkbook(null)}
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
              >
                <FileSpreadsheet size={16} />
                <span>Excel-Arbeitsmappe (.xlsx) herunterladen</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => exportAddressesToCsv(filteredAddresses)}
              >
                <Download size={16} />
                <span>Gefilterte Liste als CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE DARK FILTER BAR & OVERVIEW LIST (Matching Image 2) */}
      <div
        className="glass-panel"
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          background: '#111827',
          color: '#e5e7eb',
          border: '1px solid #1f2937',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.2)',
        }}
      >
        {/* Top Comprehensive Filter Toolbar */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #1f2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            background: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            {/* Global Search */}
            <div style={{ position: 'relative', minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                }}
              />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Suchen (Adress-ID, WE-Nr, Straße, Eigentümer)…"
                style={{
                  padding: '7px 10px 7px 32px',
                  fontSize: 12,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  borderRadius: 8,
                }}
              />
            </div>

            {/* ★ Priority Filter */}
            <button
              type="button"
              onClick={() => setOnlyPriority((p) => !p)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: onlyPriority ? 'rgba(250, 204, 21, 0.2)' : '#1e293b',
                border: onlyPriority ? '1px solid #facc15' : '1px solid #334155',
                color: onlyPriority ? '#facc15' : '#cbd5e1',
              }}
            >
              <Star size={13} fill={onlyPriority ? '#facc15' : 'none'} />
              <span>Priorität</span>
            </button>

            {/* Month Filter (Monatsfilter) */}
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 145,
                padding: '7px 10px',
                fontSize: 12,
                background: monthFilter !== 'ALL' ? 'rgba(255, 107, 0, 0.2)' : '#1e293b',
                border: monthFilter !== 'ALL' ? '1px solid #FF6B00' : '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
              }}
            >
              <option value="ALL">📅 Monat: Alle</option>
              {filterOptions.months.map((m) => (
                <option key={m} value={m}>
                  Monat: {m}
                </option>
              ))}
            </select>

            {/* Ausbau-Typ Filter */}
            <select
              value={ausbauTypFilter}
              onChange={(e) => setAusbauTypFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 145,
                padding: '7px 10px',
                fontSize: 12,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
              }}
            >
              <option value="ALL">Ausbau-Typ: Alle</option>
              {AUSBAU_TYP_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 150,
                padding: '7px 10px',
                fontSize: 12,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
              }}
            >
              <option value="ALL">Status: Alle</option>
              {BUILDING_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Teams / Auftragnehmer Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 145,
                padding: '7px 10px',
                fontSize: 12,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
              }}
            >
              <option value="ALL">Teams: Alle</option>
              {filterOptions.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Ortschaften Filter */}
            <select
              value={ortFilter}
              onChange={(e) => setOrtFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 145,
                padding: '7px 10px',
                fontSize: 12,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
              }}
            >
              <option value="ALL">Ortschaften: Alle</option>
              {filterOptions.orte.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            {/* Building Technical / Billing Flag Filter */}
            <select
              value={buildingFlagFilter}
              onChange={(e) => setBuildingFlagFilter(e.target.value)}
              style={{
                width: 'auto',
                minWidth: 165,
                padding: '7px 10px',
                fontSize: 12,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
              }}
            >
              <option value="ALL">Gebäude-Filter: Alle</option>
              <option value="FLEXROHR_YES">Flexrohr: Ja</option>
              <option value="FLEXROHR_NO">Flexrohr: Nein</option>
              <option value="HUEP_YES">HÜP installiert: Ja</option>
              <option value="HUEP_NO">HÜP installiert: Nein</option>
              <option value="SPLEISSEN_YES">Spleißen fertig: Ja</option>
              <option value="SPLEISSEN_NO">Spleißen fertig: Nein</option>
              <option value="UPLOAD_YES">Upload erledigt</option>
              <option value="GENEHMIGT_YES">Genehmigt</option>
              <option value="RECHNUNG_ERSTELLT_YES">Rechnung erstellt</option>
              <option value="RECHNUNG_BEZAHLT_YES">Rechnung bezahlt</option>
              <option value="RECHNUNG_OFFEN">Rechnung noch unbezahlt</option>
              <option value="HAS_PDF">Mit gespeichertem PDF</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={resetAllFilters}
              style={{
                padding: '7px 11px',
                borderRadius: 8,
                fontSize: 12,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                cursor: 'pointer',
              }}
            >
              Filter zurücksetzen
            </button>
            <button
              type="button"
              onClick={loadAddresses}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                cursor: 'pointer',
              }}
              title="Aktualisieren"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Overview Table with Inline Column Filters (Matching Image 2) */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  background: '#0f172a',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid #1e293b',
                }}
              >
                <th style={{ padding: '10px 10px', width: 36, textAlign: 'center' }}>★</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Adress-ID / WE-Nr</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Gemeinde</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Strasse</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>Haus</th>
                <th style={{ padding: '10px 10px', textAlign: 'center' }}>Einheiten</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Ausbau-Typ</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>E-Mail</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Eigentümer</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Teams</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>HBG / Ausbau / Rest</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Gebäude-Checks</th>
                <th style={{ padding: '10px 10px', textAlign: 'left' }}>Telefon</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Aktionen</th>
              </tr>

              {/* Column-Level Inline Filter Inputs Row */}
              <tr style={{ background: '#162032', borderBottom: '1px solid #1e293b' }}>
                <th style={{ padding: '6px 8px' }} />
                <th style={{ padding: '6px 8px' }}>
                  <input
                    value={colAdressId}
                    onChange={(e) => setColAdressId(e.target.value)}
                    placeholder="ABW / N4E…"
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <input
                    value={colGemeinde}
                    onChange={(e) => setColGemeinde(e.target.value)}
                    placeholder="Ort / PLZ…"
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <input
                    value={colStrasse}
                    onChange={(e) => setColStrasse(e.target.value)}
                    placeholder="Straße…"
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={colHausVon}
                      onChange={(e) => setColHausVon(e.target.value)}
                      placeholder="Von"
                      style={{
                        width: 44,
                        padding: '5px 6px',
                        fontSize: 11,
                        background: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        borderRadius: 6,
                      }}
                    />
                    <input
                      value={colHausBis}
                      onChange={(e) => setColHausBis(e.target.value)}
                      placeholder="Bis"
                      style={{
                        width: 44,
                        padding: '5px 6px',
                        fontSize: 11,
                        background: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </th>
                <th style={{ padding: '6px 8px' }} />
                <th style={{ padding: '6px 8px' }}>
                  <select
                    value={ausbauTypFilter}
                    onChange={(e) => setAusbauTypFilter(e.target.value)}
                    style={{
                      padding: '5px 6px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  >
                    <option value="ALL">Alle</option>
                    {AUSBAU_TYP_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <input
                    value={colEmail}
                    onChange={(e) => setColEmail(e.target.value)}
                    placeholder="E-Mail…"
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <input
                    value={colOwner}
                    onChange={(e) => setColOwner(e.target.value)}
                    placeholder="Eigentümer…"
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    style={{
                      padding: '5px 6px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  >
                    <option value="ALL">Alle</option>
                    {filterOptions.teams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      padding: '5px 6px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  >
                    <option value="ALL">Alle</option>
                    {BUILDING_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </th>
                <th style={{ padding: '6px 8px' }}>
                  <input
                    value={colDateSearch}
                    onChange={(e) => setColDateSearch(e.target.value)}
                    placeholder="📅 Zeitraum / Datum…"
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                </th>
                <th colSpan={3} style={{ padding: '6px 8px' }} />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                    Lade Gebäude-Übersicht…
                  </td>
                </tr>
              ) : filteredAddresses.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ padding: 42, textAlign: 'center', color: '#94a3b8' }}>
                    Keine Gebäude für die aktuellen Filter gefunden. Klicken Sie oben auf{' '}
                    <strong style={{ color: '#FF6B00' }}>„Muster-Protokoll testen“</strong> oder laden Sie ein PDF hoch.
                  </td>
                </tr>
              ) : (
                filteredAddresses.map((addr) => {
                  const units = addr.units || [];
                  const commentsCount = (addr.comments || []).length;
                  const bStatus = addr.building_status || 'Ausbau terminiert';

                  return (
                    <tr
                      key={addr.id}
                      onClick={() => setSelectedBuildingId(addr.id)}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        cursor: 'pointer',
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 107, 0, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* ★ Priority */}
                      <td
                        style={{ padding: '11px 10px', textAlign: 'center' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePatchBuilding(addr.id, { is_priority: !addr.is_priority });
                        }}
                      >
                        <Star
                          size={15}
                          style={{ color: addr.is_priority ? '#facc15' : '#475569' }}
                          fill={addr.is_priority ? '#facc15' : 'none'}
                        />
                      </td>

                      {/* Adress-ID & WE-Nr */}
                      <td style={{ padding: '11px 10px' }}>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#38bdf8',
                            fontSize: 12.5,
                          }}
                        >
                          {addr.adress_id || 'ABW—'}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
                          {addr.projektnummer}
                        </div>
                      </td>

                      {/* Gemeinde */}
                      <td style={{ padding: '11px 10px', fontWeight: 500, color: '#f1f5f9' }}>
                        <div>{addr.ort}</div>
                        <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{addr.plz}</div>
                      </td>

                      {/* Straße */}
                      <td style={{ padding: '11px 10px', color: '#f1f5f9' }}>{addr.strasse}</td>

                      {/* Haus */}
                      <td style={{ padding: '11px 10px', textAlign: 'center', fontWeight: 600 }}>
                        {addr.hausnummer}
                      </td>

                      {/* Einheiten */}
                      <td style={{ padding: '11px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {addr.total_we || units.length}
                      </td>

                      {/* Ausbau-Typ */}
                      <td style={{ padding: '11px 10px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: 'rgba(30, 58, 138, 0.45)',
                            color: '#93c5fd',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                          }}
                        >
                          {addr.ausbau_typ || 'Metalkanal'}
                        </span>
                      </td>

                      {/* E-Mail */}
                      <td
                        style={{
                          padding: '11px 10px',
                          color: '#38bdf8',
                          maxWidth: 165,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {addr.owner_email || '—'}
                      </td>

                      {/* Eigentümer */}
                      <td
                        style={{
                          padding: '11px 10px',
                          color: '#e2e8f0',
                          maxWidth: 165,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {addr.owner_name || '—'}
                      </td>

                      {/* Teams */}
                      <td style={{ padding: '11px 10px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#cbd5e1',
                          }}
                        >
                          {addr.team || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '11px 10px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            background:
                              bStatus === 'Ausbau terminiert'
                                ? '#a855f7'
                                : bStatus === 'Restarbeiten'
                                ? '#f97316'
                                : bStatus === 'Abgeschlossen'
                                ? '#16a34a'
                                : bStatus === 'In Bearbeitung'
                                ? '#2563eb'
                                : '#475569',
                            color: '#fff',
                          }}
                        >
                          {bStatus}
                        </span>
                      </td>

                      {/* HBG / Ausbau / Restarbeit Dates */}
                      <td style={{ padding: '11px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#cbd5e1' }}>HBG: {addr.datum || '—'}</div>
                        <div style={{ color: '#86efac' }}>
                          AB: {formatGermanDateDisplay(addr.ausbautermin)}
                        </div>
                        {addr.restarbeit_termin && (
                          <div style={{ color: '#fdba74' }}>
                            Rest: {formatGermanDateDisplay(addr.restarbeit_termin)}
                          </div>
                        )}
                      </td>

                      {/* Whole-Building Checks Mini Badges */}
                      <td
                        style={{ padding: '11px 10px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 210 }}>
                          {[
                            { k: 'flexrohr', short: 'Flex', c: '#ef4444' },
                            { k: 'huep_installiert', short: 'HÜP', c: '#ef4444' },
                            { k: 'spleissen_fertig', short: 'Spl', c: '#ef4444' },
                            { k: 'upload_done', short: 'Upl', c: '#f97316' },
                            { k: 'genehmigt', short: 'Gen', c: '#f97316' },
                            { k: 'rechnung_erstellt', short: 'RE', c: '#38bdf8' },
                            { k: 'rechnung_bezahlt', short: 'Bez', c: '#22c55e' },
                          ].map((b) => {
                            const on = Boolean(addr[b.k]);
                            return (
                              <button
                                key={b.k}
                                type="button"
                                onClick={() =>
                                  handlePatchBuilding(addr.id, { [b.k]: !on })
                                }
                                title={`${b.short} umschalten`}
                                style={{
                                  padding: '2px 5px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  border: on ? `1px solid ${b.c}` : '1px solid #334155',
                                  background: on ? `${b.c}33` : '#0f172a',
                                  color: on ? '#fff' : '#64748b',
                                }}
                              >
                                {b.short}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Telefon */}
                      <td style={{ padding: '11px 10px', color: '#38bdf8', fontSize: 11.5 }}>
                        {addr.owner_telefon || '—'}
                      </td>

                      {/* Aktionen (Eye -> Building View, Comments with badge, PDF View/Download) */}
                      <td
                        style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {/* Enter Building Details */}
                          <button
                            type="button"
                            onClick={() => setSelectedBuildingId(addr.id)}
                            title="Gebäude öffnen & Details anzeigen"
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 7,
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#e2e8f0',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={14} />
                          </button>

                          {/* Comments Modal Trigger with Counter Badge */}
                          <button
                            type="button"
                            onClick={() => {
                              setQuickCommentBuilding(addr);
                              setQuickCommentText('');
                            }}
                            title="Kommentare & Updates"
                            style={{
                              position: 'relative',
                              width: 30,
                              height: 30,
                              borderRadius: 7,
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#e2e8f0',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <MessageSquare size={14} />
                            {commentsCount > 0 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: -5,
                                  right: -5,
                                  minWidth: 16,
                                  height: 16,
                                  padding: '0 4px',
                                  borderRadius: 999,
                                  background: '#3b82f6',
                                  color: '#fff',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                              >
                                {commentsCount}
                              </span>
                            )}
                          </button>

                          {/* PDF View / Download */}
                          <button
                            type="button"
                            onClick={() => setQuickPdfBuilding(addr)}
                            title={
                              addr.has_pdf
                                ? `Gespeichertes PDF ansehen / herunterladen (${addr.pdf_filename || 'PDF'})`
                                : 'PDF für dieses Gebäude ansehen / hochladen'
                            }
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 7,
                              background: addr.has_pdf
                                ? 'rgba(22, 163, 74, 0.2)'
                                : '#1e293b',
                              border: addr.has_pdf
                                ? '1px solid #22c55e'
                                : '1px solid #334155',
                              color: addr.has_pdf ? '#4ade80' : '#94a3b8',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <FileText size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Comments & Updates Modal */}
      {quickCommentBuilding && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onMouseDown={(e) => e.target === e.currentTarget && setQuickCommentBuilding(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: 'min(560px, 100%)',
              borderRadius: 16,
              padding: 22,
              background: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  Kommentare & Updates — {quickCommentBuilding.adress_id || quickCommentBuilding.projektnummer}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12 }}>
                  {quickCommentBuilding.strasse} {quickCommentBuilding.hausnummer}, {quickCommentBuilding.ort}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setQuickCommentBuilding(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickCommentText.trim()) return;
                await handleAddComment(
                  quickCommentBuilding.id,
                  quickCommentText.trim(),
                  user?.email || 'Brünel Team'
                );
                setQuickCommentText('');
                // Refresh modal reference from updated state
                const refreshed = await fetchWithToken(
                  `/api/v1/protocol/addresses/${quickCommentBuilding.id}`
                );
                setQuickCommentBuilding(refreshed);
              }}
              style={{ display: 'flex', gap: 8, marginBottom: 14 }}
            >
              <input
                autoFocus
                value={quickCommentText}
                onChange={(e) => setQuickCommentText(e.target.value)}
                placeholder="Neuen Kommentar oder Update eingeben…"
              />
              <button type="submit" className="btn-primary btn-sm">
                Speichern
              </button>
            </form>

            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {(quickCommentBuilding.comments || []).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Noch keine Kommentare vorhanden.
                </div>
              ) : (
                (quickCommentBuilding.comments || []).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      <strong>{c.author}</strong> • {c.created_at}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{c.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick PDF Preview & Download Modal */}
      {quickPdfBuilding && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onMouseDown={(e) => e.target === e.currentTarget && setQuickPdfBuilding(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: 'min(860px, 100%)',
              borderRadius: 18,
              padding: 22,
              background: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  PDF-Protokoll — {quickPdfBuilding.strasse} {quickPdfBuilding.hausnummer}, {quickPdfBuilding.ort}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12 }}>
                  Datei: {quickPdfBuilding.pdf_filename || `UGG_${quickPdfBuilding.projektnummer}.pdf`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {quickPdfBuilding.has_pdf && (
                  <a
                    href={`${API_URL}/api/v1/protocol/addresses/${quickPdfBuilding.id}/pdf?download=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={14} />
                    <span>PDF herunterladen</span>
                  </a>
                )}
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setQuickPdfBuilding(null)}
                >
                  Close
                </button>
              </div>
            </div>

            {quickPdfBuilding.has_pdf ? (
              <iframe
                src={`${API_URL}/api/v1/protocol/addresses/${quickPdfBuilding.id}/pdf?download=false`}
                title="UGG PDF Preview"
                style={{
                  width: '100%',
                  height: 520,
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}
              />
            ) : (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <p style={{ marginBottom: 14 }}>
                  Für dieses Gebäude wurde noch keine PDF-Datei hinterlegt.
                </p>
                <label className="btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} />
                  <span>PDF jetzt auswählen & speichern</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      if (e.target.files?.[0]) {
                        await handleUploadBuildingPdf(quickPdfBuilding.id, e.target.files[0]);
                        const refreshed = await fetchWithToken(
                          `/api/v1/protocol/addresses/${quickPdfBuilding.id}`
                        );
                        setQuickPdfBuilding(refreshed);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verification Modal */}
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
            showToast(
              `Gebäude ${savedAddr.adress_id || savedAddr.projektnummer} (${savedAddr.strasse} ${savedAddr.hausnummer}) inkl. PDF gespeichert!`
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
