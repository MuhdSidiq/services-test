import whatsappClient from '../client';
import { WhatsAppResponse, TemplateResponseData, TemplateComponent } from '../types';

interface DeliveryUpdateParams {
  name: string;
  location: string;
  time: string;
  job_order_id?: string;
}

/**
 * Send delivery update / job notification
 * Template: delivery_update_1 (Malay language)
 *
 * Template structure:
 * Header: {{1}}
 * Body: {{1}} {{2}} {{3}}
 * Button: Dynamic URL with {{1}}
 *
 * @param phoneNumber - Recipient phone number
 * @param params - Template parameters
 * @param params.name - Name for header and body (e.g., "Ali Azizi")
 * @param params.location - Location/Company (e.g., "CIC P15H")
 * @param params.time - Time (e.g., "09.30 am")
 * @param params.job_order_id - Job order ID for button URL (e.g., "110")
 * @returns Response with success status and data
 */
export async function sendDeliveryUpdate(
  phoneNumber: string,
  params: DeliveryUpdateParams
): Promise<WhatsAppResponse<TemplateResponseData>> {
  try {
    // Validate required parameters
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    const requiredParams: Array<keyof Omit<DeliveryUpdateParams, 'job_order_id'>> = ['name', 'location', 'time'];
    for (const param of requiredParams) {
      if (!params[param]) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }

    // Build template components
    const components: TemplateComponent[] = [
      {
        type: 'header' as const,
        parameters: [
          { type: 'text' as const, text: params.name }  // Header {{1}}
        ]
      },
      {
        type: 'body' as const,
        parameters: [
          { type: 'text' as const, text: params.location },  // Body {{1}}
          { type: 'text' as const, text: params.name },      // Body {{2}}
          { type: 'text' as const, text: params.time }       // Body {{3}}
        ]
      }
    ];

    // Add button component if job_order_id is provided
    if (params.job_order_id) {
      components.push({
        type: 'button' as const,
        sub_type: 'url' as const,
        index: 0,
        parameters: [
          { type: 'text' as const, text: params.job_order_id }  // Button {{1}}
        ]
      });
    }

    // Build message payload
    const payload = {
      messaging_product: 'whatsapp' as const,
      to: phoneNumber,
      type: 'template' as const,
      template: {
        name: 'delivery_update_1',
        language: { code: 'ms' }, // Malay language
        components: components
      }
    };

    // Send message
    const response = await whatsappClient.sendMessage(payload);

    console.log(`Delivery update sent to ${phoneNumber}:`, {
      messageId: response.messages?.[0]?.id,
      name: params.name,
      location: params.location
    });

    return {
      success: true,
      data: {
        messageId: response.messages?.[0]?.id,
        recipient: phoneNumber,
        templateName: 'delivery_update_1',
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Error sending delivery update:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
