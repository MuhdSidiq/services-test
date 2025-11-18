import { Router, Request, Response } from 'express';
import { PrismaClient, WithdrawalStatus } from '../../app/generated/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { pagination } from '../middleware/pagination';
import { validateRequired, validateId } from '../middleware/validation';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all withdrawal request routes
router.use(authenticate);

/**
 * GET /api/withdrawal-requests
 * List all withdrawal requests with pagination
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { status, center_id, account_id } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (center_id) where.center_id = center_id;
    if (account_id) where.account_id = account_id;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip,
        take: limit,
        include: {
          accounts: {
            select: {
              id: true,
              balance: true,
              currency: true,
            },
          },
          centers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { requested_at: 'desc' },
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    res.json({
      data: withdrawals,
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
 * GET /api/withdrawal-requests/:id
 * Get a single withdrawal request by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const withdrawal = await prisma.withdrawal_requests.findUnique({
      where: { id: req.params.id },
      include: {
        accounts: {
          include: {
            centers: true,
          },
        },
        centers: true,
      },
    });

    if (!withdrawal) {
      return res.status(404).json({
        error: 'Withdrawal request not found',
        message: `No withdrawal request found with ID: ${req.params.id}`,
      });
    }

    res.json(withdrawal);
  })
);

/**
 * GET /api/withdrawal-requests/account/:account_id
 * Get all withdrawal requests for a specific account
 */
router.get(
  '/account/:account_id',
  validateId,
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { status } = req.query;

    const where: any = { account_id: req.params.account_id };
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip,
        take: limit,
        include: {
          centers: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { requested_at: 'desc' },
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    res.json({
      data: withdrawals,
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
 * GET /api/withdrawal-requests/center/:center_id
 * Get all withdrawal requests for a specific center
 */
router.get(
  '/center/:center_id',
  validateId,
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { status } = req.query;

    const where: any = { center_id: req.params.center_id };
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip,
        take: limit,
        include: {
          accounts: {
            select: {
              balance: true,
              currency: true,
            },
          },
        },
        orderBy: { requested_at: 'desc' },
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    res.json({
      data: withdrawals,
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
 * GET /api/withdrawal-requests/pending
 * Get all pending withdrawal requests (for admin)
 */
router.get(
  '/status/pending',
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;

    const where = {
      status: {
        in: [
          WithdrawalStatus.PENDING,
          WithdrawalStatus.APPROVED,
          WithdrawalStatus.PROCESSING
        ]
      },
    };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip,
        take: limit,
        include: {
          accounts: true,
          centers: true,
        },
        orderBy: { requested_at: 'asc' }, // Oldest first for processing
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    res.json({
      data: withdrawals,
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
 * POST /api/withdrawal-requests
 * Create a new withdrawal request
 */
router.post(
  '/',
  validateRequired(['account_id', 'center_id', 'amount']),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      account_id,
      center_id,
      amount,
      bank_name,
      bank_account_number,
      bank_account_name,
      notes,
    } = req.body;

    // Validate amount is positive
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Withdrawal amount must be greater than 0',
      });
    }

    // Get current account balance
    const account = await prisma.accounts.findUnique({
      where: { id: account_id },
      select: { balance: true, status: true },
    });

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `No account found with ID: ${account_id}`,
      });
    }

    // Check account status
    if (account.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Account not active',
        message: `Cannot create withdrawal request for ${account.status} account`,
      });
    }

    // Check if sufficient balance
    if (parseFloat(account.balance.toString()) < parseFloat(amount)) {
      return res.status(400).json({
        error: 'Insufficient balance',
        message: 'Requested amount exceeds account balance',
        available_balance: account.balance,
        requested_amount: parseFloat(amount),
      });
    }

    const withdrawal = await prisma.withdrawal_requests.create({
      data: {
        account_id,
        center_id,
        amount: parseFloat(amount),
        requested_balance: parseFloat(account.balance.toString()),
        bank_name,
        bank_account_number,
        bank_account_name,
        notes,
        status: 'PENDING',
      },
      include: {
        accounts: true,
        centers: true,
      },
    });

    res.status(201).json(withdrawal);
  })
);

/**
 * PUT /api/withdrawal-requests/:id
 * Update withdrawal request details (only allowed for PENDING status)
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { bank_name, bank_account_number, bank_account_name, notes } = req.body;

    // Check current status
    const existing = await prisma.withdrawal_requests.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Withdrawal request not found',
      });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Cannot update withdrawal request',
        message: `Cannot update withdrawal request with status: ${existing.status}`,
      });
    }

    const updateData: any = {};
    if (bank_name !== undefined) updateData.bank_name = bank_name;
    if (bank_account_number !== undefined) updateData.bank_account_number = bank_account_number;
    if (bank_account_name !== undefined) updateData.bank_account_name = bank_account_name;
    if (notes !== undefined) updateData.notes = notes;

    const withdrawal = await prisma.withdrawal_requests.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        accounts: true,
        centers: true,
      },
    });

    res.json(withdrawal);
  })
);

/**
 * PATCH /api/withdrawal-requests/:id/status
 * Update withdrawal request status (admin only)
 */
router.patch(
  '/:id/status',
  validateId,
  validateRequired(['status']),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, admin_notes, processed_by } = req.body;

    // Validate status enum
    const validStatuses = ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updateData: any = { status };

    // Set processed timestamp for final states
    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status)) {
      updateData.processed_at = new Date();
      if (processed_by) updateData.processed_by = processed_by;
    }

    if (admin_notes) updateData.admin_notes = admin_notes;

    const withdrawal = await prisma.withdrawal_requests.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        accounts: true,
        centers: true,
      },
    });

    res.json(withdrawal);
  })
);

/**
 * PATCH /api/withdrawal-requests/:id/approve
 * Approve withdrawal request (shortcut endpoint)
 */
router.patch(
  '/:id/approve',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { admin_notes, processed_by } = req.body;

    const withdrawal = await prisma.withdrawal_requests.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        admin_notes,
        processed_by,
      },
      include: {
        accounts: true,
        centers: true,
      },
    });

    res.json(withdrawal);
  })
);

/**
 * PATCH /api/withdrawal-requests/:id/reject
 * Reject withdrawal request (shortcut endpoint)
 */
router.patch(
  '/:id/reject',
  validateId,
  validateRequired(['admin_notes']),
  asyncHandler(async (req: Request, res: Response) => {
    const { admin_notes, processed_by } = req.body;

    const withdrawal = await prisma.withdrawal_requests.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        admin_notes,
        processed_by,
        processed_at: new Date(),
      },
      include: {
        accounts: true,
        centers: true,
      },
    });

    res.json(withdrawal);
  })
);

/**
 * PATCH /api/withdrawal-requests/:id/complete
 * Mark withdrawal as completed (shortcut endpoint)
 */
router.patch(
  '/:id/complete',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { admin_notes, processed_by } = req.body;

    const withdrawal = await prisma.withdrawal_requests.update({
      where: { id: req.params.id },
      data: {
        status: 'COMPLETED',
        admin_notes,
        processed_by,
        processed_at: new Date(),
      },
      include: {
        accounts: true,
        centers: true,
      },
    });

    res.json(withdrawal);
  })
);

/**
 * DELETE /api/withdrawal-requests/:id
 * Cancel/delete a withdrawal request (only allowed for PENDING status)
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    // Check current status
    const withdrawal = await prisma.withdrawal_requests.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });

    if (!withdrawal) {
      return res.status(404).json({
        error: 'Withdrawal request not found',
      });
    }

    // Only allow deletion of pending requests
    if (withdrawal.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Cannot delete withdrawal request',
        message: `Cannot delete withdrawal request with status: ${withdrawal.status}. Use PATCH to update status to CANCELLED instead.`,
      });
    }

    await prisma.withdrawal_requests.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  })
);

export default router;
