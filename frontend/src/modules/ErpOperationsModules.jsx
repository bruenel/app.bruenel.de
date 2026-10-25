import React, { useState, useEffect } from 'react';
import {
  Package, Truck, Wrench, Calendar as CalendarIcon, Receipt, ShoppingBag,
  Plus, ArrowRightLeft, AlertTriangle, Download, Check, X, FileText, Video, MessageSquare, Upload
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, API_URL, getToken } from '../core/api';
import { TASK_STATUS_CONFIG } from '../core/i18n';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHead, SubTabs, useQuickAction, Empty } from '../components/ui';
import { BarChart } from './LegacyModules';

// ==============================================================================
// MODULE 3: INVENTORY & EVENT-SOURCED MATERIAL LEDGER (BUCHEN & SCHWUND)
// ==============================================================================

export const InventoryLedgerModule = () => {
  const { section } = useParams();
  const sec = section || 'stock';
  const [stock, setStock] = useState([]);
  const [stockQ, setStockQ] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [lagers, setLagers] = useState({ static_lagers: [], vehicle_lagers: [] });
  const [showBuchen, setShowBuchen] = useState(false);
  const [showAddMat, setShowAddMat] = useState(false);

  const [buchenData, setBuchenData] = useState({
    material_id: '',
    source_lager_type: 'StaticLager',
    source_lager_id: '',
    target_lager_type: 'Vehicle',
    target_lager_id: '',
    transaction_type: 'CheckOut',
    quantity: 10,
    note: '',
  });
  const [newMat, setNewMat] = useState({ name: '', sku: '', category: 'Cabling', unit: 'pcs', min_stock_threshold: 10, unit_cost: 0 });

  const loadAll = () => {
    Promise.all([
      fetchWithToken('/api/v1/inventory/stock'),
      fetchWithToken('/api/v1/inventory/transactions'),
      fetchWithToken('/api/v1/inventory/materials'),
      fetchWithToken('/api/v1/inventory/lagers'),
    ]).then(([st, txs, mats, lgs]) => {
      setStock(st);
      setTransactions(txs);
      setMaterials(mats);
      setLagers(lgs);
      if (mats.length > 0 && !buchenData.material_id) {
        setBuchenData(b => ({
          ...b,
          material_id: mats[0].id,
          source_lager_id: lgs.static_lagers[0]?.id || '',
          target_lager_id: lgs.vehicle_lagers[0]?.id || '',
        }));
      }
    }).catch(console.error);
  };

  useEffect(() => { loadAll(); }, []);
  useQuickAction('buchen', () => setShowBuchen(true));
  const lowCount = stock.filter((s) => s.low_stock_alert).length;

  const handleBuchen = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...buchenData };
      if (payload.transaction_type !== 'CheckOut') {
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

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    try {
      await fetchWithToken('/api/v1/inventory/materials', {
        method: 'POST',
        body: JSON.stringify(newMat),
      });
      setShowAddMat(false);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const sourceOptions = buchenData.source_lager_type === 'StaticLager' ? lagers.static_lagers : lagers.vehicle_lagers;

  return (
    <div>
      <PageHead title="Inventory & Material Ledger" desc="Stock is aggregated from the event-sourced ledger across static warehouses and mobile vehicle lagers.">
        <button className="btn-secondary" onClick={() => setShowAddMat(true)}><Plus size={16} /> New SKU</button>
        <button className="btn-primary" onClick={() => setShowBuchen(true)}><ArrowRightLeft size={16} /> Buchen / Schwund</button>
      </PageHead>
      <SubTabs base="/inventory" active={sec} items={[
        { id: 'stock', label: 'Stock Balances', count: stock.length },
        { id: 'ledger', label: 'Ledger', count: transactions.length },
        { id: 'catalog', label: 'Material Catalog', count: materials.length },
        { id: 'lagers', label: 'Warehouses & Vehicles' },
      ]} />
      {lowCount > 0 && sec === 'stock' && (
        <div className="glass-panel" style={{ borderColor: '#f5d9a6', background: '#fff9ef', padding: 12, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--warning)' }}>
          <AlertTriangle size={16} /> {lowCount} SKU balance(s) below minimum threshold.
        </div>
      )}

      {/* Buchen Modal */}
      {showBuchen && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '480px' }}>
            <h3 style={{ marginBottom: '14px' }}>Material Buchen (Transfer / Consume / Schwund)</h3>
            <form onSubmit={handleBuchen} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Transaction Type</label>
              <select value={buchenData.transaction_type} onChange={e => setBuchenData({...buchenData, transaction_type: e.target.value})}>
                <option value="CheckOut">CheckOut (Transfer Static Lager → Vehicle)</option>
                <option value="Return">Return / Restock (+Stock into Lager/Vehicle)</option>
                <option value="Consume">Consume on Project Site (-Stock)</option>
                <option value="Schwund">Schwund / Wastage Reconciliation (-Stock, Mandatory Note)</option>
              </select>

              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Material SKU</label>
              <select value={buchenData.material_id} onChange={e => setBuchenData({...buchenData, material_id: e.target.value})}>
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Source Lager Type</label>
                  <select
                    value={buchenData.source_lager_type}
                    onChange={e => {
                      const t = e.target.value;
                      const list = t === 'StaticLager' ? lagers.static_lagers : lagers.vehicle_lagers;
                      setBuchenData({...buchenData, source_lager_type: t, source_lager_id: list[0]?.id || ''});
                    }}
                  >
                    <option value="StaticLager">Static Warehouse</option>
                    <option value="Vehicle">Mobile Vehicle Lager</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Source Lager</label>
                  <select value={buchenData.source_lager_id} onChange={e => setBuchenData({...buchenData, source_lager_id: e.target.value})}>
                    {sourceOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              {buchenData.transaction_type === 'CheckOut' && (
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Target Mobile Vehicle Lager</label>
                  <select value={buchenData.target_lager_id} onChange={e => setBuchenData({...buchenData, target_lager_id: e.target.value})}>
                    <option value="">None (Direct Site CheckOut)</option>
                    {lagers.vehicle_lagers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              <input type="number" min="1" placeholder="Quantity" required value={buchenData.quantity} onChange={e => setBuchenData({...buchenData, quantity: parseInt(e.target.value)})} />
              <textarea
                placeholder={buchenData.transaction_type === 'Schwund' ? 'MANDATORY: Justification for Schwund variance...' : 'Optional transaction note...'}
                required={buchenData.transaction_type === 'Schwund'}
                value={buchenData.note}
                onChange={e => setBuchenData({...buchenData, note: e.target.value})}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowBuchen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Execute Buchen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMat && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '420px' }}>
            <h3 style={{ marginBottom: '14px' }}>Register Material SKU</h3>
            <form onSubmit={handleAddMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Material Name" required value={newMat.name} onChange={e => setNewMat({...newMat, name: e.target.value})} />
              <input placeholder="SKU Code (e.g. MAT-FIB-100)" required value={newMat.sku} onChange={e => setNewMat({...newMat, sku: e.target.value})} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input placeholder="Unit (pcs, m, roll)" value={newMat.unit} onChange={e => setNewMat({...newMat, unit: e.target.value})} />
                <input type="number" placeholder="Min Stock Alert" value={newMat.min_stock_threshold} onChange={e => setNewMat({...newMat, min_stock_threshold: parseInt(e.target.value)})} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAddMat(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Save SKU</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {sec === 'catalog' && (
          <div className="glass-panel">
            <table>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th style={{ padding: 10 }}>SKU</th><th style={{ padding: 10 }}>Name</th><th style={{ padding: 10 }}>Category</th><th style={{ padding: 10 }}>Unit</th><th style={{ padding: 10 }}>Min. stock</th><th style={{ padding: 10 }}>Unit cost</th></tr></thead>
              <tbody>{materials.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 10, fontFamily: 'monospace' }}>{m.sku}</td><td style={{ padding: 10, fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: 10 }}><span className="badge">{m.category}</span></td><td style={{ padding: 10 }}>{m.unit}</td>
                  <td style={{ padding: 10 }}>{m.min_stock_threshold}</td><td style={{ padding: 10 }}>€{m.unit_cost.toFixed(2)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        {sec === 'lagers' && (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="glass-panel">
              <h3 style={{ marginBottom: 12 }}>Static warehouses</h3>
              {lagers.static_lagers.length === 0 ? <Empty>No warehouses.</Empty> : lagers.static_lagers.map((l) => (
                <div key={l.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><strong>{l.name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.location}</div></div>
                  <span className="badge">{l.manager_name}</span>
                </div>))}
            </div>
            <div className="glass-panel">
              <h3 style={{ marginBottom: 12 }}>Mobile vehicle lagers</h3>
              {lagers.vehicle_lagers.map((v) => (
                <div key={v.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Truck size={14} /> {v.plate_number}</strong><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{v.model}</span>
                </div>))}
            </div>
          </div>
        )}
        <div className="glass-panel" style={{ display: sec === 'stock' ? undefined : 'none' }}>
<div className="toolbar" style={{ marginBottom: 12 }}><input placeholder="Search material or SKU…" value={stockQ} onChange={(e) => setStockQ(e.target.value)} /></div>
<h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Aggregated Stock Balances (Static & Vehicles)</h3>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Material / SKU</th>
                <th style={{ padding: '8px' }}>Lager / Vehicle</th>
                <th style={{ padding: '8px' }}>Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {stock.filter((s) => `${s.material_name} ${s.sku}`.toLowerCase().includes(stockQ.toLowerCase())).map((s, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ fontWeight: 600 }}>{s.material_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.sku}</div>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <span className="badge" style={{ marginRight: '6px' }}>{s.lager_type}</span>
                    {s.lager_name}
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: s.low_stock_alert ? '#dc2626' : '#059669' }}>
                    {s.current_stock} {s.unit} {s.low_stock_alert && '(Low)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-panel" style={{ display: sec === 'ledger' ? undefined : 'none' }}>
<h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Event-Sourced Ledger (`material_transactions`)</h3>
          <div style={{ maxHeight: '640px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {transactions.map(t => (
              <div key={t.id} style={{ padding: '10px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                <div className="flex-between">
                  <strong>{t.material_name}</strong>
                  <span style={{ fontWeight: 700, color: t.quantity >= 0 ? '#059669' : '#dc2626' }}>
                    {t.quantity > 0 ? `+${t.quantity}` : t.quantity} ({t.transaction_type})
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>
                  {t.source_lager_type}: {t.source_lager_name} • By: {t.employee_name}
                </div>
                {t.note && <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--accent)' }}>Note: {t.note}</div>}
              </div>
            ))}
          </div>
        </div>
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
              <span style={{ fontSize: '0.78rem', color: '#059669' }}>{v.mileage_km.toLocaleString('de-DE')} km</span>
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
  const monthLabel = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

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
                <span style={{ fontSize: 12, fontWeight: 600 }}>{ev.date}</span><span className="badge">{ev.task_status || ev.event_type}</span>
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
                  <span className="badge">{taskDocModal.date}</span>
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
                        <span>{c.created_at ? new Date(c.created_at).toLocaleString('de-DE') : ''}</span>
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
              <h3>{new Date(dayModal.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
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
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [newExp, setNewExp] = useState({ category: 'Fuel', merchant: '', description: '', amount_gross: '', vat_rate: 19, expense_date: new Date().toISOString().split('T')[0] });

  const loadData = () => {
    fetchWithToken('/api/v1/accounting/expenses').then(setExpenses).catch(console.error);
    fetchWithToken('/api/v1/accounting/summary').then(setSummary).catch(console.error);
  };

  useEffect(() => { loadData(); }, []);
  useQuickAction('add-expense', () => setShowAdd(true));

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

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    try {
      let docId = null;
      if (receiptFile) {
        const up = await uploadMediaFile({ file: receiptFile, referenceType: 'Expense', title: receiptFile.name });
        docId = up.document_id;
      }
      await fetchWithToken('/api/v1/accounting/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...newExp, amount_gross: parseFloat(newExp.amount_gross), document_id: docId }),
      });
      setShowAdd(false);
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

  return (
    <div>
      <PageHead title="Accounting" desc="Review field receipts, VAT, payroll totals and DATEV-ready exports. n8n webhook status is prepared for later automation.">
        <button className="btn-secondary" onClick={downloadDatevCsv}><Download size={16} /> DATEV CSV</button>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Record expense</button>
      </PageHead>
      <SubTabs base="/accounting" active={sec} items={[
        { id: 'overview', label: 'Overview' }, { id: 'expenses', label: 'Expenses', count: expenses.length },
        { id: 'export', label: 'DATEV Export' }, { id: 'audit', label: 'Audit Trail' },
      ]} />

      {summary && sec === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div className="glass-panel"><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL EXPENSES (GROSS)</div><div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)' }}>€{summary.total_expenses_gross.toFixed(2)}</div></div>
          <div className="glass-panel"><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>APPROVED FOR REIMBURSEMENT</div><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#059669' }}>€{summary.approved_expenses_gross.toFixed(2)}</div></div>
          <div className="glass-panel"><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FIELD SALES REVENUE</div><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#2563eb' }}>€{summary.total_field_sales_revenue.toFixed(2)}</div></div>
          <div className="glass-panel"><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PAYROLL GROSS ISSUED</div><div style={{ fontSize: '1.8rem', fontWeight: 700 }}>€{summary.total_payroll_gross.toFixed(2)}</div></div>
        </div>
      )}

      {sec === 'overview' && summary && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="glass-panel"><h3 style={{ marginBottom: 16 }}>Expenses by category (gross €)</h3><BarChart data={summary.expenses_by_category} labelKey="category" valueKey="amount" /></div>
          <div className="glass-panel"><h3 style={{ marginBottom: 16 }}>Pending review</h3>
            <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--accent)' }}>{summary.pending_expenses_count}</div>
            <p>expense(s) waiting for approval.</p>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => { setStatusFilter('Pending'); navigate('/accounting/expenses'); }}>Review now</button>
          </div>
        </div>
      )}
      {sec === 'export' && (
        <div className="glass-panel" style={{ maxWidth: 640 }}>
          <h3>DATEV / CSV export</h3>
          <p style={{ margin: '8px 0 16px' }}>Exports all expenses with net, VAT rate, gross amount, status and receipt ID. Approved items are flagged <code>Queued_For_DATEV_Export</code> for the future n8n pipeline.</p>
          <p style={{ marginBottom: 16 }}>{expenses.filter((e) => e.n8n_sync_status === 'Queued_For_DATEV_Export').length} item(s) queued · {expenses.filter((e) => e.n8n_sync_status === 'Ready_For_Webhook').length} awaiting approval.</p>
          <button className="btn-primary" onClick={downloadDatevCsv}><Download size={16} /> Download DATEV CSV</button>
        </div>
      )}
      {sec === 'audit' && summary && (
        <div className="glass-panel">
          <table><thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th style={{ padding: 10 }}>Time</th><th style={{ padding: 10 }}>Table</th><th style={{ padding: 10 }}>Operation</th><th style={{ padding: 10 }}>Record</th><th style={{ padding: 10 }}>By</th></tr></thead>
            <tbody>{summary.recent_audit_logs.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}>{a.created_at ? new Date(a.created_at).toLocaleString('de-DE') : ''}</td><td style={{ padding: 10 }}><code>{a.table_name}</code></td>
                <td style={{ padding: 10 }}><span className="badge">{a.operation}</span></td><td style={{ padding: 10, fontFamily: 'monospace', fontSize: 12 }}>{a.record_id}</td><td style={{ padding: 10 }}>{a.changed_by}</td>
              </tr>))}</tbody></table>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '440px' }}>
            <h3 style={{ marginBottom: '14px' }}>Submit Expense & Receipt</h3>
            <form onSubmit={handleSubmitExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={newExp.category} onChange={e => setNewExp({...newExp, category: e.target.value})}>
                <option value="Fuel">Fuel / Tankbeleg</option>
                <option value="Material">Site Material / Hardware</option>
                <option value="Parking">Parking & Toll</option>
                <option value="Hotel">Accommodation</option>
                <option value="Other">Other Operational Expense</option>
              </select>
              <input placeholder="Merchant (e.g. Aral, Bauhaus)" required value={newExp.merchant} onChange={e => setNewExp({...newExp, merchant: e.target.value})} />
              <input type="number" step="0.01" placeholder="Gross Amount in EUR" required value={newExp.amount_gross} onChange={e => setNewExp({...newExp, amount_gross: e.target.value})} />
              <input type="date" required value={newExp.expense_date} onChange={e => setNewExp({...newExp, expense_date: e.target.value})} />
              <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files[0])} />
              <textarea placeholder="Description..." value={newExp.description} onChange={e => setNewExp({...newExp, description: e.target.value})} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-secondary" style={{flex: 1}} onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{flex: 1}}>Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ display: sec === 'expenses' ? undefined : 'none' }}>
<div className="toolbar" style={{ marginBottom: 12 }}><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="All">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select></div>
<table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 8px' }}>Date</th>
              <th style={{ padding: '10px 8px' }}>Employee</th>
              <th style={{ padding: '10px 8px' }}>Category & Merchant</th>
              <th style={{ padding: '10px 8px' }}>Net / Gross</th>
              <th style={{ padding: '10px 8px' }}>Receipt</th>
              <th style={{ padding: '10px 8px' }}>Status</th>
              <th style={{ padding: '10px 8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.filter((e) => statusFilter === 'All' || e.status === statusFilter).map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 8px' }}>{ex.expense_date}</td>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{ex.employee_name}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div><strong>{ex.category}</strong> — {ex.merchant}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ex.description}</div>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  €{ex.amount_net.toFixed(2)} net<br/>
                  <strong>€{ex.amount_gross.toFixed(2)} gross</strong>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {ex.receipt_url ? <a href={resolveMediaUrl(ex.receipt_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Receipt size={13} /> View Receipt</a> : '—'}
                </td>
                <td style={{ padding: '10px 8px' }}><span className="badge">{ex.status}</span></td>
                <td style={{ padding: '10px 8px', display: 'flex', gap: '6px' }}>
                  {ex.status === 'Pending' && (
                    <>
                      <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleApprove(ex.id, 'Approved')}>Approve</button>
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleApprove(ex.id, 'Rejected')}>Reject</button>
                    </>
                  )}
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
          <div className="glass-panel kpi"><label>Revenue</label><div style={{ fontSize: 28, fontWeight: 700 }}>€{dashboard.total_revenue.toFixed(2)}</div></div>
          <div className="glass-panel kpi"><label>Provision earned</label><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>€{dashboard.total_commission.toFixed(2)}</div></div>
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
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {c.sku} • Buy: €{c.buy_price.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>€{c.sell_price.toFixed(2)}</div>
                <div style={{ fontSize: '0.75rem', color: '#059669' }}>Provision: €{c.commission_amount.toFixed(2)}</div>
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
                <div style={{ fontWeight: 700, color: '#059669' }}>+€{lb.commission.toFixed(2)} Provision</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Revenue: €{lb.revenue.toFixed(2)}</div>
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
                <td style={{ padding: '8px', fontSize: '0.78rem' }}>{t.sale_timestamp ? new Date(t.sale_timestamp).toLocaleString('de-DE') : ''}</td>
                <td style={{ padding: '8px', fontWeight: 600 }}>{t.employee_name}</td>
                <td style={{ padding: '8px' }}><span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Truck size={12} /> {t.vehicle_plate} (-{t.quantity})</span></td>
                <td style={{ padding: '8px' }}>
                  <div><strong>{t.quantity}x {t.item_name}</strong></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.customer_name || 'Tenant'} ({t.customer_unit || 'On-site'})</div>
                </td>
                <td style={{ padding: '8px' }}><span className="badge">{t.payment_method}</span></td>
                <td style={{ padding: '8px' }}>
                  <strong>€{t.total_revenue.toFixed(2)}</strong> / <span style={{ color: '#059669' }}>+€{t.total_commission.toFixed(2)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
