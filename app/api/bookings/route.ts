import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { deletePrivateImage, getAccessToken, uploadPrivateImage } from '@/lib/discount-storage';
import { databaseRequestError } from '@/lib/db/errors';
import { Prisma } from '@prisma/client';

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
        discountVerification: { select: { verificationStatus: true, adminRemarks: true } },
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
      discountVerification: booking.discountVerification,
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
  let uploadedIdPath = '';
  let createdVerificationId = '';
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

    const isMultipart = request.headers.get('content-type')?.includes('multipart/form-data');
    const form = isMultipart ? await request.formData() : null;
    const body = form ? Object.fromEntries(form.entries()) : await request.json();
    const {
      tripId,
      seatNumber,
      seatNumbers: requestedSeatNumbers,
      passengerName,
      passengerEmail,
      passengerPhone,
      passengerCategory,
    } = body;
    const idFile = form?.get('idImage');

    // Validate required fields
    const parsedSeatNumbers = typeof requestedSeatNumbers === 'string'
      ? (() => { try { return JSON.parse(requestedSeatNumbers); } catch { return []; } })()
      : requestedSeatNumbers;
    const category = typeof passengerCategory === 'string' ? passengerCategory : '';
    const seatNumbers: string[] = Array.isArray(parsedSeatNumbers)
      ? parsedSeatNumbers.map((seat: unknown) => typeof seat === 'string' ? seat.trim().toUpperCase() : '')
      : typeof seatNumber === 'string' ? [seatNumber.trim().toUpperCase()] : [];
    if (!tripId || seatNumbers.length === 0 || seatNumbers.length > 10 || seatNumbers.some((seat) => !/^[A-Z]\d{1,2}$/.test(seat)) || new Set(seatNumbers).size !== seatNumbers.length || !passengerName || !passengerEmail || !passengerPhone || !['regular', 'student', 'pwd', 'senior_citizen'].includes(category)) {
      return NextResponse.json(
        { error: 'All passenger details are required' },
        { status: 400 }
      );
    }

    if (category !== 'regular' && seatNumbers.length !== 1) {
      return NextResponse.json({ error: 'A verified special-category fare applies to one named passenger. Book one discounted seat at a time.' }, { status: 400 });
    }

    let linkedVerification: { id: string; verificationStatus: string } | null = null;
    let idBytes: ArrayBuffer | null = null;
    let idContentType = '';
    if (category !== 'regular') {
      if (!(idFile instanceof File)) return NextResponse.json({ error: 'Upload a JPG, JPEG, or PNG passenger ID before booking.' }, { status: 400 });
      if (idFile.size < 1 || idFile.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'The ID image must be smaller than 5 MB.' }, { status: 400 });
      idBytes = await idFile.arrayBuffer();
      const signature = new Uint8Array(idBytes.slice(0, 8));
      const isPng = signature.length >= 8 && signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47 && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
      const isJpeg = signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
      idContentType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : '';
      if (!idContentType || idFile.type !== idContentType) return NextResponse.json({ error: 'The file contents must be a valid JPG or PNG image.' }, { status: 400 });
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

    const baseFare = trip.price * seatNumbers.length;
    const discountRate = 0;
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

    if (category !== 'regular' && idBytes && idContentType) {
      uploadedIdPath = `${user.userId}/${randomUUID()}.${idContentType === 'image/png' ? 'png' : 'jpg'}`;
      await uploadPrivateImage(uploadedIdPath, idContentType, idBytes, getAccessToken(request));
      linkedVerification = await prisma.discountVerification.create({
        data: { userId: user.userId, passengerCategory: category, idFilePath: uploadedIdPath },
        select: { id: true, verificationStatus: true },
      });
      createdVerificationId = linkedVerification.id;
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
          passengerCategory: category,
          baseFare,
          discountRate,
          discountAmount,
          discountVerificationId: linkedVerification?.id ?? null,
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
    if (createdVerificationId) await prisma.discountVerification.delete({ where: { id: createdVerificationId } }).catch(() => undefined);
    if (uploadedIdPath) await deletePrivateImage(uploadedIdPath, getAccessToken(request)).catch(() => undefined);
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
