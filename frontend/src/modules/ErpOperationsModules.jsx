import React, { useState, useEffect } from 'react';
import { DateInput, TimeInput } from '../components/DateTimeInputs';
import {
  Package, Truck, Wrench, Calendar as CalendarIcon, Receipt, ShoppingBag,
  Plus, ArrowRightLeft, AlertTriangle, Download, Check, X, FileText, Video, MessageSquare, Upload,
  Warehouse, Edit3, Trash2, RefreshCw, Search, ChevronDown, ChevronRight, BarChart3
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, API_URL, getToken, formatEuro, formatDate, formatDateTime, formatDateRange } from '../core/api';
import { TASK_STATUS_CONFIG } from '../core/i18n';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHead, SubTabs, useQuickAction, Empty, downloadCsv, confirmDelete } from '../components/ui';
import { BarChart } from './LegacyModules';

// ==============================================================================
// MODULE 3: INVENTORY, WAREHOUSES & EVENT-SOURCED MATERIAL LEDGER
// ==============================================================================

const MATERIAL_CATEGORIES = [
  'Cabling / LWL & Glasfaser',
  'Pipes / Speedpipe & Mikrorohre',
  'Splicing / Muffen & Kassetten',
  'Cabinets / NVt, APL & Gf-TA',
  'Kabelkanäle & Schutzrohre',
  'Tiefbau & Befestigungsmaterial',
  'Mess- & Montagezubehör',
  'Werkzeug & Verbrauchsmaterial',
  'Cabling',
  'Sonstiges',
];

const MATERIAL_UNITS = [
  'Stück',
  'Pack',
  'm',
  'Rolle',
  'Box',
  'Trommel',
  'Satz',
  'Palette',
  'kg',
  'pcs',
];

const WAREHOUSE_TYPES = [
  'Zentrallager',
  'Regional- / Außenlager',
  'Baucontainer / Baustellenlager',
  'Kabeltrommelplatz',
  'Zwischenlager',
];

export const InventoryLedgerModule = () => {
  const { section } = useParams();
  const sec = section || 'stock';
  const [stock, setStock] = useState([]);
  const [stockQ, setStockQ] = useState('');
  const [stockLagerFilter, setStockLagerFilter] = useState('all');
  const [stockCatFilter, setStockCatFilter] = useState('all');
  const [catalogQ, setCatalogQ] = useState('');
  const [ledgerQ, setLedgerQ] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('all');

  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [lagers, setLagers] = useState({ static_lagers: [], vehicle_lagers: [] });
  const [employees, setEmployees] = useState([]);

  // Modals
  const [showBuchen, setShowBuchen] = useState(false);
  const [showAddMat, setShowAddMat] = useState(false);
  const [editingMatId, setEditingMatId] = useState(null);
  const [showLagerModal, setShowLagerModal] = useState(false);
  const [editingLagerId, setEditingLagerId] = useState(null);
  const [showFillModal, setShowFillModal] = useState(false);
  const [expandedLagerId, setExpandedLagerId] = useState(null);

  const [buchenData, setBuchenData] = useState({
    material_id: '',
    source_lager_type: 'StaticLager',
    source_lager_id: '',
    target_lager_type: 'Vehicle',
    target_lager_id: '',
    transaction_type: 'Return',
    quantity: 10,
    note: '',
  });

  const emptyMatForm = {
    name: '',
    sku: '',
    category: 'Kabelkanäle & Schutzrohre',
    unit: 'Stück',
    min_stock_threshold: 10,
    unit_cost: 0,
    manufacturer: '',
    supplier: '',
    ean_barcode: '',
    shelf_location: '',
    package_size: '',
    description: '',
    initial_lager_id: '',
    initial_stock: 0,
  };
  const [newMat, setNewMat] = useState(emptyMatForm);

  const emptyLagerForm = {
    name: '',
    code: '',
    type: 'Zentrallager',
    street: '',
    postal_code: '',
    city: '',
    location: '',
    manager_id: '',
    phone: '',
    capacity: '',
    notes: '',
    status: 'Active',
  };
  const [lagerForm, setLagerForm] = useState(emptyLagerForm);

  const [fillForm, setFillForm] = useState({
    lager_id: '',
    general_note: 'Wareneingang / Lagerbefüllung',
    items: [{ material_id: '', quantity: 20, mode: 'add', note: '' }],
  });

  const loadAll = () => {
    Promise.all([
      fetchWithToken('/api/v1/inventory/stock').catch(() => []),
      fetchWithToken('/api/v1/inventory/transactions').catch(() => []),
      fetchWithToken('/api/v1/inventory/materials').catch(() => []),
      fetchWithToken('/api/v1/inventory/lagers').catch(() => ({ static_lagers: [], vehicle_lagers: [] })),
      fetchWithToken('/api/v1/hr/employees').catch(() => []),
    ]).then(([st, txs, mats, lgs, emps]) => {
      const safeStock = Array.isArray(st) ? st : [];
      const safeTxs = Array.isArray(txs) ? txs : [];
      const safeMats = Array.isArray(mats) ? mats : [];
      const safeLgs = lgs && Array.isArray(lgs.static_lagers) ? lgs : { static_lagers: [], vehicle_lagers: [] };
      const safeEmps = Array.isArray(emps) ? emps : [];

      setStock(safeStock);
      setTransactions(safeTxs);
      setMaterials(safeMats);
      setLagers(safeLgs);
      setEmployees(safeEmps);

      const firstLagerId = safeLgs.static_lagers[0]?.id || '';
      const firstMatId = safeMats[0]?.id || '';

      setBuchenData(b => ({
        ...b,
        material_id: b.material_id || firstMatId,
        source_lager_id: b.source_lager_id || firstLagerId,
        target_lager_id: b.target_lager_id || safeLgs.vehicle_lagers[0]?.id || '',
      }));
      setNewMat(m => ({ ...m, initial_lager_id: m.initial_lager_id || firstLagerId }));
      setFillForm(f => ({
        ...f,
        lager_id: f.lager_id || firstLagerId,
        items: f.items.map((it, idx) => (idx === 0 && !it.material_id ? { ...it, material_id: firstMatId } : it)),
      }));
      if (!expandedLagerId && firstLagerId) {
        setExpandedLagerId(firstLagerId);
      }
    }).catch(console.error);
  };

  useEffect(() => { loadAll(); }, []);
  useQuickAction('buchen', () => setShowBuchen(true));

  const lowCount = stock.filter((s) => s.low_stock_alert).length;
  const totalUnitsAll = stock.reduce((sum, s) => sum + Math.max(0, Number(s.current_stock || 0)), 0);
  const totalValueAll = stock.reduce(
    (sum, s) => sum + Math.max(0, Number(s.current_stock || 0)) * Number(s.unit_cost || 0),
    0
  );

  // ── Buchen / Quick Stock Adjustment ────────────────────────────────────────
  const handleBuchen = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...buchenData, quantity: Number(buchenData.quantity || 0) };
      if (!['CheckOut', 'Transfer'].includes(payload.transaction_type)) {
        payload.target_lager_id = null;
        payload.target_lager_type = null;
      }
      await fetchWithToken('/api/v1/inventory/buchen', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShowBuchen(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const openQuickBuchen = (matId, lagerId, lagerType = 'StaticLager', txType = 'Return', defaultQty = 10) => {
    setBuchenData({
      material_id: matId || materials[0]?.id || '',
      source_lager_type: lagerType,
      source_lager_id: lagerId || lagers.static_lagers[0]?.id || '',
      target_lager_type: 'Vehicle',
      target_lager_id: lagers.vehicle_lagers[0]?.id || '',
      transaction_type: txType,
      quantity: defaultQty,
      note: txType === 'Return' ? 'Wareneingang / Nachbestückung' : txType === 'InventorySet' ? 'Inventur-Bestandskorrektur' : '',
    });
    setShowBuchen(true);
  };

  // ── Material Create / Edit / Delete ────────────────────────────────────────
  const openCreateMatModal = (preselectLagerId = '') => {
    setEditingMatId(null);
    setNewMat({
      ...emptyMatForm,
      sku: `MAT-${Math.floor(1000 + Math.random() * 9000)}`,
      initial_lager_id: preselectLagerId || lagers.static_lagers[0]?.id || '',
      initial_stock: 25,
    });
    setShowAddMat(true);
  };

  const openEditMatModal = (m) => {
    setEditingMatId(m.id);
    setNewMat({
      name: m.name || '',
      sku: m.sku || '',
      category: m.category || 'Cabling / LWL & Glasfaser',
      unit: m.unit || 'Stück',
      min_stock_threshold: m.min_stock_threshold ?? 10,
      unit_cost: m.unit_cost ?? 0,
      manufacturer: m.manufacturer || m.attributes?.manufacturer || '',
      supplier: m.supplier || m.attributes?.supplier || '',
      ean_barcode: m.ean_barcode || m.attributes?.ean_barcode || '',
      shelf_location: m.shelf_location || m.attributes?.shelf_location || '',
      package_size: m.package_size || m.attributes?.package_size || '',
      description: m.description || m.attributes?.description || '',
      initial_lager_id: lagers.static_lagers[0]?.id || '',
      initial_stock: 0,
    });
    setShowAddMat(true);
  };

  const handleSaveMaterial = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newMat,
        min_stock_threshold: Number(newMat.min_stock_threshold || 0),
        unit_cost: Number(newMat.unit_cost || 0),
        initial_stock: Number(newMat.initial_stock || 0),
      };
      if (editingMatId) {
        await fetchWithToken(`/api/v1/inventory/materials/${editingMatId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchWithToken('/api/v1/inventory/materials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowAddMat(false);
      setEditingMatId(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMaterial = async (mat) => {
    const ok = await confirmDelete({
      title: 'Artikel (SKU) löschen?',
      message: 'Sind Sie sicher, dass Sie diesen Artikel unwiderruflich aus dem Katalog löschen möchten?',
      itemName: `${mat.name} (${mat.sku})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/inventory/materials/${mat.id}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // ── Warehouse (Lager) Create / Edit / Delete ───────────────────────────────
  const openCreateLagerModal = () => {
    setEditingLagerId(null);
    setLagerForm({
      ...emptyLagerForm,
      code: `WH-${Math.floor(10 + Math.random() * 89)}`,
    });
    setShowLagerModal(true);
  };

  const openEditLagerModal = (lg) => {
    setEditingLagerId(lg.id);
    setLagerForm({
      name: lg.name || '',
      code: lg.code || lg.attributes?.code || '',
      type: lg.type || lg.attributes?.type || 'Zentrallager',
      street: lg.street || lg.attributes?.street || '',
      postal_code: lg.postal_code || lg.attributes?.postal_code || '',
      city: lg.city || lg.attributes?.city || '',
      location: lg.location || '',
      manager_id: lg.manager_id || '',
      phone: lg.phone || lg.attributes?.phone || '',
      capacity: lg.capacity || lg.attributes?.capacity || '',
      notes: lg.notes || lg.attributes?.notes || '',
      status: lg.status || lg.attributes?.status || 'Active',
    });
    setShowLagerModal(true);
  };

  const handleSaveLager = async (e) => {
    e.preventDefault();
    try {
      const computedLocation =
        lagerForm.location.trim() ||
        [lagerForm.street, [lagerForm.postal_code, lagerForm.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') ||
        'Deutschland';
      const payload = {
        ...lagerForm,
        location: computedLocation,
        manager_id: lagerForm.manager_id || null,
      };
      if (editingLagerId) {
        await fetchWithToken(`/api/v1/inventory/lagers/${editingLagerId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchWithToken('/api/v1/inventory/lagers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowLagerModal(false);
      setEditingLagerId(null);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteLager = async (lg) => {
    const ok = await confirmDelete({
      title: 'Lagerstandort löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Lager inklusive aller zugehörigen Bestandsbuchungen unwiderruflich löschen möchten?',
      itemName: `${lg.name} (${lg.location || 'Lager'})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/inventory/lagers/${lg.id}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // ── Fill Warehouse with Multiple Items Modal ───────────────────────────────
  const openFillLagerModal = (lagerId = '') => {
    const targetLid = lagerId || lagers.static_lagers[0]?.id || '';
    setFillForm({
      lager_id: targetLid,
      general_note: `Wareneingang / Lagerbefüllung (${new Date().toLocaleDateString('de-DE')})`,
      items: [{ material_id: materials[0]?.id || '', quantity: 25, mode: 'add', note: '' }],
    });
    setShowFillModal(true);
  };

  const addFillRow = () => {
    setFillForm(prev => ({
      ...prev,
      items: [...prev.items, { material_id: materials[0]?.id || '', quantity: 10, mode: 'add', note: '' }],
    }));
  };

  const updateFillRow = (idx, field, val) => {
    setFillForm(prev => ({
      ...prev,
      items: prev.items.map((row, i) => (i === idx ? { ...row, [field]: val } : row)),
    }));
  };

  const removeFillRow = (idx) => {
    setFillForm(prev => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items,
    }));
  };

  const handleFillLagerSubmit = async (e) => {
    e.preventDefault();
    if (!fillForm.lager_id) {
      alert('Bitte wählen Sie ein Ziel-Lager aus.');
      return;
    }
    try {
      await fetchWithToken(`/api/v1/inventory/lagers/${fillForm.lager_id}/fill`, {
        method: 'POST',
        body: JSON.stringify({
          general_note: fillForm.general_note,
          items: fillForm.items.map(it => ({
            ...it,
            quantity: Number(it.quantity || 0),
          })),
        }),
      });
      setShowFillModal(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTransaction = async (txId) => {
    const tx = transactions.find(t => t.id === txId);
    const ok = await confirmDelete({
      title: 'Lagerbuchung stornieren / löschen?',
      message: 'Sind Sie sicher, dass Sie diese Lagerbuchung löschen möchten? Der Lagerbestand wird entsprechend zurückgerechnet.',
      itemName: tx ? `${tx.material_name} (${tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} ${tx.unit || ''}) — ${tx.source_lager_name}` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/inventory/transactions/${txId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const sourceOptions = buchenData.source_lager_type === 'StaticLager' ? lagers.static_lagers : lagers.vehicle_lagers;
  const targetOptions = buchenData.target_lager_type === 'StaticLager' ? lagers.static_lagers : lagers.vehicle_lagers;

  const filteredStock = stock.filter((s) => {
    const matchText = `${s.material_name} ${s.sku} ${s.lager_name} ${s.category || ''} ${s.shelf_location || ''}`
      .toLowerCase()
      .includes(stockQ.toLowerCase());
    const matchLager = stockLagerFilter === 'all' || s.lager_id === stockLagerFilter;
    const matchCat = stockCatFilter === 'all' || s.category === stockCatFilter;
    return matchText && matchLager && matchCat;
  });

  const filteredCatalog = materials.filter((m) =>
    `${m.name} ${m.sku} ${m.category || ''} ${m.manufacturer || ''} ${m.supplier || ''} ${m.shelf_location || ''}`
      .toLowerCase()
      .includes(catalogQ.toLowerCase())
  );

  const filteredTransactions = transactions.filter((t) => {
    const matchText = `${t.material_name} ${t.employee_name} ${t.source_lager_name} ${t.note || ''}`
      .toLowerCase()
      .includes(ledgerQ.toLowerCase());
    const matchType = ledgerTypeFilter === 'all' || t.transaction_type === ledgerTypeFilter;
    return matchText && matchType;
  });

  return (
    <div>
      <PageHead
        title="Inventory, Warehouses & Material Management"
        desc="Vollständige Lager-, Artikel- (SKU) und Bestandsverwaltung inkl. Echtzeit-Synchronisation mit den Timenet Mitarbeiter-Abholungen."
      >
        <button className="btn-secondary" onClick={openCreateLagerModal}>
          <Warehouse size={15} /> + Neues Lager
        </button>
        <button className="btn-secondary" onClick={() => openCreateMatModal()}>
          <Plus size={15} /> + Neuer Artikel (SKU)
        </button>
        <button className="btn-secondary" onClick={() => openFillLagerModal()}>
          <Package size={15} /> Lager befüllen (Wareneingang)
        </button>
        <button className="btn-primary" onClick={() => setShowBuchen(true)}>
          <ArrowRightLeft size={15} /> Material Buchen / Schwund
        </button>
      </PageHead>

      {/* Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div className="glass-panel kpi" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>LAGERORTE & FAHRZEUGE</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent)', margin: '4px 0' }}>
            {lagers.static_lagers.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>Lager</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            + {lagers.vehicle_lagers.length} Mobile Fahrzeuglager
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>ARTIKELKATALOG (SKUs)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', margin: '4px 0' }}>
            {materials.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Registrierte Materialien & Bauteile
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>GESAMTBESTAND & WERT</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669', margin: '4px 0' }}>
            {totalUnitsAll} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Einheiten</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Lagerwert: {formatEuro(totalValueAll)}
          </div>
        </div>

        <div className="glass-panel kpi" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>MINDESTBESTAND & BUCHUNGEN</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: lowCount > 0 ? '#dc2626' : '#059669', margin: '4px 0' }}>
            {lowCount} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Warnungen</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {transactions.length} dokumentierte Lagerbewegungen
          </div>
        </div>
      </div>

      <SubTabs base="/inventory" active={sec} items={[
        { id: 'stock', label: 'Stock Balances (Lagerbestand)', count: stock.length },
        { id: 'lagers', label: 'Warehouses & Vehicle Lagers', count: lagers.static_lagers.length },
        { id: 'catalog', label: 'Material Catalog (SKUs)', count: materials.length },
        { id: 'ledger', label: 'Transaction Ledger & Abholungen', count: transactions.length },
      ]} />

      {lowCount > 0 && sec === 'stock' && (
        <div className="glass-panel" style={{ borderColor: '#f5d9a6', background: '#fff9ef', padding: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--warning)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={16} />
            <span><strong>{lowCount} Artikel</strong> liegen unter dem definierten Mindestbestand.</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => openFillLagerModal()}>
            Jetzt Lager nachfüllen
          </button>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: MATERIAL BUCHEN / UMLAGERUNG / BESTANDSKORREKTUR / SCHWUND
         ===================================================================== */}
      {showBuchen && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '540px', maxWidth: '95vw' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <h3>Material Buchen (Wareneingang / Umlagerung / Entnahme / Inventur)</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowBuchen(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleBuchen} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>Buchungsart (Transaction Type) *</label>
                <select value={buchenData.transaction_type} onChange={e => setBuchenData({ ...buchenData, transaction_type: e.target.value })}>
                  <option value="Return">Wareneingang / Auffüllung (+ Bestand ins Lager buchen)</option>
                  <option value="InventorySet">Inventur / Bestand exakt festlegen (= Zielbestand setzen)</option>
                  <option value="CheckOut">Abholung / Umlagerung (Lager → Fahrzeug oder Baustelle)</option>
                  <option value="Consume">Materialverbrauch auf Projekt / Baustelle (- Bestand)</option>
                  <option value="Schwund">Schwund / Verlust / Bruch (- Bestand mit Pflichtbegründung)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>Artikel / Material (SKU) *</label>
                <select value={buchenData.material_id} onChange={e => setBuchenData({ ...buchenData, material_id: e.target.value })} required>
                  <option value="">— Artikel wählen —</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.sku}) · Einheit: {m.unit} · Gesamtbestand: {m.total_stock ?? 0}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lagertyp</label>
                  <select
                    value={buchenData.source_lager_type}
                    onChange={e => {
                      const t = e.target.value;
                      const list = t === 'StaticLager' ? lagers.static_lagers : lagers.vehicle_lagers;
                      setBuchenData({ ...buchenData, source_lager_type: t, source_lager_id: list[0]?.id || '' });
                    }}
                  >
                    <option value="StaticLager">Standort-Lager (Warehouse)</option>
                    <option value="Vehicle">Mobiles Fahrzeuglager</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>Gewähltes Lager *</label>
                  <select value={buchenData.source_lager_id} onChange={e => setBuchenData({ ...buchenData, source_lager_id: e.target.value })} required>
                    {sourceOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              {['CheckOut', 'Transfer'].includes(buchenData.transaction_type) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ziel-Lagertyp (optional bei Umlagerung)</label>
                    <select
                      value={buchenData.target_lager_type}
                      onChange={e => {
                        const t = e.target.value;
                        const list = t === 'StaticLager' ? lagers.static_lagers : lagers.vehicle_lagers;
                        setBuchenData({ ...buchenData, target_lager_type: t, target_lager_id: list[0]?.id || '' });
                      }}
                    >
                      <option value="Vehicle">Mobiles Fahrzeuglager</option>
                      <option value="StaticLager">Anderes Standort-Lager</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ziel-Lager / Fahrzeug</label>
                    <select value={buchenData.target_lager_id} onChange={e => setBuchenData({ ...buchenData, target_lager_id: e.target.value })}>
                      <option value="">Direktentnahme (Kein Ziel-Lager)</option>
                      {targetOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {buchenData.transaction_type === 'InventorySet' ? 'Neuer exakter Soll-Bestand *' : 'Menge (Anzahl Einheiten) *'}
                </label>
                <input
                  type="number"
                  min={buchenData.transaction_type === 'InventorySet' ? '0' : '1'}
                  required
                  value={buchenData.quantity}
                  onChange={e => setBuchenData({ ...buchenData, quantity: parseInt(e.target.value || '0', 10) })}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Buchungsnotiz / Lieferschein / Projekt {buchenData.transaction_type === 'Schwund' ? '(Pflichtfeld *)' : ''}
                </label>
                <textarea
                  placeholder={buchenData.transaction_type === 'Schwund' ? 'PFLICHTANGABE: Grund für Schwund / Bruch / Differenz…' : 'z.B. Lieferschein-Nr., Projekt, Baustelle…'}
                  required={buchenData.transaction_type === 'Schwund'}
                  value={buchenData.note}
                  onChange={e => setBuchenData({ ...buchenData, note: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowBuchen(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Buchung ausführen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: COMPLETE & PRECISE ADD / EDIT MATERIAL (SKU) MODAL
         ===================================================================== */}
      {showAddMat && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '680px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <h3>{editingMatId ? 'Artikel / Material (SKU) bearbeiten' : 'Neuen Artikel / Material (SKU) präzise anlegen'}</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddMat(false)}><X size={14} /></button>
            </div>

            <form onSubmit={handleSaveMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Artikelbezeichnung / Materialname *</label>
                  <input
                    placeholder="z.B. Kabelkanal 20x20 Metall / LWL Erdkabel A-DQ(ZN)B2Y 24E"
                    required
                    value={newMat.name}
                    onChange={e => setNewMat({ ...newMat, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>SKU / Artikelnummer *</label>
                  <input
                    placeholder="z.B. MAT-LWL-024"
                    required
                    value={newMat.sku}
                    onChange={e => setNewMat({ ...newMat, sku: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Kategorie *</label>
                  <select value={newMat.category} onChange={e => setNewMat({ ...newMat, category: e.target.value })}>
                    {MATERIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mengeneinheit (Unit) *</label>
                  <select value={newMat.unit} onChange={e => setNewMat({ ...newMat, unit: e.target.value })}>
                    {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Gebindegröße / VPE</label>
                  <input
                    placeholder="z.B. 1 Pack = 25m / 100 Stk."
                    value={newMat.package_size}
                    onChange={e => setNewMat({ ...newMat, package_size: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Einkaufspreis / Stückkosten (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newMat.unit_cost}
                    onChange={e => setNewMat({ ...newMat, unit_cost: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mindestbestand (Warn-Schwelle)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10"
                    value={newMat.min_stock_threshold}
                    onChange={e => setNewMat({ ...newMat, min_stock_threshold: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lagerplatz / Regal / Fach</label>
                  <input
                    placeholder="z.B. Halle 1 · Regal B4 · Fach 2"
                    value={newMat.shelf_location}
                    onChange={e => setNewMat({ ...newMat, shelf_location: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Hersteller / Marke</label>
                  <input
                    placeholder="z.B. Corning / Gabocom / 3M"
                    value={newMat.manufacturer}
                    onChange={e => setNewMat({ ...newMat, manufacturer: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lieferant / Großhändler</label>
                  <input
                    placeholder="z.B. Sonepar / Kellner & Kunz"
                    value={newMat.supplier}
                    onChange={e => setNewMat({ ...newMat, supplier: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>EAN / Barcode / Serien-Nr.</label>
                  <input
                    placeholder="z.B. 4012345678901"
                    value={newMat.ean_barcode}
                    onChange={e => setNewMat({ ...newMat, ean_barcode: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Technische Beschreibung & Spezifikation</label>
                <textarea
                  rows={2}
                  placeholder="Technische Details, Normen, Abmessungen, Einsatzbereich…"
                  value={newMat.description}
                  onChange={e => setNewMat({ ...newMat, description: e.target.value })}
                />
              </div>

              {!editingMatId && (
                <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '8px', color: 'var(--accent)' }}>
                    Direkte Lager-Erstbefüllung (Anfangsbestand sofort einbuchen)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Ziel-Lager für Anfangsbestand</label>
                      <select
                        value={newMat.initial_lager_id}
                        onChange={e => setNewMat({ ...newMat, initial_lager_id: e.target.value })}
                      >
                        <option value="">— Kein Anfangsbestand —</option>
                        {lagers.static_lagers.map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.location})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Anfangsbestand ({newMat.unit})</label>
                      <input
                        type="number"
                        min="0"
                        value={newMat.initial_stock}
                        onChange={e => setNewMat({ ...newMat, initial_stock: parseInt(e.target.value || '0', 10) })}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddMat(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  {editingMatId ? 'Änderungen speichern' : 'Artikel anlegen & Bestand buchen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: COMPLETE & PRECISE ADD / EDIT WAREHOUSE (LAGER) MODAL
         ===================================================================== */}
      {showLagerModal && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '620px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <h3>{editingLagerId ? 'Lagerort (Warehouse) bearbeiten' : 'Neues Lager (Warehouse) anlegen'}</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowLagerModal(false)}><X size={14} /></button>
            </div>

            <form onSubmit={handleSaveLager} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lagername / Bezeichnung *</label>
                  <input
                    placeholder="z.B. Hauptlager Lorch / Baustellenlager Darmstadt Süd"
                    required
                    value={lagerForm.name}
                    onChange={e => setLagerForm({ ...lagerForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lager-Code *</label>
                  <input
                    placeholder="z.B. WH-MAIN-01"
                    required
                    value={lagerForm.code}
                    onChange={e => setLagerForm({ ...lagerForm, code: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lagertyp</label>
                  <select value={lagerForm.type} onChange={e => setLagerForm({ ...lagerForm, type: e.target.value })}>
                    {WAREHOUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Verantwortlicher Lagerleiter</label>
                  <select value={lagerForm.manager_id} onChange={e => setLagerForm({ ...lagerForm, manager_id: e.target.value })}>
                    <option value="">— Nicht zugewiesen —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name || `${emp.first_name} ${emp.last_name}`} ({emp.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status</label>
                  <select value={lagerForm.status} onChange={e => setLagerForm({ ...lagerForm, status: e.target.value })}>
                    <option value="Active">Aktiv (Freigegeben)</option>
                    <option value="Maintenance">Inventur / Gesperrt</option>
                    <option value="Closed">Inaktiv</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Straße & Hausnummer</label>
                  <input
                    placeholder="z.B. Rheingaustraße 42"
                    value={lagerForm.street}
                    onChange={e => setLagerForm({ ...lagerForm, street: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>PLZ</label>
                  <input
                    placeholder="z.B. 65391"
                    value={lagerForm.postal_code}
                    onChange={e => setLagerForm({ ...lagerForm, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Stadt / Region</label>
                  <input
                    placeholder="z.B. Lorch / Hessen"
                    value={lagerForm.city}
                    onChange={e => setLagerForm({ ...lagerForm, city: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Standort-Anzeige / Adresse *</label>
                  <input
                    placeholder="z.B. Rheingaustraße 42, 65391 Lorch / Hessen"
                    value={lagerForm.location}
                    onChange={e => setLagerForm({ ...lagerForm, location: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Telefon / Kontakt vor Ort</label>
                  <input
                    placeholder="z.B. +49 6726 80790"
                    value={lagerForm.phone}
                    onChange={e => setLagerForm({ ...lagerForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Kapazität & Ausstattung</label>
                <input
                  placeholder="z.B. 450 m² Freifläche & Hochregallager, Gabelstapler vorhanden"
                  value={lagerForm.capacity}
                  onChange={e => setLagerForm({ ...lagerForm, capacity: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Zufahrts- & Öffnungshinweise / Notizen</label>
                <textarea
                  rows={2}
                  placeholder="z.B. Tor 2 Zahlencode, Ausgabe Mo-Fr 06:30–17:00 Uhr…"
                  value={lagerForm.notes}
                  onChange={e => setLagerForm({ ...lagerForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowLagerModal(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  {editingLagerId ? 'Lager aktualisieren' : 'Lager speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: FILL WAREHOUSE WITH ITEMS (LAGER BEFÜLLEN / WARENEINGANG)
         ===================================================================== */}
      {showFillModal && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '680px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <h3>Lager mit Artikeln befüllen (Wareneingang & Bestandsaufnahme)</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowFillModal(false)}><X size={14} /></button>
            </div>

            <form onSubmit={handleFillLagerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ziel-Lager auswählen *</label>
                  <select
                    value={fillForm.lager_id}
                    onChange={e => setFillForm({ ...fillForm, lager_id: e.target.value })}
                    required
                  >
                    <option value="">— Lager wählen —</option>
                    {lagers.static_lagers.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.location})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lieferschein / Buchungsreferenz</label>
                  <input
                    value={fillForm.general_note}
                    onChange={e => setFillForm({ ...fillForm, general_note: e.target.value })}
                    placeholder="z.B. Wareneingang Lieferschein #LS-2026-11"
                  />
                </div>
              </div>

              <div>
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Artikel & Mengen zur Befüllung</label>
                  <button type="button" className="btn-secondary btn-sm" onClick={addFillRow}>
                    <Plus size={14} /> + Weitere Position hinzufügen
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {fillForm.items.map((row, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 100px 1.2fr auto', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <select
                        value={row.material_id}
                        onChange={e => updateFillRow(idx, 'material_id', e.target.value)}
                        required
                      >
                        <option value="">— Artikel wählen —</option>
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.sku}) [{m.unit}]</option>
                        ))}
                      </select>

                      <select
                        value={row.mode}
                        onChange={e => updateFillRow(idx, 'mode', e.target.value)}
                      >
                        <option value="add">+ Menge addieren (Zugang)</option>
                        <option value="set">= Exakten Bestand setzen</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        required
                        value={row.quantity}
                        onChange={e => updateFillRow(idx, 'quantity', parseInt(e.target.value || '0', 10))}
                        placeholder="Menge"
                      />

                      <input
                        placeholder="Positionsnotiz…"
                        value={row.note}
                        onChange={e => updateFillRow(idx, 'note', e.target.value)}
                      />

                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => removeFillRow(idx)}
                        style={{ color: '#dc2626' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowFillModal(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Lager jetzt befüllen & Bestände aktualisieren</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB VIEWS
         ===================================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {/* ── TAB 1: STOCK BALANCES ── */}
        {sec === 'stock' && (
          <div className="glass-panel">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              <input
                style={{ flex: 2, minWidth: '220px' }}
                placeholder="Suche nach Artikelname, SKU, Lagerort oder Regalplatz…"
                value={stockQ}
                onChange={(e) => setStockQ(e.target.value)}
              />
              <select
                style={{ flex: 1, minWidth: '180px' }}
                value={stockLagerFilter}
                onChange={e => setStockLagerFilter(e.target.value)}
              >
                <option value="all">Alle Lagerorte ({lagers.static_lagers.length})</option>
                {lagers.static_lagers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
                {lagers.vehicle_lagers.map(v => (
                  <option key={v.id} value={v.id}>Fahrzeug: {v.name}</option>
                ))}
              </select>
              <select
                style={{ flex: 1, minWidth: '180px' }}
                value={stockCatFilter}
                onChange={e => setStockCatFilter(e.target.value)}
              >
                <option value="all">Alle Kategorien</option>
                {MATERIAL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button className="btn-secondary btn-sm" onClick={loadAll} title="Aktualisieren">
                <RefreshCw size={14} />
              </button>
            </div>

            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 8px' }}>SKU & Artikel</th>
                  <th style={{ padding: '10px 8px' }}>Kategorie</th>
                  <th style={{ padding: '10px 8px' }}>Lagerort & Regalplatz</th>
                  <th style={{ padding: '10px 8px' }}>Aktueller Bestand</th>
                  <th style={{ padding: '10px 8px' }}>Min. Bestand</th>
                  <th style={{ padding: '10px 8px' }}>Stückpreis / Wert</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Keine Bestandsdaten gefunden. Legen Sie einen Artikel an oder befüllen Sie ein Lager.
                    </td>
                  </tr>
                ) : (
                  filteredStock.map((s, idx) => (
                    <tr key={`${s.material_id}-${s.lager_id}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontWeight: 700 }}>{s.material_name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          SKU: {s.sku} {s.manufacturer ? `· ${s.manufacturer}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span className="badge">{s.category}</span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontWeight: 600 }}>
                          <span className="badge" style={{ marginRight: '6px' }}>
                            {s.lager_type === 'StaticLager' ? 'Lager' : 'Fahrzeug'}
                          </span>
                          {s.lager_name}
                        </div>
                        {s.shelf_location && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Platz: {s.shelf_location}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          color: s.current_stock <= 0 ? '#dc2626' : s.low_stock_alert ? '#d97706' : '#059669',
                        }}>
                          {s.current_stock} {s.unit}
                        </span>
                        {s.low_stock_alert && (
                          <span className="badge" style={{ marginLeft: 6, background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>
                            Niedrig
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>
                        {s.min_stock_threshold} {s.unit}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div>{formatEuro(s.unit_cost)} / {s.unit}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Gesamt: {formatEuro(s.stock_value)}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => openQuickBuchen(s.material_id, s.lager_id, s.lager_type, 'Return', 20)}
                            title="Bestand auffüllen (+ Wareneingang)"
                          >
                            + Auffüllen
                          </button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => openQuickBuchen(s.material_id, s.lager_id, s.lager_type, 'InventorySet', Math.max(0, s.current_stock))}
                            title="Exakten Bestand setzen (Inventur)"
                          >
                            Bestand setzen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TAB 2: WAREHOUSES & VEHICLE LAGERS ── */}
        {sec === 'lagers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-panel">
              <div className="flex-between" style={{ marginBottom: '14px' }}>
                <div>
                  <h3 style={{ marginBottom: '2px' }}>Standort-Lager & Zentrallager ({lagers.static_lagers.length})</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Verwalten Sie alle Lagerstandorte, verantwortliche Lagerleiter und befüllen Sie jedes Lager direkt mit Artikeln.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-secondary" onClick={() => openFillLagerModal()}>
                    <Package size={15} /> Lager mit Artikeln befüllen
                  </button>
                  <button className="btn-primary" onClick={openCreateLagerModal}>
                    <Plus size={15} /> + Neues Lager anlegen
                  </button>
                </div>
              </div>

              {lagers.static_lagers.length === 0 ? (
                <Empty>Noch keine Lagerorte angelegt.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {lagers.static_lagers.map((l) => {
                    const isExpanded = expandedLagerId === l.id;
                    const itemsList = Array.isArray(l.items) ? l.items : [];
                    return (
                      <div
                        key={l.id}
                        style={{
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Warehouse Header Card */}
                        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', background: 'var(--surface-2)' }}>
                          <div style={{ flex: 1, minWidth: '260px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '1rem' }}>{l.name}</strong>
                              <span className="badge" style={{ fontFamily: 'monospace' }}>{l.code || 'WH'}</span>
                              <span className="badge">{l.type || 'Zentrallager'}</span>
                              <span className="badge" style={{ background: l.status === 'Active' ? '#ecfdf5' : '#fef3c7', color: l.status === 'Active' ? '#059669' : '#d97706' }}>
                                {l.status === 'Active' ? 'Aktiv' : l.status}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Standort: <strong>{l.location}</strong>
                              {l.phone ? ` · Tel: ${l.phone}` : ''}
                              {l.manager_name ? ` · Lagerleiter: ${l.manager_name}` : ''}
                            </div>
                            {(l.capacity || l.notes) && (
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {l.capacity && <span>Kapazität: {l.capacity} </span>}
                                {l.notes && <span>· Hinweis: {l.notes}</span>}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#059669' }}>
                                {l.total_skus || 0} Artikel · {l.total_units || 0} Einheiten
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Warenwert: {formatEuro(l.total_value || 0)}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => openFillLagerModal(l.id)}
                              >
                                <Plus size={13} /> Artikel einbuchen / befüllen
                              </button>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => openCreateMatModal(l.id)}
                              >
                                + Neuer Artikel
                              </button>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => openEditLagerModal(l)}
                                title="Lager bearbeiten"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => handleDeleteLager(l)}
                                style={{ color: '#dc2626' }}
                                title="Lager löschen"
                              >
                                <Trash2 size={13} />
                              </button>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => setExpandedLagerId(isExpanded ? null : l.id)}
                              >
                                {isExpanded ? 'Bestand ausblenden' : `Bestand anzeigen (${itemsList.length})`}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Warehouse Items Table */}
                        {isExpanded && (
                          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                            {itemsList.length === 0 ? (
                              <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Dieses Lager enthält aktuell noch keine gebuchten Artikel. Klicken Sie auf <strong>«Artikel einbuchen / befüllen»</strong>, um Bestände hinzuzufügen.
                              </div>
                            ) : (
                              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '6px 8px' }}>SKU</th>
                                    <th style={{ padding: '6px 8px' }}>Artikelname</th>
                                    <th style={{ padding: '6px 8px' }}>Kategorie</th>
                                    <th style={{ padding: '6px 8px' }}>Bestand im Lager</th>
                                    <th style={{ padding: '6px 8px' }}>Wert</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Schnellbuchung</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itemsList.map((it) => (
                                    <tr key={it.material_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{it.sku}</td>
                                      <td style={{ padding: '8px', fontWeight: 600 }}>{it.material_name}</td>
                                      <td style={{ padding: '8px' }}><span className="badge">{it.category}</span></td>
                                      <td style={{ padding: '8px', fontWeight: 700, color: it.current_stock <= 0 ? '#dc2626' : '#059669' }}>
                                        {it.current_stock} {it.unit}
                                      </td>
                                      <td style={{ padding: '8px' }}>{formatEuro(it.stock_value)}</td>
                                      <td style={{ padding: '8px', textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                                          <button
                                            className="btn-secondary btn-sm"
                                            onClick={() => openQuickBuchen(it.material_id, l.id, 'StaticLager', 'Return', 10)}
                                          >
                                            + Zubuchen
                                          </button>
                                          <button
                                            className="btn-secondary btn-sm"
                                            onClick={() => openQuickBuchen(it.material_id, l.id, 'StaticLager', 'InventorySet', Math.max(0, it.current_stock))}
                                          >
                                            Soll setzen
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile Vehicle Lagers */}
            <div className="glass-panel">
              <h3 style={{ marginBottom: 12 }}>Mobile Fahrzeuglager ({lagers.vehicle_lagers.length})</h3>
              {lagers.vehicle_lagers.length === 0 ? (
                <Empty>Keine aktiven Fahrzeuge registriert.</Empty>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {lagers.vehicle_lagers.map((v) => (
                    <div key={v.id} style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      <div className="flex-between" style={{ marginBottom: '6px' }}>
                        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Truck size={15} /> {v.plate_number}
                        </strong>
                        <span className="badge">{v.model}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Bestand auf Fahrzeug: <strong>{v.total_skus || 0} Artikel ({v.total_units || 0} Einheiten)</strong>
                      </div>
                      {Array.isArray(v.items) && v.items.filter(i => i.current_stock > 0).length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                          {v.items.filter(i => i.current_stock > 0).map(it => (
                            <div key={it.material_id} className="flex-between">
                              <span>{it.material_name}</span>
                              <strong>{it.current_stock} {it.unit}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: MATERIAL CATALOG (SKUs) ── */}
        {sec === 'catalog' && (
          <div className="glass-panel">
            <div className="flex-between" style={{ marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
              <input
                style={{ flex: 1, minWidth: '240px' }}
                placeholder="Suche im Artikelkatalog nach SKU, Name, Kategorie, Hersteller, Lieferant…"
                value={catalogQ}
                onChange={e => setCatalogQ(e.target.value)}
              />
              <button className="btn-primary" onClick={() => openCreateMatModal()}>
                <Plus size={15} /> + Neuen Artikel (SKU) anlegen
              </button>
            </div>

            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: 10 }}>SKU & Barcode</th>
                  <th style={{ padding: 10 }}>Artikelbezeichnung & Details</th>
                  <th style={{ padding: 10 }}>Kategorie</th>
                  <th style={{ padding: 10 }}>Hersteller / Lieferant</th>
                  <th style={{ padding: 10 }}>Einheit & VPE</th>
                  <th style={{ padding: 10 }}>Min. / Preis</th>
                  <th style={{ padding: 10 }}>Gesamtbestand</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Verwaltung</th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 10, fontFamily: 'monospace' }}>
                      <div style={{ fontWeight: 700 }}>{m.sku}</div>
                      {m.ean_barcode && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>EAN: {m.ean_barcode}</div>}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{m.name}</div>
                      {m.description && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{m.description}</div>}
                      {m.shelf_location && <div style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>Lagerplatz: {m.shelf_location}</div>}
                    </td>
                    <td style={{ padding: 10 }}><span className="badge">{m.category}</span></td>
                    <td style={{ padding: 10, fontSize: '0.78rem' }}>
                      <div>{m.manufacturer || '—'}</div>
                      {m.supplier && <div style={{ color: 'var(--text-muted)' }}>Lief.: {m.supplier}</div>}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600 }}>{m.unit}</div>
                      {m.package_size && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.package_size}</div>}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div>{formatEuro(m.unit_cost)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Min: {m.min_stock_threshold}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 800, color: (m.total_stock || 0) <= 0 ? '#dc2626' : '#059669' }}>
                        {m.total_stock ?? 0} {m.unit}
                      </div>
                      {Array.isArray(m.stock_by_lager) && m.stock_by_lager.map((b, i) => (
                        <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {b.lager_name}: {b.quantity}
                        </div>
                      ))}
                    </td>
                    <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openQuickBuchen(m.id, lagers.static_lagers[0]?.id || '', 'StaticLager', 'Return', 20)}
                          title="Bestand in Lager einbuchen"
                        >
                          + Bestand
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEditMatModal(m)}
                          title="Artikel bearbeiten"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => handleDeleteMaterial(m)}
                          style={{ color: '#dc2626' }}
                          title="Artikel löschen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TAB 4: TRANSACTION LEDGER & ABHOLUNGEN ── */}
        {sec === 'ledger' && (
          <div className="glass-panel">
            <div className="flex-between" style={{ marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: '1rem' }}>Lagerbuchungen & Mitarbeiter-Abholungen (`material_transactions`)</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Alle Wareneingänge, Umlagerungen und Timenet-Abholungen der Mitarbeiter mit Datum, Menge und Verwendungszweck.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  placeholder="Suche nach Mitarbeiter, Artikel, Lager, Notiz…"
                  value={ledgerQ}
                  onChange={e => setLedgerQ(e.target.value)}
                  style={{ minWidth: '240px' }}
                />
                <select value={ledgerTypeFilter} onChange={e => setLedgerTypeFilter(e.target.value)}>
                  <option value="all">Alle Buchungsarten</option>
                  <option value="CheckOut">Abholung / Entnahme (CheckOut)</option>
                  <option value="Return">Wareneingang / Auffüllung (Return)</option>
                  <option value="Consume">Verbrauch (Consume)</option>
                  <option value="Schwund">Schwund / Verlust</option>
                </select>
              </div>
            </div>

            <div style={{ maxHeight: '640px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTransactions.length === 0 ? (
                <Empty>Keine Buchungen gefunden.</Empty>
              ) : (
                filteredTransactions.map(t => (
                  <div key={t.id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.88rem' }}>{t.material_name}</strong>
                        <span className="badge">{t.transaction_type === 'CheckOut' ? 'Abholung / Entnahme' : t.transaction_type === 'Return' ? 'Wareneingang / Zugang' : t.transaction_type}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {t.timestamp ? formatDateTime(t.timestamp) : ''}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
                        Lager: <strong>{t.source_lager_name}</strong> ({t.source_lager_type}) · Gebucht von: <strong>{t.employee_name}</strong>
                      </div>
                      {t.note && (
                        <div style={{ fontSize: '0.78rem', marginTop: '4px', color: 'var(--accent)', fontWeight: 500 }}>
                          Dokumentation: {t.note}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: t.quantity >= 0 ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.1)',
                        color: t.quantity >= 0 ? '#059669' : '#dc2626',
                      }}>
                        {t.quantity > 0 ? `+${t.quantity}` : t.quantity} {t.unit || ''}
                      </span>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => handleDeleteTransaction(t.id)}
                        style={{ color: '#dc2626' }}
                        title="Buchung stornieren / löschen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==============================================================================
// MODULE 4: EQUIPMENT & FLEET TRACKING (EXCLUSIVE POSSESSION CONSTRAINT)
// ==============================================================================

export const FleetEquipmentModule = () => {
  const { section } = useParams();
  const sec = section || 'vehicles';
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showAddVeh, setShowAddVeh] = useState(false);
  const [showAddEq, setShowAddEq] = useState(false);
  const [newVeh, setNewVeh] = useState({ plate_number: '', model: '', mileage_km: 0 });
  const [newEq, setNewEq] = useState({ name: '', category: 'Splicer', serial_number: '', assigned_employee_id: '', assigned_vehicle_id: '' });

  const loadAll = () => {
    Promise.all([
      fetchWithToken('/api/v1/fleet/vehicles'),
      fetchWithToken('/api/v1/fleet/equipment'),
      fetchWithToken('/api/v1/hr/employees'),
    ]).then(([v, eq, emps]) => {
      setVehicles(v);
      setEquipment(eq);
      setEmployees(emps);
    }).catch(console.error);
  };

  useEffect(() => { loadAll(); }, []);

  const handleAssignHolder = async (eqId, holderType, holderId) => {
    try {
      const payload = {
        assigned_employee_id: holderType === 'employee' ? holderId : null,
        assigned_vehicle_id: holderType === 'vehicle' ? holderId : null,
      };
      await fetchWithToken(`/api/v1/fleet/equipment/${eqId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/fleet/vehicles', { method: 'POST', body: JSON.stringify(newVeh) });
      setShowAddVeh(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddEquipment = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/fleet/equipment', {
        method: 'POST',
        body: JSON.stringify({
          ...newEq,
          assigned_employee_id: newEq.assigned_employee_id || null,
          assigned_vehicle_id: newEq.assigned_vehicle_id || null,
        }),
      });
      setShowAddEq(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteVehicle = async (veh) => {
    const ok = await confirmDelete({
      title: 'Fahrzeug löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Fahrzeug unwiderruflich aus dem Fuhrpark löschen möchten?',
      itemName: `${veh.plate_number} (${veh.model})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/fleet/vehicles/${veh.id}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteEquipment = async (eq) => {
    const ok = await confirmDelete({
      title: 'Werkzeug / Gerät löschen?',
      message: 'Sind Sie sicher, dass Sie dieses Werkzeug / Gerät unwiderruflich löschen möchten?',
      itemName: `${eq.name} (SN: ${eq.serial_number})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/fleet/equipment/${eq.id}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <PageHead title="Fleet & Equipment" desc="Vehicles act as mobile lagers. High-value tools are held by an employee or a vehicle, never both.">
        <button className="btn-secondary" onClick={() => setShowAddVeh(true)}><Plus size={16} /> Add vehicle</button>
        <button className="btn-primary" onClick={() => setShowAddEq(true)}><Plus size={16} /> Register tool</button>
      </PageHead>
      <SubTabs base="/fleet" active={sec} items={[
        { id: 'vehicles', label: 'Vehicles', count: vehicles.length },
        { id: 'equipment', label: 'Tools & Equipment', count: equipment.length },
      ]} />

      {showAddVeh && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '14px' }}>Add Fleet Vehicle</h3>
            <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="License Plate (e.g. FB-BR 303)" required value={newVeh.plate_number} onChange={e => setNewVeh({...newVeh, plate_number: e.target.value})} />
              <input placeholder="Vehicle Model (e.g. Mercedes Sprinter)" required value={newVeh.model} onChange={e => setNewVeh({...newVeh, model: e.target.value})} />
              <input type="number" placeholder="Mileage (km)" value={newVeh.mileage_km} onChange={e => setNewVeh({...newVeh, mileage_km: parseInt(e.target.value)})} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddVeh(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddEq && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '440px' }}>
            <h3 style={{ marginBottom: '14px' }}>Register High-Value Tool / Equipment</h3>
            <form onSubmit={handleAddEquipment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Tool Name (e.g. Fujikura 90S+ Splicer)" required value={newEq.name} onChange={e => setNewEq({...newEq, name: e.target.value})} />
              <input placeholder="Serial Number" required value={newEq.serial_number} onChange={e => setNewEq({...newEq, serial_number: e.target.value})} />
              <select
                value={newEq.assigned_employee_id}
                onChange={e => setNewEq({...newEq, assigned_employee_id: e.target.value, assigned_vehicle_id: ''})}
              >
                <option value="">Assign to Employee (Exclusive)...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
              <select
                value={newEq.assigned_vehicle_id}
                onChange={e => setNewEq({...newEq, assigned_vehicle_id: e.target.value, assigned_employee_id: ''})}
              >
                <option value="">OR Assign to Vehicle (Exclusive)...</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} ({v.model})</option>)}
              </select>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddEq(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Register Tool</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3" style={{ display: sec === 'vehicles' ? undefined : 'none' }}>
        {vehicles.map(v => (
          <div key={v.id} className="glass-panel">
            <div className="flex-between" style={{ marginBottom: '8px' }}>
              <span className="badge" style={{ fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Truck size={14} /> {v.plate_number}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: '#059669' }}>{v.mileage_km.toLocaleString('de-DE')} km</span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ padding: '2px 6px', color: '#dc2626', borderColor: '#fecaca' }}
                  title="Fahrzeug löschen"
                  onClick={() => handleDeleteVehicle(v)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <h4>{v.model}</h4>
            <p style={{ fontSize: '0.8rem', margin: '6px 0' }}>Team Lead: <strong>{v.assigned_team_lead_name}</strong></p>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Tools on board: {v.assigned_tools.map(t => t.name).join(', ') || 'None'}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ display: sec === 'equipment' ? undefined : 'none' }}>
<h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Equipment Exclusive Possession Matrix (`Employee XOR Vehicle`)</h3>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 8px' }}>Serial #</th>
              <th style={{ padding: '10px 8px' }}>Equipment Name</th>
              <th style={{ padding: '10px 8px' }}>Current Exclusive Holder</th>
              <th style={{ padding: '10px 8px' }}>Reassign to Employee</th>
              <th style={{ padding: '10px 8px' }}>Reassign to Vehicle</th>
              <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map(eq => (
              <tr key={eq.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{eq.serial_number}</td>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{eq.name}</td>
                <td style={{ padding: '10px 8px' }}>
                  <span className="badge">{eq.holder_type}: {eq.holder_label}</span>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <select
                    value={eq.assigned_employee_id || ''}
                    onChange={e => handleAssignHolder(eq.id, 'employee', e.target.value)}
                    style={{ padding: '6px', fontSize: '0.78rem' }}
                  >
                    <option value="">— Select Employee —</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <select
                    value={eq.assigned_vehicle_id || ''}
                    onChange={e => handleAssignHolder(eq.id, 'vehicle', e.target.value)}
                    style={{ padding: '6px', fontSize: '0.78rem' }}
                  >
                    <option value="">— Select Vehicle —</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ color: '#dc2626', borderColor: '#fecaca' }}
                    title="Werkzeug löschen"
                    onClick={() => handleDeleteEquipment(eq)}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==============================================================================
// MODULE 5: CENTRALIZED INTERACTIVE MASTER CALENDAR
// ==============================================================================

export const MasterCalendarModule = () => {
  const { section } = useParams();
  const sec = section || 'all';
  const typeMap = { all: 'ALL', assignments: 'Assignment', leave: 'Leave', sickness: 'Sickness', objects: 'BuildingObject' };
  const filterType = typeMap[sec] || 'ALL';
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [empFilter, setEmpFilter] = useState('');
  const [view, setView] = useState('week'); // 'week' | 'month' | 'list'
  const [cursor, setCursor] = useState(() => new Date());
  const [dayModal, setDayModal] = useState(null);
  const [taskDocModal, setTaskDocModal] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [draggedSourceId, setDraggedSourceId] = useState(null);

  const loadCal = () => {
    const qs = empFilter ? `?employee_id=${empFilter}` : '';
    fetchWithToken(`/api/v1/calendar/events${qs}`).then(setEvents).catch(console.error);
  };

  useEffect(() => {
    fetchWithToken('/api/v1/hr/employees').then(setEmployees).catch(() => []);
  }, []);

  useEffect(() => {
    loadCal();
  }, [empFilter]);

  const openAssignmentDoc = async (assignmentId) => {
    try {
      const doc = await fetchWithToken(`/api/v1/assignments/${assignmentId}/documentation`);
      setTaskDocModal(doc);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDropTaskOnDate = async (targetIsoDate) => {
    if (!draggedSourceId || !targetIsoDate) return;
    try {
      await fetchWithToken(`/api/v1/assignments/${draggedSourceId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ date: targetIsoDate }),
      });
      setDraggedSourceId(null);
      loadCal();
    } catch (err) {
      alert(err.message);
      setDraggedSourceId(null);
    }
  };

  const handleStatusChange = async (assignmentId, newStatus) => {
    try {
      await fetchWithToken(`/api/v1/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ task_status: newStatus }),
      });
      loadCal();
      if (taskDocModal && taskDocModal.id === assignmentId) {
        openAssignmentDoc(assignmentId);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePostTaskComment = async (e) => {
    e.preventDefault();
    if (!taskDocModal || !commentText.trim()) return;
    try {
      await fetchWithToken(`/api/v1/assignments/${taskDocModal.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: commentText }),
      });
      setCommentText('');
      openAssignmentDoc(taskDocModal.id);
      loadCal();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = events.filter((ev) => filterType === 'ALL' || ev.event_type === filterType);
  const byDate = {};
  filtered.forEach((ev) => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);
  const todayIso = iso(new Date());
  const monthLabel = cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  // Week days calculation
  const weekDays = (() => {
    const d = new Date(cursor);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d.setDate(diff));
    return Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      return cur;
    });
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHead title="Master Calendar & Employee Schedules" desc="View the overall company schedule or each employee's calendar separately. Drag and drop tasks onto future days to reschedule.">
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ width: 'auto', fontWeight: 600 }}>
          <option value="">Overall Calendar (All Employees)</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>Employee: {emp.full_name}</option>
          ))}
        </select>
        <div className="subtabs">
          <button className={`subtab ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Week</button>
          <button className={`subtab ${view === 'month' ? 'active' : ''}`} onClick={() => setView('month')}>Month</button>
          <button className={`subtab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </PageHead>

      <div className="flex-between" style={{ flexWrap: 'wrap' }}>
        <SubTabs base="/calendar" active={sec} items={[
          { id: 'all', label: 'All events' }, { id: 'assignments', label: 'Tasks & Assignments' }, { id: 'leave', label: 'Holiday' },
          { id: 'sickness', label: 'Sickness' }, { id: 'objects', label: 'Objects' },
        ]} />
        <div className="toolbar">
          <button className="btn-secondary btn-sm" onClick={() => {
            const next = new Date(cursor);
            view === 'month' ? next.setMonth(next.getMonth() - 1) : next.setDate(next.getDate() - 7);
            setCursor(next);
          }}>‹</button>
          <strong style={{ minWidth: 150, textAlign: 'center' }}>{monthLabel}</strong>
          <button className="btn-secondary btn-sm" onClick={() => {
            const next = new Date(cursor);
            view === 'month' ? next.setMonth(next.getMonth() + 1) : next.setDate(next.getDate() + 7);
            setCursor(next);
          }}>›</button>
          <button className="btn-secondary btn-sm" onClick={() => setCursor(new Date())}>Today</button>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', gap: 24, padding: '12px 16px', fontSize: 13, flexWrap: 'wrap' }}>
        {[
          ['#3b82f6', 'To Do / Planned (Construction)'],
          ['#eab308', 'Remaining Work / Approved Leave'],
          ['#22c55e', 'Completed / Done'],
          ['#ef4444', 'Not Completed / Sickness'],
        ].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />{l}
          </div>
        ))}
      </div>

      {view === 'week' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
          {weekDays.map(d => {
            const dIso = iso(d);
            const list = byDate[dIso] || [];
            return (
              <div
                key={dIso}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDropTaskOnDate(dIso)}
                className="glass-panel"
                style={{
                  padding: 12,
                  minHeight: 280,
                  border: dIso === todayIso ? '2px solid var(--accent)' : '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>{d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong>
                  <span className="badge">{list.length}</span>
                </div>
                {list.map(ev => (
                  <div
                    key={ev.id}
                    draggable={ev.event_type === 'Assignment'}
                    onDragStart={() => ev.event_type === 'Assignment' && setDraggedSourceId(ev.source_id)}
                    onClick={() => ev.event_type === 'Assignment' ? openAssignmentDoc(ev.source_id) : setDayModal({ date: dIso, list: [ev] })}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: `${ev.hex_color}22`,
                      borderLeft: `4px solid ${ev.hex_color}`,
                      fontSize: 12,
                      cursor: ev.event_type === 'Assignment' ? 'grab' : 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ev.employee_name || ev.subtitle}</div>
                    {ev.task_status && <div style={{ fontSize: 10, fontWeight: 700, color: ev.hex_color, marginTop: 3 }}>{ev.task_status}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {view === 'month' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="cal-grid cal-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              const key = d ? iso(d) : `e${i}`;
              const list = d ? byDate[iso(d)] || [] : [];
              return (
                <div
                  key={key}
                  onDragOver={e => d && e.preventDefault()}
                  onDrop={() => d && handleDropTaskOnDate(iso(d))}
                  className={`cal-cell ${d ? '' : 'empty'} ${d && iso(d) === todayIso ? 'today' : ''}`}
                  onClick={() => d && list.length && setDayModal({ date: iso(d), list })}
                >
                  {d && <span className="cal-num">{d.getDate()}</span>}
                  {list.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      draggable={ev.event_type === 'Assignment'}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        if (ev.event_type === 'Assignment') setDraggedSourceId(ev.source_id);
                      }}
                      onClick={(e) => {
                        if (ev.event_type === 'Assignment') {
                          e.stopPropagation();
                          openAssignmentDoc(ev.source_id);
                        }
                      }}
                      className="cal-chip"
                      style={{ background: `${ev.hex_color}26`, color: '#2b2b33', borderLeft: `3px solid ${ev.hex_color}`, cursor: ev.event_type === 'Assignment' ? 'grab' : 'pointer' }}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {list.length > 3 && <div className="cal-more">+{list.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {filtered.length === 0 && <Empty>No events for this filter.</Empty>}
          {filtered.map((ev) => (
            <div
              key={ev.id}
              onClick={() => ev.event_type === 'Assignment' && openAssignmentDoc(ev.source_id)}
              className="glass-panel hover-lift"
              style={{ borderLeft: `4px solid ${ev.hex_color}`, cursor: ev.event_type === 'Assignment' ? 'pointer' : 'default' }}
            >
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(ev.date)}</span><span className="badge">{ev.task_status || ev.event_type}</span>
              </div>
              <h4>{ev.title}</h4><p style={{ fontSize: 13 }}>{ev.subtitle}</p>
            </div>
          ))}
        </div>
      )}

      {/* Task Documentation Modal inside Master Calendar */}
      {taskDocModal && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: 740, maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <span className="badge">{formatDate(taskDocModal.date)}</span>
                  <span className="badge">{taskDocModal.assignee_label}</span>
                </div>
                <h3>{taskDocModal.title}</h3>
                <p style={{ fontSize: 13 }}>{taskDocModal.object_address} — {taskDocModal.project_name}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={taskDocModal.task_status}
                  onChange={e => handleStatusChange(taskDocModal.id, e.target.value)}
                  style={{ width: 'auto', fontWeight: 700 }}
                >
                  {Object.values(TASK_STATUS_CONFIG).map(st => (
                    <option key={st.key} value={st.key}>{st.en}</option>
                  ))}
                </select>
                <button className="btn-secondary btn-sm" onClick={() => setTaskDocModal(null)}><X size={14} /></button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={15} /> Comments ({(taskDocModal.comments || []).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 10 }}>
                  {(taskDocModal.comments || []).map(c => (
                    <div key={c.id} style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13 }}>
                      <div className="flex-between" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                        <strong>{c.author_name}</strong>
                        <span>{formatDateTime(c.created_at)}</span>
                      </div>
                      <div>{c.text}</div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handlePostTaskComment} style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Write comment..." value={commentText} onChange={e => setCommentText(e.target.value)} />
                  <button type="submit" className="btn-primary">Post</button>
                </form>
              </div>

              <div>
                <h4 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Video size={15} /> Attached Photos, Videos & PDFs ({(taskDocModal.media || []).length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {(taskDocModal.media || []).map(m => (
                    <div key={m.id} style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{m.file_name}</div>
                      {m.mime_type?.startsWith('video') ? (
                        <video controls style={{ width: '100%', borderRadius: 6, maxHeight: 150, background: '#000' }} src={resolveMediaUrl(m.url)} />
                      ) : m.mime_type?.startsWith('image') ? (
                        <img alt={m.title} style={{ width: '100%', borderRadius: 6, maxHeight: 150, objectFit: 'cover' }} src={resolveMediaUrl(m.url)} />
                      ) : (
                        <a href={resolveMediaUrl(m.url)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <FileText size={13} /> Open Document ({m.file_name})
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {dayModal && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: 520 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h3>{new Date(dayModal.date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</h3>
              <button className="btn-secondary btn-sm" onClick={() => setDayModal(null)}>Close</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayModal.list.map((ev) => (
                <div key={ev.id} style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', borderLeft: `4px solid ${ev.hex_color}` }}>
                  <div className="flex-between"><strong>{ev.title}</strong><span className="badge">{ev.event_type}</span></div>
                  <p style={{ fontSize: 13, marginTop: 4 }}>{ev.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// MODULE 6: ACCOUNTING, EXPENSES & DATEV EXPORT
// ==============================================================================

export const AccountingModule = () => {
  const { section } = useParams();
  const navigate = useNavigate();
  const sec = section || 'overview';
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [expSearch, setExpSearch] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpId, setEditingExpId] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const defaultExpState = () => ({
    employee_id: '',
    project_id: '',
    vehicle_id: '',
    category: 'Fuel',
    merchant: '',
    description: '',
    amount_gross: '',
    vat_rate: 19,
    status: 'Approved',
    expense_date: new Date().toISOString().split('T')[0],
    document_id: null,
  });
  const [newExp, setNewExp] = useState(defaultExpState);

  const loadData = () => {
    fetchWithToken('/api/v1/accounting/expenses').then(setExpenses).catch(console.error);
    fetchWithToken('/api/v1/accounting/summary').then(setSummary).catch(console.error);
    fetchWithToken('/api/v1/hr/employees').then(setEmployees).catch(() => []);
    fetchWithToken('/api/v1/projects').then(setProjects).catch(() => []);
    fetchWithToken('/api/v1/fleet/vehicles').then(setVehicles).catch(() => []);
  };

  useEffect(() => { loadData(); }, []);
  useQuickAction('add-expense', () => {
    setEditingExpId(null);
    setNewExp(defaultExpState());
    setReceiptFile(null);
    setShowAdd(true);
  });

  const openCreateExpenseModal = () => {
    setEditingExpId(null);
    setNewExp(defaultExpState());
    setReceiptFile(null);
    setShowAdd(true);
  };

  const openEditExpenseModal = (ex) => {
    setEditingExpId(ex.id);
    setReceiptFile(null);
    setNewExp({
      employee_id: ex.employee_id || '',
      project_id: ex.project_id || '',
      vehicle_id: ex.vehicle_id || '',
      category: ex.category || 'Fuel',
      merchant: ex.merchant || '',
      description: ex.description || '',
      amount_gross: ex.amount_gross ?? '',
      vat_rate: ex.vat_rate ?? 19,
      status: ex.status || 'Pending',
      expense_date: ex.expense_date || new Date().toISOString().split('T')[0],
      document_id: ex.document_id || null,
    });
    setShowAdd(true);
  };

  const handleApprove = async (id, status) => {
    try {
      await fetchWithToken(`/api/v1/accounting/expenses/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteExpense = async (id) => {
    const ex = expenses.find(e => e.id === id);
    const ok = await confirmDelete({
      title: 'Beleg / Ausgabe löschen?',
      message: 'Sind Sie sicher, dass Sie diesen Beleg bzw. Ausgabeneintrag unwiderruflich löschen möchten?',
      itemName: ex ? `${ex.category} — ${ex.merchant || ex.description || 'Ausgabe'} (${formatEuro(ex.amount_gross)} Brutto)` : undefined,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/accounting/expenses/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    try {
      let docId = newExp.document_id || null;
      if (receiptFile) {
        const up = await uploadMediaFile({ file: receiptFile, referenceType: 'Expense', title: receiptFile.name });
        docId = up.document_id;
      }
      const payload = {
        ...newExp,
        employee_id: newExp.employee_id || null,
        project_id: newExp.project_id || null,
        vehicle_id: newExp.vehicle_id || null,
        amount_gross: parseFloat(newExp.amount_gross || 0),
        vat_rate: parseFloat(newExp.vat_rate ?? 19),
        document_id: docId,
      };
      if (editingExpId) {
        await fetchWithToken(`/api/v1/accounting/expenses/${editingExpId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchWithToken('/api/v1/accounting/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowAdd(false);
      setEditingExpId(null);
      setReceiptFile(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const downloadDatevCsv = async () => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/v1/accounting/export-datev`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bruenel_datev_expenses_export.csv';
    a.click();
  };

  const filteredExpenses = expenses.filter((e) => {
    if (statusFilter !== 'All' && e.status !== statusFilter) return false;
    if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;
    if (expSearch.trim()) {
      const q = expSearch.trim().toLowerCase();
      return (
        (e.merchant || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.employee_name || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const previewGross = parseFloat(newExp.amount_gross || 0);
  const previewVatRate = parseFloat(newExp.vat_rate ?? 19);
  const previewNet = previewGross > 0 ? previewGross / (1 + previewVatRate / 100) : 0;
  const previewVat = previewGross - previewNet;

  return (
    <div>
      <PageHead title="Accounting & Finance" desc="Review field receipts, Vorsteuer (VAT), payroll totals and DATEV-ready exports. n8n webhook status is prepared for later automation.">
        <button className="btn-secondary" onClick={downloadDatevCsv}><Download size={16} /> DATEV CSV</button>
        <button className="btn-primary" onClick={openCreateExpenseModal}><Plus size={16} /> Record expense</button>
      </PageHead>
      <SubTabs base="/accounting" active={sec} items={[
        { id: 'overview', label: 'Overview' }, { id: 'expenses', label: 'Expenses', count: expenses.length },
        { id: 'export', label: 'DATEV Export' }, { id: 'audit', label: 'Audit Trail' },
      ]} />

      {summary && sec === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div className="glass-panel">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL EXPENSES (GROSS)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)' }}>{formatEuro(summary.total_expenses_gross)}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Netto: {formatEuro(summary.total_expenses_net || 0)} • Vorsteuer: {formatEuro(summary.total_vat_amount || 0)}
            </div>
          </div>
          <div className="glass-panel">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>APPROVED FOR REIMBURSEMENT</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#059669' }}>{formatEuro(summary.approved_expenses_gross)}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {summary.pending_expenses_count || 0} pending review
            </div>
          </div>
          <div className="glass-panel">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FIELD SALES REVENUE</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#2563eb' }}>{formatEuro(summary.total_field_sales_revenue)}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Confirmed hardware & upselling
            </div>
          </div>
          <div className="glass-panel">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MONTHLY PAYROLL GROSS (HR)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{formatEuro(summary.total_payroll_gross)}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Active HR workforce base payroll
            </div>
          </div>
        </div>
      )}

      {sec === 'overview' && summary && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="glass-panel"><h3 style={{ marginBottom: 16 }}>Expenses by category (gross €)</h3><BarChart data={summary.expenses_by_category} labelKey="category" valueKey="amount" /></div>
          <div className="glass-panel"><h3 style={{ marginBottom: 16 }}>Pending review</h3>
            <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--accent)' }}>{summary.pending_expenses_count}</div>
            <p>expense(s) waiting for approval.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn-primary" onClick={() => { setStatusFilter('Pending'); navigate('/accounting/expenses'); }}>Review now</button>
              <button className="btn-secondary" onClick={openCreateExpenseModal}><Plus size={15} /> Add Expense</button>
            </div>
          </div>
        </div>
      )}
      {sec === 'export' && (
        <div className="glass-panel" style={{ maxWidth: 640 }}>
          <h3>DATEV / CSV export</h3>
          <p style={{ margin: '8px 0 16px' }}>Exports all expenses with net, VAT rate, Vorsteuer, gross amount, status and receipt ID. Approved items are flagged <code>Queued_For_DATEV_Export</code> for the future n8n pipeline.</p>
          <p style={{ marginBottom: 16 }}>{expenses.filter((e) => e.n8n_sync_status === 'Queued_For_DATEV_Export').length} item(s) queued · {expenses.filter((e) => e.n8n_sync_status === 'Ready_For_Webhook').length} awaiting approval.</p>
          <button className="btn-primary" onClick={downloadDatevCsv}><Download size={16} /> Download DATEV CSV</button>
        </div>
      )}
      {sec === 'audit' && summary && (
        <div className="glass-panel">
          <table><thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th style={{ padding: 10 }}>Time</th><th style={{ padding: 10 }}>Table</th><th style={{ padding: 10 }}>Operation</th><th style={{ padding: 10 }}>Record</th><th style={{ padding: 10 }}>By</th></tr></thead>
            <tbody>{summary.recent_audit_logs.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}>{formatDateTime(a.created_at)}</td><td style={{ padding: 10 }}><code>{a.table_name}</code></td>
                <td style={{ padding: 10 }}><span className="badge">{a.operation}</span></td><td style={{ padding: 10, fontFamily: 'monospace', fontSize: 12 }}>{a.record_id}</td><td style={{ padding: 10 }}>{a.changed_by}</td>
              </tr>))}</tbody></table>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '540px', maxWidth: '95vw' }}>
            <div className="flex-between" style={{ marginBottom: '14px' }}>
              <h3 style={{ margin: 0 }}>{editingExpId ? 'Beleg / Ausgabe bearbeiten' : 'Ausgabe & Beleg erfassen'}</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAdd(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleSubmitExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Zuordnung (Mitarbeiter / Firma)</label>
                  <select value={newExp.employee_id} onChange={e => setNewExp({ ...newExp, employee_id: e.target.value })}>
                    <option value="">Unternehmen / Geschäftsführung</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Kategorie</label>
                  <select value={newExp.category} onChange={e => setNewExp({ ...newExp, category: e.target.value })}>
                    <option value="Fuel">Fuel / Tankbeleg</option>
                    <option value="Material">Site Material / Hardware</option>
                    <option value="Parking">Parking & Toll</option>
                    <option value="Hotel">Accommodation / Hotel</option>
                    <option value="Tooling">Werkzeug & Maschinen</option>
                    <option value="IT & Software">IT, Software & Telekommunikation</option>
                    <option value="Subcontractor">Subunternehmer / Fremdleistung</option>
                    <option value="Other">Other Operational Expense</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Händler / Lieferant *</label>
                  <input placeholder="z.B. Aral, Bauhaus, Telekom..." required value={newExp.merchant} onChange={e => setNewExp({ ...newExp, merchant: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Belegdatum *</label>
                  <DateInput required value={newExp.expense_date} onChange={e => setNewExp({ ...newExp, expense_date: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.9fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Bruttobetrag (€) *</label>
                  <input type="number" step="0.01" placeholder="0.00" required value={newExp.amount_gross} onChange={e => setNewExp({ ...newExp, amount_gross: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>MwSt.-Satz</label>
                  <select value={newExp.vat_rate} onChange={e => setNewExp({ ...newExp, vat_rate: parseFloat(e.target.value) })}>
                    <option value={19}>19% MwSt.</option>
                    <option value={7}>7% MwSt.</option>
                    <option value={0}>0% (Steuerfrei / §13b)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Status</label>
                  <select value={newExp.status} onChange={e => setNewExp({ ...newExp, status: e.target.value })}>
                    <option value="Approved">Approved (Freigegeben)</option>
                    <option value="Pending">Pending (Prüfung)</option>
                    <option value="Rejected">Rejected (Abgelehnt)</option>
                  </select>
                </div>
              </div>

              {previewGross > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Netto: <strong>{formatEuro(previewNet)}</strong></span>
                  <span>Vorsteuer ({previewVatRate}%): <strong>{formatEuro(previewVat)}</strong></span>
                  <span>Brutto: <strong style={{ color: 'var(--accent)' }}>{formatEuro(previewGross)}</strong></span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Projekt (Optional)</label>
                  <select value={newExp.project_id} onChange={e => setNewExp({ ...newExp, project_id: e.target.value })}>
                    <option value="">— Kein Projekt —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Fahrzeug (Optional)</label>
                  <select value={newExp.vehicle_id} onChange={e => setNewExp({ ...newExp, vehicle_id: e.target.value })}>
                    <option value="">— Kein Fahrzeug —</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.license_plate} · {v.make_model}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Beleg-Datei (PDF / Foto)</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files[0])} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Beschreibung / Verwendungszweck</label>
                <textarea placeholder="Optionale Details zum Beleg..." value={newExp.description} onChange={e => setNewExp({ ...newExp, description: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>{editingExpId ? 'Änderungen speichern' : 'Beleg speichern'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ display: sec === 'expenses' ? undefined : 'none' }}>
        <div className="toolbar" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Beleg, Händler, Mitarbeiter suchen..."
            value={expSearch}
            onChange={(e) => setExpSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="All">Alle Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="All">Alle Kategorien</option>
            <option value="Fuel">Fuel / Tankbeleg</option>
            <option value="Material">Site Material / Hardware</option>
            <option value="Parking">Parking & Toll</option>
            <option value="Hotel">Accommodation</option>
            <option value="Tooling">Werkzeug & Maschinen</option>
            <option value="IT & Software">IT & Software</option>
            <option value="Subcontractor">Subunternehmer</option>
            <option value="Other">Other</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => downloadCsv(filteredExpenses, `bruenel_expenses_${new Date().toISOString().slice(0, 10)}.csv`)}>
              <Download size={14} /> CSV Export
            </button>
            <button className="btn-primary" onClick={openCreateExpenseModal}>
              <Plus size={14} /> Ausgabe erfassen
            </button>
          </div>
        </div>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 8px' }}>Date</th>
              <th style={{ padding: '10px 8px' }}>Employee / Zuordnung</th>
              <th style={{ padding: '10px 8px' }}>Category & Merchant</th>
              <th style={{ padding: '10px 8px' }}>Net / VAT / Gross</th>
              <th style={{ padding: '10px 8px' }}>Receipt</th>
              <th style={{ padding: '10px 8px' }}>Status</th>
              <th style={{ padding: '10px 8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 8px' }}>{formatDate(ex.expense_date)}</td>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{ex.employee_name}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div><strong>{ex.category}</strong> — {ex.merchant}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ex.description}</div>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {formatEuro(ex.amount_net)} Netto ({ex.vat_rate ?? 19}% MwSt.)
                  </span><br/>
                  <strong>{formatEuro(ex.amount_gross)} Brutto</strong>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {ex.receipt_url ? <a href={resolveMediaUrl(ex.receipt_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Receipt size={13} /> View Receipt</a> : '—'}
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <span className="badge" style={{
                    background: ex.status === 'Approved' ? 'rgba(34,197,94,0.16)' : ex.status === 'Rejected' ? 'rgba(239,68,68,0.16)' : undefined,
                    color: ex.status === 'Approved' ? '#16a34a' : ex.status === 'Rejected' ? '#dc2626' : undefined,
                  }}>
                    {ex.status}
                  </span>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {ex.status === 'Pending' && (
                      <>
                        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleApprove(ex.id, 'Approved')}>Approve</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleApprove(ex.id, 'Rejected')}>Reject</button>
                      </>
                    )}
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => openEditExpenseModal(ex)} title="Beleg bearbeiten">
                      <Edit3 size={12} />
                    </button>
                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleDeleteExpense(ex.id)} title="Beleg löschen">
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
  );
};

// ==============================================================================
// MODULE 7: FIELD SALES & HARDWARE UPSELLING DASHBOARD
// ==============================================================================

export const FieldSalesAdminModule = () => {
  const { section } = useParams();
  const sec = section || 'feed';
  const [catalog, setCatalog] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCat, setNewCat] = useState({ item_name: '', sku: '', category: 'Fiber Router', buy_price: 150, sell_price: 249, commission_amount: 25 });

  const loadData = () => {
    fetchWithToken('/api/v1/sales/catalog').then(setCatalog).catch(console.error);
    fetchWithToken('/api/v1/sales/dashboard').then(setDashboard).catch(console.error);
  };

  useEffect(() => { loadData(); }, []);

  const handleAddCatalog = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/sales/catalog', {
        method: 'POST',
        body: JSON.stringify(newCat),
      });
      setShowAddCat(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteCatalogItem = async (catItem) => {
    const ok = await confirmDelete({
      title: 'Hardware-Katalogartikel löschen?',
      message: 'Sind Sie sicher, dass Sie diesen Hardware-Artikel aus dem Verkaufskatalog entfernen möchten?',
      itemName: `${catItem.item_name} (SKU: ${catItem.sku})`,
    });
    if (!ok) return;
    try {
      await fetchWithToken(`/api/v1/sales/catalog/${catItem.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <PageHead title="Field Sales & Upselling" desc="On-site hardware sales deduct vehicle stock automatically and credit technician commissions (Provision).">
        <button className="btn-primary" onClick={() => setShowAddCat(true)}><Plus size={16} /> Add catalog hardware</button>
      </PageHead>
      <SubTabs base="/sales" active={sec} items={[
        { id: 'feed', label: 'Live Feed', count: dashboard?.transactions?.length || 0 },
        { id: 'leaderboard', label: 'Leaderboard' }, { id: 'catalog', label: 'Hardware Catalog', count: catalog.length },
      ]} />
      {dashboard && sec === 'feed' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div className="glass-panel kpi"><label>Revenue</label><div style={{ fontSize: 28, fontWeight: 700 }}>{formatEuro(dashboard.total_revenue)}</div></div>
          <div className="glass-panel kpi"><label>Provision earned</label><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>{formatEuro(dashboard.total_commission)}</div></div>
          <div className="glass-panel kpi"><label>Units sold</label><div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.total_units_sold}</div></div>
        </div>
      )}

      {showAddCat && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '420px' }}>
            <h3 style={{ marginBottom: '14px' }}>New Hardware Upsell Item</h3>
            <form onSubmit={handleAddCatalog} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Hardware Name (e.g. FRITZ!Box 5590)" required value={newCat.item_name} onChange={e => setNewCat({...newCat, item_name: e.target.value})} />
              <input placeholder="SKU (Matches Material SKU)" required value={newCat.sku} onChange={e => setNewCat({...newCat, sku: e.target.value})} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <input type="number" step="0.01" placeholder="Buy (€)" value={newCat.buy_price} onChange={e => setNewCat({...newCat, buy_price: parseFloat(e.target.value)})} />
                <input type="number" step="0.01" placeholder="Sell (€)" value={newCat.sell_price} onChange={e => setNewCat({...newCat, sell_price: parseFloat(e.target.value)})} />
                <input type="number" step="0.01" placeholder="Provision (€)" value={newCat.commission_amount} onChange={e => setNewCat({...newCat, commission_amount: parseFloat(e.target.value)})} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddCat(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div className="glass-panel" style={{ display: sec === 'catalog' ? undefined : 'none' }}>
<h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>Hardware Upsell Catalog</h3>
          {catalog.map(c => (
            <div key={c.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.item_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {c.sku} • Buy: {formatEuro(c.buy_price)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatEuro(c.sell_price)}</div>
                  <div style={{ fontSize: '0.75rem', color: '#059669' }}>Provision: {formatEuro(c.commission_amount)}</div>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  title="Katalogartikel löschen"
                  onClick={() => handleDeleteCatalogItem(c)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-panel" style={{ display: sec === 'leaderboard' ? undefined : 'none' }}>
<h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>Technician Commission Leaderboard (`Provision`)</h3>
          {(dashboard?.leaderboard || []).map((lb, idx) => (
            <div key={idx} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <div>
                <strong>#{idx + 1} {lb.employee_name}</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lb.units} hardware units sold</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#059669' }}>{formatEuro(lb.commission, { showPlus: true })} Provision</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Revenue: {formatEuro(lb.revenue)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel" style={{ display: sec === 'feed' ? undefined : 'none' }}>
<h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>Live Field Sales Feed</h3>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px' }}>Timestamp</th>
              <th style={{ padding: '8px' }}>Technician</th>
              <th style={{ padding: '8px' }}>Vehicle Stock Deducted</th>
              <th style={{ padding: '8px' }}>Hardware & Customer</th>
              <th style={{ padding: '8px' }}>Payment</th>
              <th style={{ padding: '8px' }}>Revenue / Provision</th>
            </tr>
          </thead>
          <tbody>
            {(dashboard?.transactions || []).map(t => (
              <tr key={t.sale_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px', fontSize: '0.78rem' }}>{formatDateTime(t.sale_timestamp)}</td>
                <td style={{ padding: '8px', fontWeight: 600 }}>{t.employee_name}</td>
                <td style={{ padding: '8px' }}><span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Truck size={12} /> {t.vehicle_plate} (-{t.quantity})</span></td>
                <td style={{ padding: '8px' }}>
                  <div><strong>{t.quantity}x {t.item_name}</strong></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.customer_name || 'Tenant'} ({t.customer_unit || 'On-site'})</div>
                </td>
                <td style={{ padding: '8px' }}><span className="badge">{t.payment_method}</span></td>
                <td style={{ padding: '8px' }}>
                  <strong>{formatEuro(t.total_revenue)}</strong> / <span style={{ color: '#059669' }}>{formatEuro(t.total_commission, { showPlus: true })}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
