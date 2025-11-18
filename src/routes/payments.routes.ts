import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../app/generated/prisma';
import { asyncHandler } from '../middleware/error-handler';
import { pagination } from '../middleware/pagination';
import { validateRequired, validateId } from '../middleware/validation';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all payment routes
router.use(authenticate);

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: List all payments
 *     description: Retrieve a paginated list of payments with optional filters
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, EXPIRED, CANCELLED, REFUNDED, COMPLETED]
 *         description: Filter by payment status
 *       - in: query
 *         name: center_id
 *         schema:
 *           type: string
 *         description: Filter by center ID
 *       - in: query
 *         name: payment_method
 *         schema:
 *           type: string
 *         description: Filter by payment method (e.g., billplz)
 *     responses:
 *       200:
 *         description: List of payments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Payment'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Unauthorized - JWT token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/',
  pagination,
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit, page } = req.pagination;
    const { status, center_id, payment_method } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (center_id) where.center_id = center_id;
    if (payment_method) where.payment_method = payment_method;

    const [payments, total] = await Promise.all([
      prisma.payments.findMany({
        where,
        skip,
        take: limit,
        include: {
          job_orders: {
            select: {
              id: true,
              scheduled_date: true,
              status: true,
              center_location: true,
            },
          },
          centers: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              account_transactions: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.payments.count({ where }),
    ]);

    res.json({
      data: payments,
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
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     description: Retrieve a single payment with full details including related job order and center
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *         example: "payment_123"
 *     responses:
 *       200:
 *         description: Payment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - JWT token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await prisma.payments.findUnique({
      where: { id: req.params.id },
      include: {
        job_orders: true,
        centers: true,
        account_transactions: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: `No payment found with ID: ${req.params.id}`,
      });
    }

    res.json(payment);
  })
);

/**
 * GET /api/payments/job-order/:job_order_id
 * Get payment by job order ID
 */
router.get(
  '/job-order/:job_order_id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await prisma.payments.findUnique({
      where: { job_order_id: req.params.job_order_id },
      include: {
        job_orders: true,
        centers: true,
        account_transactions: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: `No payment found for job order ID: ${req.params.job_order_id}`,
      });
    }

    res.json(payment);
  })
);

/**
 * GET /api/payments/billplz/:billplz_bill_id
 * Get payment by Billplz bill ID
 */
router.get(
  '/billplz/:billplz_bill_id',
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await prisma.payments.findUnique({
      where: { billplz_bill_id: req.params.billplz_bill_id },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: `No payment found for Billplz bill ID: ${req.params.billplz_bill_id}`,
      });
    }

    res.json(payment);
  })
);

/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Create a new payment
 *     description: Create a new payment record for a job order
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - job_order_id
 *               - center_id
 *               - gantifier_fee
 *               - service_fee
 *               - total_amount
 *             properties:
 *               job_order_id:
 *                 type: string
 *                 example: "job_123"
 *               center_id:
 *                 type: string
 *                 example: "center_123"
 *               gantifier_fee:
 *                 type: number
 *                 example: 135.00
 *                 description: Fee paid to gantifier
 *               service_fee:
 *                 type: number
 *                 example: 15.00
 *                 description: Gantify service fee
 *               total_amount:
 *                 type: number
 *                 example: 150.00
 *                 description: Total amount (must equal gantifier_fee + service_fee)
 *               currency:
 *                 type: string
 *                 default: "MYR"
 *                 example: "MYR"
 *               payment_method:
 *                 type: string
 *                 default: "billplz"
 *                 example: "billplz"
 *               billplz_bill_id:
 *                 type: string
 *                 example: "bill_xyz123"
 *               billplz_collection_id:
 *                 type: string
 *                 example: "coll_abc456"
 *               billplz_url:
 *                 type: string
 *                 example: "https://www.billplz.com/bills/bill_xyz123"
 *               description:
 *                 type: string
 *                 example: "Payment for job order #123"
 *               reference_number:
 *                 type: string
 *                 example: "REF123456"
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Invalid request - total amount mismatch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - JWT token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  validateRequired(['job_order_id', 'center_id', 'gantifier_fee', 'service_fee', 'total_amount']),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      job_order_id,
      center_id,
      gantifier_fee,
      service_fee,
      total_amount,
      currency = 'MYR',
      billplz_bill_id,
      billplz_collection_id,
      billplz_url,
      payment_method = 'billplz',
      description,
      reference_number,
    } = req.body;

    // Validate that total_amount = gantifier_fee + service_fee
    const calculatedTotal = parseFloat(gantifier_fee) + parseFloat(service_fee);
    if (Math.abs(calculatedTotal - parseFloat(total_amount)) > 0.01) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Total amount must equal gantifier fee + service fee',
        expected: calculatedTotal,
        received: parseFloat(total_amount),
      });
    }

    const payment = await prisma.payments.create({
      data: {
        job_order_id,
        center_id,
        gantifier_fee: parseFloat(gantifier_fee),
        service_fee: parseFloat(service_fee),
        total_amount: parseFloat(total_amount),
        currency,
        billplz_bill_id,
        billplz_collection_id,
        billplz_url,
        payment_method,
        description,
        reference_number,
        status: 'PENDING',
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    res.status(201).json(payment);
  })
);

/**
 * PUT /api/payments/:id
 * Update payment details
 */
router.put(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      billplz_bill_id,
      billplz_collection_id,
      billplz_url,
      description,
      reference_number,
    } = req.body;

    const updateData: any = {};
    if (billplz_bill_id !== undefined) updateData.billplz_bill_id = billplz_bill_id;
    if (billplz_collection_id !== undefined) updateData.billplz_collection_id = billplz_collection_id;
    if (billplz_url !== undefined) updateData.billplz_url = billplz_url;
    if (description !== undefined) updateData.description = description;
    if (reference_number !== undefined) updateData.reference_number = reference_number;

    const payment = await prisma.payments.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        job_orders: true,
        centers: true,
      },
    });

    res.json(payment);
  })
);

/**
 * @swagger
 * /api/payments/{id}/status:
 *   patch:
 *     summary: Update payment status
 *     description: Update the status of a payment (typically called by webhooks or internal services)
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *         example: "payment_123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, PAID, FAILED, EXPIRED, CANCELLED, REFUNDED, COMPLETED]
 *                 example: "PAID"
 *                 description: New payment status
 *               failure_reason:
 *                 type: string
 *                 example: "Insufficient funds"
 *                 description: Reason for failure (required if status is FAILED)
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Invalid status value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - JWT token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(
  '/:id/status',
  validateId,
  validateRequired(['status']),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, failure_reason } = req.body;

    // Validate status enum
    const validStatuses = ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updateData: any = { status };

    // Set timestamp based on status
    if (status === 'PAID') {
      updateData.paid_at = new Date();
    } else if (status === 'FAILED') {
      updateData.failed_at = new Date();
      if (failure_reason) updateData.failure_reason = failure_reason;
    } else if (status === 'EXPIRED') {
      updateData.expired_at = new Date();
    }

    const payment = await prisma.payments.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        job_orders: true,
        centers: true,
      },
    });

    res.json(payment);
  })
);

/**
 * PATCH /api/payments/:id/mark-paid
 * Mark payment as paid (shortcut endpoint)
 */
router.patch(
  '/:id/mark-paid',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await prisma.payments.update({
      where: { id: req.params.id },
      data: {
        status: 'PAID',
        paid_at: new Date(),
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    res.json(payment);
  })
);

/**
 * PATCH /api/payments/:id/mark-failed
 * Mark payment as failed (shortcut endpoint)
 */
router.patch(
  '/:id/mark-failed',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { failure_reason } = req.body;

    const payment = await prisma.payments.update({
      where: { id: req.params.id },
      data: {
        status: 'FAILED',
        failed_at: new Date(),
        failure_reason: failure_reason || 'Payment failed',
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    res.json(payment);
  })
);

/**
 * DELETE /api/payments/:id
 * Delete a payment (protected - only if status is PENDING or FAILED)
 */
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    // Check payment status
    const payment = await prisma.payments.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
      });
    }

    // Only allow deletion of pending or failed payments
    if (!['PENDING', 'FAILED', 'CANCELLED'].includes(payment.status)) {
      return res.status(400).json({
        error: 'Cannot delete payment',
        message: `Cannot delete payment with status: ${payment.status}`,
      });
    }

    await prisma.payments.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  })
);

export default router;
