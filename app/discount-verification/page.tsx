'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGate from '../components/AuthGate';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../components/AuthContext';

type Verification = { id: string; passengerCategory: string; verificationStatus: string; adminRemarks: string | null; submittedAt: string; reviewedAt: string | null; imageUrl: string; fileName: string };
const names: Record<string, string> = { student: 'Student', pwd: 'PWD', senior_citizen: 'Senior Citizen' };

export default function DiscountVerificationPage() {
  const { user } = useAuth();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifiedCategories, setVerifiedCategories] = useState<string[]>([]);
  const [canSubmit, setCanSubmit] = useState(true);
  const [category, setCategory] = useState('student');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/discount-verifications', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load your verification status.');
      setVerification(data.verification || null);
      setVerifiedCategories(data.verifiedCategories || []);
      setCanSubmit(data.canSubmit !== false);
      if (data.verification) setCategory(data.verification.passengerCategory);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your status.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    window.addEventListener('app:database-change', load);
    return () => { window.clearInterval(timer); window.removeEventListener('app:database-change', load); };
  }, [user, load]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) { setError('Choose an ID image first.'); return; }
    setSubmitting(true); setError(''); setNotice('');
    try {
      const form = new FormData(); form.set('passengerCategory', category); form.set('idImage', file);
      const response = await fetch('/api/discount-verifications', { method: 'POST', credentials: 'include', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit the ID.');
      setFile(null); setNotice('Your ID was submitted securely and is waiting for administrator review.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit the ID.'); }
    finally { setSubmitting(false); }
  };

  const pendingExists = verification?.verificationStatus === 'pending';
  const alreadyVerified = verifiedCategories.includes(category);
  return <AuthGate><div className="ds-app"><Navbar user={{ name: user?.name ?? 'Passenger', role: user?.role ?? 'Passenger' }} /><div className="ds-app-body"><Sidebar isAuthenticated username={user?.name ?? 'Passenger'} /><main className="ds-page">
    <div className="ds-mb"><h1 className="ds-page-title">Passenger discount verification</h1><p className="ds-page-sub">Submit a valid Student, PWD, or Senior Citizen ID. Your image is stored privately and only you and authorized administrators can view it.</p></div>
    {error && <div className="ds-alert ds-alert-error ds-mb" role="alert">{error}</div>}{notice && <div className="ds-alert ds-alert-success ds-mb" role="status">{notice}</div>}
    {loading ? <p className="ds-note">Loading verification status…</p> : <div className="ds-card ds-card-pad">
      <h2>Current application</h2>
      {verification ? <><p><strong>Category:</strong> {names[verification.passengerCategory] || verification.passengerCategory}</p><p><strong>Status:</strong> {verification.verificationStatus === 'pending' ? 'Pending — your ID is waiting for admin verification.' : verification.verificationStatus === 'verified' ? 'Verified — your discount eligibility has been approved.' : 'Rejected — review the administrator’s remarks and submit an updated document.'}</p><p><strong>File:</strong> {verification.fileName}</p><p><strong>Submitted:</strong> {new Date(verification.submittedAt).toLocaleString()}</p>{verification.reviewedAt && <p><strong>Reviewed:</strong> {new Date(verification.reviewedAt).toLocaleString()}</p>}{verification.adminRemarks && <p><strong>Admin remarks:</strong> {verification.adminRemarks}</p>}<a href={verification.imageUrl} target="_blank" rel="noreferrer"><img src={verification.imageUrl} alt="Your privately stored ID submission" style={{ maxWidth: 360, maxHeight: 240, objectFit: 'contain', borderRadius: 8 }} /></a></> : <p>No ID has been submitted yet.</p>}
      {pendingExists && <p role="status">Your pending application must be reviewed before another ID can be submitted.</p>}
      <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 24, maxWidth: 520 }}>
        <label htmlFor="discount-category">Passenger category<select id="discount-category" value={category} onChange={(event) => setCategory(event.target.value)} disabled={pendingExists} style={{ display: 'block', width: '100%', marginTop: 6 }}><option value="student">Student</option><option value="pwd">PWD</option><option value="senior_citizen">Senior Citizen</option></select></label>
        {alreadyVerified ? <p>This category is already verified. The eligible 20% fare discount is applied by the booking server.</p> : <>
          <label htmlFor="discount-id-file">Upload a clear JPG or PNG image (maximum 5 MB)<input id="discount-id-file" type="file" accept="image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={!canSubmit || submitting} style={{ display: 'block', marginTop: 6 }} /></label>
          {file && <p>{file.name} · {Math.ceil(file.size / 1024)} KB</p>}
          {preview && <img src={preview} alt="Preview of the ID selected for upload" style={{ maxWidth: 360, maxHeight: 240, objectFit: 'contain', borderRadius: 8 }} />}
          <button type="submit" className="ds-btn ds-btn-primary" disabled={!canSubmit || !file || submitting}>{submitting ? 'Submitting…' : verification?.verificationStatus === 'rejected' ? 'Replace ID and resubmit' : 'Submit ID for verification'}</button>
        </>}
      </form>
      <p className="ds-note" style={{ marginTop: 20 }}>A selected category alone does not qualify for a discount. Pending or rejected applications receive no discount. For a verified special-category fare, book one passenger per booking; extra seats require their own eligible passenger.</p>
      <Link href="/bookings">View my bookings</Link>
    </div>}
  </main></div></div></AuthGate>;
}
