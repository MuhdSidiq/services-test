import 'dotenv/config';
import whatsappClient from '../client';
import { WhatsAppResponse, TemplateResponseData } from '../types';

interface AuthenticationOtpParams {
  otpCode: string;
  expiryMinutes?: string; // Not used in template, kept for backward compatibility
}

/**
 * Send authentication OTP code
 * @param phoneNumber - Recipient phone number
 * @param params - Template parameters
 * @param params.otpCode - OTP code to send
 * @param params.expiryMinutes - Not used (expiry is hardcoded in template)
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

    // Get template name from environment variable or use default
    const templateName = process.env.WA_OTP_TEMPLATE_NAME || 'gantify_authentication';
    const templateLanguage = process.env.WA_OTP_TEMPLATE_LANGUAGE || 'en_US';

    // Build template components - body and button both need OTP code parameter
    const components = [
      {
        type: 'body' as const,
        parameters: [
          { type: 'text' as const, text: params.otpCode }
        ]
      },
      {
        type: 'button' as const,
        sub_type: 'url' as const,
        index: 0,
        parameters: [
          { type: 'text' as const, text: params.otpCode }
        ]
      }
    ];

    // Build message payload
    const payload = {
      messaging_product: 'whatsapp' as const,
      to: phoneNumber,
      type: 'template' as const,
      template: {
        name: templateName,
        language: { code: templateLanguage },
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
        templateName: templateName,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide helpful error message for template not found
    if (errorMessage.includes('132001') || errorMessage.includes('Template name does not exist')) {
      const templateName = process.env.WA_OTP_TEMPLATE_NAME || 'gantify_authentication';
      console.error('WhatsApp Template Error:', {
        error: errorMessage,
        templateName: templateName,
        help: 'Template does not exist or is not approved in Meta Business Manager. Please:',
        steps: [
          '1. Go to Meta Business Suite → WhatsApp Manager → Message Templates',
          '2. Check if template exists and is approved',
          '3. Verify template name matches exactly (case-sensitive)',
          '4. Set WA_OTP_TEMPLATE_NAME in .env if using different name',
          '5. Wait 24-48 hours if template is pending approval'
        ]
      });
    }
    
    console.error('Error sending authentication OTP:', errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
}
