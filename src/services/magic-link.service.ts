import { PrismaClient } from '../../app/generated/prisma';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Magic Link Service
 * Handles magic link token generation, validation, and email sending
 */

export interface MagicLinkResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string | null;
    name: string;
    phoneVerified: boolean;
  };
}

/**
 * Generate a secure magic link token
 * Uses crypto.randomBytes for cryptographic security
 */
export function generateMagicLinkToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 character hex string
}

/**
 * Get token expiration time (15 minutes from now by default)
 */
export function getTokenExpirationTime(minutes: number = 15): Date {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
  return expiresAt;
}

/**
 * Check if a token has expired
 */
export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Send magic link email to user
 * @param email User's email address
 * @param name User's name
 * @param token Magic link token
 * @param isNewUser Whether this is a new user (for email customization)
 */
export async function sendMagicLinkEmail(
  email: string,
  name: string,
  token: string,
  isNewUser: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // Magic link should point to backend API endpoint, not frontend
    const backendUrl = process.env.BACKEND_URL || process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
    const magicLinkUrl = `${backendUrl}/api/auth/verify-magic-link?token=${token}`;

    // Import email service dynamically to avoid circular dependencies
    const { sendMagicLinkEmail: sendEmail } = await import('./email.service');

    console.log('📧 Sending magic link email to:', email, isNewUser ? '(New User)' : '(Existing User)');
    console.log('Magic Link URL:', magicLinkUrl);

    // Send email via Gmail
    const result = await sendEmail(email, name, token, isNewUser);

    if (result.success) {
      console.log('✅ Magic link email sent successfully to:', email);
    } else {
      console.error('❌ Failed to send magic link email:', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error sending magic link email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    };
  }
}

/**
 * Create magic link for a user
 * Auto-creates user if they don't exist (for Express Order flow)
 * @param email User's email address
 */
export async function createMagicLink(
  email: string
): Promise<{ success: boolean; message?: string; error?: string; isNewUser?: boolean }> {
  try {
    // Find user by email
    let user = await prisma.users.findUnique({
      where: { email }
    });

    let isNewUser = false;

    // If user doesn't exist, auto-create them with CENTER role
    if (!user) {
      console.log('User not found for email:', email, '- Auto-creating new user');

      // Find or create CENTER role
      let centerRole = await prisma.roles.findFirst({
        where: { name: 'CENTER' }
      });

      if (!centerRole) {
        // Create CENTER role if it doesn't exist
        centerRole = await prisma.roles.create({
          data: {
            id: 'role_center',
            name: 'CENTER'
          }
        });
        console.log('✅ Created CENTER role');
      }

      // Extract name from email (e.g., "user" from "user@example.com")
      const emailUsername = email.split('@')[0];
      const userName = emailUsername.charAt(0).toUpperCase() + emailUsername.slice(1);

      // Create new user
      user = await prisma.users.create({
        data: {
          id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          email,
          name: userName, // Temporary name from email, can be updated later
          phone: null,
          password: null,
          phoneVerified: false,
          role_id: centerRole.id,
          updated_at: new Date()
        }
      });

      isNewUser = true;
      console.log(`✅ Auto-created new user: ${user.email} with CENTER role`);
    }

    // Generate magic link token
    const magicLinkToken = generateMagicLinkToken();
    // Allow configurable expiration time via env var (default: 15 minutes, dev: 60 minutes)
    const expirationMinutes = process.env.MAGIC_LINK_EXPIRY_MINUTES
      ? parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES, 10)
      : (process.env.NODE_ENV === 'development' ? 60 : 15);
    const magicLinkExpiresAt = getTokenExpirationTime(expirationMinutes);

    // Store magic link token in database
    await prisma.users.update({
      where: { id: user.id },
      data: {
        magicLinkToken,
        magicLinkExpiresAt
      }
    });

    console.log(`Magic link token generated for user: ${user.email}`);

    // Send magic link email
    const emailResult = await sendMagicLinkEmail(
      user.email!,
      user.name,
      magicLinkToken,
      isNewUser
    );

    if (!emailResult.success) {
      console.error('Failed to send magic link email:', emailResult.error);
      return {
        success: false,
        error: 'Failed to send magic link email. Please try again later.'
      };
    }

    console.log(`Magic link email sent successfully to: ${user.email}`);

    return {
      success: true,
      message: 'Magic link sent to your email',
      isNewUser
    };
  } catch (error) {
    console.error('Error creating magic link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create magic link'
    };
  }
}

/**
 * Verify magic link token and authenticate user
 * @param token Magic link token
 */
export async function verifyMagicLink(token: string): Promise<MagicLinkResult> {
  try {
    // Find user by magic link token
    const user = await prisma.users.findFirst({
      where: {
        magicLinkToken: token,
        magicLinkExpiresAt: {
          gte: new Date() // Token must not be expired
        }
      },
      include: {
        roles: true,
        centers: true
      }
    });

    if (!user) {
      console.log('Invalid or expired magic link token');
      return {
        success: false,
        error: 'Invalid or expired magic link'
      };
    }

    // Double check token expiration
    if (!user.magicLinkExpiresAt || isTokenExpired(user.magicLinkExpiresAt)) {
      console.log(`Magic link token has expired for user: ${user.email}`);
      return {
        success: false,
        error: 'Magic link has expired. Please request a new one.'
      };
    }

    // Clear magic link token after successful verification
    await prisma.users.update({
      where: { id: user.id },
      data: {
        magicLinkToken: null,
        magicLinkExpiresAt: null
      }
    });

    console.log(`Magic link verified successfully for user: ${user.email}`);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phoneVerified: user.phoneVerified
      }
    };
  } catch (error) {
    console.error('Error verifying magic link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Magic link verification failed'
    };
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
