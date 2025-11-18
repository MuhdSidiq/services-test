import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../app/generated/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { pagination } from '../middleware/pagination';
import { validateRequired, validateId } from '../middleware/validation';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all account routes
router.use(authenticate);

/**
 * GET /api/accounts
 * List all accounts with pagination
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { status, center_id } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (center_id) where.center_id = center_id;

    const [accounts, total] = await Promise.all([
      prisma.accounts.findMany({
        where,
        skip,
        take: limit,
        include: {
          centers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          _count: {
            select: {
              account_transactions: true,
              withdrawal_requests: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.accounts.count({ where }),
    ]);

    res.json({
      data: accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /api/accounts/:id
 * Get a single account by ID with full relations
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const account = await prisma.accounts.findUnique({
      where: { id: req.params.id },
      include: {
        centers: true,
        account_transactions: {
          orderBy: { created_at: 'desc' },
          take: 50, // Last 50 transactions
        },
        withdrawal_requests: {
          orderBy: { requested_at: 'desc' },
        },
      },
    });

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `No account found with ID: ${req.params.id}`,
      });
    }

    res.json(account);
  })
);

/**
 * GET /api/accounts/center/:center_id
 * Get account by center ID
 */
router.get(
  '/center/:center_id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const account = await prisma.accounts.findUnique({
      where: { center_id: req.params.center_id },
      include: {
        centers: true,
        account_transactions: {
          orderBy: { created_at: 'desc' },
          take: 50,
        },
        withdrawal_requests: {
          orderBy: { requested_at: 'desc' },
        },
      },
    });

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `No account found for center ID: ${req.params.center_id}`,
      });
    }

    res.json(account);
  })
);

/**
 * POST /api/accounts
 * Create a new account
 */
router.post(
  '/',
  validateRequired(['center_id']),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      center_id,
      balance = 0,
      total_paid = 0,
      total_completed = 0,
      total_refunded = 0,
      currency = 'MYR',
      status = 'ACTIVE',
    } = req.body;

    const account = await prisma.accounts.create({
      data: {
        center_id,
        balance,
        total_paid,
        total_completed,
        total_refunded,
        currency,
        status,
      },
      include: {
        centers: true,
      },
    });

    res.status(201).json(account);
  })
);

/**
 * PUT /api/accounts/:id
 * Update an account (for admin use - balance updates should go through transactions)
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { status, currency } = req.body;

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (currency !== undefined) updateData.currency = currency;

    const account = await prisma.accounts.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        centers: true,
      },
    });

    res.json(account);
  })
);

/**
 * PATCH /api/accounts/:id/status
 * Update account status (suspend/activate/close)
 */
router.patch(
  '/:id/status',
  validateId,
  validateRequired(['status']),
  asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.body;

    // Validate status enum
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const account = await prisma.accounts.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        centers: true,
      },
    });

    res.json(account);
  })
);

/**
 * GET /api/accounts/:id/balance
 * Get current balance and summary
 */
router.get(
  '/:id/balance',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const account = await prisma.accounts.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        balance: true,
        total_paid: true,
        total_completed: true,
        total_refunded: true,
        currency: true,
        status: true,
        updated_at: true,
      },
    });

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `No account found with ID: ${req.params.id}`,
      });
    }

    res.json(account);
  })
);

/**
 * DELETE /api/accounts/:id
 * Delete an account (protected - only if no transactions)
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    // Check if account has any transactions
    const transactionCount = await prisma.account_transactions.count({
      where: { account_id: req.params.id },
    });

    if (transactionCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete account',
        message: 'Account has transaction history and cannot be deleted',
      });
    }

    // Check if account has pending withdrawals
    const pendingWithdrawals = await prisma.withdrawal_requests.count({
      where: {
        account_id: req.params.id,
        status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
      },
    });

    if (pendingWithdrawals > 0) {
      return res.status(400).json({
        error: 'Cannot delete account',
        message: 'Account has pending withdrawal requests',
      });
    }

    await prisma.accounts.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  })
);

export default router;
