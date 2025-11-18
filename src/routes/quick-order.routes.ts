// src/routes/quick-order.routes.ts
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import quickOrderService from '../services/quick-order.service';

const router = Router();

/**
 * POST /api/quick-order/check-phone
 * Check if a phone number is registered
 *
 * This is a helper endpoint for the frontend to determine
 * which flow to use (signup vs login)
 *
 * Request body:
 * {
 *   "phone": "60123456789"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "exists": true,        // Phone is registered
 *   "has_center": true     // User has a center
 * }
 */
router.post(
  '/check-phone',
  asyncHandler(async (req: Request, res: Response) => {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    const result = await quickOrderService.checkPhoneExists(phone);

    res.json({
      success: true,
      exists: result.exists,
      has_center: result.has_center
    });
  })
);

/**
 * POST /api/quick-order/create
 * Create a quick order with OTP verification (all-in-one endpoint)
 *
 * This endpoint handles the entire quick order flow:
 * 1. Verifies OTP
 * 2. Creates or updates user/center
 * 3. Creates job order
 * 4. Creates payment with Billplz
 * 5. Returns JWT token and payment URL
 *
 * Request body:
 * {
 *   // OTP verification
 *   "phone": "60123456789",
 *   "otp": "123456",
 *
 *   // User/Center details
 *   "name": "Little Stars Childcare",
 *   "email": "contact@littlestars.com",
 *   "address": "123 Jalan Presint 15",
 *   "postcode": "62000",
 *   "city": "Putrajaya",
 *   "state": "Putrajaya",
 *   "whatsapp_number": "60123456789",
 *   "location": "2.9264,101.6964", // optional
 *
 *   // Job order details
 *   "scheduled_date": "2025-12-25T09:00:00Z",
 *   "job_tasks": ["TEACHING", "SUPERVISION"],
 *   "custom_tasks": ["Prepare lunch"], // optional
 *   "center_location": "2.9264,101.6964",
 *   "rate": 150.00,
 *   "start_time": "09:00",
 *   "end_time": "17:00",
 *   "gantify_service_fees": 10, // optional, default 10
 *
 *   // Payment details
 *   "gantifier_fee": 140.00,
 *   "service_fee": 10.00,
 *   "payment_description": "Payment for job on 25 Dec 2025" // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user": {
 *       "id": "user_123",
 *       "name": "Little Stars Childcare",
 *       "email": "contact@littlestars.com",
 *       "phone": "60123456789",
 *       "phoneVerified": true,
 *       "role": "CENTER"
 *     },
 *     "center": {
 *       "id": "center_123",
 *       "name": "Little Stars Childcare",
 *       "email": "contact@littlestars.com",
 *       "phone": "60123456789",
 *       "address": "123 Jalan Presint 15",
 *       "city": "Putrajaya",
 *       "state": "Putrajaya"
 *     },
 *     "job_order": {
 *       "id": "job_123",
 *       "center_id": "center_123",
 *       "scheduled_date": "2025-12-25T09:00:00Z",
 *       "status": "AWAITING_PAYMENT",
 *       "rate": 150.00
 *     },
 *     "payment": {
 *       "id": "payment_123",
 *       "total_amount": 150.00,
 *       "billplz_url": "https://www.billplz.com/bills/abc123",
 *       "status": "PENDING"
 *     },
 *     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   },
 *   "message": "Quick order created successfully. Redirect user to payment URL."
 * }
 */
router.post(
  '/create',
  asyncHandler(async (req: Request, res: Response) => {
    console.log('[QUICK-ORDER API] Received quick order request');

    const result = await quickOrderService.createQuickOrder(req.body);

    if (!result.success) {
      console.error('[QUICK-ORDER API] Failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    console.log('[QUICK-ORDER API] ✅ Success - Payment URL:', result.data?.payment.billplz_url);

    res.status(201).json({
      success: true,
      data: result.data,
      message: 'Quick order created successfully. Redirect user to payment URL.'
    });
  })
);

export default router;
