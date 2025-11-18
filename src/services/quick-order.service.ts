// src/services/quick-order.service.ts
import { PrismaClient } from '../../app/generated/prisma';
import { verifyOTP, validateMalaysianPhone } from './otp.service';
import { validateEmail } from './magic-link.service';
import { generateToken } from '../middleware/auth.middleware';
import paymentService from './payment.service';

const prisma = new PrismaClient();

/**
 * Input for quick order creation
 */
export interface QuickOrderInput {
  // OTP verification
  phone: string;
  otp: string;

  // User/Center details (for new users)
  name: string;
  email: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  whatsapp_number: string;
  location?: string;

  // Job order details
  scheduled_date: string; // ISO date string
  job_tasks: string[];
  custom_tasks?: string[];
  center_location: string;
  rate: number;
  start_time: string; // e.g., "09:00"
  end_time: string; // e.g., "17:00"
  gantify_service_fees?: number;

  // Payment details
  gantifier_fee: number;
  service_fee: number;
  payment_description?: string;
}

/**
 * Result of quick order creation
 */
export interface QuickOrderResult {
  success: boolean;
  error?: string;
  data?: {
    user: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      phoneVerified: boolean;
      role?: string;
    };
    center?: {
      id: string;
      name: string;
      email: string;
      phone: string;
      address: string;
      city: string;
      state: string;
    };
    job_order: {
      id: string;
      center_id: string;
      scheduled_date: Date;
      status: string;
      rate: number;
    };
    payment: {
      id: string;
      total_amount: number;
      billplz_url: string | null;
      status: string;
    };
    token: string;
  };
}

/**
 * Create a quick order with OTP verification
 *
 * This is an all-in-one endpoint that:
 * 1. Verifies OTP
 * 2. Creates or updates user/center
 * 3. Creates job order
 * 4. Creates payment with Billplz
 * 5. Returns JWT token and payment URL
 */
export async function createQuickOrder(input: QuickOrderInput): Promise<QuickOrderResult> {
  console.log('[QUICK-ORDER] Starting quick order creation for phone:', input.phone);

  try {
    // Step 1: Validate inputs
    const validation = validateQuickOrderInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Step 2: Verify OTP
    console.log('[QUICK-ORDER] Verifying OTP...');
    const otpResult = await verifyOTP(input.phone, input.otp);

    if (!otpResult.success) {
      return {
        success: false,
        error: otpResult.error || 'OTP verification failed'
      };
    }

    console.log('[QUICK-ORDER] OTP verified successfully');

    // Step 3: Get or create user and center
    let user = await prisma.users.findUnique({
      where: { phone: input.phone },
      include: { roles: true, centers: true }
    });

    let center;
    let isNewUser = false;

    if (!user) {
      return {
        success: false,
        error: 'User not found after OTP verification. This should not happen.'
      };
    }

    // Check if user has a center
    if (user.centers && user.centers.length > 0) {
      // Existing center - use the first one
      center = user.centers[0];
      console.log('[QUICK-ORDER] Using existing center:', center.id);

      // Update user details if provided and different
      if (input.name && input.name !== user.name) {
        user = await prisma.users.update({
          where: { id: user.id },
          data: {
            name: input.name,
            email: input.email || user.email,
            updated_at: new Date()
          },
          include: { roles: true, centers: true }
        });
      }

      // Update center details if provided
      center = await prisma.centers.update({
        where: { id: center.id },
        data: {
          name: input.name,
          email: input.email,
          address: input.address,
          postcode: input.postcode,
          city: input.city,
          state: input.state,
          whatsapp_number: input.whatsapp_number,
          location: input.location || center.location
        }
      });
    } else {
      // New center - create it
      isNewUser = true;
      console.log('[QUICK-ORDER] Creating new center for user:', user.id);

      // Update user with name and email
      user = await prisma.users.update({
        where: { id: user.id },
        data: {
          name: input.name,
          email: input.email,
          updated_at: new Date()
        },
        include: { roles: true, centers: true }
      });

      // Check if email already exists in centers
      const existingCenter = await prisma.centers.findUnique({
        where: { email: input.email }
      });

      if (existingCenter) {
        return {
          success: false,
          error: 'Email already registered to another center. Please use a different email.'
        };
      }

      // Create center
      center = await prisma.centers.create({
        data: {
          id: `center_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: input.name,
          email: input.email,
          phone: input.phone,
          address: input.address,
          postcode: input.postcode,
          city: input.city,
          state: input.state,
          whatsapp_number: input.whatsapp_number,
          location: input.location || null,
          user_id: user.id
        }
      });

      console.log('[QUICK-ORDER] Center created:', center.id);
    }

    // Step 4: Create job order
    console.log('[QUICK-ORDER] Creating job order...');

    const jobOrderId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const jobOrder = await prisma.job_orders.create({
      data: {
        id: jobOrderId,
        center_id: center.id,
        scheduled_date: new Date(input.scheduled_date),
        job_tasks: input.job_tasks,
        custom_tasks: input.custom_tasks || [],
        center_location: input.center_location,
        rate: input.rate,
        start_time: input.start_time,
        end_time: input.end_time,
        gantify_service_fees: input.gantify_service_fees || 10,
        status: 'AWAITING_PAYMENT'
      }
    });

    console.log('[QUICK-ORDER] Job order created:', jobOrder.id);

    // Step 5: Create payment with Billplz
    console.log('[QUICK-ORDER] Creating payment...');

    const paymentResult = await paymentService.createPayment({
      job_order_id: jobOrder.id,
      center_id: center.id,
      gantifier_fee: input.gantifier_fee,
      service_fee: input.service_fee,
      description: input.payment_description || `Payment for job order on ${new Date(input.scheduled_date).toLocaleDateString()}`
    });

    console.log('[QUICK-ORDER] Payment created:', paymentResult.payment.id);

    // Step 6: Generate JWT token
    const token = generateToken({
      userId: user.id,
      phone: user.phone ?? undefined,
      email: user.email ?? undefined,
      role: user.roles?.name
    });

    console.log('[QUICK-ORDER] ✅ Quick order completed successfully');
    console.log('[QUICK-ORDER] User:', user.id, isNewUser ? '(new)' : '(existing)');
    console.log('[QUICK-ORDER] Center:', center.id);
    console.log('[QUICK-ORDER] Job Order:', jobOrder.id);
    console.log('[QUICK-ORDER] Payment:', paymentResult.payment.id);
    console.log('[QUICK-ORDER] Payment URL:', paymentResult.billplz_url);

    // Step 7: Return result
    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
          role: user.roles?.name
        },
        center: {
          id: center.id,
          name: center.name,
          email: center.email,
          phone: center.phone,
          address: center.address,
          city: center.city,
          state: center.state
        },
        job_order: {
          id: jobOrder.id,
          center_id: jobOrder.center_id,
          scheduled_date: jobOrder.scheduled_date,
          status: jobOrder.status,
          rate: jobOrder.rate
        },
        payment: {
          id: paymentResult.payment.id,
          total_amount: parseFloat(paymentResult.payment.total_amount.toString()),
          billplz_url: paymentResult.billplz_url,
          status: paymentResult.payment.status
        },
        token
      }
    };

  } catch (error) {
    console.error('[QUICK-ORDER] ❌ Error creating quick order:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create quick order'
    };
  }
}

/**
 * Validate quick order input
 */
function validateQuickOrderInput(input: QuickOrderInput): { valid: boolean; error?: string } {
  // Phone validation
  if (!input.phone) {
    return { valid: false, error: 'Phone number is required' };
  }

  if (!validateMalaysianPhone(input.phone)) {
    return { valid: false, error: 'Invalid Malaysian phone number format. Use format: 60XXXXXXXXX' };
  }

  // OTP validation
  if (!input.otp) {
    return { valid: false, error: 'OTP is required' };
  }

  if (!/^\d{6}$/.test(input.otp)) {
    return { valid: false, error: 'OTP must be 6 digits' };
  }

  // User/Center details validation
  const requiredFields = ['name', 'email', 'address', 'postcode', 'city', 'state', 'whatsapp_number'];
  for (const field of requiredFields) {
    if (!input[field as keyof QuickOrderInput]) {
      return { valid: false, error: `${field} is required` };
    }
  }

  // Email validation
  if (!validateEmail(input.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Job order validation
  if (!input.scheduled_date) {
    return { valid: false, error: 'Scheduled date is required' };
  }

  if (!input.job_tasks || input.job_tasks.length === 0) {
    return { valid: false, error: 'At least one job task is required' };
  }

  if (!input.center_location) {
    return { valid: false, error: 'Center location is required' };
  }

  if (!input.rate || input.rate <= 0) {
    return { valid: false, error: 'Valid rate is required' };
  }

  if (!input.start_time) {
    return { valid: false, error: 'Start time is required' };
  }

  if (!input.end_time) {
    return { valid: false, error: 'End time is required' };
  }

  // Payment validation
  if (!input.gantifier_fee || input.gantifier_fee <= 0) {
    return { valid: false, error: 'Valid gantifier fee is required' };
  }

  if (!input.service_fee || input.service_fee <= 0) {
    return { valid: false, error: 'Valid service fee is required' };
  }

  return { valid: true };
}

/**
 * Check if a phone number is already registered
 */
export async function checkPhoneExists(phone: string): Promise<{ exists: boolean; has_center: boolean }> {
  if (!validateMalaysianPhone(phone)) {
    return { exists: false, has_center: false };
  }

  const user = await prisma.users.findUnique({
    where: { phone },
    include: { centers: true }
  });

  if (!user) {
    return { exists: false, has_center: false };
  }

  return {
    exists: true,
    has_center: user.centers && user.centers.length > 0
  };
}

export default {
  createQuickOrder,
  checkPhoneExists
};
