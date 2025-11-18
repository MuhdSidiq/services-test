import express, { Request, Response } from 'express';
import { PrismaClient } from '../../app/generated/prisma';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/offers/{token}:
 *   get:
 *     summary: Get job offer details by token
 *     description: |
 *       Retrieve job offer details using a secure 8-character token. No authentication required - token acts as authentication.
 *       Automatically marks offer as READ on first view. Expires after 30 minutes.
 *     tags: [Job Offers]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           example: "nD3larZZ"
 *         description: 8-character offer acceptance token
 *     responses:
 *       200:
 *         description: Offer details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/JobOffer'
 *       404:
 *         description: Offer not found
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
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    console.log('Fetching offer for token:', token);

    // Find the offer with this token
    const offer = await prisma.job_offers.findUnique({
      where: { acceptance_token: token },
      include: {
        job_orders: {
          include: {
            centers: true
          }
        },
        gantifiers: {
          include: {
            users: true
          }
        }
      }
    });

    if (!offer) {
      console.log('Offer not found for token:', token);
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    console.log('Found offer:', { id: offer.id, status: offer.status });

    // Mark as READ if it was SENT or DELIVERED
    if (offer.status === 'SENT' || offer.status === 'DELIVERED') {
      await prisma.job_offers.update({
        where: { id: offer.id },
        data: {
          status: 'READ',
          read_at: new Date()
        }
      });

      offer.status = 'READ';
      offer.read_at = new Date();
    }

    // Check if this offer is still valid
    const validStatuses = ['SENT', 'DELIVERED', 'READ'];
    const isValid = validStatuses.includes(offer.status);
    const expiresAt = new Date(offer.sent_at.getTime() + 30 * 60000); // 30 minutes
    const isExpired = new Date() > expiresAt;
    const jobValidStatuses = ['PENDING', 'AWAITING_GANTIFIER_RESPONSE'];
    const isJobValid = jobValidStatuses.includes(offer.job_orders.status);

    let invalidReason;
    if (!isValid) {
      invalidReason = `This offer has already been ${offer.status.toLowerCase().replace(/_/g, ' ')}`;
    } else if (isExpired) {
      invalidReason = 'This offer has expired';
    } else if (!isJobValid) {
      invalidReason = 'This job is no longer available';
    }

    // Format response
    const response = {
      success: true,
      data: {
        offerId: offer.id,
        token,
        status: offer.status,
        isValid: isValid && !isExpired && isJobValid,
        gantifier: {
          id: offer.gantifiers.id,
          name: offer.gantifiers.full_name
        },
        jobOrder: {
          id: offer.job_orders.id,
          centerName: offer.job_orders.centers.name,
          centerAddress: offer.job_orders.centers.address,
          scheduledDate: offer.job_orders.scheduled_date,
          startTime: offer.job_orders.start_time,
          endTime: offer.job_orders.end_time,
          location: offer.job_orders.center_location,
          jobTasks: offer.job_orders.job_tasks,
          rate: offer.job_orders.rate,
          status: offer.job_orders.status
        },
        sentAt: offer.sent_at,
        readAt: offer.read_at,
        responded_at: offer.responded_at,
        response: offer.response,
        actions: {
          acceptUrl: `${process.env.API_BASE_URL}/api/offers/${token}/accept`,
          rejectUrl: `${process.env.API_BASE_URL}/api/offers/${token}/reject`
        },
        expiresAt,
        invalidReason
      }
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching job offer:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch job offer details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/offers/{token}/accept:
 *   get:
 *     summary: Accept job offer
 *     description: |
 *       Accept a job offer using the token. No authentication required.
 *       Actions performed:
 *       - Marks offer as ACCEPTED_BY_GANTIFIER
 *       - Assigns gantifier to job order (status → ASSIGNED)
 *       - Marks all other pending offers for this job as SUPERSEDED
 *       - Redirects to job details page on frontend
 *     tags: [Job Offers]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           example: "nD3larZZ"
 *         description: 8-character offer acceptance token
 *     responses:
 *       302:
 *         description: Redirects to frontend job details page
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "https://app.gantify.my/job-orders/job_123"
 *       400:
 *         description: Offer expired, invalid, or job no longer available
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Offer not found
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
router.get('/:token/accept', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    console.log('Accepting offer with token:', token);

    // Find the offer with this token
    const offer = await prisma.job_offers.findUnique({
      where: { acceptance_token: token },
      include: {
        job_orders: {
          include: {
            centers: true
          }
        },
        gantifiers: {
          include: {
            users: true
          }
        }
      }
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    // Check if offer is still valid
    const validStatuses = ['SENT', 'DELIVERED', 'READ'];
    if (!validStatuses.includes(offer.status)) {
      return res.status(400).json({
        success: false,
        error: 'This offer is no longer valid',
        currentStatus: offer.status
      });
    }

    // Check if offer has expired
    const expiresAt = new Date(offer.sent_at.getTime() + 30 * 60000);
    if (new Date() > expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'This offer has expired'
      });
    }

    // Check if job is still available
    const jobValidStatuses = ['PENDING', 'AWAITING_GANTIFIER_RESPONSE'];
    if (!jobValidStatuses.includes(offer.job_orders.status)) {
      return res.status(400).json({
        success: false,
        error: 'This job is no longer available',
        jobStatus: offer.job_orders.status
      });
    }

    // Start transaction to accept offer
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update this offer as accepted
      await tx.job_offers.update({
        where: { id: offer.id },
        data: {
          status: 'ACCEPTED_BY_GANTIFIER',
          responded_at: new Date(),
          is_accepted: 'YES',
          response: 'ACCEPT'
        }
      });

      // 2. Update job order with gantifier and change status
      await tx.job_orders.update({
        where: { id: offer.job_order_id },
        data: {
          gantifier_id: offer.gantifier_id,
          status: 'ASSIGNED' // or 'CONFIRMED' depending on your workflow
        }
      });

      // 3. Reject all other pending offers for this job
      await tx.job_offers.updateMany({
        where: {
          job_order_id: offer.job_order_id,
          id: { not: offer.id },
          status: { in: ['SENT', 'DELIVERED', 'READ'] }
        },
        data: {
          status: 'SUPERSEDED',
          responded_at: new Date()
        }
      });

      return {
        offerId: offer.id,
        job_order_id: offer.job_order_id,
        gantifier_id: offer.gantifier_id
      };
    });

    console.log('Offer accepted successfully:', result);

    // TODO: Send notification to center
    // You can call the WhatsApp notification endpoint here

    // Redirect to job details page
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.gantify.my';
    return res.redirect(`${frontendUrl}/job-orders/${result.job_order_id}`);
  } catch (error) {
    console.error('Error accepting job offer:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to accept job offer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/offers/:token/reject
 * Reject offer via secure token (no auth required)
 */
router.get('/:token/reject', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    console.log('Rejecting offer with token:', token);

    // Find the offer with this token
    const offer = await prisma.job_offers.findUnique({
      where: { acceptance_token: token },
      include: {
        job_orders: {
          include: {
            centers: true
          }
        },
        gantifiers: {
          include: {
            users: true
          }
        }
      }
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    // Check if offer is still valid
    const validStatuses = ['SENT', 'DELIVERED', 'READ'];
    if (!validStatuses.includes(offer.status)) {
      return res.status(400).json({
        success: false,
        error: 'This offer is no longer valid',
        currentStatus: offer.status
      });
    }

    // Update job offer as rejected
    await prisma.job_offers.update({
      where: { id: offer.id },
      data: {
        status: 'REJECTED_BY_GANTIFIER',
        responded_at: new Date(),
        is_accepted: 'NO',
        response: 'REJECT'
      }
    });

    console.log('Offer rejected successfully');

    // Check how many offers are still pending for this job
    const pendingOffers = await prisma.job_offers.count({
      where: {
        job_order_id: offer.job_order_id,
        status: { in: ['SENT', 'DELIVERED', 'READ'] }
      }
    });

    console.log(`Pending offers remaining: ${pendingOffers}`);

    // If no pending offers left and job is still awaiting response, mark it as PENDING again
    if (pendingOffers === 0) {
      const jobOrder = await prisma.job_orders.findUnique({
        where: { id: offer.job_order_id }
      });

      if (jobOrder && jobOrder.status === 'AWAITING_GANTIFIER_RESPONSE') {
        await prisma.job_orders.update({
          where: { id: offer.job_order_id },
          data: { status: 'PENDING' }
        });

        console.log('Job order updated back to PENDING - all offers rejected');

        // TODO: Send notification to center that all gantifiers rejected
        // You can call the WhatsApp notification endpoint here
      }
    }

    // Redirect to rejection confirmation page
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.gantify.my';
    return res.redirect(`${frontendUrl}/offers/response?action=rejected&status=success`);
  } catch (error) {
    console.error('Error rejecting job offer:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reject job offer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
