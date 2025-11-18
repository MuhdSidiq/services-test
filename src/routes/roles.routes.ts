import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';

const router = Router();

// Apply authentication middleware to all role routes
router.use(authenticate);

/**
 * POST /api/roles
 * Create a new role
 */
router.post(
  '/',
  validateRequired(['id', 'name']),
  asyncHandler(async (req, res) => {
    const data: Prisma.rolesCreateInput = req.body;

    const role = await prisma.roles.create({
      data
    });

    res.status(201).json({
      success: true,
      data: role
    });
  })
);

/**
 * GET /api/roles
 * List all roles with pagination
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;

    const [roles, total] = await Promise.all([
      prisma.roles.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      prisma.roles.count()
    ]);

    res.json(paginatedResponse(roles, total, page, limit));
  })
);

/**
 * GET /api/roles/:id
 * Get a single role by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const role = await prisma.roles.findUnique({
      where: { id },
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

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    res.json({
      success: true,
      data: role
    });
  })
);

/**
 * PUT /api/roles/:id
 * Update a role
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data: Prisma.rolesUpdateInput = req.body;

    const role = await prisma.roles.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: role
    });
  })
);

/**
 * DELETE /api/roles/:id
 * Delete a role
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.roles.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  })
);

export default router;
