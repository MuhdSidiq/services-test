import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId, isValidEmail } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';

const router = Router();

// Apply authentication middleware to all user routes
router.use(authenticate);

/**
 * POST /api/users
 * Create a new user
 */
router.post(
  '/',
  validateRequired(['id', 'name']),
  asyncHandler(async (req, res) => {
    const { email, phone } = req.body;

    // Validate email format if provided
    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const data: Prisma.usersCreateInput = {
      id: req.body.id,
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      phone: req.body.phone,
      phoneVerified: req.body.phoneVerified ?? false,
      responsiveness: req.body.responsiveness ?? 0.5,
      acceptanceRate: req.body.acceptanceRate ?? 0.5,
      penaltyScore: req.body.penaltyScore ?? 0,
      created_at: new Date(),
      updated_at: new Date(),
      otpCode: req.body.otpCode,
      otpExpiresAt: req.body.otpExpiresAt,
      roles: req.body.role_id ? {
        connect: { id: req.body.role_id }
      } : undefined
    };

    const user = await prisma.users.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneVerified: true,
        responsiveness: true,
        acceptanceRate: true,
        penaltyScore: true,
        role_id: true,
        created_at: true,
        updated_at: true,
        roles: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: user
    });
  })
);

/**
 * GET /api/users
 * List all users with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { role_id, phoneVerified, search } = req.query;

    const where: Prisma.usersWhereInput = {};

    if (role_id) {
      where.role_id = role_id as string;
    }

    if (phoneVerified !== undefined) {
      where.phoneVerified = phoneVerified === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneVerified: true,
          responsiveness: true,
          acceptanceRate: true,
          penaltyScore: true,
          role_id: true,
          created_at: true,
          updated_at: true,
          roles: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.users.count({ where })
    ]);

    res.json(paginatedResponse(users, total, page, limit));
  })
);

/**
 * GET /api/users/:id
 * Get a single user by ID with relations
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneVerified: true,
        responsiveness: true,
        acceptanceRate: true,
        penaltyScore: true,
        role_id: true,
        created_at: true,
        updated_at: true,
        otpExpiresAt: true,
        roles: {
          select: {
            id: true,
            name: true
          }
        },
        centers: {
          select: {
            id: true,
            name: true,
            city: true
          }
        },
        gantifiers: {
          select: {
            id: true,
            full_name: true,
            status: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  })
);

/**
 * PUT /api/users/:id
 * Update a user
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

    const data: Prisma.usersUpdateInput = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      phone: req.body.phone,
      phoneVerified: req.body.phoneVerified,
      responsiveness: req.body.responsiveness,
      acceptanceRate: req.body.acceptanceRate,
      penaltyScore: req.body.penaltyScore,
      updated_at: new Date(),
      otpCode: req.body.otpCode,
      otpExpiresAt: req.body.otpExpiresAt,
      roles: req.body.role_id ? {
        connect: { id: req.body.role_id }
      } : undefined
    };

    const user = await prisma.users.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneVerified: true,
        responsiveness: true,
        acceptanceRate: true,
        penaltyScore: true,
        role_id: true,
        created_at: true,
        updated_at: true,
        roles: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: user
    });
  })
);

/**
 * DELETE /api/users/:id
 * Delete a user (cascades to gantifiers and sessions)
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.users.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  })
);

export default router;
