'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Sidebar from '../components/Sidebar';
import AuthGate from '../components/AuthGate';
import { useAuth } from '../components/AuthContext';
import Navbar from '../components/Navbar';
import { formatScheduleTime } from '@/lib/schedule';

interface DashboardStats {
  totalBookings: number;
  totalRevenue: number;
  activeBuses: number;
  totalRoutes: number;
  todayBookings: number;
  upcomingTrips: number;
  totalSchedules: number;
}

interface RecentBooking { id: string; from: string; to: string; date: string; time: string; status: string; totalAmount: number; }

export default function DashboardPage() {
  const { user } = useAuth();
  const username = user?.name ?? 'Account';
  const isAdmin = user?.role === 'admin';
  
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    totalRevenue: 0,
    activeBuses: 0,
    totalRoutes: 0,
    todayBookings: 0,
    upcomingTrips: 0,
    totalSchedules: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statsUserId, setStatsUserId] = useState<string | null>(null);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [discountDashboardStatus, setDiscountDashboardStatus] = useState('Check eligibility');
  const activeUserId = useRef<string | null>(null);
  const accountDataLoading = loading || statsUserId !== user?.id;

  useEffect(() => {
    activeUserId.current = user?.id ?? null;
    setStatsUserId(null);
    setRecentBookings([]);
    setStats({ totalBookings: 0, totalRevenue: 0, activeBuses: 0, totalRoutes: 0, todayBookings: 0, upcomingTrips: 0, totalSchedules: 0 });
    if (!user) {
      setLoading(true);
      return;
    }

    setLoading(true);
    const refresh = () => fetchDashboardStats(user.id, user.role === 'admin');
    refresh();
    const interval = setInterval(refresh, 10000);
    window.addEventListener('app:database-change', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('app:database-change', refresh);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const refreshDiscountStatus = async () => {
      try {
        const response = await fetch(user.role === 'admin' ? '/api/admin/discount-verifications?status=pending' : '/api/discount-verifications?includeImage=false', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !active) return;
        if (user.role === 'admin') setDiscountDashboardStatus(String(data.counts?.pending || 0));
        else if (data.verification) {
          const categoryName = ({ student: 'Student', pwd: 'PWD', senior_citizen: 'Senior' } as Record<string, string>)[data.verification.passengerCategory] || 'Discount';
          setDiscountDashboardStatus(`${categoryName}: ${data.verification.verificationStatus}`);
        } else setDiscountDashboardStatus('Not submitted');
      } catch { /* Keep the last known dashboard state when the request is offline. */ }
    };
    void refreshDiscountStatus();
    const interval = window.setInterval(() => void refreshDiscountStatus(), 10000);
    window.addEventListener('app:database-change', refreshDiscountStatus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('app:database-change', refreshDiscountStatus); };
  }, [user?.id, user?.role]);

  const fetchDashboardStats = async (userId: string, admin: boolean) => {
    try {
      const requests = [
        fetch('/api/bookings', { credentials: 'include' }),
        admin ? fetch('/api/admin/buses', { credentials: 'include' }) : Promise.resolve(null),
        admin ? fetch('/api/admin/routes', { credentials: 'include' }) : Promise.resolve(null),
        admin ? fetch('/api/admin/trips', { credentials: 'include' }) : Promise.resolve(null),
      ] as const;
      const [bookingsRes, busesRes, routesRes, tripsRes] = await Promise.all(requests);
      if (activeUserId.current !== userId) return;

      let totalBookings = 0;
      let totalRevenue = 0;
      let todayBookings = 0;
      let upcomingTrips = 0;
      let totalSchedules = 0;
      const today = new Date().toISOString().split('T')[0];

      if (bookingsRes.ok) {
        const bookingsData = await bookingsRes.json();
        const bookings = bookingsData.bookings || [];
        setRecentBookings(bookings.slice(0, 5));
        totalBookings = bookings.length;
        
        bookings.forEach((booking: any) => {
          if (booking.paymentStatus === 'paid') {
            totalRevenue += booking.totalAmount;
          }
          if (booking.bookingDate.startsWith(today)) {
            todayBookings++;
          }
          if (booking.status !== 'cancelled' && booking.date >= today) upcomingTrips++;
        });
      }

      let activeBuses = 0;
      if (busesRes?.ok) {
        const busesData = await busesRes.json();
        const buses = busesData.buses || [];
        activeBuses = buses.filter((bus: any) => bus.status === 'active').length;
      }

      let totalRoutes = 0;
      if (routesRes?.ok) {
        const routesData = await routesRes.json();
        totalRoutes = (routesData.routes || []).length;
      }

      if (tripsRes?.ok) {
        const tripsData = await tripsRes.json();
        const trips = tripsData.trips || [];
        totalSchedules = trips.length;
        const availableTrips = trips.filter((trip: any) => 
          trip.status === 'scheduled' && trip.departureDate >= today
        ).length;
        if (admin) upcomingTrips = availableTrips;
      }

      if (activeUserId.current !== userId) return;
      setStats({
        totalBookings,
        totalRevenue,
        activeBuses,
        totalRoutes,
        todayBookings,
        upcomingTrips,
        totalSchedules
      });
      setStatsUserId(userId);
    } catch (err) {
      if (activeUserId.current !== userId) return;
      console.error('Error fetching dashboard stats:', err);
      setStatsUserId(userId);
    } finally {
      if (activeUserId.current === userId) setLoading(false);
    }
  };

  const formatPrice = (amount: number): string => {
    return `₱${amount.toLocaleString('en-PH')}`;
  };

  return (
    <AuthGate>
      <div className="ds-app">
        <Navbar user={{ name: user?.name ?? 'Account', role: isAdmin ? 'Administrator' : 'Passenger' }} />

        <div className="ds-app-body">
          <Sidebar isAuthenticated username={username} />

          <main className="ds-page">
            <div className="ds-mb">
              <h1 className="ds-page-title">Hello, {username}!</h1>
              <p className="ds-page-sub">{isAdmin ? 'System overview' : 'Your account and travel overview'}</p>
            </div>

            {accountDataLoading ? (
              <div className="ds-empty">
                <div className="loading" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>Loading dashboard...</p>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div className="ds-stats-grid ds-mb">
                  <Link href="/bookings" className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3.5" />
                        <path d="M3 9.5a1.8 1.8 0 0 0 0 3V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5a1.8 1.8 0 0 1 0-3" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="ds-stat-value">{stats.totalBookings}</h3>
                      <p className="ds-stat-label">Total Bookings</p>
                    </div>
                  </Link>

                  <Link href={isAdmin ? '/admin/payments' : '/bookings'} className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="ds-stat-value">{formatPrice(stats.totalRevenue)}</h3>
                      <p className="ds-stat-label">{isAdmin ? 'Total Revenue' : 'Paid Booking Spend'}</p>
                    </div>
                  </Link>

                  {isAdmin && <Link href="/buses" className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="5" width="19" height="12" rx="2.5" />
                        <path d="M2.5 11h19" />
                        <circle cx="7" cy="19" r="1.7" />
                        <circle cx="17" cy="19" r="1.7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="ds-stat-value">{stats.activeBuses}</h3>
                      <p className="ds-stat-label">Active Buses</p>
                    </div>
                  </Link>}

                  {isAdmin && <Link href="/routes" className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 17.5s5.5-4.6 5.5-8.8A5.5 5.5 0 0 0 4.5 8.7c0 4.2 5.5 8.8 5.5 8.8Z" />
                        <circle cx="10" cy="8.6" r="1.9" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="ds-stat-value">{stats.totalRoutes}</h3>
                      <p className="ds-stat-label">Total Routes</p>
                    </div>
                  </Link>}

                  <Link href="/bookings" className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="ds-stat-value">{stats.todayBookings}</h3>
                      <p className="ds-stat-label">Today's Bookings</p>
                    </div>
                  </Link>

                  <Link href={isAdmin ? '/schedules?view=all' : '/search'} className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 4v8a2 2 0 0 0 2 2h6" />
                        <path d="M5 16h10" />
                        <path d="M14 8h1.5A1.5 1.5 0 0 1 17 9.5V16" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="ds-stat-value">{isAdmin ? stats.totalSchedules : stats.upcomingTrips}</h3>
                      <p className="ds-stat-label">{isAdmin ? 'Total Schedules' : 'Upcoming Trips'}</p>
                    </div>
                  </Link>

                  <Link href={isAdmin ? '/admin/discount-verifications' : '/discount-verification'} className="ds-stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="ds-stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><circle cx="17" cy="16" r="3"/></svg></div>
                    <div><h3 className="ds-stat-value">{discountDashboardStatus}</h3><p className="ds-stat-label">{isAdmin ? 'Pending discount applications' : 'Passenger discount verification'}</p></div>
                  </Link>
                </div>

                {isAdmin ? <>
                {/* Quick Actions */}
                <div className="ds-section-head">
                  <div>
                    <h2 className="ds-section-title">Quick Actions</h2>
                    <p className="ds-section-sub">Manage your bus ticketing system</p>
                  </div>
                </div>

                <div className="ds-row ds-mb">
                  <Link href="/buses" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}>
                    <div className="ds-card-head">
                      <h3 className="ds-card-title">Manage Buses</h3>
                      <p className="ds-card-sub">Add, edit, or remove buses from your fleet</p>
                    </div>
                  </Link>

                  <Link href="/routes" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}>
                    <div className="ds-card-head">
                      <h3 className="ds-card-title">Manage Routes</h3>
                      <p className="ds-card-sub">Configure travel routes and pricing</p>
                    </div>
                  </Link>

                  <Link href="/schedules" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}>
                    <div className="ds-card-head">
                      <h3 className="ds-card-title">Manage Schedules</h3>
                      <p className="ds-card-sub">Set departure times and manage seat availability</p>
                    </div>
                  </Link>
                </div>

                <div className="ds-row">
                  <Link href="/bookings" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}>
                    <div className="ds-card-head">
                      <h3 className="ds-card-title">View Bookings</h3>
                      <p className="ds-card-sub">See all customer bookings and reservations</p>
                    </div>
                  </Link>

                  <Link href="/users" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}>
                    <div className="ds-card-head">
                      <h3 className="ds-card-title">Manage Users</h3>
                      <p className="ds-card-sub">Administer user accounts and permissions</p>
                    </div>
                  </Link>
                </div>
                </> : <>
                  <div className="ds-section-head"><div><h2 className="ds-section-title">Your recent bookings</h2><p className="ds-section-sub">These bookings belong to your signed-in account.</p></div><Link href="/bookings" className="ds-link">View all</Link></div>
                  {recentBookings.length ? <div className="ds-table-wrap ds-mb"><table className="ds-table"><thead><tr><th>Route</th><th>Date</th><th>Status</th><th>Total</th><th /></tr></thead><tbody>{recentBookings.map((booking) => <tr key={booking.id}><td className="ds-cell-strong">{booking.from} → {booking.to}</td><td>{booking.date} · {formatScheduleTime(booking.time)}</td><td>{booking.status}</td><td>{formatPrice(booking.totalAmount)}</td><td><Link href={`/reservation?bookingId=${encodeURIComponent(booking.id)}`} className="ds-link">Ticket</Link></td></tr>)}</tbody></table></div> : <div className="ds-empty ds-mb"><p>No bookings on this account yet.</p><Link href="/search" className="ds-btn ds-btn-primary">Search trips</Link></div>}
                  <div className="ds-row">
                    <Link href="/search" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}><h3 className="ds-card-title">Search trips</h3><p className="ds-card-sub">Find buses and reserve seats.</p></Link>
                    <Link href="/profile" className="ds-card ds-card-pad" style={{ flex: 1, textDecoration: 'none' }}><h3 className="ds-card-title">Profile & Settings</h3><p className="ds-card-sub">Update the personal information on your account.</p></Link>
                  </div>
                </>}
              </>
            )}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
