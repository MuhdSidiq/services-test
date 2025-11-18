import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../app/generated/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { pagination } from '../middleware/pagination';
import { validateId } from '../middleware/validation';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all account transaction routes
router.use(authenticate);

/**
 * GET /api/account-transactions
 * List all account transactions with pagination
 * Note: This is an immutable ledger - no update/delete operations allowed
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { account_id, transaction_type, payment_id, job_order_id } = req.query;

    const where: any = {};
    if (account_id) where.account_id = account_id;
    if (transaction_type) where.transaction_type = transaction_type;
    if (payment_id) where.payment_id = payment_id;
    if (job_order_id) where.job_order_id = job_order_id;

    const [transactions, total] = await Promise.all([
      prisma.account_transactions.findMany({
        where,
        skip,
        take: limit,
        include: {
          accounts: {
            select: {
              id: true,
              center_id: true,
              balance: true,
              centers: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          payments: {
            select: {
              id: true,
              billplz_bill_id: true,
              status: true,
              total_amount: true,
            },
          },
          job_orders: {
            select: {
              id: true,
              scheduled_date: true,
              status: true,
              center_location: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.account_transactions.count({ where }),
    ]);

    res.json({
      data: transactions,
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
 * GET /api/account-transactions/:id
 * Get a single transaction by ID
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const transaction = await prisma.account_transactions.findUnique({
      where: { id: req.params.id },
      include: {
        accounts: {
          include: {
            centers: true,
          },
        },
        payments: true,
        job_orders: true,
      },
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: `No transaction found with ID: ${req.params.id}`,
      });
    }

    res.json(transaction);
  })
);

/**
 * GET /api/account-transactions/account/:account_id
 * Get all transactions for a specific account
 */
router.get(
  '/account/:account_id',
  validateId,
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { transaction_type } = req.query;

    const where: any = { account_id: req.params.account_id };
    if (transaction_type) where.transaction_type = transaction_type;

    const [transactions, total] = await Promise.all([
      prisma.account_transactions.findMany({
        where,
        skip,
        take: limit,
        include: {
          payments: {
            select: {
              id: true,
              billplz_bill_id: true,
              status: true,
              total_amount: true,
            },
          },
          job_orders: {
            select: {
              id: true,
              scheduled_date: true,
              status: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.account_transactions.count({ where }),
    ]);

    res.json({
      data: transactions,
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
 * GET /api/account-transactions/job-order/:job_order_id
 * Get all transactions for a specific job order
 */
router.get(
  '/job-order/:job_order_id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const transactions = await prisma.account_transactions.findMany({
      where: { job_order_id: req.params.job_order_id },
      include: {
        accounts: {
          include: {
            centers: true,
          },
        },
        payments: true,
      },
      orderBy: { created_at: 'asc' },
    });

    res.json({
      data: transactions,
      total: transactions.length,
    });
  })
);

/**
 * GET /api/account-transactions/account/:account_id/summary
 * Get transaction summary for an account
 */
router.get(
  '/account/:account_id/summary',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;

    const where: any = { account_id: req.params.account_id };

    // Add date range filter if provided
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date as string);
      if (end_date) where.created_at.lte = new Date(end_date as string);
    }

    // Get summary by transaction type
    const summary = await prisma.account_transactions.groupBy({
      by: ['transaction_type'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
    });

    // Get current account balance
    const account = await prisma.accounts.findUnique({
      where: { id: req.params.account_id },
      select: {
        balance: true,
        total_paid: true,
        total_completed: true,
        total_refunded: true,
      },
    });

    res.json({
      account_id: req.params.account_id,
      current_balance: account?.balance || 0,
      summary: summary.map((item) => ({
        transaction_type: item.transaction_type,
        total_amount: item._sum.amount || 0,
        count: item._count.id,
      })),
      account_totals: account || null,
      period: {
        start_date: start_date || null,
        end_date: end_date || null,
      },
    });
  })
);

/**
 * POST /api/account-transactions
 * Create a new transaction (should be called by services, not directly)
 * This is included for completeness but should have auth restrictions in production
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      account_id,
      transaction_type,
      amount,
      balance_before,
      balance_after,
      payment_id,
      job_order_id,
      description,
      metadata,
    } = req.body;

    // Validate required fields
    if (!account_id || !transaction_type || !amount || balance_before === undefined || balance_after === undefined || !job_order_id || !description) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['account_id', 'transaction_type', 'amount', 'balance_before', 'balance_after', 'job_order_id', 'description'],
      });
    }

    // Validate transaction type
    const validTypes = ['HOLD', 'DEDUCT', 'REFUND', 'WITHDRAW', 'FEE'];
    if (!validTypes.includes(transaction_type)) {
      return res.status(400).json({
        error: 'Invalid transaction type',
        message: `Transaction type must be one of: ${validTypes.join(', ')}`,
      });
    }

    const transaction = await prisma.account_transactions.create({
      data: {
        account_id,
        transaction_type,
        amount: parseFloat(amount),
        balance_before: parseFloat(balance_before),
        balance_after: parseFloat(balance_after),
        payment_id,
        job_order_id,
        description,
        metadata,
      },
      include: {
        accounts: true,
        payments: true,
        job_orders: true,
      },
    });

    res.status(201).json(transaction);
  })
);

/**
 * Note: No PUT/PATCH/DELETE endpoints
 * Account transactions are immutable for audit trail integrity
 * Once created, they cannot be modified or deleted
 */

export default router;
