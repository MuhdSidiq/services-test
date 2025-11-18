import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import paymentService from '../services/payment.service';
import accountService from '../services/account.service';
import { findNearbyGantifiers } from '../services/gantifier-discovery.service';
import { createJobOffers, sendOffersViaWhatsApp } from '../services/offer.service';
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

          // After successful payment, find nearby gantifiers and send offers
          console.log('🔍 Starting gantifier discovery for job order:', payment.job_order_id);

          try {
            // Get job order details
            const jobOrder = await prisma.job_orders.findUnique({
              where: { id: payment.job_order_id },
              include: { centers: true }
            });

            if (!jobOrder) {
              console.error('❌ Job order not found:', payment.job_order_id);
            } else {
              // Find nearby gantifiers within 20KM radius
              const nearbyGantifiers = await findNearbyGantifiers(
                jobOrder.center_location,
                jobOrder.scheduled_date.toISOString(),
                20 // 20KM radius
              );

              console.log(`✅ Found ${nearbyGantifiers.length} nearby gantifiers`);

              if (nearbyGantifiers.length > 0) {
                // Create job offers for discovered gantifiers
                const offers = await createJobOffers(payment.job_order_id, nearbyGantifiers);

                console.log(`✅ Created ${offers.length} job offers`);

                // Send WhatsApp notifications to gantifiers
                const sendResults = await sendOffersViaWhatsApp(offers);

                const successCount = sendResults.filter(r => r.success).length;
                console.log(`✅ Sent ${successCount}/${offers.length} WhatsApp job offers`);

                // Update job order status to AWAITING_GANTIFIER_RESPONSE
                await prisma.job_orders.update({
                  where: { id: payment.job_order_id },
                  data: { status: 'AWAITING_GANTIFIER_RESPONSE' }
                });

                console.log('✅ Job order status updated to AWAITING_GANTIFIER_RESPONSE');
              } else {
                console.log('⚠️ No nearby gantifiers found for this job');
              }
            }
          } catch (gantifierError: any) {
            console.error('❌ Error in gantifier discovery workflow:', gantifierError.message);
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
