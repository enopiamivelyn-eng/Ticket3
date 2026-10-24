'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import AuthGate from '../components/AuthGate';
import { useAuth } from '../components/AuthContext';
import { formatScheduleTime } from '@/lib/schedule';
import Navbar from '../components/Navbar';
import { useLiveDatabaseRefresh } from '../components/useLiveDatabaseRefresh';
import { displayBookingStatus, isApprovedBookingStatus, isCompletedBookingStatus } from '@/lib/booking-status';

interface Booking {
  id: string;
  tripId: string;
  seatNumber: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmount: number;
  passengerCategory: string;
  baseFare: number;
  discountRate: number;
  discountAmount: number;
  discountVerification: { verificationStatus: string; adminRemarks: string | null } | null;
  bookingDate: string;
  trip: {
    route: {
      name: string;
      fromCity: string;
      toCity: string;
    };
    departureDate: string;
    departureTime: string;
    arrivalTime: string;
    price: number;
    bus: {
      busNumber: string;
      model: string;
    };
  };
}

interface DiscountApplication {
  id: string;
  passengerName: string;
  passengerEmail: string;
  passengerCategory: string;
  verificationStatus: string;
  adminRemarks: string | null;
  submittedAt: string;
  bookings: Array<{ id: string; baseFare: number; discountRate: number; discountAmount: number; totalAmount: number }>;
}
type DiscountReview = DiscountApplication & { imageUrl: string };

type TabType = 'upcoming' | 'completed' | 'cancelled';

export default function BookingsPage() {
  const { user } = useAuth();
  const username = user?.name ?? 'Traveller';
  const isAdmin = user?.role === 'admin';

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [viewingPassengerBookingId, setViewingPassengerBookingId] = useState<string | null>(null);
  const [discountApplications, setDiscountApplications] = useState<DiscountApplication[]>([]);
  const [discountReview, setDiscountReview] = useState<DiscountReview | null>(null);
  const [discountRemarks, setDiscountRemarks] = useState('');
  const [discountBusy, setDiscountBusy] = useState(false);

  // Keep passenger and admin booking lists in sync with approvals and changes.
  const fetchBookings = useCallback(async () => {
    try {
      const requestOptions = { credentials: 'include' as const, cache: 'no-store' as const };
      let response = await fetch('/api/bookings', requestOptions);
      if (response.status === 401) {
        const session = await fetch('/api/auth/me', requestOptions);
        if (session.ok) response = await fetch('/api/bookings', requestOptions);
      }
      if (response.status === 401) {
        setBookings([]);
        setError('Your sign-in session expired. Log in again to view bookings.');
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load bookings');
      setBookings(data.bookings || []);
      setError('');
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveDatabaseRefresh(() => { void fetchBookings(); });

  const fetchDiscountApplications = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const response = await fetch('/api/admin/discount-verifications?status=pending', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setDiscountApplications(data.applications || []);
    } catch { /* Keep the last loaded admin review list when offline. */ }
  }, [isAdmin]);

  useEffect(() => {
    void fetchBookings();
    void fetchDiscountApplications();
    if (new URLSearchParams(window.location.search).get('discount') === 'pending') {
      setSuccessMessage('Booking saved. Your ID is awaiting verification; payment is paused until the final fare is confirmed.');
    }
    const interval = window.setInterval(() => { void fetchBookings(); }, 8000);
    const discountInterval = window.setInterval(() => { void fetchDiscountApplications(); }, 8000);
    return () => { window.clearInterval(interval); window.clearInterval(discountInterval); };
  }, [fetchBookings, fetchDiscountApplications]);

  const openDiscountReview = async (application: DiscountApplication) => {
    setDiscountBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/discount-verifications/${application.id}`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the private ID image.');
      setDiscountReview({ ...application, ...data.application });
      setDiscountRemarks(application.adminRemarks || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the private ID image.'); }
    finally { setDiscountBusy(false); }
  };

  const decideDiscount = async (verificationStatus: 'verified' | 'rejected') => {
    if (!discountReview) return;
    if (verificationStatus === 'rejected' && !discountRemarks.trim()) { setError('Enter a reason before rejecting this ID.'); return; }
    setDiscountBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/discount-verifications/${discountReview.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ verificationStatus, adminRemarks: discountRemarks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the verification decision.');
      setDiscountReview(null);
      setSuccessMessage(`Passenger ID ${verificationStatus}.`);
      await Promise.all([fetchDiscountApplications(), fetchBookings()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the verification decision.'); }
    finally { setDiscountBusy(false); }
  };

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    setCancellingId(bookingId);
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (response.ok) {
        // Update local state
        setBookings(bookings.map(b => 
          b.id === bookingId ? { ...b, status: 'cancelled' } : b
        ));
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to cancel booking');
      }
    } catch (err) {
      console.error('Error cancelling booking:', err);
      alert('Network error. Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleAdminStatus = async (bookingId: string, status: 'approved' | 'complete' | 'rejected') => {
    if (status === 'rejected' && !confirm('Reject this passenger booking? Its reserved seat will be released.')) return;
    setCancellingId(bookingId);
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update booking status.');
      const savedStatus = data.booking?.status;
      if (savedStatus !== status) throw new Error('The server did not confirm the requested status. Refresh and try again.');
      setBookings((current) => current.map((booking) => booking.id === bookingId ? { ...booking, status: savedStatus } : booking));
      setEditingBookingId(null);
      setStatusDraft('');
      setSuccessMessage(`Booking status updated to ${displayBookingStatus(status)}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update booking status.');
    } finally {
      setCancellingId(null);
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case 'approved':
      case 'confirmed':
      case 'complete':
      case 'completed':
        return 'ds-badge-green';
      case 'pending':
        return 'ds-badge-amber';
      default:
        return 'ds-badge-red';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPrice = (amount: number): string => {
    return `₱${amount.toLocaleString('en-PH')}`;
  };

  const filterBookings = (bookings: Booking[], tab: TabType) => {
    switch (tab) {
      case 'upcoming':
        return bookings.filter(b => isApprovedBookingStatus(b.status) || b.status === 'pending');
      case 'completed':
        return bookings.filter(b => isCompletedBookingStatus(b.status));
      case 'cancelled':
        return bookings.filter(b => b.status === 'cancelled' || b.status === 'rejected');
      default:
        return bookings;
    }
  };

  const filteredBookings = filterBookings(bookings, activeTab);

  return (
    <AuthGate>
      <div className="ds-app">
        <Navbar user={{ name: user?.name ?? 'Traveller', role: user?.role ?? 'Passenger' }} />

        <div className="ds-app-body">
          <Sidebar isAuthenticated username={username} />

          <main className="ds-page">
            <div className="ds-mb">
              <h1 className="ds-page-title">{isAdmin ? 'Manage Bookings' : 'My Bookings'}</h1>
              <p className="ds-page-sub">{isAdmin ? 'Review passenger reservations and update their status.' : 'View and manage your ticket bookings.'}</p>
            </div>

            {error && (
              <div className="ds-alert ds-alert-error ds-mb">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="10" cy="10" r="7.5" />
                  <path d="M10 6v4M10 13.5v.5" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            {successMessage && <div className="ds-alert ds-alert-success ds-mb" role="status">{successMessage}</div>}

            {isAdmin && <section className="ds-card ds-card-pad ds-mb" aria-labelledby="discount-review-heading">
              <h2 id="discount-review-heading">Passenger ID verification</h2>
              <p className="ds-card-sub">Review IDs attached to discounted bookings. Approval applies the 20% fare discount; rejection keeps the regular fare.</p>
              {discountApplications.length ? <div className="ds-table-wrap"><table className="ds-table"><thead><tr><th>Booking reference</th><th>Passenger</th><th>Category</th><th>Original fare</th><th>Discount</th><th>Final fare</th><th>Status / remarks</th><th>Review</th></tr></thead><tbody>
                {discountApplications.map((application) => <tr key={application.id}><td>{application.bookings.map((booking) => <div key={booking.id}><code>{booking.id.slice(0, 8)}</code></div>)}</td><td>{application.passengerName}<br/><small>{application.passengerEmail}</small></td><td>{application.passengerCategory === 'senior_citizen' ? 'Senior Citizen' : application.passengerCategory === 'pwd' ? 'PWD' : 'Student'}</td><td>{application.bookings.map((booking) => <div key={booking.id}>{formatPrice(booking.baseFare)}</div>)}</td><td>{application.bookings.map((booking) => <div key={booking.id}>{Math.round(booking.discountRate * 100)}% · {formatPrice(booking.discountAmount)}</div>)}</td><td>{application.bookings.map((booking) => <div key={booking.id}>{formatPrice(booking.totalAmount)}</div>)}</td><td>Pending{application.adminRemarks ? ` · ${application.adminRemarks}` : ''}</td><td><button type="button" className="ds-btn ds-btn-soft ds-btn-sm" onClick={() => void openDiscountReview(application)} disabled={discountBusy}>View ID & review</button></td></tr>)}
              </tbody></table></div> : <p>No pending passenger ID reviews.</p>}
            </section>}

            {/* Tabs */}
            <div className="ds-tabs ds-mb">
              <button
                className={`ds-tab ${activeTab === 'upcoming' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('upcoming')}
              >
                Upcoming
              </button>
              <button
                className={`ds-tab ${activeTab === 'completed' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('completed')}
              >
                Completed
              </button>
              <button
                className={`ds-tab ${activeTab === 'cancelled' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('cancelled')}
              >
                Cancelled
              </button>
            </div>

            {loading ? (
              <div className="ds-empty">
                <div className="loading" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>Loading your bookings...</p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="ds-card ds-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, margin: '0 auto 1rem' }}>
                  <path d="M3 9.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3.5" />
                  <path d="M3 9.5a1.8 1.8 0 0 0 0 3V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5a1.8 1.8 0 0 1 0-3" />
                </svg>
                <h3>No {activeTab} bookings</h3>
                <p>
                  {activeTab === 'upcoming' && (isAdmin ? 'Passenger bookings will appear here when they book a trip.' : 'Start your journey by booking a ticket')}
                  {activeTab === 'completed' && (isAdmin ? 'Completed passenger trips will appear here.' : 'Your completed trips will appear here')}
                  {activeTab === 'cancelled' && (isAdmin ? 'Cancelled or rejected passenger bookings will appear here.' : 'Your cancelled bookings will appear here')}
                </p>
                {!isAdmin && activeTab === 'upcoming' && (
                  <Link href="/home" className="ds-btn ds-btn-primary" style={{ marginTop: '1rem' }}>
                    Book Now
                  </Link>
                )}
              </div>
            ) : (
              <div className="ds-list">
                {filteredBookings.map((booking) => (
                  <article key={booking.id} className={`ds-row ds-booking-list-row ${isAdmin && (editingBookingId === booking.id || viewingPassengerBookingId === booking.id) ? 'ds-row-expanded' : ''}`}>
                    <div className="ds-row-thumb" aria-hidden="true">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="5" width="19" height="12" rx="2.5" />
                        <path d="M2.5 11h19" />
                        <circle cx="7" cy="19" r="1.7" />
                        <circle cx="17" cy="19" r="1.7" />
                      </svg>
                    </div>

                    <div className="ds-row-main">
                      <h3 className="ds-row-route">
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M10 17.5s5.5-4.6 5.5-8.8A5.5 5.5 0 0 0 4.5 8.7c0 4.2 5.5 8.8 5.5 8.8Z" />
                        </svg>
                        {booking.trip.route.fromCity} → {booking.trip.route.toCity}
                      </h3>
                      <small>Booking reference: {booking.id}</small>
                      {isAdmin && <button type="button" className="ds-row-passenger-toggle" onClick={() => setViewingPassengerBookingId(viewingPassengerBookingId === booking.id ? null : booking.id)} aria-expanded={viewingPassengerBookingId === booking.id} aria-controls={`passenger-details-${booking.id}`}>
                        {viewingPassengerBookingId === booking.id ? 'Hide passenger details' : 'View passenger details'}
                      </button>}
                      <div className="ds-row-meta">
                        <span>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <rect x="3.5" y="4.5" width="13" height="12" rx="2.5" />
                            <path d="M7 3v3M13 3v3M3.5 9h13" />
                          </svg>
                          {formatDate(booking.trip.departureDate)}
                        </span>
                        <span>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <circle cx="10" cy="10" r="7" />
                            <path d="M10 6v4l2.5 1.5" />
                          </svg>
                          {formatScheduleTime(booking.trip.departureTime)}
                        </span>
                        <span>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M5 4v8a2 2 0 0 0 2 2h6" />
                            <path d="M5 16h10" />
                          </svg>
                          Seat {booking.seatNumber}
                        </span>
                        <span>Bus: {booking.trip.bus.busNumber}</span>
                        <span>Booked on {formatDate(booking.bookingDate)}</span>
                      </div>
                    </div>

                    <div className="ds-row-aside">
                      <span className={`ds-badge ${statusClass(booking.status)}`}>
                        {displayBookingStatus(booking.status)}
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.72)', marginTop: '0.25rem' }}>
                        {booking.passengerCategory === 'regular' ? 'Regular · 0% · ID verification not required' : `${booking.passengerCategory === 'senior_citizen' ? 'Senior Citizen' : booking.passengerCategory.toUpperCase()} · ${booking.discountRate ? `${Math.round(booking.discountRate * 100)}% discount` : 'no discount until ID verified'} · ID ${booking.discountVerification?.verificationStatus ?? 'not submitted'}`}
                      </span>
                      {booking.discountVerification?.adminRemarks && <small style={{ color: 'rgba(255,255,255,0.8)' }}>Admin feedback: {booking.discountVerification.adminRemarks}</small>}
                      {isAdmin && ['pending', 'approved', 'confirmed'].includes(booking.status) && <button type="button" className="ds-btn ds-btn-soft ds-btn-sm" onClick={() => { setEditingBookingId(editingBookingId === booking.id ? null : booking.id); setStatusDraft(''); }} aria-expanded={editingBookingId === booking.id}>{editingBookingId === booking.id ? 'Close' : 'Edit status'}</button>}
                      {(!isAdmin || editingBookingId === booking.id) && (
                        <span className={`ds-row-fare ${isAdmin ? 'ds-row-fare-large' : ''}`}>
                          <small style={{ display: 'block', fontSize: '0.75rem', opacity: 0.8 }}>Base {formatPrice(booking.baseFare)} · {Math.round(booking.discountRate * 100)}% discount ({formatPrice(booking.discountAmount)}) · Final</small>
                          {formatPrice(booking.totalAmount)}
                        </span>
                      )}
                      {booking.paymentMethod && (
                        <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem' }}>
                          via {booking.paymentMethod}
                        </span>
                      )}
                    </div>

                    <div className="ds-row-actions">
                      {isApprovedBookingStatus(booking.status) && (
                        <>
                          {!isAdmin && <Link href={`/reservation?bookingId=${booking.id}`} className="ds-btn ds-btn-soft ds-btn-sm">View Ticket</Link>}
                          {!isAdmin && <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => handleCancel(booking.id)} disabled={cancellingId === booking.id}>{cancellingId === booking.id ? 'Cancelling...' : 'Cancel'}</button>}
                        </>
                      )}
                      {booking.status === 'pending' && (
                        <>
                          {!isAdmin && booking.passengerCategory !== 'regular' && booking.discountVerification?.verificationStatus === 'pending'
                            ? <span className="ds-note">Awaiting ID review before payment</span>
                            : !isAdmin && <Link href={`/payment?bookingId=${booking.id}`} className="ds-btn ds-btn-primary ds-btn-sm">Pay Now</Link>}
                          {!isAdmin && <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => handleCancel(booking.id)} disabled={cancellingId === booking.id}>{cancellingId === booking.id ? 'Cancelling...' : 'Cancel'}</button>}
                        </>
                      )}

                      {!isAdmin && booking.status === 'cancelled' && (
                        <Link href="/home" className="ds-btn ds-btn-primary ds-btn-sm">
                          Rebook
                        </Link>
                      )}
                      {!isAdmin && isCompletedBookingStatus(booking.status) && (
                        <>
                          <Link href={`/reservation?bookingId=${booking.id}`} className="ds-btn ds-btn-soft ds-btn-sm">View Ticket</Link>
                          <Link href="/home" className="ds-btn ds-btn-soft ds-btn-sm">Book Again</Link>
                        </>
                      )}
                    </div>
                    {isAdmin && viewingPassengerBookingId === booking.id && <div className="ds-row-passenger" id={`passenger-details-${booking.id}`}>
                      <strong>Passenger: {booking.passengerName}</strong>
                      <span>Phone: {booking.passengerPhone}</span>
                    </div>}
                    {isAdmin && editingBookingId === booking.id && <div className="ds-row-status-editor">
                      <label htmlFor={`booking-status-select-${booking.id}`}>Change booking status</label>
                      <select id={`booking-status-select-${booking.id}`} value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} disabled={cancellingId === booking.id}>
                        <option value="">Choose a status</option>
                        <option value="approved" disabled={booking.status !== 'pending'}>Approve</option>
                        <option value="complete" disabled={!isApprovedBookingStatus(booking.status) || booking.paymentStatus !== 'paid'}>
                          {!isApprovedBookingStatus(booking.status) ? 'Complete (approve first)' : booking.paymentStatus !== 'paid' ? 'Complete (verify payment first)' : 'Complete'}
                        </option>
                        <option value="rejected" disabled={!(booking.status === 'pending' || isApprovedBookingStatus(booking.status)) || booking.paymentStatus === 'paid'}>Reject (info mismatch)</option>
                      </select>
                      <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={() => { if (statusDraft === 'approved' || statusDraft === 'complete' || statusDraft === 'rejected') void handleAdminStatus(booking.id, statusDraft); }} disabled={cancellingId === booking.id || !statusDraft}>{cancellingId === booking.id ? 'Saving...' : 'Save status'}</button>
                      {booking.paymentStatus === 'paid'
                        ? <small>Refund this booking before rejecting it.</small>
                        : booking.status === 'pending'
                          ? <small>To complete a booking, approve it first, then verify its payment in <Link href="/admin/payments">Payment review</Link>.</small>
                          : isApprovedBookingStatus(booking.status)
                            ? <small>To complete this booking, verify its payment in <Link href="/admin/payments">Payment review</Link> first.</small>
                            : null}
                    </div>}
                  </article>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
      {discountReview && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !discountBusy) setDiscountReview(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'grid', placeItems: 'center', padding: 16 }}><section role="dialog" aria-modal="true" aria-labelledby="booking-discount-review-title" className="ds-card" style={{ width: 'min(900px, 100%)', maxHeight: '95vh', overflow: 'auto', padding: 24 }}>
        <h2 id="booking-discount-review-title">Review passenger ID</h2><p>{discountReview.passengerName} ({discountReview.passengerEmail}) · {discountReview.passengerCategory === 'senior_citizen' ? 'Senior Citizen' : discountReview.passengerCategory === 'pwd' ? 'PWD' : 'Student'}</p>
        {discountReview.bookings.map((booking) => <p key={booking.id}>Booking {booking.id} · Base {formatPrice(booking.baseFare)} · Current discount {Math.round(booking.discountRate * 100)}% · Final {formatPrice(booking.totalAmount)}</p>)}
        <a href={discountReview.imageUrl} target="_blank" rel="noreferrer" aria-label="Open larger private passenger ID image"><img src={discountReview.imageUrl} alt={`Passenger ID for ${discountReview.passengerName}`} style={{ display: 'block', maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', margin: '16px auto', borderRadius: 8 }} /></a>
        <label htmlFor="booking-discount-admin-remarks">Admin remarks (required when rejecting)</label><textarea id="booking-discount-admin-remarks" value={discountRemarks} onChange={(event) => setDiscountRemarks(event.target.value)} maxLength={1000} rows={3} style={{ width: '100%', margin: '8px 0 16px' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="ds-btn ds-btn-primary" type="button" onClick={() => void decideDiscount('verified')} disabled={discountBusy}>{discountBusy ? 'Saving…' : 'Approve ID'}</button><button className="ds-btn ds-btn-outline" type="button" onClick={() => void decideDiscount('rejected')} disabled={discountBusy}>Reject ID</button><button className="ds-btn ds-btn-soft" type="button" onClick={() => setDiscountReview(null)} disabled={discountBusy}>Close</button></div>
      </section></div>}
    </AuthGate>
  );
}
