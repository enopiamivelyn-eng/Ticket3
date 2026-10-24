'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGate from '../../components/AuthGate';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../components/AuthContext';

type Application = {
  id: string; userId: string; passengerName: string; passengerEmail: string; passengerCategory: string;
  verificationStatus: string; adminRemarks: string | null; submittedAt: string; reviewedAt: string | null;
};
type Counts = { pending?: number; verified?: number; rejected?: number };
type Review = Application & { imageUrl: string };

const categoryName = (value: string) => ({ student: 'Student', pwd: 'PWD', senior_citizen: 'Senior Citizen' }[value] || value);

export default function DiscountVerificationAdminPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [status, setStatus] = useState('pending');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      if (category) query.set('category', category);
      const response = await fetch(`/api/admin/discount-verifications?${query}`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load applications.');
      setApplications(data.applications || []);
      setCounts(data.counts || {});
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load applications.');
    }
  }, [status, category]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    window.addEventListener('app:database-change', load);
    return () => { window.clearInterval(timer); window.removeEventListener('app:database-change', load); };
  }, [load]);

  const openReview = async (application: Application) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/discount-verifications/${application.id}`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open the ID image.');
      setReview({ ...application, ...data.application });
      setRemarks(application.adminRemarks || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the ID image.');
    } finally { setBusy(false); }
  };

  const decide = async (verificationStatus: 'verified' | 'rejected') => {
    if (!review) return;
    if (verificationStatus === 'rejected' && !remarks.trim()) { setError('Enter a reason before rejecting this application.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/discount-verifications/${review.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ verificationStatus, adminRemarks: remarks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the decision.');
      setReview(null); setNotice(`Application ${verificationStatus}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the decision.'); }
    finally { setBusy(false); }
  };

  const shown = applications.filter((application) => `${application.passengerName} ${application.passengerEmail} ${application.passengerCategory}`.toLowerCase().includes(search.toLowerCase()));

  return <AuthGate><div className="ds-app"><Navbar user={{ name: user?.name ?? 'Admin', role: 'Administrator' }} /><div className="ds-app-body"><Sidebar isAuthenticated username={user?.name ?? 'Admin'} /><main className="ds-page">
    <div className="ds-mb"><h1 className="ds-page-title">Discount verification</h1><p className="ds-page-sub">Review private passenger ID documents and record eligibility decisions.</p></div>
    {error && <div className="ds-alert ds-alert-error ds-mb" role="alert">{error}</div>}{notice && <div className="ds-alert ds-alert-success ds-mb" role="status">{notice}</div>}
    <div className="ds-stats-grid ds-mb"><div className="ds-stat-card"><span>Total applications</span><strong>{(counts.pending || 0) + (counts.verified || 0) + (counts.rejected || 0)}</strong></div><div className="ds-stat-card"><span>Pending</span><strong>{counts.pending || 0}</strong></div><div className="ds-stat-card"><span>Verified</span><strong>{counts.verified || 0}</strong></div><div className="ds-stat-card"><span>Rejected</span><strong>{counts.rejected || 0}</strong></div></div>
    <div className="ds-card ds-mb" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16 }}>
      <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="">All</option></select></label>
      <label>Category <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option><option value="student">Student</option><option value="pwd">PWD</option><option value="senior_citizen">Senior Citizen</option></select></label>
      <label>Search <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></label>
    </div>
    <div className="ds-table-wrap"><table className="ds-table"><thead><tr><th>Passenger</th><th>Category</th><th>Submitted</th><th>Status</th><th>Admin remarks</th><th>Action</th></tr></thead><tbody>
      {shown.map((application) => <tr key={application.id}><td><strong>{application.passengerName || 'Passenger'}</strong><br/><small>{application.passengerEmail}</small></td><td>{categoryName(application.passengerCategory)}</td><td>{new Date(application.submittedAt).toLocaleString()}</td><td>{application.verificationStatus}</td><td>{application.adminRemarks || '—'}</td><td><button type="button" className="ds-btn ds-btn-soft ds-btn-sm" onClick={() => void openReview(application)} disabled={busy}>View ID{application.verificationStatus === 'pending' ? ' & review' : ''}</button></td></tr>)}
      {!shown.length && <tr><td colSpan={6}>No applications match these filters.</td></tr>}
    </tbody></table></div>
  </main></div>
  {review && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setReview(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'grid', placeItems: 'center', padding: 16 }}><section role="dialog" aria-modal="true" aria-labelledby="discount-review-title" className="ds-card" style={{ width: 'min(900px, 100%)', maxHeight: '95vh', overflow: 'auto', padding: 24 }}>
    <h2 id="discount-review-title">Review passenger ID</h2><p>{review.passengerName} · {categoryName(review.passengerCategory)} · Submitted {new Date(review.submittedAt).toLocaleString()}</p><p>Status: <strong>{review.verificationStatus}</strong></p>
    <a href={review.imageUrl} target="_blank" rel="noreferrer" aria-label="Open larger private ID image"><img src={review.imageUrl} alt={`${categoryName(review.passengerCategory)} ID submitted by ${review.passengerName}`} style={{ display: 'block', maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', margin: '16px auto', borderRadius: 8 }} /></a>
    {review.verificationStatus === 'pending' ? <><label htmlFor="discount-admin-remarks">Admin remarks (required when rejecting)</label><textarea id="discount-admin-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={3} style={{ width: '100%', margin: '8px 0 16px' }} /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="ds-btn ds-btn-primary" type="button" onClick={() => void decide('verified')} disabled={busy}>{busy ? 'Saving…' : 'Approve ID'}</button><button className="ds-btn ds-btn-outline" type="button" onClick={() => void decide('rejected')} disabled={busy}>Reject ID</button><button className="ds-btn ds-btn-soft" type="button" onClick={() => setReview(null)} disabled={busy}>Close</button></div></> : <button className="ds-btn ds-btn-soft" type="button" onClick={() => setReview(null)}>Close</button>}
  </section></div>}
  </div></AuthGate>;
}
