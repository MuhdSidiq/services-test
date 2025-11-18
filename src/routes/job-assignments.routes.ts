import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';
import crypto from 'crypto';

const router = Router();

// Apply authentication middleware to all job assignment routes
router.use(authenticate);

/**
 * POST /api/job-assignments
 * Create a new job assignment
 */
router.post(
  '/',
  validateRequired(['id', 'job_order_id', 'gantifier_id', 'token_expires_at', 'priority_score_at_assignment']),
  asyncHandler(async (req, res) => {
    // Generate secure token
    const token = req.body.token || crypto.randomBytes(32).toString('hex');

    const data: Prisma.job_assignmentsCreateInput = {
      id: req.body.id,
      token,
      token_expires_at: new Date(req.body.token_expires_at),
      priority_score_at_assignment: parseInt(req.body.priority_score_at_assignment),
      assigned_at: new Date(),
      job_orders: {
        connect: { id: req.body.job_order_id }
      },
      gantifiers: {
        connect: { id: req.body.gantifier_id }
      }
    };

    const assignment = await prisma.job_assignments.create({
      data,
      include: {
        job_orders: {
          select: {
            id: true,
            scheduled_date: true,
            center_location: true,
            rate: true,
            status: true,
            centers: {
              select: {
                id: true,
                name: true,
                city: true
              }
            }
          }
        },
        gantifiers: {
          select: {
            id: true,
            full_name: true,
            status: true,
            users: {
              select: {
                phone: true,
                email: true
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: assignment
    });
  })
);

/**
 * GET /api/job-assignments
 * List all job assignments with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { gantifier_id, job_order_id, expired } = req.query;

    const where: Prisma.job_assignmentsWhereInput = {};

    if (gantifier_id) {
      where.gantifier_id = gantifier_id as string;
    }

    if (job_order_id) {
      where.job_order_id = job_order_id as string;
    }

    // Filter expired/active tokens
    if (expired === 'true') {
      where.token_expires_at = {
        lt: new Date()
      };
    } else if (expired === 'false') {
      where.token_expires_at = {
        gte: new Date()
      };
    }

    const [assignments, total] = await Promise.all([
      prisma.job_assignments.findMany({
        where,
        skip,
        take: limit,
        include: {
          job_orders: {
            select: {
              id: true,
              scheduled_date: true,
              center_location: true,
              rate: true,
              status: true,
              centers: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          gantifiers: {
            select: {
              id: true,
              full_name: true,
              status: true
            }
          }
        },
        orderBy: { assigned_at: 'desc' }
      }),
      prisma.job_assignments.count({ where })
    ]);

    res.json(paginatedResponse(assignments, total, page, limit));
  })
);

/**
 * GET /api/job-assignments/:id
 * Get a single job assignment by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const assignment = await prisma.job_assignments.findUnique({
      where: { id },
      include: {
        job_orders: {
          include: {
            centers: true
          }
        },
        gantifiers: {
          include: {
            users: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                phoneVerified: true
              }
            }
          }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Job assignment not found'
      });
    }

    res.json({
      success: true,
      data: assignment
    });
  })
);

/**
 * GET /api/job-assignments/token/:token
 * Get assignment by token (for verification)
 */
router.get(
  '/token/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const assignment = await prisma.job_assignments.findUnique({
      where: { token },
      include: {
        job_orders: {
          include: {
            centers: true
          }
        },
        gantifiers: {
          include: {
            users: {
              select: {
                id: true,
                name: true,
                phone: true
              }
            }
          }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check if token is expired
    if (assignment.token_expires_at < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Assignment token expired',
        data: assignment
      });
    }

    res.json({
      success: true,
      data: assignment
    });
  })
);

/**
 * GET /api/job-assignments/job-order/:job_order_id
 * Get assignment by job order ID (since it's unique)
 */
router.get(
  '/job-order/:job_order_id',
  validateId,
  asyncHandler(async (req, res) => {
    const { job_order_id } = req.params;

    const assignment = await prisma.job_assignments.findUnique({
      where: { job_order_id },
      include: {
        job_orders: true,
        gantifiers: true
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'No assignment found for this job order'
      });
    }

    res.json({
      success: true,
      data: assignment
    });
  })
);

/**
 * PUT /api/job-assignments/:id
 * Update a job assignment
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.job_assignmentsUpdateInput = {
      token_expires_at: req.body.token_expires_at ? new Date(req.body.token_expires_at) : undefined,
      priority_score_at_assignment: req.body.priority_score_at_assignment
    };

    const assignment = await prisma.job_assignments.update({
      where: { id },
      data,
      include: {
        job_orders: {
          select: {
            id: true,
            scheduled_date: true,
            center_location: true,
            rate: true
          }
        },
        gantifiers: {
          select: {
            id: true,
            full_name: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: assignment
    });
  })
);

/**
 * DELETE /api/job-assignments/:id
 * Delete a job assignment
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.job_assignments.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Job assignment deleted successfully'
    });
  })
);

export default router;
