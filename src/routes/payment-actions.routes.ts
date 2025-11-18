import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validateRequired, validateId } from '../middleware/validation';
import { authenticate } from '../middleware/auth.middleware';
import paymentService from '../services/payment.service';
import accountService from '../services/account.service';
import withdrawalService from '../services/withdrawal.service';

const router = Router();

// Apply authentication middleware to all payment action routes
router.use(authenticate);

/**
 * POST /api/payment-actions/create-payment
 * Create a payment for a job order with Billplz integration
 */
router.post(
  '/create-payment',
  validateRequired(['job_order_id', 'center_id', 'gantifier_fee', 'service_fee']),
  asyncHandler(async (req: Request, res: Response) => {
    const { job_order_id, center_id, gantifier_fee, service_fee, description } = req.body;

    const result = await paymentService.createPayment({
      job_order_id,
      center_id,
      gantifier_fee: parseFloat(gantifier_fee),
      service_fee: parseFloat(service_fee),
      description,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Payment created successfully. Redirect user to payment_url.',
    });
  })
);

/**
 * POST /api/payment-actions/create-admin-manual-payment
 * Create a manual payment record for admin-created job orders
 *
 * This endpoint creates a payment record without Billplz integration
 * for admin-initiated job orders. The payment is marked as PAID immediately
 * and can be used for tracking purposes.
 *
 * Use cases:
 * - Admin creates job orders manually
 * - Prepaid packages
 * - Offline payments
 * - Testing purposes
 */
router.post(
  '/create-admin-manual-payment',
  validateRequired(['job_order_id', 'center_id', 'gantifier_fee', 'service_fee']),
  asyncHandler(async (req: Request, res: Response) => {
    const { job_order_id, center_id, gantifier_fee, service_fee, description } = req.body;

    // Import prisma
    const { PrismaClient } = await import('../../app/generated/prisma');
    const prisma = new PrismaClient();

    try {
      // Calculate total amount
      const total_amount = parseFloat(gantifier_fee) + parseFloat(service_fee);

      // Create payment record marked as PAID with ADMIN_MANUAL method
      const payment = await prisma.payments.create({
        data: {
          job_order_id,
          center_id,
          gantifier_fee: parseFloat(gantifier_fee),
          service_fee: parseFloat(service_fee),
          total_amount,
          currency: 'MYR',
          payment_method: 'ADMIN_MANUAL',
          status: 'PAID',
          paid_at: new Date(),
          description: description || `Admin manual payment for job order ${job_order_id}`,
          reference_number: `ADMIN-${Date.now()}`
        },
        include: {
          job_orders: true,
          centers: true,
        },
      });

      console.log(`[ADMIN-PAYMENT] ✅ Created admin manual payment: ${payment.id}`);

      res.status(201).json({
        success: true,
        data: payment,
        message: 'Admin manual payment created successfully. You can now trigger matching.',
      });
    } finally {
      await prisma.$disconnect();
    }
  })
);

/**
 * POST /api/payment-actions/hold-payment
 * Hold payment amount in account (called after payment confirmation)
 */
router.post(
  '/hold-payment',
  validateRequired(['center_id', 'amount', 'payment_id', 'job_order_id']),
  asyncHandler(async (req: Request, res: Response) => {
    const { center_id, amount, payment_id, job_order_id, description } = req.body;

    const transaction = await accountService.holdPayment({
      center_id,
      amount: parseFloat(amount),
      payment_id,
      job_order_id,
      description: description || `Payment held for job order ${job_order_id}`,
    });

    res.json({
      success: true,
      data: transaction,
      message: 'Payment held in account successfully',
    });
  })
);

/**
 * POST /api/payment-actions/complete-job
 * Complete a job and deduct payment from account (pay gantifier)
 */
router.post(
  '/complete-job',
  validateRequired(['center_id', 'job_order_id', 'amount']),
  asyncHandler(async (req: Request, res: Response) => {
    const { center_id, job_order_id, amount, payment_id } = req.body;

    const transaction = await accountService.deductAmount({
      center_id,
      amount: parseFloat(amount),
      payment_id,
      job_order_id,
      description: `Payment deducted for completed job ${job_order_id}`,
    });

    res.json({
      success: true,
      data: transaction,
      message: 'Job completed and payment deducted from account',
    });
  })
);

/**
 * POST /api/payment-actions/refund-job
 * Refund payment to account (for cancelled jobs or gantifier no-show)
 */
router.post(
  '/refund-job',
  validateRequired(['center_id', 'job_order_id', 'amount', 'reason']),
  asyncHandler(async (req: Request, res: Response) => {
    const { center_id, job_order_id, amount, payment_id, reason } = req.body;

    const transaction = await accountService.refundAmount({
      center_id,
      amount: parseFloat(amount),
      payment_id,
      job_order_id,
      description: `Refund for job ${job_order_id}: ${reason}`,
    });

    res.json({
      success: true,
      data: transaction,
      message: 'Payment refunded to account successfully',
    });
  })
);

/**
 * POST /api/payment-actions/request-withdrawal
 * Create a withdrawal request
 */
router.post(
  '/request-withdrawal',
  validateRequired(['center_id', 'amount']),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      center_id,
      amount,
      bank_name,
      bank_account_number,
      bank_account_name,
      notes,
    } = req.body;

    const withdrawal = await withdrawalService.createWithdrawalRequest({
      center_id,
      amount: parseFloat(amount),
      bank_name,
      bank_account_number,
      bank_account_name,
      notes,
    });

    res.status(201).json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal request created successfully',
    });
  })
);

/**
 * POST /api/payment-actions/approve-withdrawal
 * Approve a withdrawal request (admin only)
 */
router.post(
  '/approve-withdrawal/:id',
  validateId,
  validateRequired(['processed_by']),
  asyncHandler(async (req: Request, res: Response) => {
    const { processed_by, admin_notes } = req.body;

    const withdrawal = await withdrawalService.approveWithdrawal({
      withdrawal_id: req.params.id,
      processed_by,
      admin_notes,
    });

    res.json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal approved successfully',
    });
  })
);

/**
 * POST /api/payment-actions/reject-withdrawal
 * Reject a withdrawal request (admin only)
 */
router.post(
  '/reject-withdrawal/:id',
  validateId,
  validateRequired(['processed_by', 'admin_notes']),
  asyncHandler(async (req: Request, res: Response) => {
    const { processed_by, admin_notes } = req.body;

    const withdrawal = await withdrawalService.rejectWithdrawal({
      withdrawal_id: req.params.id,
      processed_by,
      admin_notes,
    });

    res.json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal rejected',
    });
  })
);

/**
 * POST /api/payment-actions/process-withdrawal
 * Mark withdrawal as processing (admin only)
 */
router.post(
  '/process-withdrawal/:id',
  validateId,
  validateRequired(['processed_by']),
  asyncHandler(async (req: Request, res: Response) => {
    const { processed_by, admin_notes } = req.body;

    const withdrawal = await withdrawalService.markAsProcessing({
      withdrawal_id: req.params.id,
      processed_by,
      admin_notes,
    });

    res.json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal marked as processing',
    });
  })
);

/**
 * POST /api/payment-actions/complete-withdrawal
 * Complete withdrawal and deduct from account (admin only)
 */
router.post(
  '/complete-withdrawal/:id',
  validateId,
  validateRequired(['processed_by']),
  asyncHandler(async (req: Request, res: Response) => {
    const { processed_by, admin_notes } = req.body;

    const withdrawal = await withdrawalService.completeWithdrawal({
      withdrawal_id: req.params.id,
      processed_by,
      admin_notes,
    });

    res.json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal completed and amount deducted from account',
    });
  })
);

/**
 * POST /api/payment-actions/cancel-withdrawal
 * Cancel a withdrawal request
 */
router.post(
  '/cancel-withdrawal/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { cancelled_by, admin_notes } = req.body;

    const withdrawal = await withdrawalService.cancelWithdrawal({
      withdrawal_id: req.params.id,
      cancelled_by,
      admin_notes,
    });

    res.json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal cancelled',
    });
  })
);

/**
 * GET /api/payment-actions/account-balance/:center_id
 * Get account balance for a center
 */
router.get(
  '/account-balance/:center_id',
  asyncHandler(async (req: Request, res: Response) => {
    const balance = await accountService.getBalance(req.params.center_id);

    res.json({
      success: true,
      data: {
        center_id: req.params.center_id,
        balance,
        currency: 'MYR',
      },
    });
  })
);

/**
 * GET /api/payment-actions/account-summary/:center_id
 * Get account summary for a center
 */
router.get(
  '/account-summary/:center_id',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await accountService.getAccountSummary(req.params.center_id);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
      });
    }

    res.json({
      success: true,
      data: summary,
    });
  })
);

export default router;
