'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface SidebarProps {
  /** Kept for backward compatibility; the live session overrides it. */
  isAuthenticated?: boolean;
  username?: string;
}

/**
 * Line icons drawn inline so the sidebar carries no icon-font or image
 * dependency. They all share the same 20x20 stroke grid as the mockup.
 */
const icons: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 9.5 10 3l7 6.5" />
      <path d="M5 8.5V17h10V8.5" />
    </>
  ),
  routes: (
    <>
      <path d="M6 17a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 0 0-5" />
      <circle cx="14" cy="4.5" r="2.5" />
      <circle cx="14" cy="15.5" r="2.5" />
      <path d="M6 17h5.5a2.5 2.5 0 0 1 2.5 2.5" />
    </>
  ),
  buses: (
    <>
      <rect x="3" y="4" width="14" height="10" rx="2" />
      <path d="M3 9h14" />
      <circle cx="6.5" cy="16" r="1.4" />
      <circle cx="13.5" cy="16" r="1.4" />
    </>
  ),
  trips: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </>
  ),
  seats: (
    <>
      <path d="M5 4v8a2 2 0 0 0 2 2h6" />
      <path d="M5 16h10" />
      <path d="M14 8h1.5A1.5 1.5 0 0 1 17 9.5V16" />
    </>
  ),
  bookings: (
    <>
      <rect x="3.5" y="4" width="13" height="13" rx="2.5" />
      <path d="M7 2.6v3M13 2.6v3" />
      <path d="M3.5 9h13" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 6h14v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
      <path d="M10 7v2M10 12v2" />
    </>
  ),
  reservations: (
    <>
      <path d="M3 8.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2.5" />
      <path d="M3 8.5a1.8 1.8 0 0 0 0 3V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5a1.8 1.8 0 0 1 0-3" />
      <path d="M8 13.5h4" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="2.5" />
      <path d="M2.5 9h15" />
      <path d="M6 12.5h3" />
    </>
  ),
  users: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M3.5 16.5c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2" />
      <path d="M13.5 5.2a3 3 0 0 1 0 5.6" />
      <path d="M14.5 12.6c1.6.4 2.7 1.5 2.7 3.2" />
    </>
  ),
  messages: (
    <>
      <path d="M3 4.5h14v10H9l-4.5 3v-3H3z" />
      <path d="M6 8h8M6 11h5" />
    </>
  ),
  reports: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2.5" />
      <path d="M7 13V9M10 13V6M13 13v-2.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </>
  ),
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

export default function Sidebar({
  isAuthenticated = false,
  username = 'JoyBusUser',
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  // The sidebar is only ever mounted for a signed-in user, so the session name
  // is the source of truth here rather than the prop.
  const displayName = user?.name ?? username;
  const customerLinks = [
    { href: '/home', label: 'Home', icon: 'home' },
    { href: '/about', label: 'About Us', icon: 'routes' },
    { href: '/search', label: 'Search Trips', icon: 'trips' },
    { href: '/bookings', label: 'My Bookings', icon: 'bookings' },
    { href: '/my-ticket', label: 'My Ticket', icon: 'ticket' },
    { href: '/reservations', label: 'Reservations', icon: 'reservations' },
    { href: '/messages', label: 'Messages', icon: 'messages' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
    { href: '/profile', label: 'Profile', icon: 'users' },
  ];
  const adminLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: 'home' },
    { href: '/buses', label: 'Manage Buses', icon: 'buses' },
    { href: '/routes', label: 'Manage Routes', icon: 'routes' },
    { href: '/schedules', label: 'Schedules', icon: 'trips' },
    { href: '/bookings', label: 'Manage Bookings', icon: 'bookings' },
    { href: '/admin/payments', label: 'Review Payments', icon: 'payments' },
    { href: '/admin/scan-tickets', label: 'Scan Tickets', icon: 'ticket' },
    { href: '/users', label: 'Manage Users', icon: 'users' },
    { href: '/reports', label: 'Reports', icon: 'reports' },
    { href: '/messages', label: 'Messages', icon: 'messages' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
    { href: '/profile', label: 'Profile', icon: 'users' },
  ];
  const visibleNavLinks = user?.role === 'admin' ? adminLinks : customerLinks;

  const isActive = (path: string) =>
    path === '/home' ? pathname === '/home' : pathname.startsWith(path);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <aside className="ds-sidebar">
      {/* Brand lockup */}
      <div className="ds-sidebar-brand">
        <div className="ds-sidebar-logo">
          <Image src="/BUSLOGO.png" alt="Bus Ticket" width={512} height={512} priority />
        </div>
        <div className="ds-sidebar-brand-text">
          <strong>Bus Ticket</strong>
          <span>Management System</span>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="ds-nav-list" aria-label="Main">
        {visibleNavLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`ds-nav-item ${isActive(link.href) ? 'is-active' : ''}`}
          >
            <NavIcon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>

      {/* Signed-in identity */}
      <div className="ds-sidebar-foot">
        <div className="ds-sidebar-foot-avatar">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="10" cy="7" r="3.2" />
            <path d="M4.5 17c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
          </svg>
        </div>
        <div className="ds-sidebar-foot-text">
          <strong>{displayName}</strong>
          <span>Online</span>
        </div>
        <button
          type="button"
          className="ds-sidebar-logout"
          onClick={handleSignOut}
          title="Log out"
          aria-label="Log out"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12.5 6.5V4.5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-2" />
            <path d="M8 10h8.5M14 7.5 16.5 10 14 12.5" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
