// src/services/job-matching.service.ts
import { PrismaClient } from '../../app/generated/prisma';
import { findNearbyGantifiers } from './gantifier-discovery.service';
import { createJobOffers, sendOffersViaWhatsApp } from './offer.service';

const prisma = new PrismaClient();

interface TriggerJobMatchingParams {
  jobOrderId: string;
  radius?: number; // Search radius in KM (default: 20)
  paymentId?: string; // Optional payment ID for tracking
}

interface JobMatchingResult {
  success: boolean;
  message: string;
  data?: {
    jobOrderId: string;
    status: string;
    gantifiersFound: number;
    offersCreated: number;
    offersSent: number;
    offers: any[];
  };
  error?: string;
}

/**
 * Triggers the complete job matching workflow
 *
 * Workflow:
 * 1. Fetch job order details
 * 2. Find nearby gantifiers within radius
 * 3. Create job offers for matched gantifiers
 * 4. Send WhatsApp notifications
 * 5. Update job order status
 *
 * @param params - Job matching parameters
 * @returns Result object with matching details
 */
export async function triggerJobMatching(params: TriggerJobMatchingParams): Promise<JobMatchingResult> {
  const { jobOrderId, radius = 20, paymentId } = params;

  try {
    console.log(`[JOB-MATCHING] Starting job matching for job order: ${jobOrderId}`);

    // 1. Get job order details
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: jobOrderId },
      include: {
        centers: true,
        payments: true
      }
    });

    if (!jobOrder) {
      console.error(`[JOB-MATCHING] ❌ Job order not found: ${jobOrderId}`);
      return {
        success: false,
        message: 'Job order not found',
        error: 'JOB_ORDER_NOT_FOUND'
      };
    }

    console.log(`[JOB-MATCHING] ✅ Job order found: ${jobOrder.id} for center ${jobOrder.centers.name}`);

    // 2. Check if job order is in valid state for matching
    const validStatuses = ['PENDING', 'PAYMENT_CONFIRMED'];
    if (!validStatuses.includes(jobOrder.status)) {
      console.error(`[JOB-MATCHING] ❌ Invalid job order status: ${jobOrder.status}`);
      return {
        success: false,
        message: `Job order must be in PENDING or PAYMENT_CONFIRMED status. Current status: ${jobOrder.status}`,
        error: 'INVALID_STATUS'
      };
    }

    // 3. Find nearby gantifiers within specified radius
    console.log(`[JOB-MATCHING] 🔍 Finding gantifiers within ${radius}km of ${jobOrder.center_location}`);

    const nearbyGantifiers = await findNearbyGantifiers(
      jobOrder.center_location,
      jobOrder.scheduled_date.toISOString(),
      radius
    );

    console.log(`[JOB-MATCHING] ✅ Found ${nearbyGantifiers.length} nearby gantifiers`);

    if (nearbyGantifiers.length === 0) {
      console.log(`[JOB-MATCHING] ⚠️ No gantifiers found within ${radius}km`);
      return {
        success: false,
        message: `No gantifiers found within ${radius}km radius`,
        error: 'NO_GANTIFIERS_FOUND',
        data: {
          jobOrderId,
          status: jobOrder.status,
          gantifiersFound: 0,
          offersCreated: 0,
          offersSent: 0,
          offers: []
        }
      };
    }

    // 4. Create job offers for discovered gantifiers
    console.log(`[JOB-MATCHING] 📝 Creating job offers for ${nearbyGantifiers.length} gantifiers`);

    const offers = await createJobOffers(jobOrderId, nearbyGantifiers);

    console.log(`[JOB-MATCHING] ✅ Created ${offers.length} job offers`);

    // 5. Send WhatsApp notifications to gantifiers
    console.log(`[JOB-MATCHING] 📱 Sending WhatsApp notifications...`);

    const sendResults = await sendOffersViaWhatsApp(offers);

    const successCount = sendResults.filter(r => r.success).length;
    console.log(`[JOB-MATCHING] ✅ Successfully sent ${successCount}/${offers.length} WhatsApp notifications`);

    // 6. Update job order status to AWAITING_GANTIFIER_RESPONSE
    await prisma.job_orders.update({
      where: { id: jobOrderId },
      data: { status: 'AWAITING_GANTIFIER_RESPONSE' }
    });

    console.log(`[JOB-MATCHING] ✅ Job order status updated to AWAITING_GANTIFIER_RESPONSE`);

    // 7. Link payment if provided
    if (paymentId) {
      await prisma.payments.update({
        where: { id: paymentId },
        data: { job_order_id: jobOrderId }
      });
      console.log(`[JOB-MATCHING] ✅ Linked payment ${paymentId} to job order`);
    }

    console.log(`[JOB-MATCHING] ✅ Job matching completed successfully for ${jobOrderId}`);

    return {
      success: true,
      message: `Successfully matched ${nearbyGantifiers.length} gantifiers and sent ${successCount} offers`,
      data: {
        jobOrderId,
        status: 'AWAITING_GANTIFIER_RESPONSE',
        gantifiersFound: nearbyGantifiers.length,
        offersCreated: offers.length,
        offersSent: successCount,
        offers: offers.map(offer => ({
          id: offer.id,
          gantifierId: offer.gantifier_id,
          gantifierName: offer.gantifiers?.full_name,
          status: offer.status,
          acceptanceToken: offer.acceptance_token,
          sentAt: offer.sent_at
        }))
      }
    };

  } catch (error: any) {
    console.error(`[JOB-MATCHING] ❌ Error during job matching:`, error);
    return {
      success: false,
      message: 'Failed to trigger job matching',
      error: error.message || 'UNKNOWN_ERROR'
    };
  }
}

/**
 * Validates if a job order can be matched
 *
 * @param jobOrderId - Job order ID to validate
 * @returns Validation result
 */
export async function canTriggerMatching(jobOrderId: string): Promise<{
  canMatch: boolean;
  reason?: string;
}> {
  try {
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: jobOrderId },
      include: {
        job_offers: true
      }
    });

    if (!jobOrder) {
      return { canMatch: false, reason: 'Job order not found' };
    }

    // Check if already matched
    if (jobOrder.status === 'AWAITING_GANTIFIER_RESPONSE' || jobOrder.status === 'ASSIGNED') {
      return { canMatch: false, reason: 'Job order already matched or assigned' };
    }

    // Check if job is completed or cancelled
    const invalidStatuses = ['COMPLETED', 'CANCELLED_BY_CENTER', 'CANCELLED_BY_GANTIFIER', 'CANCELLED_BY_SYSTEM'];
    if (invalidStatuses.includes(jobOrder.status)) {
      return { canMatch: false, reason: 'Job order is completed or cancelled' };
    }

    return { canMatch: true };

  } catch (error) {
    return { canMatch: false, reason: 'Error checking job order status' };
  }
}

export default {
  triggerJobMatching,
  canTriggerMatching
};
