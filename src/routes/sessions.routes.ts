import { Router } from 'express';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { pagination, paginatedResponse, PaginationParams } from '../middleware/pagination';
import { authenticate } from '../middleware/auth.middleware';
import type { Prisma } from '../../app/generated/prisma';
import crypto from 'crypto';

const router = Router();

// Apply authentication middleware to all session routes
router.use(authenticate);

/**
 * POST /api/sessions
 * Create a new session
 */
router.post(
  '/',
  validateRequired(['id', 'user_id', 'expires_at']),
  asyncHandler(async (req, res) => {
    // Generate secure token if not provided
    const token = req.body.token || crypto.randomBytes(32).toString('hex');

    const data: Prisma.sessionsCreateInput = {
      id: req.body.id,
      token,
      expires_at: new Date(req.body.expires_at),
      created_at: new Date(),
      updated_at: new Date(),
      users: {
        connect: { id: req.body.user_id }
      }
    };

    const session = await prisma.sessions.create({
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
      data: session
    });
  })
);

/**
 * GET /api/sessions
 * List all sessions with pagination
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req, res) => {
    const { skip, limit, page } = (req as any).pagination as PaginationParams;
    const { user_id, active } = req.query;

    const where: Prisma.sessionsWhereInput = {};

    if (user_id) {
      where.user_id = user_id as string;
    }

    // Filter for active sessions (not expired)
    if (active === 'true') {
      where.expires_at = {
        gte: new Date()
      };
    } else if (active === 'false') {
      where.expires_at = {
        lt: new Date()
      };
    }

    const [sessions, total] = await Promise.all([
      prisma.sessions.findMany({
        where,
        skip,
        take: limit,
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.sessions.count({ where })
    ]);

    res.json(paginatedResponse(sessions, total, page, limit));
  })
);

/**
 * GET /api/sessions/:id
 * Get a single session by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const session = await prisma.sessions.findUnique({
      where: { id },
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

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: session
    });
  })
);

/**
 * GET /api/sessions/token/:token
 * Get session by token (for authentication)
 */
router.get(
  '/token/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const session = await prisma.sessions.findUnique({
      where: { token },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role_id: true,
            roles: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if session is expired
    if (session.expires_at < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }

    res.json({
      success: true,
      data: session
    });
  })
);

/**
 * PUT /api/sessions/:id
 * Update a session (e.g., extend expiration)
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data: Prisma.sessionsUpdateInput = {
      expires_at: req.body.expires_at ? new Date(req.body.expires_at) : undefined,
      updated_at: new Date()
    };

    const session = await prisma.sessions.update({
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
      data: session
    });
  })
);

/**
 * DELETE /api/sessions/:id
 * Delete a session (logout)
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.sessions.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  })
);

/**
 * DELETE /api/sessions/user/:user_id
 * Delete all sessions for a user (logout all devices)
 */
router.delete(
  '/user/:user_id',
  validateId,
  asyncHandler(async (req, res) => {
    const { user_id } = req.params;

    const result = await prisma.sessions.deleteMany({
      where: { user_id }
    });

    res.json({
      success: true,
      message: `Deleted ${result.count} session(s)`,
      count: result.count
    });
  })
);

export default router;
