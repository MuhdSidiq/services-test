import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { authenticate } from '../middleware/auth.middleware';
import { PrismaClient } from '../../app/generated/prisma';

const prisma = new PrismaClient();
const router = Router();

// Apply authentication middleware to all WhatsApp routes
router.use(authenticate);

// Import WhatsApp templates (TypeScript ES modules)
import * as templates from '../lib/whatsapp/templates';

/**
 * POST /api/whatsapp/notification-to-center
 * Send notification to center (job acceptance notification)
 *
 * Request body:
 * {
 *   "phoneNumber": "1234567890",
 *   "name": "Ali Azizi",
 *   "location": "CIC P15H",
 *   "time": "09.30 am",
 *   "job_order_id": "110"  // Optional: for button URL
 * }
 */
router.post(
  '/notification-to-center',
  asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, name, location, time, job_order_id } = req.body;

    if (!phoneNumber || !name || !location || !time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Required: phoneNumber, name, location, time',
      });
    }

    const result = await templates.sendNotificationToCenter(phoneNumber, {
      name,
      location,
      time,
      job_order_id,
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  })
);

/**
 * POST /api/whatsapp/job-offer
 * Send job offer notification
 *
 * Request body:
 * {
 *   "phoneNumber": "1234567890",
 *   "candidateName": "Ali Azizi",        // {{1}}
 *   "companyName": "CIC",                // {{2}}
 *   "location": "Presint 15",            // {{3}}
 *   "date": "12/06/2025",                // {{4}}
 *   "shift": "3",                        // {{5}}
 *   "time": "8.30pm",                    // {{6}}
 *   "duration": "15",                    // {{7}}
 *   "additionalInfo": "45",              // {{8}}
 *   "offerUrl": "nD3larZZ"               // Button URL parameter (optional)
 * }
 */
router.post(
  '/job-offer',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      phoneNumber,
      candidateName,
      companyName,
      location,
      date,
      shift,
      time,
      duration,
      additionalInfo,
      offerUrl,
    } = req.body;

    // Validate required fields
    if (
      !phoneNumber ||
      !candidateName ||
      !companyName ||
      !location ||
      !date ||
      !shift ||
      !time ||
      !duration ||
      !additionalInfo
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required fields. Required: phoneNumber, candidateName, companyName, location, date, shift, time, duration, additionalInfo',
      });
    }

    const result = await templates.sendJobOffer(phoneNumber, {
      candidateName,
      companyName,
      location,
      date,
      shift,
      time,
      duration,
      additionalInfo,
      offerUrl,
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  })
);

/**
 * POST /api/whatsapp/send-otp
 * Send authentication OTP
 *
 * Request body:
 * {
 *   "phoneNumber": "1234567890",
 *   "otpCode": "123456",
 *   "expiryMinutes": "5" (optional, default: 5)
 * }
 */
router.post(
  '/send-otp',
  asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, otpCode, expiryMinutes = 5 } = req.body;

    if (!phoneNumber || !otpCode) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber and otpCode are required',
      });
    }

    // Store OTP in database
    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(expiryMinutes));

      // Find or create user by phone
      let user = await prisma.users.findUnique({
        where: { phone: phoneNumber },
      });

      if (!user) {
        // Create new user if doesn't exist
        user = await prisma.users.create({
          data: {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            phone: phoneNumber,
            name: phoneNumber, // Temporary name
            otpCode,
            otpExpiresAt: expiresAt,
            phoneVerified: false,
            updated_at: new Date(),
          },
        });
      } else {
        // Update existing user with new OTP
        await prisma.users.update({
          where: { phone: phoneNumber },
          data: {
            otpCode,
            otpExpiresAt: expiresAt,
            updated_at: new Date(),
          },
        });
      }

      console.log(
        `OTP stored in database for phone: ${phoneNumber}, expires at: ${expiresAt}`
      );
    } catch (dbError) {
      console.error('Error storing OTP in database:', dbError);
      // Continue with sending OTP even if DB storage fails
    }

    // Send OTP via WhatsApp
    const result = await templates.sendAuthenticationOtp(phoneNumber, {
      otpCode,
      expiryMinutes,
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  })
);

/**
 * POST /api/whatsapp/delivery-update
 * Send delivery update / job notification
 *
 * Request body:
 * {
 *   "phoneNumber": "60132040324",
 *   "name": "Ali Azizi",
 *   "location": "CIC P15H",
 *   "time": "09.30 am",
 *   "job_order_id": "110"  // Optional: for button URL
 * }
 */
router.post(
  '/delivery-update',
  asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, name, location, time, job_order_id } = req.body;

    if (!phoneNumber || !name || !location || !time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Required: phoneNumber, name, location, time',
      });
    }

    const result = await templates.sendDeliveryUpdate(phoneNumber, {
      name,
      location,
      time,
      job_order_id,
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  })
);

/**
 * GET /api/whatsapp/health
 * Health check endpoint for WhatsApp service
 */
router.get('/health', (_req: Request, res: Response) => {
  const hasCredentials = !!(
    process.env.WA_ACCESS_TOKEN && process.env.WA_PHONE_NUMBER_ID
  );

  res.json({
    service: 'WhatsApp',
    status: hasCredentials ? 'ready' : 'not configured',
    configured: hasCredentials,
    message: hasCredentials
      ? 'WhatsApp service is ready to send messages'
      : 'Missing WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID',
    availableTemplates: [
      'notification-to-center',
      'job-offer',
      'send-otp',
      'delivery-update',
    ],
  });
});

export default router;
