import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { databaseRequestError } from '@/lib/db/errors';

/**
 * GET /api/admin/buses - Get all buses (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user || !isAdmin(user)) {
      return NextResponse.json(
        { error: error || 'Admin access required. Sign in with an administrator account.' },
        { status: 403 }
      );
    }

    const buses = await prisma.bus.findMany({
      include: {
        _count: {
          select: { trips: true },
        },
      },
      orderBy: {
        busNumber: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      buses: buses.map(bus => ({
        id: bus.id,
        busNumber: bus.busNumber,
        model: bus.model,
        capacity: bus.capacity,
        status: bus.status,
        tripsCount: bus._count.trips,
        createdAt: bus.createdAt,
      })),
    });
  } catch (error) {
    const failure = databaseRequestError(error, 'buses');
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status }
    );
  }
}

/**
 * POST /api/admin/buses - Create new bus (Admin only)
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
    const { busNumber, model, capacity, status } = body;

    // Validate required fields
    if (!busNumber || !model || !capacity) {
      return NextResponse.json(
        { error: 'Bus number, model, and capacity are required' },
        { status: 400 }
      );
    }

    // Check if bus number already exists
    const existingBus = await prisma.bus.findUnique({
      where: { busNumber },
    });

    if (existingBus) {
      return NextResponse.json(
        { error: 'A bus with this number already exists' },
        { status: 409 }
      );
    }

    // Create bus
    const bus = await prisma.bus.create({
      data: {
        busNumber,
        model,
        capacity: parseInt(capacity),
        status: status || 'active',
      },
    });

    return NextResponse.json({
      success: true,
      bus,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating bus:', error);
    return NextResponse.json(
      { error: 'Failed to create bus' },
      { status: 500 }
    );
  }
}
