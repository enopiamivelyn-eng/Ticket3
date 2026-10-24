'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import GuestNavbar from '../components/GuestNavbar';
import { useAuth } from '../components/AuthContext';
import { formatPrice } from '@/lib/routes';
import { formatScheduleTime } from '@/lib/schedule';
import { normalizeBookedSeatNumbers, toggleSeatSelection } from '@/lib/seats';

interface RouteOption {
  id: number | string;
  name: string;
  from: string;
  to: string;
}

interface TripOption {
  id: string;
  routeId: string;
  routeName: string;
  from: string;
  to: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  availableSeats: number;
  bookedSeatNumbers: string[];
  busNumber: string;
  busModel: string;
  capacity: number;
  duration: string;
}

function localDateString() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function prettyDate(value: string) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function ReservePage() {
  const { user, loading: authLoading } = useAuth();
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [travelDate, setTravelDate] = useState(localDateString);
  const [passengers, setPassengers] = useState(1);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripOption | null>(null);
  const [seatNumbers, setSeatNumbers] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedFilters, setSearchedFilters] = useState<{ origin: string; destination: string; travelDate: string; passengers: number } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [passengerCategory, setPassengerCategory] = useState('');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState('');

  useEffect(() => {
    let active = true;
    const refreshRoutes = () => fetch('/api/routes', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load routes.');
        if (!active) return;
        const availableRoutes: RouteOption[] = data.routes || [];
        setRoutes(availableRoutes);
        if (availableRoutes.length) {
          setOrigin(availableRoutes[0].from);
          setDestination(availableRoutes[0].to);
        }
      })
      .catch((requestError) => {
        if (active) setSearchError(requestError instanceof Error ? requestError.message : 'Could not load routes.');
      });
    void refreshRoutes();
    const interval = window.setInterval(() => { void refreshRoutes(); }, 10000);
    window.addEventListener('app:database-change', refreshRoutes);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('app:database-change', refreshRoutes);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setPassengerName((current) => current || user.name || '');
    setEmail((current) => current || user.email || '');
    setContactNumber((current) => current || user.phone || '');
  }, [user]);

  useEffect(() => {
    if (!idFile) { setIdPreview(''); return; }
    const url = URL.createObjectURL(idFile);
    setIdPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [idFile]);

  const origins = useMemo(() => Array.from(new Set(routes.map((route) => route.from))), [routes]);
  const destinations = useMemo(
    () => Array.from(new Set(routes.filter((route) => route.from === origin).map((route) => route.to))),
    [routes, origin],
  );
  const signedIn = Boolean(user) && !authLoading;
  const baseTotal = selectedTrip ? selectedTrip.price * passengers : 0;
  const total = baseTotal;
  const takenSeatNumbers = normalizeBookedSeatNumbers(selectedTrip?.bookedSeatNumbers);
  const canSubmit = Boolean(
    signedIn && passengerCategory && (passengerCategory === 'regular' || idFile) && selectedTrip && seatNumbers.length === passengers && passengerName.trim() &&
    contactNumber.trim() && /^\S+@\S+\.\S+$/.test(email.trim())
  );

  const searchTrips = useCallback(async () => {
    setSearchError('');
    setIsSearching(true);
    setSelectedTrip(null);
    setSeatNumbers([]);
    setHasSearched(true);
    setSearchedFilters({ origin, destination, travelDate, passengers });
    try {
      const query = new URLSearchParams({ from: origin, to: destination, date: travelDate, passengers: String(passengers) });
      const response = await fetch(`/api/trips?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not search trips.');
      setTrips(data.trips || []);
      window.setTimeout(() => document.getElementById('booking-step-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (requestError) {
      setTrips([]);
      setSearchError(requestError instanceof Error ? requestError.message : 'Could not search trips.');
    } finally {
      setIsSearching(false);
    }
  }, [origin, destination, travelDate, passengers]);

  useEffect(() => {
    if (!searchedFilters) return;
    const refreshLiveResults = async () => {
      try {
        const query = new URLSearchParams({
          from: searchedFilters.origin,
          to: searchedFilters.destination,
          date: searchedFilters.travelDate,
          passengers: String(searchedFilters.passengers),
        });
        const response = await fetch(`/api/trips?${query.toString()}`);
        if (!response.ok) return;
        const data = await response.json();
        const latestTrips: TripOption[] = data.trips || [];
        setTrips(latestTrips);
        setSelectedTrip((current) => current ? latestTrips.find((trip) => trip.id === current.id) ?? null : current);
      } catch {
        // Keep the last successful results visible if a refresh fails.
      }
    };
    const interval = window.setInterval(() => void refreshLiveResults(), 10000);
    window.addEventListener('app:database-change', refreshLiveResults);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('app:database-change', refreshLiveResults);
    };
  }, [searchedFilters]);

  const resetSearch = () => {
    setHasSearched(false);
    setTrips([]);
    setSelectedTrip(null);
    setSeatNumbers([]);
    setSearchError('');
  };

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!user) {
      setError('Sign in to confirm and save your booking. Your selected trip and seats are ready below.');
      return;
    }
    if (!selectedTrip || seatNumbers.length !== passengers) {
      setError(`Choose a trip and ${passengers} available seat${passengers === 1 ? '' : 's'} first.`);
      return;
    }
    if (passengerCategory !== 'regular' && !idFile) {
      setError('Upload the passenger category ID image before submitting this booking.');
      return;
    }
    setIsSubmitting(true);
    try {
      const form = new FormData();
      form.set('tripId', selectedTrip.id);
      form.set('seatNumber', seatNumbers[0]);
      form.set('seatNumbers', JSON.stringify(seatNumbers));
      form.set('passengerName', passengerName.trim());
      form.set('passengerEmail', email.trim());
      form.set('passengerPhone', contactNumber.trim());
      form.set('passengerCategory', passengerCategory);
      if (passengerCategory !== 'regular' && idFile) form.set('idImage', idFile);
      const response = await fetch('/api/bookings', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create your booking.');
      if (passengerCategory !== 'regular') {
        window.location.assign('/bookings?discount=pending');
      } else {
        window.location.assign(`/payment?bookingId=${encodeURIComponent(data.booking.id)}`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create your booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSeat = (seat: string) => {
    setSeatNumbers((current) => toggleSeatSelection(current, seat, passengers));
  };

  return (
    <div className="ds-app ds-app-booking">
      <GuestNavbar activeLabel="Log in" showSiteLinks activeSiteLabel="Online Booking" />

      <header className="ds-booking-hero">
        <div className="ds-booking-hero-content">
          <p className="ds-booking-eyebrow">BUS TICKETS · PHILIPPINES</p>
          <h1>Book your bus journey</h1>
          <p className="ds-booking-intro">Travel comfortably across the Philippines with Bus Ticket.</p>
          <p className="ds-booking-subintro">Choose a route, compare departure times, and reserve the seats you need.</p>
        </div>
        <section className="ds-online-search-card" aria-labelledby="online-search-title">
          <div className="ds-online-search-heading">
            <div>
              <span>START YOUR BOOKING</span>
              <h2 id="online-search-title">Where would you like to go?</h2>
            </div>
            <span className="ds-online-way-badge">One way</span>
          </div>
          <div className="ds-online-search-fields">
            <label className="ds-booking-field" htmlFor="booking-origin">
              <span>From</span>
              <select id="booking-origin" value={origin} onChange={(event) => {
                const nextOrigin = event.target.value;
                setOrigin(nextOrigin);
                setDestination(routes.find((route) => route.from === nextOrigin)?.to || '');
                resetSearch();
              }} required disabled={!routes.length}>
                {origins.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>
            <label className="ds-booking-field" htmlFor="booking-destination">
              <span>To</span>
              <select id="booking-destination" value={destination} onChange={(event) => { setDestination(event.target.value); resetSearch(); }} required disabled={!destinations.length}>
                {destinations.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>
            <label className="ds-booking-field" htmlFor="booking-date">
              <span>Departure</span>
              <input id="booking-date" type="date" value={travelDate} min={localDateString()} onChange={(event) => { setTravelDate(event.target.value); resetSearch(); }} required />
            </label>
            <label className="ds-booking-field" htmlFor="booking-passengers">
              <span>Passengers</span>
              <select id="booking-passengers" value={passengers} onChange={(event) => { setPassengers(Number(event.target.value)); resetSearch(); }}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'Person' : 'People'}</option>)}
              </select>
            </label>
            <button className="ds-booking-search-button" type="button" onClick={() => {
              if (!origin || !destination || !travelDate) {
                setSearchError('Choose an origin, destination, and departure date to search.');
                return;
              }
              void searchTrips();
            }} disabled={isSearching}>
              {isSearching ? 'Searching…' : 'Search Trips'} <span aria-hidden="true">→</span>
            </button>
          </div>
          {searchError && <div className="ds-alert ds-alert-error ds-online-search-error" role="alert">{searchError}</div>}
          <p className="ds-online-search-note">✓ Search trips without signing in <span>·</span> Sign in to confirm your booking</p>
        </section>
        <ul className="ds-booking-benefits" aria-label="Booking benefits">
          <li>Instant trip details</li><li>Choose your own seat</li><li>Secure online booking</li>
        </ul>
      </header>

      <main className="ds-booking-main">
        <div className="ds-booking-layout">
          <form id="bus-booking-form" className="ds-booking-flow" onSubmit={submitBooking}>
            {error && <div className="ds-alert ds-alert-error" role="alert">{error}</div>}

            <section id="booking-step-2" className="ds-booking-step-card" aria-labelledby="booking-step-2-title">
              <p className="ds-booking-step-label">STEP 2 · AVAILABLE TRIPS</p>
              <h2 id="booking-step-2-title">Choose your trip</h2>
              <p className="ds-booking-step-copy">Tap a trip to select it.</p>
              {!hasSearched ? (
                <div className="ds-booking-empty">Search a route to see available buses.</div>
              ) : trips.length ? (
                <div className="ds-booking-trips">
                  {trips.map((trip) => {
                    const isSelected = selectedTrip?.id === trip.id;
                    return (
                      <button key={trip.id} type="button" className={`ds-booking-trip ${isSelected ? 'is-selected' : ''}`} onClick={() => { setSelectedTrip(trip); setSeatNumbers([]); setError(''); }} aria-pressed={isSelected}>
                        <span className="ds-booking-trip-main">
                          <strong>{trip.from} → {trip.to}</strong>
                          <small>{formatScheduleTime(trip.departureTime)} · {trip.busModel} · {trip.busNumber}</small>
                          <span className="ds-booking-badges"><em>Air-conditioned</em><em>{trip.duration}</em><em>{trip.availableSeats} seats left</em></span>
                        </span>
                        <strong className="ds-booking-trip-price">{formatPrice(trip.price)}</strong>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ds-booking-empty">No buses found for this route and date. Try another day or destination.</div>
              )}
            </section>

            <section className="ds-booking-step-card" aria-labelledby="booking-step-3">
              <p className="ds-booking-step-label">STEP 3 · SEAT SELECTION</p>
              <h2 id="booking-step-3">Choose your seat</h2>
              <p className="ds-booking-step-copy">Select a trip first, then tap the seats you want.</p>
              <div className="ds-seat-legend">
                <span><i className="is-available" /> Available</span>
                <span><i className="is-chosen" /> Selected</span>
                <span><i className="is-taken" /> Taken</span>
              </div>
              {selectedTrip ? (
                <>
                  <div className="ds-booking-bus">
                    <div className="ds-booking-driver">DRIVER</div>
                    <div className="ds-booking-seat-grid" role="group" aria-label="Choose seats">
                      {Array.from({ length: selectedTrip.capacity }, (_, index) => {
                        const seat = `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`;
                        const isTaken = takenSeatNumbers.has(seat);
                        const isChosen = seatNumbers.includes(seat);
                        return <button key={seat} type="button" className={`ds-booking-seat ${isChosen ? 'is-chosen' : ''} ${isTaken ? 'is-taken' : ''}`} disabled={isTaken} aria-disabled={isTaken} aria-label={`Seat ${seat}${isTaken ? ', already taken' : isChosen ? ', selected' : ', available'}`} aria-pressed={isChosen} onClick={() => toggleSeat(seat)}>{seat}</button>;
                      })}
                    </div>
                  </div>
                  <p className="ds-booking-selection-note">{seatNumbers.length} of {passengers} seat{passengers === 1 ? '' : 's'} selected. Tap another available seat to change your selection.</p>
                </>
              ) : <div className="ds-booking-empty">Available seats will appear after you choose a trip.</div>}
            </section>

            <section className="ds-booking-step-card" aria-labelledby="booking-step-4">
              <p className="ds-booking-step-label">STEP 4 · PASSENGER DETAILS</p>
              <h2 id="booking-step-4">Who is travelling?</h2>
              <div className="ds-booking-passenger-grid">
                <label className="ds-booking-field" htmlFor="passenger-name"><span>Full name</span><input id="passenger-name" value={passengerName} onChange={(event) => setPassengerName(event.target.value)} placeholder="As shown on your ID" autoComplete="name" required /></label>
                <label className="ds-booking-field" htmlFor="passenger-phone"><span>Mobile number</span><input id="passenger-phone" type="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder="e.g. 0917 123 4567" autoComplete="tel" required /></label>
                <label className="ds-booking-field" htmlFor="passenger-email"><span>Email</span><input id="passenger-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
                <label className="ds-booking-field" htmlFor="passenger-category"><span>Passenger category</span><select id="passenger-category" value={passengerCategory} onChange={(event) => { setPassengerCategory(event.target.value); setIdFile(null); setError(''); }} required><option value="">Select passenger category</option><option value="regular">Regular Passenger · 0%</option><option value="student">Student · 20% after approval</option><option value="senior_citizen">Senior Citizen · 20% after approval</option><option value="pwd">PWD (Person with Disability) · 20% after approval</option></select></label>
              </div>
              {passengerCategory !== '' && passengerCategory !== 'regular' && <div className="ds-card ds-card-pad" style={{ marginTop: 16 }}>
                <strong>Passenger ID image (required)</strong>
                <p className="ds-card-sub">Upload the eligible category ID here with your booking. The image is private. The booking fare remains provisional at the regular rate until an administrator approves the ID; approval applies the 20% discount.</p>
                <label className="ds-booking-field" htmlFor="booking-discount-id"><span>Choose JPG, JPEG, or PNG image (up to 5 MB)</span><input key={passengerCategory} id="booking-discount-id" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" required onChange={(event) => { const file = event.target.files?.[0] || null; if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type))) { setError('Choose a JPG, JPEG, or PNG image smaller than 5 MB.'); event.target.value = ''; setIdFile(null); return; } setError(''); setIdFile(file); }} /></label>
                {idPreview && <img src={idPreview} alt="Preview of selected passenger ID image" style={{ display: 'block', maxWidth: 320, maxHeight: 220, objectFit: 'contain', marginTop: 12, borderRadius: 8 }} />}
                {idFile && <p>{idFile.name} · Ready to submit with booking. Choose another file to replace it.</p>}
                <p>Status after booking: Pending administrator verification.</p>
              </div>}
            </section>
          </form>

          <aside className="ds-booking-summary-card">
            <p className="ds-booking-step-label">YOUR RESERVATION</p>
            <h2>Trip summary</h2>
            <dl className="ds-booking-summary-list">
              <div><dt>Route</dt><dd>{selectedTrip ? `${selectedTrip.from} → ${selectedTrip.to}` : '—'}</dd></div>
              <div><dt>Date</dt><dd>{selectedTrip ? prettyDate(selectedTrip.departureDate) : '—'}</dd></div>
              <div><dt>Departure</dt><dd>{selectedTrip ? formatScheduleTime(selectedTrip.departureTime) : '—'}</dd></div>
              <div><dt>Seats</dt><dd>{seatNumbers.length ? seatNumbers.join(', ') : '—'}</dd></div>
              {passengerCategory && <div><dt>Category discount</dt><dd>{passengerCategory === 'regular' ? '0% · Not required' : '20% after ID approval'}</dd></div>}
              <div className="is-total"><dt>Total</dt><dd>{formatPrice(total)}</dd></div>
            </dl>
            {!passengerCategory && <p className="ds-note">Choose a passenger category to continue.</p>}
            {passengerCategory !== '' && passengerCategory !== 'regular' && <p className="ds-note">ID status will be Pending after submission. Fare shown is provisional; payment is available after administrator review.</p>}
            {signedIn ? (
              <button className="ds-booking-confirm" type="submit" form="bus-booking-form" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? 'Saving booking…' : 'Reserve a Seat'} <span aria-hidden="true">→</span>
              </button>
            ) : authLoading ? (
              <button className="ds-booking-confirm" type="button" disabled>Checking your account…</button>
            ) : (
              <Link className="ds-booking-confirm" href="/login">Sign in to reserve <span aria-hidden="true">→</span></Link>
            )}
            <Link className="ds-booking-signin" href={signedIn ? '/home' : '/login'}>{signedIn ? 'Go to your account' : 'Sign in to your account'}</Link>
            {!signedIn && !authLoading && <p className="ds-booking-auth-note">Your selected trip is not saved until you sign in and confirm.</p>}
          </aside>
        </div>
      </main>
    </div>
  );
}
