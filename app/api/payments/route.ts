import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request);
    if (error || !user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });

    const body = await request.json();
    const { bookingId, method } = body;
    const methods: Record<string, string> = { gcash: 'GCash', maya: 'Maya', terminal: 'Cash' };
    if (typeof bookingId !== 'string' || typeof method !== 'string' || !Object.hasOwn(methods, method)) {
      return NextResponse.json({ error: 'Choose a valid booking and payment method.' }, { status: 400 });
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if (booking.userId !== user.userId && !isAdmin(user)) {
      return NextResponse.json({ error: 'You cannot pay for another user’s booking.' }, { status: 403 });
    }
    if (booking.status === 'cancelled' || booking.status === 'rejected') return NextResponse.json({ error: 'Cancelled or rejected bookings cannot be paid.' }, { status: 400 });
    if (booking.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'This booking is already paid.' }, { status: 409 });
    }
    if (booking.passengerCategory !== 'regular' && booking.discountVerificationId) {
      const verification = await prisma.discountVerification.findUnique({ where: { id: booking.discountVerificationId }, select: { verificationStatus: true } });
      if (verification?.verificationStatus === 'pending') {
        return NextResponse.json({ error: 'Your ID is still waiting for admin review. Submit payment after the verification decision so the final fare is correct.' }, { status: 409 });
      }
    }
    if (!['unpaid', 'pending', 'failed'].includes(booking.paymentStatus)) return NextResponse.json({ error: 'This booking is not awaiting payment.' }, { status: 409 });
    const updated = await prisma.booking.updateMany({
      where: { id: bookingId, userId: booking.userId, status: { notIn: ['cancelled', 'rejected'] }, paymentStatus: { not: 'paid' } },
      data: { paymentStatus: 'pending', paymentMethod: methods[method], status: ['approved', 'confirmed'].includes(booking.status) ? 'approved' : 'pending' },
    });
    if (!updated.count) return NextResponse.json({ error: 'This booking is no longer awaiting payment.' }, { status: 409 });
    const current = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    return NextResponse.json({
      success: true,
      message: 'Payment submitted for administrator verification. A ticket will be issued after settlement is confirmed.',
      booking: {
        id: current.id,
        paymentStatus: current.paymentStatus,
        paymentMethod: current.paymentMethod,
        status: current.status,
      },
    });
  } catch (error) {
    console.error('Payment submission failed:', error);
    return NextResponse.json({ error: 'Could not submit payment for verification.' }, { status: 500 });
  }
}
