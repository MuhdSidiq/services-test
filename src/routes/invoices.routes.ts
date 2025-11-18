// src/routes/invoices.routes.ts
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validateId } from '../middleware/validation';
import { authenticate } from '../middleware/auth.middleware';
import { generateInvoicePDF, getInvoiceData } from '../services/invoice.service';
import { PrismaClient } from '../../app/generated/prisma';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all invoice routes
router.use(authenticate);

/**
 * GET /api/invoices/job-order/:job_order_id/download
 * Download invoice PDF for a completed job order
 *
 * Authorization:
 * - Centers: Can download invoices for their own job orders
 * - Admins: Can download any invoice
 * - Gantifiers: Can download invoices for jobs they completed
 */
router.get(
  '/job-order/:job_order_id/download',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { job_order_id } = req.params;
    const user = (req as any).user; // User from authentication middleware

    console.log(`[INVOICE] Download request for job order: ${job_order_id} by user: ${user?.id}`);

    // Fetch job order with authorization check
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: job_order_id },
      include: {
        centers: {
          include: {
            users: true
          }
        },
        gantifiers: {
          include: {
            users: true
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

    // Check if job is completed
    if (jobOrder.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'Invoice only available for completed jobs',
        currentStatus: jobOrder.status
      });
    }

    // Authorization check
    const isAuthorized = await checkInvoiceAuthorization(user, jobOrder);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to download this invoice'
      });
    }

    try {
      // Generate PDF
      console.log(`[INVOICE] Generating PDF for job order: ${job_order_id}`);
      const pdfBuffer = await generateInvoicePDF(job_order_id);

      // Get invoice data for filename
      const invoiceData = await getInvoiceData(job_order_id);
      const filename = `Invoice-${invoiceData.invoiceNumber}.pdf`;

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      console.log(`[INVOICE] ✅ PDF generated successfully: ${filename}`);

      // Send PDF
      res.send(pdfBuffer);

    } catch (error: any) {
      console.error('[INVOICE] ❌ Error generating PDF:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate invoice',
        message: error.message
      });
    }
  })
);

/**
 * GET /api/invoices/job-order/:job_order_id/preview
 * Get invoice data as JSON (for preview or debugging)
 */
router.get(
  '/job-order/:job_order_id/preview',
  validateId,
  asyncHandler(async (req: Request, res: Response) => {
    const { job_order_id } = req.params;
    const user = (req as any).user;

    console.log(`[INVOICE] Preview request for job order: ${job_order_id}`);

    // Fetch job order
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: job_order_id },
      include: {
        centers: {
          include: {
            users: true
          }
        },
        gantifiers: {
          include: {
            users: true
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

    // Check if job is completed
    if (jobOrder.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'Invoice only available for completed jobs',
        currentStatus: jobOrder.status
      });
    }

    // Authorization check
    const isAuthorized = await checkInvoiceAuthorization(user, jobOrder);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to view this invoice'
      });
    }

    try {
      const invoiceData = await getInvoiceData(job_order_id);

      res.json({
        success: true,
        data: {
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: invoiceData.invoiceDate,
          jobOrder: {
            id: invoiceData.jobOrder.id,
            scheduled_date: invoiceData.jobOrder.scheduled_date,
            start_time: invoiceData.jobOrder.start_time,
            end_time: invoiceData.jobOrder.end_time,
            status: invoiceData.jobOrder.status,
            completed_at: invoiceData.jobOrder.completed_at
          },
          center: {
            name: invoiceData.center.name,
            email: invoiceData.center.email,
            phone: invoiceData.center.phone,
            address: invoiceData.center.address,
            city: invoiceData.center.city,
            state: invoiceData.center.state
          },
          gantifier: invoiceData.gantifier ? {
            full_name: invoiceData.gantifier.full_name,
            email: invoiceData.gantifier.users?.email,
            phone: invoiceData.gantifier.users?.phone
          } : null,
          payment: {
            gantifier_fee: invoiceData.payment.gantifier_fee,
            service_fee: invoiceData.payment.service_fee,
            total_amount: invoiceData.payment.total_amount,
            payment_method: invoiceData.payment.payment_method,
            status: invoiceData.payment.status,
            paid_at: invoiceData.payment.paid_at
          }
        }
      });

    } catch (error: any) {
      console.error('[INVOICE] ❌ Error getting invoice data:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get invoice data',
        message: error.message
      });
    }
  })
);

/**
 * Helper function to check if user is authorized to access invoice
 *
 * Authorization rules:
 * - Admin: Can access any invoice
 * - Center: Can access invoices for their own job orders
 * - Gantifier: Can access invoices for jobs they completed
 */
async function checkInvoiceAuthorization(user: any, jobOrder: any): Promise<boolean> {
  if (!user) {
    return false;
  }

  // Get user's role
  const userWithRole = await prisma.users.findUnique({
    where: { id: user.id },
    include: {
      roles: true,
      centers: true,
      gantifiers: true
    }
  });

  if (!userWithRole) {
    return false;
  }

  // Check if user is admin
  if (userWithRole.roles?.name === 'ADMIN') {
    console.log('[INVOICE] ✅ Authorization: Admin access');
    return true;
  }

  // Check if user is the center who created the job order
  if (userWithRole.centers && userWithRole.centers.length > 0) {
    const centerIds = userWithRole.centers.map(c => c.id);
    if (centerIds.includes(jobOrder.center_id)) {
      console.log('[INVOICE] ✅ Authorization: Center owns job order');
      return true;
    }
  }

  // Check if user is the gantifier who completed the job
  if (userWithRole.gantifiers && jobOrder.gantifier_id) {
    if (userWithRole.gantifiers.id === jobOrder.gantifier_id) {
      console.log('[INVOICE] ✅ Authorization: Gantifier completed job');
      return true;
    }
  }

  console.log('[INVOICE] ❌ Authorization: Access denied');
  return false;
}

export default router;
