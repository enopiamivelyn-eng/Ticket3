import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { normalizeScheduleTime } from '@/lib/schedule';
import { databaseRequestError } from '@/lib/db/errors';

/** GET /api/admin/trips - List all trips and their current statuses. */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request);
    if (error || !user || !isAdmin(user)) {
      return NextResponse.json({ error: error || 'Admin access required. Sign in with an administrator account.' }, { status: 403 });
    }

    const trips = await prisma.trip.findMany({
      include: { route: true, bus: true },
      orderBy: [{ departureDate: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, trips });
  } catch (error) {
    const failure = databaseRequestError(error, 'trips');
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

/**
 * POST /api/admin/trips - Create new trip (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user || !isAdmin(user)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      routeId,
      busId,
      departureDate,
      departureTime,
      arrivalTime,
      price,
      status,
    } = body;

    // Validate required fields
    if (!routeId || !busId || !departureDate || !departureTime) {
      return NextResponse.json(
        { error: 'Route, bus, departure date, and departure time are required' },
        { status: 400 }
      );
    }
    const validDate = typeof departureDate === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(departureDate)
      && !Number.isNaN(Date.parse(`${departureDate}T00:00:00Z`));
    const normalizedDepartureTime = normalizeScheduleTime(departureTime);
    const normalizedArrivalTime = arrivalTime ? normalizeScheduleTime(arrivalTime) : '23:59';
    if (!validDate || !normalizedDepartureTime || !normalizedArrivalTime) {
      return NextResponse.json({ error: 'Enter a valid travel date and departure/arrival time.' }, { status: 400 });
    }
    if (status && !['scheduled', 'boarding', 'completed', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Choose a valid trip status.' }, { status: 400 });
    }

    // Get bus capacity for available seats
    const bus = await prisma.bus.findUnique({
      where: { id: busId },
    });

    if (!bus) {
      return NextResponse.json(
        { error: 'Bus not found' },
        { status: 404 }
      );
    }
    if (bus.status !== 'active') {
      return NextResponse.json({ error: 'Choose an active bus for a new schedule.' }, { status: 400 });
    }

    // Get route for price if not provided
    const route = await prisma.route.findUnique({
      where: { id: routeId },
    });

    if (!route) {
      return NextResponse.json(
        { error: 'Route not found' },
        { status: 404 }
      );
    }
    if (route.status !== 'active') {
      return NextResponse.json({ error: 'Activate this route before scheduling a trip.' }, { status: 400 });
    }

    const sameDateSchedules = await prisma.trip.findMany({
      where: { departureDate, OR: [{ routeId }, { busId }] },
      select: { routeId: true, busId: true, departureTime: true },
    });
    const duplicateRoute = sameDateSchedules.some((trip) =>
      trip.routeId === routeId && normalizeScheduleTime(trip.departureTime) === normalizedDepartureTime,
    );
    const duplicateBus = sameDateSchedules.some((trip) =>
      trip.busId === busId && normalizeScheduleTime(trip.departureTime) === normalizedDepartureTime,
    );
    if (duplicateRoute || duplicateBus) {
      return NextResponse.json({
        error: duplicateBus
          ? 'This bus already has a schedule at that date and time.'
          : 'This route already has a schedule at that date and time.',
      }, { status: 409 });
    }

    const tripPrice = price === undefined || price === null || price === '' ? route.basePrice : Number(price);
    if (!Number.isFinite(tripPrice) || tripPrice <= 0) {
      return NextResponse.json({ error: 'Trip fare must be a positive number.' }, { status: 400 });
    }

    // Create trip
    const trip = await prisma.trip.create({
      data: {
        routeId,
        busId,
        departureDate,
        departureTime: normalizedDepartureTime,
        arrivalTime: normalizedArrivalTime,
        price: tripPrice,
        availableSeats: bus.capacity,
        status: status || 'scheduled',
      },
      include: {
        route: true,
        bus: true,
      },
    });

    return NextResponse.json({
      success: true,
      trip,
    }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A trip already exists for this route, date, and departure time.' }, { status: 409 });
    }
    console.error('Error creating trip:', error);
    return NextResponse.json(
      { error: 'Failed to create trip' },
      { status: 500 }
    );
  }
}
