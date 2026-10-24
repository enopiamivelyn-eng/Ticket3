import Link from 'next/link';
import GuestNavbar from './components/GuestNavbar';

export default function NotFound() {
  return (
    <div className="ds-app">
      <GuestNavbar />

      <main className="ds-auth">
          <div className="ds-auth-card">
            <div className="ds-auth-icon" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              >
                <circle cx="10" cy="10" r="7.2" />
                <path d="M10 6.2v4.4M10 13.6h.01" />
              </svg>
            </div>

            <div className="ds-auth-head">
              <h1 className="ds-auth-title">Page not found</h1>
              <p className="ds-auth-sub">
                That route doesn&apos;t go anywhere — let&apos;s get you back on
                board.
              </p>
            </div>

            <div className="ds-form">
              <Link href="/" className="ds-btn ds-btn-primary ds-btn-block">
                Back to Home
              </Link>
              <Link href="/reserve" className="ds-btn ds-btn-outline ds-btn-block">
                Book a Ticket
              </Link>
            </div>
          </div>
        </main>
    </div>
  );
}
