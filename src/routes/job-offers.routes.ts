import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma, JobOfferIsAccepted } from '../../app/generated/prisma';
import crypto from 'crypto';

const router = Router();

// Apply authentication middleware to all job offer admin routes
router.use(authenticate);

/**
 * POST /api/job-offers
 * Create a new job offer
 */
router.post(
  '/',
  validateRequired(['id', 'job_order_id', 'gantifier_id']),
  asyncHandler(async (req, res) => {
    // Generate secure acceptance token
    const acceptance_token = req.body.acceptance_token || crypto.randomBytes(16).toString('hex');

    const data: Prisma.job_offersCreateInput = {
      id: req.body.id,
      acceptance_token,
      status: req.body.status || 'SENT',
      is_accepted: req.body.is_accepted as JobOfferIsAccepted,
      response: req.body.response,
      sent_at: new Date(),
      delivered_at: req.body.delivered_at ? new Date(req.body.delivered_at) : undefined,
      read_at: req.body.read_at ? new Date(req.body.read_at) : undefined,
      responded_at: req.body.responded_at ? new Date(req.body.responded_at) : undefined,
      job_orders: {
        connect: { id: req.body.job_order_id }
      },
      gantifiers: {
        connect: { id: req.body.gantifier_id }
      }
    };

    const jobOffer = await prisma.job_offers.create({
      data,
      include: {
        job_orders: {
          select: {
            id: true,
            scheduled_date: true,
            center_location: true,
            rate: true,
            status: true
          }
        },
        gantifiers: {
          select: {
            id: true,
            full_name: true,
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
      data: jobOffer
    });
  })
);

/**
 * GET /api/job-offers
 * List all job offers with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { status, job_order_id, gantifier_id, is_accepted } = req.query;

    const where: Prisma.job_offersWhereInput = {};

    if (status) {
      where.status = status as string;
    }

    if (job_order_id) {
      where.job_order_id = job_order_id as string;
    }

    if (gantifier_id) {
      where.gantifier_id = gantifier_id as string;
    }

    if (is_accepted) {
      where.is_accepted = is_accepted as JobOfferIsAccepted;
    }

    const [jobOffers, total] = await Promise.all([
      prisma.job_offers.findMany({
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
        orderBy: { sent_at: 'desc' }
      }),
      prisma.job_offers.count({ where })
    ]);

    res.json(paginatedResponse(jobOffers, total, page, limit));
  })
);

/**
 * GET /api/job-offers/:id
 * Get a single job offer by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const jobOffer = await prisma.job_offers.findUnique({
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
                phone: true
              }
            }
          }
        }
      }
    });

    if (!jobOffer) {
      return res.status(404).json({
        success: false,
        error: 'Job offer not found'
      });
    }

    res.json({
      success: true,
      data: jobOffer
    });
  })
);

/**
 * GET /api/job-offers/token/:token
 * Get job offer by acceptance token (for worker acceptance flow)
 */
router.get(
  '/token/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const jobOffer = await prisma.job_offers.findUnique({
      where: { acceptance_token: token },
      include: {
        job_orders: {
          include: {
            centers: {
              select: {
                id: true,
                name: true,
                address: true,
                city: true,
                state: true
              }
            }
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

    if (!jobOffer) {
      return res.status(404).json({
        success: false,
        error: 'Job offer not found'
      });
    }

    res.json({
      success: true,
      data: jobOffer
    });
  })
);

/**
 * PUT /api/job-offers/:id
 * Update a job offer
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.job_offersUpdateInput = {
      status: req.body.status,
      is_accepted: req.body.is_accepted as JobOfferIsAccepted,
      response: req.body.response,
      delivered_at: req.body.delivered_at ? new Date(req.body.delivered_at) : undefined,
      read_at: req.body.read_at ? new Date(req.body.read_at) : undefined,
      responded_at: req.body.responded_at ? new Date(req.body.responded_at) : undefined
    };

    const jobOffer = await prisma.job_offers.update({
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
      data: jobOffer
    });
  })
);

/**
 * PATCH /api/job-offers/:id/accept
 * Accept a job offer
 */
router.patch(
  '/:id/accept',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.job_offersUpdateInput = {
      is_accepted: 'YES' as JobOfferIsAccepted,
      status: 'ACCEPTED_BY_GANTIFIER',
      responded_at: new Date(),
      response: req.body.response || 'Accepted'
    };

    const jobOffer = await prisma.job_offers.update({
      where: { id },
      data,
      include: {
        job_orders: true,
        gantifiers: true
      }
    });

    res.json({
      success: true,
      data: jobOffer,
      message: 'Job offer accepted successfully'
    });
  })
);

/**
 * PATCH /api/job-offers/:id/reject
 * Reject a job offer
 */
router.patch(
  '/:id/reject',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.job_offersUpdateInput = {
      is_accepted: 'NO' as JobOfferIsAccepted,
      status: 'REJECTED_BY_GANTIFIER',
      responded_at: new Date(),
      response: req.body.response || 'Rejected'
    };

    const jobOffer = await prisma.job_offers.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: jobOffer,
      message: 'Job offer rejected'
    });
  })
);

/**
 * DELETE /api/job-offers/:id
 * Delete a job offer
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.job_offers.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Job offer deleted successfully'
    });
  })
);

export default router;
