import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { databaseRequestError } from '@/lib/db/errors';
import { Prisma } from '@prisma/client';
import { getSupabaseUser } from '@/lib/supabase';

/**
 * GET /api/bookings - Get user's bookings
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Build where clause
    const where: any = isAdmin(user) ? {} : { userId: user.userId };

    if (status) {
      where.status = status;
    }

    // Fetch bookings with related data
    const bookings = await prisma.booking.findMany({
      where,
      select: {
        id: true,
        userId: true,
        tripId: true,
        seatNumber: true,
        passengerName: true,
        passengerEmail: true,
        passengerPhone: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        totalAmount: true,
        passengerCategory: true,
        baseFare: true,
        discountRate: true,
        discountAmount: true,
        discountVerificationId: true,
        bookingDate: true,
        createdAt: true,
        trip: {
          select: {
            departureDate: true,
            departureTime: true,
            arrivalTime: true,
            price: true,
            route: { select: { name: true, fromCity: true, toCity: true } },
            bus: { select: { busNumber: true, model: true } },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format bookings
    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      userId: booking.userId,
      tripId: booking.tripId,
      seatNumber: booking.seatNumber,
      passengerName: booking.passengerName,
      passengerEmail: booking.passengerEmail,
      passengerPhone: booking.passengerPhone,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      totalAmount: booking.totalAmount,
      passengerCategory: booking.passengerCategory,
      baseFare: booking.baseFare,
      discountRate: booking.discountRate,
      discountAmount: booking.discountAmount,
      discountVerificationId: booking.discountVerificationId,
      bookingDate: booking.bookingDate,
      route: booking.trip.route.name,
      from: booking.trip.route.fromCity,
      to: booking.trip.route.toCity,
      date: booking.trip.departureDate,
      time: booking.trip.departureTime,
      busNumber: booking.trip.bus.busNumber,
      trip: {
        route: {
          name: booking.trip.route.name,
          fromCity: booking.trip.route.fromCity,
          toCity: booking.trip.route.toCity,
        },
        departureDate: booking.trip.departureDate,
        departureTime: booking.trip.departureTime,
        arrivalTime: booking.trip.arrivalTime,
        price: booking.trip.price,
        bus: { busNumber: booking.trip.bus.busNumber, model: booking.trip.bus.model },
      },
    }));

    return NextResponse.json({
      success: true,
      bookings: formattedBookings,
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    const failure = databaseRequestError(error, 'bookings');
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status }
    );
  }
}

/**
 * POST /api/bookings - Create a new booking
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (isAdmin(user)) {
      return NextResponse.json(
        { error: 'Administrators manage passenger bookings and cannot create bookings.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      tripId,
      seatNumber,
      seatNumbers: requestedSeatNumbers,
      passengerName,
      passengerEmail,
      passengerPhone,
      passengerCategory = 'regular',
    } = body;

    // Validate required fields
    const seatNumbers: string[] = Array.isArray(requestedSeatNumbers)
      ? requestedSeatNumbers.map((seat: unknown) => typeof seat === 'string' ? seat.trim().toUpperCase() : '')
      : typeof seatNumber === 'string' ? [seatNumber.trim().toUpperCase()] : [];
    if (!tripId || seatNumbers.length === 0 || seatNumbers.length > 10 || seatNumbers.some((seat) => !/^[A-Z]\d{1,2}$/.test(seat)) || new Set(seatNumbers).size !== seatNumbers.length || !passengerName || !passengerEmail || !passengerPhone || !['regular', 'student', 'pwd', 'senior_citizen'].includes(passengerCategory)) {
      return NextResponse.json(
        { error: 'All passenger details are required' },
        { status: 400 }
      );
    }

    if (passengerCategory !== 'regular' && seatNumbers.length !== 1) {
      return NextResponse.json({ error: 'A verified special-category fare applies to one named passenger. Book one discounted seat at a time.' }, { status: 400 });
    }

    // Get trip details
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { route: true },
    });

    if (!trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }

    const verifiedDiscount = passengerCategory === 'regular' ? null : await prisma.discountVerification.findFirst({
      where: { userId: user.userId, passengerCategory, verificationStatus: 'verified' },
      orderBy: { reviewedAt: 'desc' },
      select: { id: true },
    });
    if (verifiedDiscount) {
      const token = request.cookies.get('auth-token')?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const account = await getSupabaseUser(token);
      const accountName = account.user_metadata?.name?.trim().toLocaleLowerCase();
      if (accountName && accountName !== passengerName.trim().toLocaleLowerCase()) {
        return NextResponse.json({ error: 'For a verified discount, the booking passenger name must match the name on your passenger account and reviewed ID.' }, { status: 400 });
      }
    }
    const baseFare = trip.price * seatNumbers.length;
    const discountRate = verifiedDiscount ? 0.2 : 0;
    const discountAmount = Math.round((trip.price * discountRate + Number.EPSILON) * 100) / 100;
    const finalFare = Math.round((baseFare - discountAmount + Number.EPSILON) * 100) / 100;

    // Check if trip is available
    if (trip.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Trip is not available for booking' },
        { status: 400 }
      );
    }

    // Check if seats are available
    if (trip.availableSeats < seatNumbers.length) {
      return NextResponse.json(
        { error: `Only ${trip.availableSeats} seats are available for this trip.` },
        { status: 400 }
      );
    }

    // Check if seat is already booked
    const existingBookings = await prisma.booking.findMany({
      where: { tripId, status: { notIn: ['cancelled', 'rejected'] } },
      select: { seatNumber: true },
    });
    const occupiedSeats = new Set(existingBookings.flatMap((booking) => booking.seatNumber.split(',').map((seat) => seat.trim())));
    if (seatNumbers.some((seat) => occupiedSeats.has(seat))) {
      return NextResponse.json(
        { error: 'One or more selected seats have just been booked. Choose different seats.' },
        { status: 400 }
      );
    }

    // Create booking in a transaction
    const booking = await prisma.$transaction(async (tx) => {
      // Create the booking
      const newBooking = await tx.booking.create({
        data: {
          userId: user.userId,
          tripId,
          seatNumber: seatNumbers.join(', '),
          passengerName,
          passengerEmail,
          passengerPhone,
          passengerCategory,
          baseFare,
          discountRate,
          discountAmount,
          discountVerificationId: verifiedDiscount?.id ?? null,
          totalAmount: finalFare,
          paymentMethod: null,
          status: 'pending',
          paymentStatus: 'unpaid',
        },
      });

      // Update trip's available seats
      await tx.trip.update({
        where: { id: tripId },
        data: {
          availableSeats: trip.availableSeats - seatNumbers.length,
        },
      });

      return newBooking;
    });

    // Fetch complete booking with trip details
    const completeBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
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
        id: completeBooking!.id,
        tripId: completeBooking!.tripId,
        seatNumber: completeBooking!.seatNumber,
        passengerName: completeBooking!.passengerName,
        passengerEmail: completeBooking!.passengerEmail,
        passengerPhone: completeBooking!.passengerPhone,
        status: completeBooking!.status,
        paymentStatus: completeBooking!.paymentStatus,
        paymentMethod: completeBooking!.paymentMethod,
        totalAmount: completeBooking!.totalAmount,
        passengerCategory: completeBooking!.passengerCategory,
        baseFare: completeBooking!.baseFare,
        discountRate: completeBooking!.discountRate,
        discountAmount: completeBooking!.discountAmount,
        discountVerificationId: completeBooking!.discountVerificationId,
        bookingDate: completeBooking!.bookingDate,
        route: completeBooking!.trip.route.name,
        from: completeBooking!.trip.route.fromCity,
        to: completeBooking!.trip.route.toCity,
        date: completeBooking!.trip.departureDate,
        time: completeBooking!.trip.departureTime,
        busNumber: completeBooking!.trip.bus.busNumber,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating booking:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003' && String(error.meta?.field_name ?? '').includes('userId')) {
      return NextResponse.json(
        { error: 'Your Supabase account is blocked by an outdated booking database constraint. Run supabase-ticket-payment-qr-migration.sql in Supabase SQL Editor, then retry.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}
