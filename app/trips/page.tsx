'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import AuthGate from '../components/AuthGate';
import { useAuth } from '../components/AuthContext';
import Navbar from '../components/Navbar';
import { useRouter } from 'next/navigation';
import { formatScheduleTime, normalizeScheduleTime } from '@/lib/schedule';
import { useAutoSave } from '../components/useAutoSave';

interface Trip {
  id: string;
  routeId: string;
  busId: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  availableSeats: number;
  status: string;
  route: {
    name: string;
    fromCity: string;
    toCity: string;
  };
  bus: {
    busNumber: string;
    model: string;
  };
}

interface Route {
  id: string;
  name: string;
  fromCity: string;
  toCity: string;
}

interface Bus {
  id: string;
  busNumber: string;
  model: string;
  capacity: number;
}

type ScheduleView = 'upcoming' | 'all' | 'completed' | 'cancelled';

const statusClass = (status: string) => {
  if (status === 'scheduled') return 'ds-badge-green';
  if (status === 'boarding') return 'ds-badge-amber';
  if (status === 'completed') return 'ds-badge-blue';
  return 'ds-badge-red';
};

const formatPrice = (amount: number): string => {
  return `₱${amount.toLocaleString('en-PH')}`;
};

export default function TripsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const username = user?.name ?? 'Traveller';
  const isAdmin = user?.role === 'admin';
  
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('upcoming');
  const [showModal, setShowModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [formData, setFormData] = useState({
    routeId: '',
    busId: '',
    departureDate: '',
    departureTime: '',
    arrivalTime: '',
    price: '',
    availableSeats: '',
    status: 'scheduled'
  });
  const autoSave = useAutoSave();

  useEffect(() => {
    fetchData();
    if (new URLSearchParams(window.location.search).get('view') === 'all') {
      setScheduleView('all');
    }
    const interval = window.setInterval(() => void fetchData(), 10000);
    const refresh = () => void fetchData();
    window.addEventListener('app:database-change', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('app:database-change', refresh);
    };
  }, []);

  const saveTripEdit = (values: typeof formData, includeAvailability = false) => {
    if (!editingTrip) return;
    const { availableSeats, ...scheduleFields } = values;
    void autoSave.save(`/api/admin/trips/${editingTrip.id}`, {
      ...scheduleFields,
      price: Number(values.price),
      ...(includeAvailability ? { availableSeats: Number(availableSeats) } : {}),
    }).then(() => void fetchData());
  };

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/search');
  }, [user, router]);

  const fetchData = async () => {
    try {
      const [tripsRes, routesRes, busesRes] = await Promise.all([
        fetch('/api/admin/trips', { credentials: 'include' }),
        fetch('/api/admin/routes', { credentials: 'include' }),
        fetch('/api/admin/buses', { credentials: 'include' })
      ]);

      if (tripsRes.ok) {
        const tripsData = await tripsRes.json();
        const tripRows = Array.isArray(tripsData.trips) ? tripsData.trips : [];
        setTrips(tripRows.map((trip: Trip & {
          routeName?: string;
          from?: string;
          to?: string;
          busNumber?: string;
          busModel?: string;
        }) => ({
          ...trip,
          route: trip.route ?? {
            name: trip.routeName ?? 'Unknown route',
            fromCity: trip.from ?? '',
            toCity: trip.to ?? '',
          },
          bus: trip.bus ?? {
            busNumber: trip.busNumber ?? '—',
            model: trip.busModel ?? '',
          },
        })));
      } else {
        const data = await tripsRes.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load trips (HTTP ${tripsRes.status}).`);
      }

      if (routesRes.ok) {
        const routesData = await routesRes.json();
        setRoutes(routesData.routes || []);
      } else {
        const data = await routesRes.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load routes (HTTP ${routesRes.status}).`);
      }

      if (busesRes.ok) {
        const busesData = await busesRes.json();
        setBuses(busesData.buses || []);
      } else {
        const data = await busesRes.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load buses (HTTP ${busesRes.status}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin schedule data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (editingTrip) {
      saveTripEdit(formData, true);
      return;
    }

    try {
      const response = await fetch('/api/admin/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          routeId: formData.routeId,
          busId: formData.busId,
          departureDate: formData.departureDate,
          departureTime: formData.departureTime,
          arrivalTime: formData.arrivalTime,
          price: parseFloat(formData.price),
          status: formData.status
        })
      });

      if (response.ok) {
        setShowModal(false);
        setEditingTrip(null);
        setFormData({ routeId: '', busId: '', departureDate: '', departureTime: '', arrivalTime: '', price: '', availableSeats: '', status: 'scheduled' });
        fetchData();
      } else {
        const data = await response.json();
        setError(data.error || 'Operation failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleEdit = (trip: Trip) => {
    autoSave.reset();
    setEditingTrip(trip);
    setFormData({
      routeId: trip.routeId,
      busId: trip.busId,
      departureDate: trip.departureDate,
      departureTime: normalizeScheduleTime(trip.departureTime) ?? '',
      arrivalTime: normalizeScheduleTime(trip.arrivalTime) ?? '',
      price: trip.price.toString(),
      availableSeats: trip.availableSeats.toString(),
      status: trip.status
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trip?')) return;

    try {
      const response = await fetch(`/api/admin/trips/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        fetchData();
      } else {
        const data = await response.json();
        setError(data.error || 'Delete failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const normalizedSearch = searchTerm.toLowerCase();
  const searchedTrips = trips.filter((trip) =>
    [trip.route?.name, trip.route?.fromCity, trip.route?.toCity]
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  );
  const today = new Date().toISOString().slice(0, 10);
  const filteredTrips = searchedTrips.filter((trip) => {
    if (scheduleView === 'upcoming') return trip.status === 'scheduled' && trip.departureDate >= today;
    if (scheduleView === 'completed' || scheduleView === 'cancelled') return trip.status === scheduleView;
    return true;
  });

  if (user && user.role !== 'admin') {
    return <AuthGate><div className="ds-app"><main className="ds-page"><p className="ds-note">Opening trip search…</p></main></div></AuthGate>;
  }

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
                <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>Loading schedules...</p>
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
              <h1 className="ds-page-title">Schedules</h1>
              <p className="ds-page-sub">Manage bus routes, departure times, and seat availability</p>
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
                  placeholder="Search schedules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ds-input"
                  style={{ maxWidth: '300px' }}
                />
                <button
                  onClick={() => {
                    setEditingTrip(null);
                    autoSave.reset();
                    setFormData({ routeId: '', busId: '', departureDate: '', departureTime: '', arrivalTime: '', price: '', availableSeats: '', status: 'scheduled' });
                    setShowModal(true);
                  }}
                  className="ds-btn ds-btn-primary"
                >
                  + Add Schedule
                </button>
              </div>
            </div>

            <div className="ds-tabs ds-mb" aria-label="Filter schedules">
              {([
                ['upcoming', `Upcoming (${trips.filter((trip) => trip.status === 'scheduled' && trip.departureDate >= today).length})`],
                ['all', `All schedules (${trips.length})`],
                ['completed', `Completed (${trips.filter((trip) => trip.status === 'completed').length})`],
                ['cancelled', `Cancelled (${trips.filter((trip) => trip.status === 'cancelled').length})`],
              ] as const).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  className={`ds-tab ${scheduleView === view ? 'is-active' : ''}`}
                  onClick={() => setScheduleView(view)}
                  aria-pressed={scheduleView === view}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Date</th>
                    <th>Departure</th>
                    <th>Arrival</th>
                    <th>Bus</th>
                    <th>Available Seats</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                        {scheduleView === 'upcoming' ? 'No upcoming schedules found' : 'No schedules found'}
                      </td>
                    </tr>
                  ) : (
                    filteredTrips.map((trip) => (
                      <tr key={trip.id}>
                        <td className="ds-cell-strong">{trip.route?.name ?? 'Unknown route'}</td>
                        <td>{trip.departureDate}</td>
                        <td>{formatScheduleTime(trip.departureTime)}</td>
                        <td>{formatScheduleTime(trip.arrivalTime)}</td>
                        <td>{trip.bus?.busNumber ?? '—'}</td>
                        <td>{trip.availableSeats}</td>
                        <td className="ds-cell-price">{formatPrice(trip.price)}</td>
                        <td>
                          <span className={`ds-badge ${statusClass(trip.status)}`}>
                            {trip.status}
                          </span>
                        </td>
                        <td>
                          <div className="ds-row" style={{ gap: '0.5rem' }}>
                            <button
                              onClick={() => handleEdit(trip)}
                              className="ds-btn ds-btn-soft ds-btn-sm"
                            >
                              Edit
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(trip.id)}
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
                      {editingTrip ? 'Edit Schedule' : 'Add Schedule'}
                    </h2>
                    <button onClick={() => setShowModal(false)} className="ds-modal-close">×</button>
                  </div>
                  
                  <div className="ds-modal-body">
                    {error && <div className="ds-alert ds-alert-error ds-mb" role="alert">{error}</div>}
                    {editingTrip && <p className="ds-note" role="status" aria-live="polite">{autoSave.status === 'saving' ? 'Saving...' : autoSave.status === 'saved' ? 'Saved successfully.' : autoSave.status === 'unsaved' ? 'Unsaved changes. Finish the field to save.' : autoSave.status === 'error' ? autoSave.error : 'Changes save automatically when you finish editing a field.'}</p>}
                    <form onSubmit={handleSubmit} className="ds-form">
                      <div className="ds-field">
                        <label htmlFor="routeId" className="ds-label">Route</label>
                        <select
                          id="routeId"
                          value={formData.routeId}
                          onChange={(e) => { const next = {...formData, routeId: e.target.value}; setFormData(next); autoSave.markDirty(); saveTripEdit(next); }}
                          className="ds-select"
                          required
                        >
                          <option value="">Select a route</option>
                          {routes.map((route) => (
                            <option key={route.id} value={route.id}>
                              {route.name} ({route.fromCity} → {route.toCity})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="ds-field">
                        <label htmlFor="busId" className="ds-label">Bus</label>
                        <select
                          id="busId"
                          value={formData.busId}
                          onChange={(e) => {
                            const selectedBus = buses.find((bus) => bus.id === e.target.value);
                            const next = { ...formData, busId: e.target.value, availableSeats: selectedBus?.capacity.toString() ?? formData.availableSeats };
                            setFormData(next);
                            autoSave.markDirty();
                            saveTripEdit(next);
                          }}
                          className="ds-select"
                          required
                        >
                          <option value="">Select a bus</option>
                          {buses.map((bus) => (
                            <option key={bus.id} value={bus.id}>
                              {bus.busNumber} ({bus.model}) - {bus.capacity} seats
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="ds-trip-grid">
                        <div className="ds-field">
                          <label htmlFor="departureDate" className="ds-label">Departure Date</label>
                          <input
                            id="departureDate"
                            type="date"
                            value={formData.departureDate}
                            onChange={(e) => { const next = {...formData, departureDate: e.target.value}; setFormData(next); autoSave.markDirty(); saveTripEdit(next); }}
                            className="ds-input"
                            required
                          />
                        </div>

                        <div className="ds-field">
                          <label htmlFor="departureTime" className="ds-label">Departure Time</label>
                          <input
                            id="departureTime"
                            type="time"
                            value={formData.departureTime}
                            onChange={(e) => { const next = {...formData, departureTime: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                            onBlur={() => saveTripEdit(formData)}
                            className="ds-input"
                            required
                          />
                          <small>{formatScheduleTime(formData.departureTime)}</small>
                        </div>
                      </div>

                      <div className="ds-field">
                        <label htmlFor="arrivalTime" className="ds-label">Arrival Time</label>
                        <input
                          id="arrivalTime"
                          type="time"
                          value={formData.arrivalTime}
                          onChange={(e) => { const next = {...formData, arrivalTime: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                          onBlur={() => saveTripEdit(formData)}
                          className="ds-input"
                          required
                        />
                        <small>{formatScheduleTime(formData.arrivalTime)}</small>
                      </div>

                      <div className="ds-field">
                        <label htmlFor="price" className="ds-label">Price</label>
                        <input
                          id="price"
                          type="number"
                          value={formData.price}
                          onChange={(e) => { const next = {...formData, price: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                          onBlur={() => saveTripEdit(formData)}
                          className="ds-input"
                          required
                          min="1"
                          placeholder="300"
                        />
                      </div>

                      {editingTrip && <div className="ds-field">
                        <label htmlFor="availableSeats" className="ds-label">Available Seats</label>
                        <input
                          id="availableSeats"
                          type="number"
                          value={formData.availableSeats}
                          onChange={(e) => { const next = {...formData, availableSeats: e.target.value}; setFormData(next); autoSave.markDirty(); }}
                          onBlur={() => saveTripEdit(formData, true)}
                          className="ds-input"
                          required
                          min="0"
                          max={buses.find((bus) => bus.id === formData.busId)?.capacity ?? undefined}
                        />
                      </div>}

                      <div className="ds-field">
                        <label htmlFor="status" className="ds-label">Status</label>
                        <select
                          id="status"
                          value={formData.status}
                          onChange={(e) => { const next = {...formData, status: e.target.value}; setFormData(next); autoSave.markDirty(); saveTripEdit(next); }}
                          className="ds-select"
                          required
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="boarding">Boarding</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>

                      <div className="ds-row-actions">
                        <button type="button" onClick={() => setShowModal(false)} className="ds-btn ds-btn-outline">
                          Cancel
                        </button>
                        {!editingTrip && <button type="submit" className="ds-btn ds-btn-primary">Add Schedule</button>}
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
