import { redirect } from 'next/navigation';

export default function MyBookingsRedirect() {
  redirect('/bookings');
}
