import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';

const router = Router();

// Apply authentication middleware to all priority score routes
router.use(authenticate);

/**
 * POST /api/priority-scores
 * Create a new priority score
 */
router.post(
  '/',
  validateRequired(['id', 'job_order_id', 'gantifier_id', 'score']),
  asyncHandler(async (req, res) => {
    const data: Prisma.priority_scoresCreateInput = {
      id: req.body.id,
      score: parseInt(req.body.score),
      created_at: new Date(),
      job_orders: {
        connect: { id: req.body.job_order_id }
      },
      gantifiers: {
        connect: { id: req.body.gantifier_id }
      }
    };

    const priorityScore = await prisma.priority_scores.create({
      data,
      include: {
        job_orders: {
          select: {
            id: true,
            scheduled_date: true,
            center_location: true,
            status: true
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

    res.status(201).json({
      success: true,
      data: priorityScore
    });
  })
);

/**
 * POST /api/priority-scores/batch
 * Create multiple priority scores at once (for job matching)
 */
router.post(
  '/batch',
  validateRequired(['job_order_id', 'scores']),
  asyncHandler(async (req, res) => {
    const { job_order_id, scores } = req.body;

    if (!Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'scores must be a non-empty array'
      });
    }

    // Validate each score object
    for (const score of scores) {
      if (!score.id || !score.gantifier_id || score.score === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Each score must have id, gantifier_id, and score'
        });
      }
    }

    const data = scores.map((score: any) => ({
      id: score.id,
      job_order_id,
      gantifier_id: score.gantifier_id,
      score: parseInt(score.score),
      created_at: new Date()
    }));

    const result = await prisma.priority_scores.createMany({
      data,
      skipDuplicates: true
    });

    res.status(201).json({
      success: true,
      message: `Created ${result.count} priority scores`,
      count: result.count
    });
  })
);

/**
 * GET /api/priority-scores
 * List all priority scores with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { job_order_id, gantifier_id, min_score } = req.query;

    const where: Prisma.priority_scoresWhereInput = {};

    if (job_order_id) {
      where.job_order_id = job_order_id as string;
    }

    if (gantifier_id) {
      where.gantifier_id = gantifier_id as string;
    }

    if (min_score) {
      where.score = {
        gte: parseInt(min_score as string)
      };
    }

    const [scores, total] = await Promise.all([
      prisma.priority_scores.findMany({
        where,
        skip,
        take: limit,
        include: {
          job_orders: {
            select: {
              id: true,
              scheduled_date: true,
              center_location: true,
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
        orderBy: { score: 'desc' }
      }),
      prisma.priority_scores.count({ where })
    ]);

    res.json(paginatedResponse(scores, total, page, limit));
  })
);

/**
 * GET /api/priority-scores/:id
 * Get a single priority score by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const score = await prisma.priority_scores.findUnique({
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
                phone: true
              }
            }
          }
        }
      }
    });

    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'Priority score not found'
      });
    }

    res.json({
      success: true,
      data: score
    });
  })
);

/**
 * GET /api/priority-scores/job-order/:job_order_id/top
 * Get top N gantifiers by priority score for a job order
 */
router.get(
  '/job-order/:job_order_id/top',
  validateId,
  asyncHandler(async (req, res) => {
    const { job_order_id } = req.params;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const scores = await prisma.priority_scores.findMany({
      where: { job_order_id },
      take: limit,
      include: {
        gantifiers: {
          select: {
            id: true,
            full_name: true,
            status: true,
            average_rating: true,
            completion_rate: true,
            total_jobs_completed: true,
            users: {
              select: {
                phone: true,
                phoneVerified: true,
                responsiveness: true,
                acceptanceRate: true
              }
            }
          }
        }
      },
      orderBy: { score: 'desc' }
    });

    res.json({
      success: true,
      data: scores,
      count: scores.length
    });
  })
);

/**
 * PUT /api/priority-scores/:id
 * Update a priority score
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.priority_scoresUpdateInput = {
      score: req.body.score ? parseInt(req.body.score) : undefined
    };

    const score = await prisma.priority_scores.update({
      where: { id },
      data,
      include: {
        job_orders: {
          select: {
            id: true,
            scheduled_date: true,
            center_location: true
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
      data: score
    });
  })
);

/**
 * DELETE /api/priority-scores/:id
 * Delete a priority score
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.priority_scores.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Priority score deleted successfully'
    });
  })
);

/**
 * DELETE /api/priority-scores/job-order/:job_order_id
 * Delete all priority scores for a job order
 */
router.delete(
  '/job-order/:job_order_id',
  validateId,
  asyncHandler(async (req, res) => {
    const { job_order_id } = req.params;

    const result = await prisma.priority_scores.deleteMany({
      where: { job_order_id }
    });

    res.json({
      success: true,
      message: `Deleted ${result.count} priority score(s)`,
      count: result.count
    });
  })
);

export default router;
