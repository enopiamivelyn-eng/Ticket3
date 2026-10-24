'use client';

import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import AuthGate from '../components/AuthGate';
import { useAuth } from '../components/AuthContext';
import { formatScheduleTime } from '@/lib/schedule';
import { normalizeBookedSeatNumbers, toggleSeatSelection } from '@/lib/seats';
import Navbar from '../components/Navbar';
import { formatPrice } from '@/lib/routes';

interface Trip {
  id: string;
  routeId: string;
  busId: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  availableSeats: number;
  bookedSeatNumbers?: string[];
  routeName: string;
  from: string;
  to: string;
  duration: string;
  busNumber: string;
  busModel: string;
  capacity: number;
  status: string;
}

function BookingFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId');
  const dateParam = searchParams.get('date');
  
  const { user } = useAuth();
  const username = user?.name ?? 'Traveller';
  
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedTripId, setSelectedTripId] = useState(tripId || '');
  const [passengers, setPassengers] = useState(() => Math.max(1, Math.min(10, Number(searchParams.get('passengers')) || 1)));
  const [seatNumbers, setSeatNumbers] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState(user?.name || '');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState(user?.email || '');

  // Fetch available trips
  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const tripDate = dateParam || new Date().toISOString().split('T')[0];
        const response = await fetch(`/api/trips?date=${encodeURIComponent(tripDate)}&passengers=${passengers}`);
        
        if (response.ok) {
          const data = await response.json();
          setTrips(data.trips || []);
          
          // If tripId is provided, pre-select it
          if (tripId) {
            const trip = data.trips.find((t: Trip) => t.id === tripId);
            if (trip) {
              setSelectedTrip(trip);
              setSelectedTripId(tripId);
            }
          }
        } else {
          const data = await response.json().catch(() => ({}));
          setError(data.error || `Failed to load trips (HTTP ${response.status}).`);
        }
      } catch (err) {
        console.error('Error fetching trips:', err);
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
    
    // Poll for real-time seat updates every 30 seconds
    const interval = setInterval(fetchTrips, 10000);
    window.addEventListener('app:database-change', fetchTrips);
    return () => {
      clearInterval(interval);
      window.removeEventListener('app:database-change', fetchTrips);
    };
  }, [tripId, dateParam, passengers]);

  // Update selected trip when selection changes
  useEffect(() => {
    if (selectedTripId) {
      const trip = trips.find(t => t.id === selectedTripId);
      setSelectedTrip(trip || null);
      
      // Auto-generate seat numbers when passengers change
      if (trip) {
        setSeatNumbers((current) => current.filter((seat) => !trip.bookedSeatNumbers?.includes(seat)).slice(0, passengers));
      }
    }
  }, [selectedTripId, passengers, trips]);

  const totalPrice = selectedTrip ? selectedTrip.price * passengers : 0;
  const takenSeatNumbers = normalizeBookedSeatNumbers(selectedTrip?.bookedSeatNumbers);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTrip) {
      alert('Please select a trip');
      return;
    }

    if (passengers > selectedTrip.availableSeats) {
      alert(`Only ${selectedTrip.availableSeats} seats available for this trip`);
      return;
    }

    if (seatNumbers.length !== passengers) {
      setError(`Select ${passengers} available seat${passengers === 1 ? '' : 's'} to continue.`);
      return;
    }

    if (!passengerName.trim()) {
      setError('Enter the lead passenger name to continue.');
      return;
    }
    if (!contactNumber.trim()) {
      setError('Enter a contact number to continue.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address to continue.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tripId: selectedTrip.id,
          seatNumber: seatNumbers[0] || 'A1',
          seatNumbers,
          passengerName: passengerName.trim(),
          passengerEmail: email.trim(),
          passengerPhone: contactNumber.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.booking?.id) {
        router.push(`/payment?bookingId=${data.booking.id}`);
      } else {
        setError(data.error || 'Your booking was not created. Please review your trip and passenger details and try again.');
      }
    } catch (requestError) {
      console.error('Error creating booking:', requestError);
      setError('Could not reach the booking service. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const [dateValue, timeValue = ''] = dateString.split('T');
    const date = new Date(`${dateValue}T12:00:00`);
    return {
      date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      time: formatScheduleTime(timeValue),
    };
  };

  return (
      <div className="ds-app">
        <Navbar user={{ name: user?.name ?? 'Traveller', role: user?.role ?? 'Passenger' }} />

        <div className="ds-app-body">
          <Sidebar isAuthenticated username={username} />

          <main className="ds-page">
            <div className="ds-mb">
              <h1 className="ds-page-title">Book Your Ticket</h1>
              <p className="ds-page-sub">
                Fill in the details to reserve your seat
              </p>
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

            {loading ? (
              <div className="ds-empty">
                <div className="loading" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>Loading trips...</p>
              </div>
            ) : trips.length === 0 ? (
              <div className="ds-empty">
                <h3>No trips available</h3>
                <p>There are no scheduled trips at the moment. Please check back later.</p>
                <Link href="/home" className="ds-btn ds-btn-primary" style={{ marginTop: '1rem' }}>
                  Back to Home
                </Link>
              </div>
            ) : (
              <div className="ds-pay-grid">
                <form onSubmit={handleSubmit} className="ds-form" noValidate>
                  {/* Trip details */}
                  <div className="ds-card ds-card-pad">
                    <div className="ds-card-head">
                      <h2 className="ds-card-title">Trip Details</h2>
                    </div>

                    <div className="ds-form" style={{ gap: '0.9rem' }}>
                      <div className="ds-field">
                        <label htmlFor="trip" className="ds-label">Select Trip *</label>
                        <select
                          id="trip"
                          value={selectedTripId}
                          onChange={(e) => { setSeatNumbers([]); setSelectedTripId(e.target.value); }}
                          className="ds-select"
                          required
                        >
                          <option value="">Choose a trip</option>
                          {trips.map((trip) => {
                            const dt = formatDateTime(trip.departureDate + 'T' + trip.departureTime);
                            return (
                              <option key={trip.id} value={trip.id}>
                                {trip.from} → {trip.to} | {dt.date} at {dt.time} | {formatPrice(trip.price)} | {trip.availableSeats} seats left
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="ds-field">
                        <label htmlFor="passengers" className="ds-label">Number of Passengers *</label>
                        <input
                          type="number"
                          id="passengers"
                          value={passengers}
                          onChange={(e) => setPassengers(parseInt(e.target.value) || 1)}
                          className="ds-input"
                          min="1"
                          max={selectedTrip ? Math.min(10, selectedTrip.availableSeats) : 10}
                          required
                        />
                        {selectedTrip && (
                          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem' }}>
                            {selectedTrip.availableSeats} seats available
                          </p>
                        )}
                      </div>
                      {selectedTrip && <div className="ds-field">
                        <span className="ds-label">Choose {passengers} seat{passengers === 1 ? '' : 's'} *</span>
                        <div className="ds-seat-picker" role="group" aria-label="Choose seats">
                          {Array.from({ length: selectedTrip.capacity }, (_, index) => {
                            const seat = `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`;
                            const booked = takenSeatNumbers.has(seat);
                            const chosen = seatNumbers.includes(seat);
                            return <button key={seat} type="button" disabled={booked} aria-disabled={booked} aria-label={`Seat ${seat}${booked ? ', already taken' : chosen ? ', selected' : ', available'}`} aria-pressed={chosen} className={`ds-seat ${chosen ? 'is-selected' : ''} ${booked ? 'is-booked' : ''}`} onClick={() => setSeatNumbers((current) => toggleSeatSelection(current, seat, passengers))}>{seat}</button>;
                          })}
                        </div>
                        <p className="ds-note">Selected {seatNumbers.length} of {passengers}. Gray seats are already booked. Tap any other available seat to change your selection.</p>
                      </div>}
                    </div>
                  </div>

                  {/* Passenger information */}
                  <div className="ds-card ds-card-pad">
                    <div className="ds-card-head">
                      <h2 className="ds-card-title">Passenger Information</h2>
                    </div>

                    <div className="ds-form" style={{ gap: '0.9rem' }}>
                      <p className="ds-note">For a group booking, the contact details below belong to the lead passenger. Each selected seat is included on the group ticket.</p>
                      <div className="ds-field">
                        <label htmlFor="name" className="ds-label">Lead Passenger Name *</label>
                        <input
                          type="text"
                          id="name"
                          value={passengerName}
                          onChange={(e) => setPassengerName(e.target.value)}
                          className="ds-input"
                          placeholder="Enter full name"
                          required
                        />
                      </div>

                      <div className="ds-trip-grid">
                        <div className="ds-field">
                          <label htmlFor="contact" className="ds-label">Contact Number *</label>
                          <input
                            type="tel"
                            id="contact"
                            value={contactNumber}
                            onChange={(e) => setContactNumber(e.target.value)}
                            className="ds-input"
                            placeholder="+63 912 345 6789"
                            required
                          />
                        </div>

                        <div className="ds-field">
                          <label htmlFor="email" className="ds-label">Email Address *</label>
                          <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="ds-input"
                            placeholder="your@email.com"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Booking summary */}
                  {selectedTrip && (
                    <div className="ds-card ds-card-pad">
                      <div className="ds-card-head">
                        <h2 className="ds-card-title">Booking Summary</h2>
                      </div>

                      <div className="ds-detail-grid">
                        <div>
                          <span className="ds-detail-label">Route</span>
                          <span className="ds-detail-value">{selectedTrip.from} → {selectedTrip.to}</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Departure</span>
                          <span className="ds-detail-value">{formatDateTime(selectedTrip.departureDate + 'T' + selectedTrip.departureTime).date}</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Time</span>
                          <span className="ds-detail-value">{formatDateTime(selectedTrip.departureDate + 'T' + selectedTrip.departureTime).time}</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Duration</span>
                          <span className="ds-detail-value">{selectedTrip.duration}</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Bus</span>
                          <span className="ds-detail-value">{selectedTrip.busNumber} ({selectedTrip.busModel})</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Price per ticket</span>
                          <span className="ds-detail-value">{formatPrice(selectedTrip.price)}</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Passengers</span>
                          <span className="ds-detail-value">{passengers}</span>
                        </div>
                        <div>
                          <span className="ds-detail-label">Seats</span>
                          <span className="ds-detail-value">{seatNumbers.join(', ')}</span>
                        </div>
                      </div>

                      <div className="ds-pay-total">
                        <span className="ds-detail-label" style={{ margin: 0 }}>
                          Total Amount
                        </span>
                        <strong>{formatPrice(totalPrice)}</strong>
                      </div>
                    </div>
                  )}

                  <div className="ds-row-actions">
                    <button
                      type="button"
                      className="ds-btn ds-btn-outline"
                      onClick={() => router.back()}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="ds-btn ds-btn-primary" disabled={isSubmitting || !selectedTrip}>
                      {isSubmitting ? 'Creating Booking...' : 'Proceed to Payment'}
                    </button>
                  </div>
                </form>

                {/* Guidelines */}
                <aside className="ds-card ds-card-pad">
                  <div className="ds-card-head">
                    <h2 className="ds-card-title">Booking Guidelines</h2>
                  </div>

                  <ol className="ds-steps">
                    <li><span>1</span>Arrive at the terminal 30 minutes before departure.</li>
                    <li><span>2</span>Bring a valid ID for verification.</li>
                    <li><span>3</span>Tickets are non-transferable.</li>
                    <li><span>4</span>Cancellations must be made 24 hours in advance.</li>
                  </ol>

                  <div className="ds-note ds-note-info" style={{ marginTop: '1.2rem' }}>
                    Children under 3 travel free (no seat). Senior citizens and PWDs get a
                    20% discount. Maximum 2 bags per passenger (20kg total).
                  </div>

                  <h3 className="ds-subhead">Need Help?</h3>
                  <div className="ds-contact-grid">
                    <div className="ds-contact-item">
                      <strong>Phone</strong>
                      <span>+63 123 456 7890</span>
                    </div>
                    <div className="ds-contact-item">
                      <strong>Email</strong>
                      <span>support@busticketing.com</span>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </main>
        </div>
      </div>
  );
}

export default function BookDetailsPage() {
  return (
    <AuthGate>
      <Suspense fallback={
        <div className="ds-app">
          <Navbar user={{ name: 'Traveller', role: 'Passenger' }} />
          <div className="ds-app-body">
            <Sidebar isAuthenticated username="Traveller" />
            <main className="ds-page">
              <div className="ds-empty">
                <div className="loading" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>Loading...</p>
              </div>
            </main>
          </div>
        </div>
      }>
        <BookingFormContent />
      </Suspense>
    </AuthGate>
  );
}
