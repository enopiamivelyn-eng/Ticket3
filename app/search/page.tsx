'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from '../components/AuthGate';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../components/AuthContext';
import { formatPrice } from '@/lib/routes';
import { formatScheduleTime } from '@/lib/schedule';

interface Trip {
  id: string;
  from: string;
  to: string;
  routeName: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price: number;
  availableSeats: number;
  capacity: number;
  bookedSeatNumbers: string[];
  busNumber: string;
  busModel: string;
}

interface RouteOption {
  id: string;
  name: string;
  from: string;
  to: string;
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function SearchPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [query, setQuery] = useState({ from: '', to: '', date: '', time: '', passengers: '1' });
  const [searchedQuery, setSearchedQuery] = useState<typeof query | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const origins = useMemo(() => Array.from(new Set(routes.map((route) => route.from))), [routes]);
  const destinations = useMemo(
    () => Array.from(new Set(routes.filter((route) => route.from === query.from).map((route) => route.to))),
    [routes, query.from],
  );

  const runSearch = useCallback(async (nextQuery: typeof query, updateAddress = false) => {
    setLoading(true);
    setError('');
    try {
      const apiQuery = new URLSearchParams(
        Object.entries(nextQuery).filter(([, value]) => value.trim()),
      );
      const response = await fetch(`/api/trips?${apiQuery.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not search trips.');
      setTrips(data.trips || []);
      setSearchedQuery(nextQuery);
      if (updateAddress) {
        const address = apiQuery.size ? `/search?${apiQuery.toString()}` : '/search';
        window.history.replaceState(null, '', address);
      }
    } catch (fetchError) {
      setTrips([]);
      setSearchedQuery(nextQuery);
      setError(fetchError instanceof Error ? fetchError.message : 'Could not search trips.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextQuery = {
      from: params.get('from') || '', to: params.get('to') || '',
      date: params.get('date') || '', time: params.get('time') || '',
      passengers: params.get('passengers') || '1',
    };
    setQuery(nextQuery);
    void runSearch(nextQuery);
    fetch('/api/routes')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load routes.');
        setRoutes(data.routes || []);
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : 'Could not load routes.'));
  }, [runSearch]);

  useEffect(() => {
    if (!searchedQuery) return;
    const refreshLiveResults = async () => {
      try {
        const apiQuery = new URLSearchParams(Object.entries(searchedQuery).filter(([, value]) => value.trim()));
        const [tripsResponse, routesResponse] = await Promise.all([
          fetch(`/api/trips?${apiQuery.toString()}`),
          fetch('/api/routes'),
        ]);
        if (tripsResponse.ok) {
          const data = await tripsResponse.json();
          setTrips(data.trips || []);
        }
        if (routesResponse.ok) {
          const data = await routesResponse.json();
          setRoutes(data.routes || []);
        }
      } catch {
        // Keep the last successful results visible while a refresh is unavailable.
      }
    };
    const interval = window.setInterval(() => void refreshLiveResults(), 10000);
    window.addEventListener('app:database-change', refreshLiveResults);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('app:database-change', refreshLiveResults);
    };
  }, [searchedQuery]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.from || !query.to) {
      setError('Choose both an origin and destination to search trips.');
      return;
    }
    void runSearch(query, true);
  };

  const searchedDate = searchedQuery?.date
    ? new Date(`${searchedQuery.date}T12:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Any date';
  const searchedTime = searchedQuery?.time
    ? formatScheduleTime(searchedQuery.time)
    : 'Any time';

  return (
    <AuthGate>
      <div className="ds-app">
        <Navbar user={{ name: user?.name ?? 'Traveller', role: user?.role ?? 'Passenger' }} />
        <div className="ds-app-body">
          <Sidebar isAuthenticated username={user?.name ?? 'Traveller'} />
          <main className="ds-page">
            <div className="ds-mb">
              <h1 className="ds-page-title">Search trips</h1>
              <p className="ds-page-sub">{query.from || 'Any origin'} → {query.to || 'Any destination'} · {query.date || 'Any date'} · {query.passengers} passenger(s)</p>
            </div>
            {error && <div className="ds-alert ds-alert-error" role="alert">{error}</div>}
            <form className="ds-card ds-card-pad ds-trip-grid ds-mb" onSubmit={submitSearch}>
              <div className="ds-field">
                <label className="ds-label" htmlFor="search-from">From</label>
                <select id="search-from" name="from" className="ds-select" value={query.from} required disabled={!origins.length} onChange={(event) => {
                  const from = event.target.value;
                  setQuery((current) => ({ ...current, from, to: '' }));
                }}>
                  <option value="">{origins.length ? 'Choose origin' : 'No routes available'}</option>
                  {origins.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                </select>
              </div>
              <div className="ds-field">
                <label className="ds-label" htmlFor="search-to">To</label>
                <select id="search-to" name="to" className="ds-select" value={query.to} required disabled={!destinations.length} onChange={(event) => setQuery((current) => ({ ...current, to: event.target.value }))}>
                  <option value="">{destinations.length ? 'Choose destination' : 'Select an origin first'}</option>
                  {destinations.map((destination) => <option key={destination} value={destination}>{destination}</option>)}
                </select>
              </div>
              <div className="ds-field">
                <label className="ds-label" htmlFor="search-date">Departure date</label>
                <input id="search-date" name="date" type="date" className="ds-input" min={todayLocal()} value={query.date} onChange={(event) => setQuery((current) => ({ ...current, date: event.target.value }))} />
              </div>
              <div className="ds-field">
                <label className="ds-label" htmlFor="search-time">Preferred time</label>
                <input id="search-time" name="time" type="time" className="ds-input" value={query.time} onChange={(event) => setQuery((current) => ({ ...current, time: event.target.value }))} />
              </div>
              <div className="ds-field">
                <label className="ds-label" htmlFor="search-passengers">Passengers</label>
                <select id="search-passengers" name="passengers" className="ds-select" value={query.passengers} onChange={(event) => setQuery((current) => ({ ...current, passengers: event.target.value }))}>
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} passenger{count === 1 ? '' : 's'}</option>)}
                </select>
              </div>
              <div className="ds-field">
                <button type="submit" className="ds-btn ds-btn-primary" disabled={loading || !origins.length}>{loading ? 'Searching…' : 'Search trips'}</button>
              </div>
            </form>
            {!loading && searchedQuery && <div className="ds-section-head">
              <div>
                <h2 className="ds-section-title">{trips.length ? 'Available buses' : 'Search results'}</h2>
                <p className="ds-section-sub">{searchedQuery.from || 'Any origin'} to {searchedQuery.to || 'Any destination'} · {searchedDate} · {searchedTime === 'Any time' ? searchedTime : `From ${searchedTime} onward`} · {searchedQuery.passengers} passenger{searchedQuery.passengers === '1' ? '' : 's'}</p>
              </div>
              {trips.length > 0 && <span className="ds-badge ds-badge-green">{trips.length} trip{trips.length === 1 ? '' : 's'} found</span>}
            </div>}
            {loading ? <p className="ds-note">Searching available trips…</p> : trips.length ? (
              <div className="ds-route-grid">
                {trips.map((trip) => {
                  const bookedSeats = new Set(trip.bookedSeatNumbers || []);
                  const freeSeats = Array.from({ length: trip.capacity }, (_, index) => `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`).filter((seat) => !bookedSeats.has(seat));
                  return (
                  <article className="ds-card ds-card-pad" key={trip.id}>
                    <div className="ds-section-head">
                      <div>
                        <h2 className="ds-card-title">{trip.from} → {trip.to}</h2>
                        <p className="ds-section-sub">{trip.routeName}</p>
                      </div>
                      <span className="ds-badge ds-badge-green">{trip.availableSeats} seats left</span>
                    </div>
                    <dl className="ds-search-details">
                      <div><dt>Operator / Bus</dt><dd>{trip.busModel} · {trip.busNumber}</dd></div>
                      <div><dt>Departure</dt><dd>{trip.departureDate} · {formatScheduleTime(trip.departureTime)}</dd></div>
                      <div><dt>Arrival / Duration</dt><dd>{formatScheduleTime(trip.arrivalTime)} · {trip.duration}</dd></div>
                      <div><dt>Fare per passenger</dt><dd>{formatPrice(trip.price)}</dd></div>
                      <div className="ds-search-available-seats"><dt>Available seat numbers ({freeSeats.length})</dt><dd>{freeSeats.length ? freeSeats.join(', ') : 'No seats available'}</dd></div>
                    </dl>
                    <Link className="ds-btn ds-btn-primary ds-btn-block" href={`/book-details?tripId=${encodeURIComponent(trip.id)}&date=${encodeURIComponent(trip.departureDate)}&passengers=${encodeURIComponent(query.passengers)}`}>
                      Book now
                    </Link>
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className="ds-empty"><h2>No matching buses</h2><p>No available trips matched {searchedQuery?.from || 'any origin'} to {searchedQuery?.to || 'any destination'} on {searchedDate} {searchedTime === 'Any time' ? '' : `from ${searchedTime} onward `}for {searchedQuery?.passengers || query.passengers} passenger{(searchedQuery?.passengers || query.passengers) === '1' ? '' : 's'}.</p><p>Change your search filters above to see other available trips.</p></div>
            )}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
