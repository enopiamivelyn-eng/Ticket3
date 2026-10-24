import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { APPROVED_BOOKING_STATUSES, COMPLETED_BOOKING_STATUSES } from '@/lib/booking-status';

/**
 * GET /api/bookings/[id] - Get specific booking details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    let booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        discountVerification: { select: { verificationStatus: true, adminRemarks: true } },
        trip: {
          include: {
            route: true,
            bus: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Check ownership before any backfill or other write.
    if (booking.userId !== user.userId && !isAdmin(user)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Backfill approved bookings that were approved before QR token creation
    // was added, or whose token was not saved by an older application build.
    if ([...APPROVED_BOOKING_STATUSES, ...COMPLETED_BOOKING_STATUSES].includes(booking.status as never) && !booking.ticketToken) {
      await prisma.booking.updateMany({
        where: { id, status: { in: [...APPROVED_BOOKING_STATUSES, ...COMPLETED_BOOKING_STATUSES] }, ticketToken: null },
        data: { ticketToken: randomBytes(32).toString('hex') },
      });
      booking = await prisma.booking.findUnique({
        where: { id },
        include: { discountVerification: { select: { verificationStatus: true, adminRemarks: true } }, trip: { include: { route: true, bus: true } } },
      });
      if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        tripId: booking.tripId,
        seatNumber: booking.seatNumber,
        passengerName: booking.passengerName,
        passengerEmail: booking.passengerEmail,
        passengerPhone: booking.passengerPhone,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        ticketToken: [...APPROVED_BOOKING_STATUSES, ...COMPLETED_BOOKING_STATUSES].includes(booking.status as never) ? booking.ticketToken : null,
        totalAmount: booking.totalAmount,
        passengerCategory: booking.passengerCategory,
        baseFare: booking.baseFare,
        discountRate: booking.discountRate,
        discountAmount: booking.discountAmount,
        discountVerificationId: booking.discountVerificationId,
        discountVerificationStatus: booking.discountVerification?.verificationStatus ?? null,
        discountAdminRemarks: booking.discountVerification?.adminRemarks ?? null,
        bookingDate: booking.bookingDate,
        route: booking.trip.route.name,
        from: booking.trip.route.fromCity,
        to: booking.trip.route.toCity,
        date: booking.trip.departureDate,
        departureTime: booking.trip.departureTime,
        arrivalTime: booking.trip.arrivalTime,
        busNumber: booking.trip.bus.busNumber,
        busModel: booking.trip.bus.model,
        duration: booking.trip.route.duration,
        trip: {
          route: { name: booking.trip.route.name, fromCity: booking.trip.route.fromCity, toCity: booking.trip.route.toCity },
          departureDate: booking.trip.departureDate,
          departureTime: booking.trip.departureTime,
          arrivalTime: booking.trip.arrivalTime,
          price: booking.trip.price,
          status: booking.trip.status,
          bus: { busNumber: booking.trip.bus.busNumber, model: booking.trip.bus.model },
        },
      },
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('Error fetching booking:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022' && /ticketToken|checkedInAt/i.test(error.message)) {
      return NextResponse.json(
        { error: 'The ticket database setup is incomplete. Run supabase-ticket-payment-qr-migration.sql in the Supabase SQL Editor, then restart the app.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch booking details' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/bookings/[id] - Update booking status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status, paymentStatus, paymentMethod } = body;
    if (status === 'confirmed') body.status = 'approved';
    if (status === 'completed') body.status = 'complete';
    const nextStatus = body.status;
    if (nextStatus !== undefined && !['pending', 'approved', 'complete', 'cancelled', 'rejected'].includes(nextStatus)) {
      return NextResponse.json({ error: 'Invalid booking status.' }, { status: 400 });
    }
    if (paymentStatus !== undefined) return NextResponse.json({ error: 'Payment status can only be changed through the administrator payment review.' }, { status: 403 });
    if (paymentMethod !== undefined && paymentMethod !== null && !['GCash', 'Maya', 'Cash'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 });
    }

    // Get existing booking
    const existingBooking = await prisma.booking.findUnique({
      where: { id },
      include: { trip: true },
    });

    if (!existingBooking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Check if user owns this booking or is admin
    if (existingBooking.userId !== user.userId && !isAdmin(user)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Admin booking-management actions are explicit and cannot change payment state.
    if (isAdmin(user) && (nextStatus === 'approved' || nextStatus === 'complete' || nextStatus === 'rejected')) {
      if (nextStatus === 'approved' && existingBooking.status !== 'pending') {
        return NextResponse.json({ error: 'Only pending bookings can be approved.' }, { status: 409 });
      }
      if (nextStatus === 'complete' && (!['approved', 'confirmed'].includes(existingBooking.status) || existingBooking.paymentStatus !== 'paid')) {
        return NextResponse.json({ error: 'Only approved, paid bookings can be marked complete.' }, { status: 409 });
      }
      if (status === 'rejected' && existingBooking.paymentStatus === 'paid') {
        return NextResponse.json({ error: 'Refund the paid booking before rejecting it.' }, { status: 409 });
      }
      if (nextStatus === 'rejected' && !['pending', 'approved', 'confirmed'].includes(existingBooking.status)) {
        return NextResponse.json({ error: 'Only pending or confirmed bookings can be rejected.' }, { status: 409 });
      }

      const updated = await prisma.$transaction(async (transaction) => {
        if (nextStatus === 'approved') {
          const result = await transaction.booking.updateMany({
            where: { id, status: 'pending' },
            data: { status: 'approved', ticketToken: randomBytes(32).toString('hex') },
          });
          if (!result.count) return null;
        } else if (nextStatus === 'complete') {
          const result = await transaction.booking.updateMany({
            where: { id, status: { in: ['approved', 'confirmed'] }, paymentStatus: 'paid' },
            data: { status: 'complete' },
          });
          if (!result.count) return null;
        } else {
          const result = await transaction.booking.updateMany({
            where: { id, status: { in: ['pending', 'approved', 'confirmed'] }, paymentStatus: { not: 'paid' } },
            data: { status: 'rejected', ticketToken: null },
          });
          if (!result.count) return null;
          const seatsToRestore = existingBooking.seatNumber.split(',').filter((seat) => seat.trim()).length || 1;
          await transaction.trip.update({
            where: { id: existingBooking.tripId },
            data: { availableSeats: { increment: seatsToRestore } },
          });
        }
        return transaction.booking.findUnique({ where: { id }, select: { status: true } });
      });
      if (!updated) return NextResponse.json({ error: 'This booking has already changed. Refresh and try again.' }, { status: 409 });
      return NextResponse.json({ success: true, booking: updated });
    }

    // Passengers may cancel their own booking, but only an administrator may
    // change booking or payment states. This prevents users marking tickets paid.
    if (paymentMethod !== undefined) return NextResponse.json({ error: 'Payment method is set when submitting payment.' }, { status: 403 });
    if (isAdmin(user) && nextStatus !== undefined && nextStatus !== 'cancelled') return NextResponse.json({ error: 'Use the appropriate booking management action.' }, { status: 403 });
    if (!isAdmin(user) && (nextStatus !== 'cancelled' || paymentStatus !== undefined || paymentMethod !== undefined)) {
      return NextResponse.json({ error: 'You may cancel your booking. Contact an administrator for other changes.' }, { status: 403 });
    }
    if (['cancelled', 'rejected', 'complete', 'completed'].includes(existingBooking.status) && nextStatus && nextStatus !== existingBooking.status) {
      return NextResponse.json({ error: 'This booking is already closed and cannot be changed.' }, { status: 400 });
    }

    // Build update data
    const updateData: any = {};
    if (nextStatus) updateData.status = nextStatus;

    // If cancelling, restore seat availability
    if (nextStatus === 'cancelled') {
      const seatsToRestore = existingBooking.seatNumber.split(',').filter((seat) => seat.trim()).length || 1;
      await prisma.$transaction(async (transaction) => {
        const cancelled = await transaction.booking.updateMany({
          where: { id, status: { in: ['pending', 'approved', 'confirmed'] } },
          data: { ...updateData, ticketToken: null },
        });
        if (cancelled.count > 0) {
          await transaction.trip.update({
            where: { id: existingBooking.tripId },
            data: { availableSeats: { increment: seatsToRestore } },
          });
        }
      });
    } else {
      await prisma.booking.update({
        where: { id },
        data: updateData,
      });
    }

    // Fetch updated booking
    const updatedBooking = await prisma.booking.findUnique({
      where: { id },
      include: {
        trip: {
          include: {
            route: true,
            bus: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      booking: {
        id: updatedBooking!.id,
        status: updatedBooking!.status,
        paymentStatus: updatedBooking!.paymentStatus,
        paymentMethod: updatedBooking!.paymentMethod,
      },
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { error: 'Failed to update booking' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings/[id] - Cancel booking (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only admin can delete bookings
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { trip: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Cancel booking and restore every seat once, including multi-seat bookings.
    const seatsToRestore = booking.seatNumber.split(',').filter((seat) => seat.trim()).length || 1;
    await prisma.$transaction(async (transaction) => {
      const cancelled = await transaction.booking.updateMany({
      where: { id, status: { in: ['pending', 'approved', 'confirmed'] } },
        data: { status: 'cancelled', ticketToken: null },
      });
      if (cancelled.count > 0) {
        await transaction.trip.update({
          where: { id: booking.tripId },
          data: { availableSeats: { increment: seatsToRestore } },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    console.error('Error deleting booking:', error);
    return NextResponse.json(
      { error: 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}
