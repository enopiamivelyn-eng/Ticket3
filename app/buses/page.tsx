'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import AuthGate from '../components/AuthGate';
import { useAuth } from '../components/AuthContext';
import Navbar from '../components/Navbar';
import { useRouter } from 'next/navigation';
import { useAutoSave } from '../components/useAutoSave';

interface Bus {
  id: string;
  busNumber: string;
  model: string;
  capacity: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const statusClass = (status: string) => {
  if (status === 'active') return 'ds-badge-green';
  if (status === 'maintenance') return 'ds-badge-amber';
  return 'ds-badge-red';
};

export default function BusesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const username = user?.name ?? 'Traveller';
  const isAdmin = user?.role === 'admin';
  useEffect(() => { if (user && !isAdmin) router.replace('/home'); }, [user, isAdmin, router]);
  
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [formData, setFormData] = useState({
    busNumber: '',
    model: '',
    capacity: '',
    status: 'active'
  });
  const autoSave = useAutoSave();

  useEffect(() => {
    fetchBuses();
    const interval = window.setInterval(() => void fetchBuses(), 10000);
    const refresh = () => void fetchBuses();
    window.addEventListener('app:database-change', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('app:database-change', refresh);
    };
  }, []);

  const saveBusEdit = (values: typeof formData) => {
    if (!editingBus) return;
    void autoSave.save(`/api/admin/buses/${editingBus.id}`, {
      busNumber: values.busNumber,
      model: values.model,
      capacity: Number(values.capacity),
      status: values.status,
    }).then(() => void fetchBuses());
  };

  const fetchBuses = async () => {
    try {
      const response = await fetch('/api/admin/buses', {
        credentials: 'include'
      });
      
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to load buses (HTTP ${response.status}).`);
      setBuses(data.buses || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the buses API.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (editingBus) {
      saveBusEdit(formData);
      return;
    }

    try {
      const response = await fetch('/api/admin/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          busNumber: formData.busNumber,
          model: formData.model,
          capacity: parseInt(formData.capacity),
          status: formData.status
        })
      });

      if (response.ok) {
        setShowModal(false);
        setEditingBus(null);
        setFormData({ busNumber: '', model: '', capacity: '', status: 'active' });
        fetchBuses();
      } else {
        const data = await response.json();
        setError(data.error || 'Operation failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleEdit = (bus: Bus) => {
    autoSave.reset();
    setEditingBus(bus);
    setFormData({
      busNumber: bus.busNumber,
      model: bus.model,
      capacity: bus.capacity.toString(),
      status: bus.status
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;

    try {
      const response = await fetch(`/api/admin/buses/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        fetchBuses();
      } else {
        const data = await response.json();
        setError(data.error || 'Delete failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const filteredBuses = buses.filter(bus =>
    bus.busNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bus.model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AuthGate>
        <div className="ds-app">
          <Navbar user={{ name: user?.name ?? 'Traveller', role: user?.role ?? 'Passenger' }} />
          <div className="ds-app-body">
            <Sidebar isAuthenticated username={username} />
            <main className="ds-page">
              <div className="ds-empty">
                <div className="loading" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>Loading buses...</p>
              </div>
            </main>
          </div>
        </div>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <div className="ds-app">
        <Navbar user={{ name: user?.name ?? 'Traveller', role: user?.role ?? 'Passenger' }} />

        <div className="ds-app-body">
          <Sidebar isAuthenticated username={username} />

          <main className="ds-page">
            <div className="ds-mb">
              <h1 className="ds-page-title">Buses</h1>
              <p className="ds-page-sub">Manage your bus fleet</p>
            </div>

            {error && (
              <div className="ds-alert ds-alert-error ds-mb">
                <span>{error}</span>
              </div>
            )}

            <div className="ds-card ds-card-pad ds-mb">
              <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search buses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ds-input"
                  style={{ maxWidth: '300px' }}
                />
                <button
                  onClick={() => {
                    setEditingBus(null);
                    setFormData({ busNumber: '', model: '', capacity: '', status: 'active' });
                    setShowModal(true);
                  }}
                  className="ds-btn ds-btn-primary"
                >
                  + Add New Bus
                </button>
              </div>
            </div>

            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Bus Code</th>
                    <th>Bus Name</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuses.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                        No buses found
                      </td>
                    </tr>
                  ) : (
                    filteredBuses.map((bus) => (
                      <tr key={bus.id}>
                        <td className="ds-cell-strong">{bus.busNumber}</td>
                        <td>{bus.model}</td>
                        <td>{bus.capacity}</td>
                        <td>
                          <span className={`ds-badge ${statusClass(bus.status)}`}>
                            {bus.status}
                          </span>
                        </td>
                        <td>
                          <div className="ds-row" style={{ gap: '0.5rem' }}>
                            <button
                              onClick={() => handleEdit(bus)}
                              className="ds-btn ds-btn-soft ds-btn-sm"
                            >
                              Edit
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(bus.id)}
                                className="ds-btn ds-btn-soft ds-btn-sm"
                                style={{ color: '#ef4444' }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {showModal && (
              <div className="ds-modal-overlay" onClick={() => setShowModal(false)}>
                <div className="ds-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="ds-modal-head">
                    <h2 className="ds-modal-title">
                      {editingBus ? 'Edit Bus' : 'Add New Bus'}
                    </h2>
                    <button onClick={() => setShowModal(false)} className="ds-modal-close">×</button>
                  </div>
                  
                  <div className="ds-modal-body">
                    {editingBus && <p className="ds-note" role="status" aria-live="polite">{autoSave.status === 'saving' ? 'Saving...' : autoSave.status === 'saved' ? 'Saved successfully.' : autoSave.status === 'unsaved' ? 'Unsaved changes. Finish the field to save.' : autoSave.status === 'error' ? autoSave.error : 'Changes save automatically when you finish editing a field.'}</p>}
                    <form onSubmit={handleSubmit} className="ds-form">
                      <div className="ds-field">
                        <label htmlFor="busNumber" className="ds-label">Bus Number</label>
                        <input
                          id="busNumber"
                          type="text"
                          value={formData.busNumber}
                          onChange={(e) => { const next = {...formData, busNumber: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                          onBlur={() => saveBusEdit(formData)}
                          className="ds-input"
                          required
                          placeholder="BUS-001"
                        />
                      </div>

                      <div className="ds-field">
                        <label htmlFor="model" className="ds-label">Bus Model</label>
                        <input
                          id="model"
                          type="text"
                          value={formData.model}
                          onChange={(e) => { const next = {...formData, model: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                          onBlur={() => saveBusEdit(formData)}
                          className="ds-input"
                          required
                          placeholder="Hino Grand Cruiser"
                        />
                      </div>

                      <div className="ds-field">
                        <label htmlFor="capacity" className="ds-label">Capacity</label>
                        <input
                          id="capacity"
                          type="number"
                          value={formData.capacity}
                          onChange={(e) => { const next = {...formData, capacity: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                          onBlur={() => saveBusEdit(formData)}
                          className="ds-input"
                          required
                          min="1"
                          placeholder="45"
                        />
                      </div>

                      <div className="ds-field">
                        <label htmlFor="status" className="ds-label">Status</label>
                        <select
                          id="status"
                          value={formData.status}
                          onChange={(e) => { const next = {...formData, status: e.target.value}; setFormData(next); autoSave.markDirty(); saveBusEdit(next); }}
                          className="ds-select"
                          required
                        >
                          <option value="active">Active</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="ds-row-actions">
                        <button type="button" onClick={() => setShowModal(false)} className="ds-btn ds-btn-outline">
                          Cancel
                        </button>
                        {!editingBus && <button type="submit" className="ds-btn ds-btn-primary">Add Bus</button>}
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
