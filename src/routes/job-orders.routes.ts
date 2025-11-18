import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';

const router = Router();

// Apply authentication middleware to all job order routes
router.use(authenticate);

/**
 * POST /api/job-orders
 * Create a new job order
 */
router.post(
  '/',
  validateRequired([
    'id', 'center_id', 'scheduled_date', 'job_tasks', 'center_location',
    'rate', 'start_time', 'end_time'
  ]),
  asyncHandler(async (req, res) => {
    const data: Prisma.job_ordersCreateInput = {
      id: req.body.id,
      scheduled_date: new Date(req.body.scheduled_date),
      job_tasks: req.body.job_tasks,
      center_location: req.body.center_location,
      rate: parseFloat(req.body.rate),
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      custom_tasks: req.body.custom_tasks || [],
      gantify_service_fees: req.body.gantify_service_fees || 10,
      status: req.body.status || 'PENDING',
      created_at: new Date(),
      completed_at: req.body.completed_at ? new Date(req.body.completed_at) : undefined,
      client_feedback: req.body.client_feedback,
      completion_rating: req.body.completion_rating,
      centers: {
        connect: { id: req.body.center_id }
      },
      gantifiers: req.body.gantifier_id ? {
        connect: { id: req.body.gantifier_id }
      } : undefined
    };

    const jobOrder = await prisma.job_orders.create({
      data,
      include: {
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

    res.status(201).json({
      success: true,
      data: jobOrder
    });
  })
);

/**
 * GET /api/job-orders
 * List all job orders with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { status, center_id, gantifier_id, date_from, date_to } = req.query;

    const where: Prisma.job_ordersWhereInput = {};

    if (status) {
      where.status = status as string;
    }

    if (center_id) {
      where.center_id = center_id as string;
    }

    if (gantifier_id) {
      where.gantifier_id = gantifier_id as string;
    }

    // Date range filter
    if (date_from || date_to) {
      where.scheduled_date = {};
      if (date_from) {
        where.scheduled_date.gte = new Date(date_from as string);
      }
      if (date_to) {
        where.scheduled_date.lte = new Date(date_to as string);
      }
    }

    const [jobOrders, total] = await Promise.all([
      prisma.job_orders.findMany({
        where,
        skip,
        take: limit,
        include: {
          centers: {
            select: {
              id: true,
              name: true,
              city: true,
              whatsapp_number: true
            }
          },
          gantifiers: {
            select: {
              id: true,
              full_name: true,
              status: true
            }
          },
          job_assignments: {
            select: {
              id: true,
              assigned_at: true,
              priority_score_at_assignment: true
            }
          },
          _count: {
            select: {
              job_offers: true,
              priority_scores: true
            }
          }
        },
        orderBy: { scheduled_date: 'desc' }
      }),
      prisma.job_orders.count({ where })
    ]);

    res.json(paginatedResponse(jobOrders, total, page, limit));
  })
);

/**
 * GET /api/job-orders/:id
 * Get a single job order by ID with full details
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const jobOrder = await prisma.job_orders.findUnique({
      where: { id },
      include: {
        centers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            whatsapp_number: true
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
        },
        job_assignments: true,
        job_offers: {
          orderBy: { sent_at: 'desc' },
          include: {
            gantifiers: {
              select: {
                id: true,
                full_name: true
              }
            }
          }
        },
        priority_scores: {
          orderBy: { score: 'desc' },
          take: 10,
          include: {
            gantifiers: {
              select: {
                id: true,
                full_name: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!jobOrder) {
      return res.status(404).json({
        success: false,
        error: 'Job order not found'
      });
    }

    res.json({
      success: true,
      data: jobOrder
    });
  })
);

/**
 * PUT /api/job-orders/:id
 * Update a job order
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.job_ordersUpdateInput = {
      scheduled_date: req.body.scheduled_date ? new Date(req.body.scheduled_date) : undefined,
      job_tasks: req.body.job_tasks,
      center_location: req.body.center_location,
      rate: req.body.rate ? parseFloat(req.body.rate) : undefined,
      start_time: req.body.start_time,
      end_time: req.body.end_time,
      custom_tasks: req.body.custom_tasks,
      gantify_service_fees: req.body.gantify_service_fees ? parseFloat(req.body.gantify_service_fees) : undefined,
      status: req.body.status,
      completed_at: req.body.completed_at ? new Date(req.body.completed_at) : undefined,
      client_feedback: req.body.client_feedback,
      completion_rating: req.body.completion_rating,
      gantifiers: req.body.gantifier_id ? {
        connect: { id: req.body.gantifier_id }
      } : req.body.gantifier_id === null ? {
        disconnect: true
      } : undefined
    };

    const jobOrder = await prisma.job_orders.update({
      where: { id },
      data,
      include: {
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

    res.json({
      success: true,
      data: jobOrder
    });
  })
);

/**
 * PATCH /api/job-orders/:id/status
 * Update job order status
 */
router.patch(
  '/:id/status',
  validateId,
  validateRequired(['status']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const data: Prisma.job_ordersUpdateInput = {
      status
    };

    // Auto-set completed_at if status is COMPLETED
    if (status === 'COMPLETED') {
      data.completed_at = new Date();
    }

    const jobOrder = await prisma.job_orders.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: jobOrder
    });
  })
);

/**
 * DELETE /api/job-orders/:id
 * Delete a job order
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if job order has assignment
    const assignment = await prisma.job_assignments.findUnique({
      where: { job_order_id: id }
    });

    if (assignment) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete job order with existing assignment. Delete the assignment first.'
      });
    }

    // Delete related records first
    await prisma.job_offers.deleteMany({
      where: { job_order_id: id }
    });

    await prisma.priority_scores.deleteMany({
      where: { job_order_id: id }
    });

    await prisma.job_orders.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Job order deleted successfully'
    });
  })
);

/**
 * POST /api/job-orders/:id/complete
 * Mark job order as completed with optional rating and feedback
 */
router.post(
  '/:id/complete',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { completionRating, clientFeedback } = req.body;

    // Find the job order
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id },
      include: {
        gantifiers: true
      }
    });

    if (!jobOrder) {
      return res.status(404).json({
        success: false,
        error: 'Job order not found'
      });
    }

    // Check if job is in a completable state
    const completableStatuses = ['ASSIGNED', 'IN_PROGRESS'];
    if (!completableStatuses.includes(jobOrder.status)) {
      return res.status(400).json({
        success: false,
        error: 'Job is not in the correct state for completion',
        currentStatus: jobOrder.status,
        allowedStatuses: completableStatuses
      });
    }

    // Validate rating if provided
    if (completionRating !== undefined && completionRating !== null) {
      const rating = parseInt(completionRating);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          error: 'Rating must be between 1 and 5'
        });
      }
    }

    // Update the job order to completed
    const updatedJob = await prisma.job_orders.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completed_at: new Date(),
        completion_rating: completionRating ? parseInt(completionRating) : null,
        client_feedback: clientFeedback || null
      },
      include: {
        centers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        gantifiers: {
          select: {
            id: true,
            full_name: true,
            average_rating: true,
            total_jobs_completed: true
          }
        }
      }
    });

    console.log(`Job order ${id} marked as COMPLETED`);

    // Update gantifier stats if a rating was provided and gantifier assigned
    if (completionRating && jobOrder.gantifier_id) {
      await updateGantifierStats(jobOrder.gantifier_id);
      console.log(`Updated stats for gantifier ${jobOrder.gantifier_id}`);
    }

    res.json({
      success: true,
      data: updatedJob,
      message: 'Job marked as completed successfully'
    });
  })
);

/**
 * Helper function to update gantifier statistics
 * Calculates total completed jobs and average rating
 */
async function updateGantifierStats(gantifier_id: string) {
  // Get all completed jobs for this gantifier with ratings
  const completedJobs = await prisma.job_orders.findMany({
    where: {
      gantifier_id: gantifier_id,
      status: 'COMPLETED',
      completion_rating: { not: null }
    },
    select: {
      completion_rating: true
    }
  });

  // Calculate new stats
  const totalJobs = completedJobs.length;
  const totalRating = completedJobs.reduce(
    (sum, job) => sum + (job.completion_rating || 0),
    0
  );
  const averageRating = totalJobs > 0 ? totalRating / totalJobs : 0;

  // Update gantifier stats
  await prisma.gantifiers.update({
    where: { id: gantifier_id },
    data: {
      total_jobs_completed: totalJobs,
      average_rating: averageRating,
      last_updated: new Date()
    }
  });

  console.log(`Gantifier ${gantifier_id} stats updated: ${totalJobs} jobs, ${averageRating.toFixed(2)} avg rating`);
}

export default router;
