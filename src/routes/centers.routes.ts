import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId, isValidEmail } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';

const router = Router();

// Apply authentication middleware to all center routes
router.use(authenticate);

/**
 * POST /api/centers
 * Create a new center
 */
router.post(
  '/',
  validateRequired(['id', 'name', 'email', 'phone', 'address', 'postcode', 'city', 'state', 'user_id', 'whatsapp_number']),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const data: Prisma.centersCreateInput = {
      id: req.body.id,
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      postcode: req.body.postcode,
      city: req.body.city,
      state: req.body.state,
      location: req.body.location,
      whatsapp_number: req.body.whatsapp_number,
      created_at: new Date(),
      users: {
        connect: { id: req.body.user_id }
      }
    };

    const center = await prisma.centers.create({
      data,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: center
    });
  })
);

/**
 * GET /api/centers
 * List all centers with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { city, state, user_id, search } = req.query;

    const where: Prisma.centersWhereInput = {};

    if (city) {
      where.city = city as string;
    }

    if (state) {
      where.state = state as string;
    }

    if (user_id) {
      where.user_id = user_id as string;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [centers, total] = await Promise.all([
      prisma.centers.findMany({
        where,
        skip,
        take: limit,
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          _count: {
            select: {
              job_orders: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.centers.count({ where })
    ]);

    res.json(paginatedResponse(centers, total, page, limit));
  })
);

/**
 * GET /api/centers/:id
 * Get a single center by ID with relations
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const center = await prisma.centers.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        job_orders: {
          take: 10,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            scheduled_date: true,
            status: true,
            center_location: true,
            rate: true
          }
        },
        _count: {
          select: {
            job_orders: true
          }
        }
      }
    });

    if (!center) {
      return res.status(404).json({
        success: false,
        error: 'Center not found'
      });
    }

    res.json({
      success: true,
      data: center
    });
  })
);

/**
 * PUT /api/centers/:id
 * Update a center
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;

    // Validate email format if provided
    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const data: Prisma.centersUpdateInput = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      postcode: req.body.postcode,
      city: req.body.city,
      state: req.body.state,
      location: req.body.location,
      whatsapp_number: req.body.whatsapp_number
    };

    const center = await prisma.centers.update({
      where: { id },
      data,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: center
    });
  })
);

/**
 * DELETE /api/centers/:id
 * Delete a center
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if center has job orders
    const jobOrdersCount = await prisma.job_orders.count({
      where: { center_id: id }
    });

    if (jobOrdersCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete center with existing job orders',
        jobOrdersCount
      });
    }

    await prisma.centers.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Center deleted successfully'
    });
  })
);

export default router;
