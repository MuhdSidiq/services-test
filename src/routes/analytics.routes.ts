// src/routes/analytics.routes.ts
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { authenticate } from '../middleware/auth.middleware';
import { PrismaClient, PeriodType } from '../../app/generated/prisma';
import { aggregateAllStats } from '../services/analytics-aggregation.service';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all analytics routes
router.use(authenticate);

/**
 * Helper function to check if user is admin
 */
function isAdmin(user: any): boolean {
  return user?.roles?.name === 'ADMIN';
}

/**
 * Helper to parse period type from query
 */
function parsePeriodType(periodType?: string): PeriodType {
  const validTypes: PeriodType[] = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'];
  const upperType = periodType?.toUpperCase() as PeriodType;
  return validTypes.includes(upperType) ? upperType : 'DAY';
}

/**
 * Helper to parse date from query
 */
function parseDate(dateString?: string): Date {
  if (!dateString) {
    return new Date();
  }
  const parsed = new Date(dateString);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// ========================================
// MANUAL AGGREGATION (Admin Only)
// ========================================

/**
 * POST /api/analytics/aggregate
 * Trigger analytics aggregation manually
 * (Admin only - for testing or on-demand updates)
 */
router.post(
  '/aggregate',
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;

    // Check if user is admin
    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: { roles: true }
    });

    if (!isAdmin(userWithRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can trigger manual aggregation'
      });
    }

    const { date, period_type } = req.body;

    const targetDate = parseDate(date);
    const periodType = parsePeriodType(period_type);

    console.log(`[ANALYTICS] Manual aggregation triggered by admin ${user.id}`);

    try {
      await aggregateAllStats(targetDate, periodType);

      res.json({
        success: true,
        message: `Analytics aggregated successfully for ${periodType}`,
        data: {
          date: targetDate,
          period_type: periodType
        }
      });
    } catch (error: any) {
      console.error('[ANALYTICS] Manual aggregation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to aggregate analytics',
        message: error.message
      });
    }
  })
);

// ========================================
// CENTER ANALYTICS
// ========================================

/**
 * GET /api/analytics/centers/:center_id
 * Get analytics for a specific center
 */
router.get(
  '/centers/:center_id',
  asyncHandler(async (req: Request, res: Response) => {
    const { center_id } = req.params;
    const { period_type, start_date, end_date, limit } = req.query;
    const user = (req as any).user;

    // Authorization: Only admin or the center itself can view analytics
    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: {
        roles: true,
        centers: true
      }
    });

    const isOwner = userWithRole?.centers?.some(c => c.id === center_id);
    if (!isAdmin(userWithRole) && !isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view these analytics'
      });
    }

    const periodType = parsePeriodType(period_type as string);

    // Build query
    const where: any = {
      center_id: center_id,
      period_type: periodType
    };

    if (start_date || end_date) {
      where.period_start = {};
      if (start_date) {
        where.period_start.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.period_start.lte = new Date(end_date as string);
      }
    }

    const stats = await prisma.analytics_center_stats.findMany({
      where,
      orderBy: {
        period_start: 'desc'
      },
      take: limit ? parseInt(limit as string) : 30
    });

    res.json({
      success: true,
      data: stats,
      meta: {
        count: stats.length,
        period_type: periodType,
        center_id: center_id
      }
    });
  })
);

/**
 * GET /api/analytics/centers
 * Get analytics for all centers (Admin only)
 */
router.get(
  '/centers',
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;

    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: { roles: true }
    });

    if (!isAdmin(userWithRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can view all center analytics'
      });
    }

    const { period_type, start_date, end_date, limit } = req.query;
    const periodType = parsePeriodType(period_type as string);

    const where: any = {
      period_type: periodType
    };

    if (start_date || end_date) {
      where.period_start = {};
      if (start_date) {
        where.period_start.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.period_start.lte = new Date(end_date as string);
      }
    }

    const stats = await prisma.analytics_center_stats.findMany({
      where,
      include: {
        centers: {
          select: {
            id: true,
            name: true,
            email: true,
            city: true,
            state: true
          }
        }
      },
      orderBy: [
        { period_start: 'desc' },
        { total_spent: 'desc' }
      ],
      take: limit ? parseInt(limit as string) : 100
    });

    res.json({
      success: true,
      data: stats,
      meta: {
        count: stats.length,
        period_type: periodType
      }
    });
  })
);

// ========================================
// GANTIFIER ANALYTICS
// ========================================

/**
 * GET /api/analytics/gantifiers/:gantifier_id
 * Get analytics for a specific gantifier
 */
router.get(
  '/gantifiers/:gantifier_id',
  asyncHandler(async (req: Request, res: Response) => {
    const { gantifier_id } = req.params;
    const { period_type, start_date, end_date, limit } = req.query;
    const user = (req as any).user;

    // Authorization: Only admin or the gantifier itself can view analytics
    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: {
        roles: true,
        gantifiers: true
      }
    });

    const isOwner = userWithRole?.gantifiers?.id === gantifier_id;
    if (!isAdmin(userWithRole) && !isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view these analytics'
      });
    }

    const periodType = parsePeriodType(period_type as string);

    const where: any = {
      gantifier_id: gantifier_id,
      period_type: periodType
    };

    if (start_date || end_date) {
      where.period_start = {};
      if (start_date) {
        where.period_start.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.period_start.lte = new Date(end_date as string);
      }
    }

    const stats = await prisma.analytics_gantifier_stats.findMany({
      where,
      orderBy: {
        period_start: 'desc'
      },
      take: limit ? parseInt(limit as string) : 30
    });

    res.json({
      success: true,
      data: stats,
      meta: {
        count: stats.length,
        period_type: periodType,
        gantifier_id: gantifier_id
      }
    });
  })
);

/**
 * GET /api/analytics/gantifiers
 * Get analytics for all gantifiers (Admin only)
 */
router.get(
  '/gantifiers',
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;

    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: { roles: true }
    });

    if (!isAdmin(userWithRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can view all gantifier analytics'
      });
    }

    const { period_type, start_date, end_date, limit } = req.query;
    const periodType = parsePeriodType(period_type as string);

    const where: any = {
      period_type: periodType
    };

    if (start_date || end_date) {
      where.period_start = {};
      if (start_date) {
        where.period_start.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.period_start.lte = new Date(end_date as string);
      }
    }

    const stats = await prisma.analytics_gantifier_stats.findMany({
      where,
      include: {
        gantifiers: {
          select: {
            id: true,
            full_name: true,
            city: true,
            state: true,
            average_rating: true,
            total_jobs_completed: true
          }
        }
      },
      orderBy: [
        { period_start: 'desc' },
        { total_earnings: 'desc' }
      ],
      take: limit ? parseInt(limit as string) : 100
    });

    res.json({
      success: true,
      data: stats,
      meta: {
        count: stats.length,
        period_type: periodType
      }
    });
  })
);

// ========================================
// PLATFORM ANALYTICS
// ========================================

/**
 * GET /api/analytics/platform
 * Get platform-wide analytics (Admin only)
 */
router.get(
  '/platform',
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;

    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: { roles: true }
    });

    if (!isAdmin(userWithRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can view platform analytics'
      });
    }

    const { period_type, start_date, end_date, limit } = req.query;
    const periodType = parsePeriodType(period_type as string);

    const where: any = {
      period_type: periodType
    };

    if (start_date || end_date) {
      where.period_start = {};
      if (start_date) {
        where.period_start.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.period_start.lte = new Date(end_date as string);
      }
    }

    const stats = await prisma.analytics_platform_stats.findMany({
      where,
      orderBy: {
        period_start: 'desc'
      },
      take: limit ? parseInt(limit as string) : 30
    });

    res.json({
      success: true,
      data: stats,
      meta: {
        count: stats.length,
        period_type: periodType
      }
    });
  })
);

/**
 * GET /api/analytics/dashboard
 * Get dashboard summary data (latest stats for all types)
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;

    const userWithRole = await prisma.users.findUnique({
      where: { id: user.id },
      include: {
        roles: true,
        centers: true,
        gantifiers: true
      }
    });

    const { period_type } = req.query;
    const periodType = parsePeriodType(period_type as string);

    let response: any = {
      success: true,
      data: {},
      meta: {
        period_type: periodType,
        user_role: userWithRole?.roles?.name
      }
    };

    // Admin sees everything
    if (isAdmin(userWithRole)) {
      const latestPlatformStats = await prisma.analytics_platform_stats.findFirst({
        where: { period_type: periodType },
        orderBy: { period_start: 'desc' }
      });

      response.data.platform = latestPlatformStats;
    }

    // Center sees their own stats
    if (userWithRole?.centers && userWithRole.centers.length > 0) {
      const centerStats = await Promise.all(
        userWithRole.centers.map(async (center) => {
          const stats = await prisma.analytics_center_stats.findFirst({
            where: {
              center_id: center.id,
              period_type: periodType
            },
            orderBy: { period_start: 'desc' }
          });
          return {
            center_id: center.id,
            center_name: center.name,
            stats
          };
        })
      );

      response.data.centers = centerStats;
    }

    // Gantifier sees their own stats
    if (userWithRole?.gantifiers) {
      const gantifierStats = await prisma.analytics_gantifier_stats.findFirst({
        where: {
          gantifier_id: userWithRole.gantifiers.id,
          period_type: periodType
        },
        orderBy: { period_start: 'desc' }
      });

      response.data.gantifier = gantifierStats;
    }

    res.json(response);
  })
);

export default router;
