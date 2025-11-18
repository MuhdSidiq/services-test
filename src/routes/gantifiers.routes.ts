import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma, Gender } from '../../app/generated/prisma';

const router = Router();

// Apply authentication middleware to all gantifier routes
router.use(authenticate);

/**
 * POST /api/gantifiers
 * Create a new gantifier (worker)
 */
router.post(
  '/',
  validateRequired([
    'id', 'full_name', 'gender', 'address', 'postcode', 'current_address',
    'citizenship', 'education_level', 'ece_qualification', 'experience_with_children',
    'last_minute_work', 'user_id'
  ]),
  asyncHandler(async (req, res) => {
    const data: Prisma.gantifiersCreateInput = {
      id: req.body.id,
      full_name: req.body.full_name,
      gender: req.body.gender as Gender,
      address: req.body.address,
      postcode: req.body.postcode,
      city: req.body.city,
      state: req.body.state,
      address_details: req.body.address_details,
      current_address: req.body.current_address,
      citizenship: req.body.citizenship,
      country: req.body.country,
      education_level: req.body.education_level,
      ece_qualification: req.body.ece_qualification,
      experience_with_children: req.body.experience_with_children,
      last_minute_work: req.body.last_minute_work,
      ic_number: req.body.ic_number,
      passport_number: req.body.passport_number,
      resume_path: req.body.resume_path,
      status: req.body.status || 'INACTIVE',
      selected_cities: req.body.selected_cities || [],
      selected_states: req.body.selected_states || [],
      preferred_location: req.body.preferred_location,
      email_verified_at: req.body.email_verified_at ? new Date(req.body.email_verified_at) : undefined,
      phone_number_verified_at: req.body.phone_number_verified_at ? new Date(req.body.phone_number_verified_at) : undefined,
      created_at: new Date(),
      updated_at: new Date(),
      last_updated: new Date(),
      users: {
        connect: { id: req.body.user_id }
      }
    };

    const gantifier = await prisma.gantifiers.create({
      data,
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
    });

    res.status(201).json({
      success: true,
      data: gantifier
    });
  })
);

/**
 * GET /api/gantifiers
 * List all gantifiers with pagination and filters
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { status, city, state, gender, ece_qualification, search } = req.query;

    const where: Prisma.gantifiersWhereInput = {};

    if (status) {
      where.status = status as string;
    }

    if (city) {
      where.city = city as string;
    }

    if (state) {
      where.state = state as string;
    }

    if (gender) {
      where.gender = gender as Gender;
    }

    if (ece_qualification !== undefined) {
      where.ece_qualification = ece_qualification === 'true';
    }

    if (search) {
      where.OR = [
        { full_name: { contains: search as string, mode: 'insensitive' } },
        { ic_number: { contains: search as string } },
        { passport_number: { contains: search as string } }
      ];
    }

    const [gantifiers, total] = await Promise.all([
      prisma.gantifiers.findMany({
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
              job_assignments: true,
              job_offers: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.gantifiers.count({ where })
    ]);

    res.json(paginatedResponse(gantifiers, total, page, limit));
  })
);

/**
 * GET /api/gantifiers/:id
 * Get a single gantifier by ID with full details
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const gantifier = await prisma.gantifiers.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            phoneVerified: true
          }
        },
        job_assignments: {
          take: 10,
          orderBy: { assigned_at: 'desc' },
          include: {
            job_orders: {
              select: {
                id: true,
                scheduled_date: true,
                status: true,
                center_location: true
              }
            }
          }
        },
        job_offers: {
          take: 10,
          orderBy: { sent_at: 'desc' },
          select: {
            id: true,
            status: true,
            is_accepted: true,
            sent_at: true,
            responded_at: true
          }
        },
        _count: {
          select: {
            job_assignments: true,
            job_offers: true,
            job_orders: true,
            priority_scores: true
          }
        }
      }
    });

    if (!gantifier) {
      return res.status(404).json({
        success: false,
        error: 'Gantifier not found'
      });
    }

    res.json({
      success: true,
      data: gantifier
    });
  })
);

/**
 * PUT /api/gantifiers/:id
 * Update a gantifier
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Don't allow direct updates to computed fields
    const data: Prisma.gantifiersUpdateInput = {
      full_name: req.body.full_name,
      gender: req.body.gender as Gender,
      address: req.body.address,
      postcode: req.body.postcode,
      city: req.body.city,
      state: req.body.state,
      address_details: req.body.address_details,
      current_address: req.body.current_address,
      citizenship: req.body.citizenship,
      country: req.body.country,
      education_level: req.body.education_level,
      ece_qualification: req.body.ece_qualification,
      experience_with_children: req.body.experience_with_children,
      last_minute_work: req.body.last_minute_work,
      ic_number: req.body.ic_number,
      passport_number: req.body.passport_number,
      resume_path: req.body.resume_path,
      status: req.body.status,
      selected_cities: req.body.selected_cities,
      selected_states: req.body.selected_states,
      preferred_location: req.body.preferred_location,
      email_verified_at: req.body.email_verified_at ? new Date(req.body.email_verified_at) : undefined,
      phone_number_verified_at: req.body.phone_number_verified_at ? new Date(req.body.phone_number_verified_at) : undefined,
      updated_at: new Date(),
      last_updated: new Date()
    };

    const gantifier = await prisma.gantifiers.update({
      where: { id },
      data,
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
    });

    res.json({
      success: true,
      data: gantifier
    });
  })
);

/**
 * PATCH /api/gantifiers/:id/stats
 * Update gantifier statistics (separate endpoint for computed fields)
 */
router.patch(
  '/:id/stats',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.gantifiersUpdateInput = {
      average_rating: req.body.average_rating,
      completion_rate: req.body.completion_rate,
      total_jobs_completed: req.body.total_jobs_completed,
      last_updated: new Date()
    };

    const gantifier = await prisma.gantifiers.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: gantifier
    });
  })
);

/**
 * DELETE /api/gantifiers/:id
 * Delete a gantifier
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if gantifier has assignments
    const assignmentsCount = await prisma.job_assignments.count({
      where: { gantifier_id: id }
    });

    if (assignmentsCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete gantifier with existing job assignments',
        assignmentsCount
      });
    }

    await prisma.gantifiers.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Gantifier deleted successfully'
    });
  })
);

export default router;
