import whatsappClient from '../client';
import { WhatsAppResponse, TemplateResponseData } from '../types';

interface AuthenticationOtpParams {
  otpCode: string;
  expiryMinutes?: string;
}

/**
 * Send authentication OTP code
 * @param phoneNumber - Recipient phone number
 * @param params - Template parameters
 * @param params.otpCode - OTP code to send
 * @param params.expiryMinutes - OTP expiry time in minutes (optional, default: 5)
 * @returns Response with success status and data
 */
export async function sendAuthenticationOtp(
  phoneNumber: string,
  params: AuthenticationOtpParams
): Promise<WhatsAppResponse<TemplateResponseData>> {
  try {
    // Validate required parameters
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    if (!params.otpCode) {
      throw new Error('OTP code is required');
    }

    // Default expiry to 5 minutes if not provided
    const expiryMinutes = params.expiryMinutes || '5';

    // Build template components based on your WhatsApp template structure
    const components = [
      {
        type: 'body' as const,
        parameters: [
          { type: 'text' as const, text: params.otpCode },
          { type: 'text' as const, text: expiryMinutes }
        ]
      }
    ];

    // Build message payload
    const payload = {
      messaging_product: 'whatsapp' as const,
      to: phoneNumber,
      type: 'template' as const,
      template: {
        name: 'authentication_otp', // Update this to match your actual template name in Meta
        language: { code: 'en' },
        components: components
      }
    };

    // Send message
    const response = await whatsappClient.sendMessage(payload);

    console.log(`OTP sent to ${phoneNumber}:`, {
      messageId: response.messages?.[0]?.id
    });

    return {
      success: true,
      data: {
        messageId: response.messages?.[0]?.id,
        recipient: phoneNumber,
        templateName: 'authentication_otp',
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Error sending authentication OTP:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
