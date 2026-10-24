import Image from 'next/image';
import Link from 'next/link';
import GuestNavbar from './components/GuestNavbar';
import { popularRoutes, formatPrice } from '@/lib/routes';

const infoStrip = [
  { label: 'Easy reservations', text: 'Choose your route and seats', icon: 'ticket' },
  { label: 'Flexible booking', text: 'Start without signing in', icon: 'seat' },
  { label: 'Philippines routes', text: 'Find a trip that fits your plans', icon: 'pin' },
  { label: 'Trip details', text: 'See fares and journey times', icon: 'signal' },
];

const routePhotos = [
  'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1509749837427-ac6a7ec5b52f?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?auto=format&fit=crop&w=900&q=85',
];

const infoIcons: Record<string, React.ReactNode> = {
  ticket: (
    <>
      <path d="M3 8.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2.5" />
      <path d="M3 8.5a1.8 1.8 0 0 0 0 3V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5a1.8 1.8 0 0 1 0-3" />
    </>
  ),
  seat: (
    <>
      <path d="M5 4v8a2 2 0 0 0 2 2h6" />
      <path d="M5 16h10" />
      <path d="M14 8h1.5A1.5 1.5 0 0 1 17 9.5V16" />
    </>
  ),
  pin: (
    <>
      <path d="M10 17.5s5.5-4.6 5.5-8.8A5.5 5.5 0 0 0 4.5 8.7c0 4.2 5.5 8.8 5.5 8.8Z" />
      <circle cx="10" cy="8.6" r="1.9" />
    </>
  ),
  signal: (
    <>
      <path d="M4 14V9M8 14V5M12 14v-3M16 14v-6" />
    </>
  ),
};

export default function LandingPage() {
  return (
    <div className="ds-app">
      <GuestNavbar showSiteLinks />

      {/* No sidebar: a visitor who has not logged in gets a single column.
          The hero is full-bleed; everything below it is centred. */}
      <main className="ds-landing">
        {/* Public hero — the login form now lives on /login */}
        <section className="ds-hero ds-hero-full">
            <div className="ds-hero-scenery">
              <Image src="/hero-bus.png" alt="" fill priority sizes="100vw" />
            </div>

            <div className="ds-hero-copy">
              <p className="ds-hero-eyebrow">BUS TICKETS · PHILIPPINES</p>
              <h1 className="ds-hero-heading">
                Your next bus trip,
                <br />
                <span>made simple.</span>
              </h1>
              <p className="ds-hero-sub">
                Find your route, compare trip details, and reserve your seat in just a few steps.
              </p>
              <div className="ds-hero-actions">
                <Link href="/reserve" className="ds-btn ds-btn-primary ds-btn-lg">
                  Reserve a Seat <span aria-hidden="true">→</span>
                </Link>
                <Link href="/login" className="ds-btn ds-btn-outline ds-btn-lg">
                  Sign in to your account
                </Link>
              </div>
            </div>
            <aside className="ds-hero-booking-card">
              <span className="ds-hero-booking-kicker">PLAN YOUR JOURNEY</span>
              <h2>Where would you like to go?</h2>
              <p>Choose from available routes and see fares before you reserve.</p>
              <Link href="/reserve" className="ds-hero-booking-link">
                Browse routes <span aria-hidden="true">→</span>
              </Link>
              <div className="ds-hero-booking-note">
                <span aria-hidden="true">✓</span> Start a reservation without signing in
              </div>
            </aside>
        </section>

        <div className="ds-landing-inner">
          {/* Live status strip */}
          <section className="ds-info-strip ds-mb">
            {infoStrip.map((item) => (
              <div key={item.label} className="ds-info-item">
                <span className="ds-info-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {infoIcons[item.icon]}
                  </svg>
                </span>
                <span className="ds-info-text">
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </span>
              </div>
            ))}
          </section>

          {/* Popular routes */}
          <div className="ds-section-head">
            <div>
              <h2 className="ds-section-title">Plan your next trip</h2>
              <p className="ds-section-sub">Explore popular journeys and check fares per seat</p>
            </div>
            <Link href="/reserve" className="ds-link">See booking options</Link>
          </div>

          <div className="ds-route-grid ds-mb">
            {popularRoutes.map((route, index) => (
              <Link key={route.id} href="/reserve" className="ds-route-card">
                <div className="ds-route-media" style={{ backgroundImage: `linear-gradient(0deg, rgba(4, 40, 32, .16), rgba(4, 40, 32, .02)), url("${routePhotos[index % routePhotos.length]}")` }}>
                  <span className="ds-route-photo-label">BUS JOURNEY</span>
                </div>
                <div className="ds-route-body">
                  <span className="ds-route-name">
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M10 17.5s5.5-4.6 5.5-8.8A5.5 5.5 0 0 0 4.5 8.7c0 4.2 5.5 8.8 5.5 8.8Z" />
                    </svg>
                    {route.from} → {route.to}
                  </span>
                  <span className="ds-route-meta">
                    <span className="ds-route-price">{formatPrice(route.price)}</span>
                    <span className="ds-route-duration">{route.duration}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="ds-card ds-card-pad">
            <div className="ds-card-head">
              <div>
                <h2 className="ds-card-title">Ready to travel?</h2>
                <p className="ds-card-sub">
                  Hold a seat now and pay at the terminal, no account needed.
                </p>
              </div>
              <Link href="/reserve" className="ds-btn ds-btn-primary">
                Reserve Now
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
