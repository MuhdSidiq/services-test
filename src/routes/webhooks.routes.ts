import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import paymentService from '../services/payment.service';
import accountService from '../services/account.service';
import { triggerJobMatching } from '../services/job-matching.service';
import { PrismaClient } from '../../app/generated/prisma';

const prisma = new PrismaClient();

const router = Router();

/**
 * POST /api/webhooks/billplz
 * Handle Billplz payment callback
 */
router.post(
  '/billplz',
  asyncHandler(async (req: Request, res: Response) => {
    const webhookData = req.body;

    console.log('📥 Billplz Webhook Received:', {
      billplz_bill_id: webhookData.id,
      paid: webhookData.paid,
      state: webhookData.state,
      amount: webhookData.amount,
    });

    // Validate required fields
    if (!webhookData.id) {
      return res.status(400).json({
        error: 'Missing required field: id',
      });
    }

    try {
      // Process webhook through payment service
      await paymentService.handleBillplzWebhook(webhookData);

      // If payment is paid, hold the amount in account
      if (webhookData.paid && webhookData.state === 'paid') {
        const payment = await paymentService.getPaymentByBillplzId(webhookData.id);

        if (payment) {
          // Hold payment amount in account
          await accountService.holdPayment({
            center_id: payment.center_id,
            amount: parseFloat(payment.total_amount.toString()),
            payment_id: payment.id,
            job_order_id: payment.job_order_id,
            description: `Payment held for job order ${payment.job_order_id}`,
          });

          console.log('✅ Payment held in account:', {
            payment_id: payment.id,
            amount: payment.total_amount,
            center_id: payment.center_id,
          });

          // After successful payment, trigger gantifier matching
          console.log('🔍 Triggering gantifier matching for job order:', payment.job_order_id);

          try {
            // Use the job matching service to handle the complete workflow
            const matchingResult = await triggerJobMatching({
              jobOrderId: payment.job_order_id,
              radius: 20, // 20KM radius
              paymentId: payment.id
            });

            if (matchingResult.success) {
              console.log('✅ Job matching completed successfully:', matchingResult.message);
              console.log(`   - Gantifiers found: ${matchingResult.data?.gantifiersFound}`);
              console.log(`   - Offers created: ${matchingResult.data?.offersCreated}`);
              console.log(`   - Offers sent: ${matchingResult.data?.offersSent}`);
            } else {
              console.log('⚠️ Job matching failed:', matchingResult.message);
            }
          } catch (gantifierError: any) {
            console.error('❌ Error in gantifier matching workflow:', gantifierError.message);
            // Don't fail the webhook if gantifier discovery fails
            // The payment has already been processed successfully
          }
        }
      }

      res.json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error: any) {
      console.error('❌ Billplz Webhook Error:', error.message);

      // Still return 200 to Billplz to prevent retries for errors we can't fix
      res.status(200).json({
        success: false,
        error: error.message,
      });
    }
  })
);

/**
 * GET /api/webhooks/billplz/test
 * Test endpoint to verify webhook is accessible
 */
router.get('/billplz/test', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Billplz webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
  });
});

export default router;
