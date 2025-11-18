import whatsappClient from '../client';
import { WhatsAppResponse, TemplateResponseData, TemplateComponent } from '../types';

interface NotificationToCenterParams {
  name: string;
  location: string;
  time: string;
  job_order_id?: string;
}

/**
 * Send notification to center (Job acceptance notification)
 * Template: Notifies center that a worker has accepted the job and is on the way
 *
 * Template structure:
 * Header: {{1}} - Worker name
 * Body: {{1}} {{2}} {{3}} - Location, Worker name, Arrival time
 * Button: Dynamic URL with {{1}} - Job order ID
 *
 * @param phoneNumber - Recipient phone number (center/admin)
 * @param params - Template parameters
 * @param params.name - Worker/Gantifier name (appears in header and body)
 * @param params.location - Job location
 * @param params.time - Expected arrival time
 * @param params.job_order_id - Job order ID for button URL (optional)
 * @returns Response with success status and data
 */
export async function sendNotificationToCenter(
  phoneNumber: string,
  params: NotificationToCenterParams
): Promise<WhatsAppResponse<TemplateResponseData>> {
  try {
    // Validate required parameters
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    const requiredParams: Array<keyof Omit<NotificationToCenterParams, 'job_order_id'>> = ['name', 'location', 'time'];
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
          { type: 'text' as const, text: params.name }  // {{1}} Header
        ]
      },
      {
        type: 'body' as const,
        parameters: [
          { type: 'text' as const, text: params.location },  // {{1}} Body
          { type: 'text' as const, text: params.name },      // {{2}} Body
          { type: 'text' as const, text: params.time }       // {{3}} Body
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
          { type: 'text' as const, text: params.job_order_id }  // {{1}} for button URL
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
        language: { code: 'ms' },  // Malay language
        components: components
      }
    };

    // Send message
    const response = await whatsappClient.sendMessage(payload);

    console.log(`Notification sent to center (${phoneNumber}):`, {
      messageId: response.messages?.[0]?.id,
      worker: params.name,
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
    console.error('Error sending notification to center:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
