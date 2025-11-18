import { PrismaClient } from '../../app/generated/prisma';

const prisma = new PrismaClient();

/**
 * OTP Service
 * Handles OTP generation, storage, and verification
 */

export interface OTPVerificationResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    phone: string | null;
    name: string;
    phoneVerified: boolean;
  };
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP in database for a user (by phone number)
 * @param phone User's phone number
 * @param otpCode 6-digit OTP code
 * @param expiryMinutes OTP validity duration in minutes (default: 5)
 */
export async function storeOTP(
  phone: string,
  otpCode: string,
  expiryMinutes: number = 5
): Promise<{ success: boolean; error?: string }> {
  try {
    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Find or create user by phone
    let user = await prisma.users.findUnique({
      where: { phone }
    });

    if (!user) {
      // Create new user if doesn't exist
      user = await prisma.users.create({
        data: {
          id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          phone,
          name: phone, // Temporary name, can be updated later
          otpCode,
          otpExpiresAt: expiresAt,
          phoneVerified: false,
          updated_at: new Date()
        }
      });
    } else {
      // Update existing user with new OTP
      await prisma.users.update({
        where: { phone },
        data: {
          otpCode,
          otpExpiresAt: expiresAt,
          updated_at: new Date()
        }
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error storing OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store OTP'
    };
  }
}

/**
 * Verify OTP for a user
 * @param phone User's phone number
 * @param otp OTP code to verify
 */
export async function verifyOTP(
  phone: string,
  otp: string
): Promise<OTPVerificationResult> {
  try {
    // Find user by phone
    const user = await prisma.users.findUnique({
      where: { phone }
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found with this phone number'
      };
    }

    // Check if OTP exists
    if (!user.otpCode) {
      return {
        success: false,
        error: 'No OTP found. Please request a new OTP'
      };
    }

    // Check if OTP matches
    if (user.otpCode !== otp) {
      return {
        success: false,
        error: 'Invalid OTP code'
      };
    }

    // Check if OTP has expired
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return {
        success: false,
        error: 'OTP has expired. Please request a new OTP'
      };
    }

    // OTP is valid - update user
    const updatedUser = await prisma.users.update({
      where: { phone },
      data: {
        phoneVerified: true,
        otpCode: null, // Clear OTP after successful verification
        otpExpiresAt: null,
        updated_at: new Date()
      }
    });

    return {
      success: true,
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        name: updatedUser.name,
        phoneVerified: updatedUser.phoneVerified
      }
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OTP verification failed'
    };
  }
}

/**
 * Validate Malaysian phone number format
 * Accepts formats: +60123456789, 60123456789, 0123456789
 */
export function validateMalaysianPhone(phone: string): boolean {
  // Remove spaces and dashes
  const cleaned = phone.replace(/[\s-]/g, '');

  // Check various Malaysian phone formats
  const patterns = [
    /^\+60\d{9,10}$/, // +60123456789
    /^60\d{9,10}$/, // 60123456789
    /^0\d{9,10}$/ // 0123456789
  ];

  return patterns.some(pattern => pattern.test(cleaned));
}

/**
 * Normalize Malaysian phone number to +60 format
 */
export function normalizeMalaysianPhone(phone: string): string {
  // Remove spaces and dashes
  let cleaned = phone.replace(/[\s-]/g, '');

  // Convert to +60 format
  if (cleaned.startsWith('0')) {
    cleaned = '+60' + cleaned.substring(1);
  } else if (cleaned.startsWith('60')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+60')) {
    cleaned = '+60' + cleaned;
  }

  return cleaned;
}
