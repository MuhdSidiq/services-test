import whatsappClient from '../client';
import { WhatsAppResponse, TemplateResponseData, TemplateComponent } from '../types';

interface JobOfferParams {
  candidateName: string;
  companyName: string;
  location: string;
  date: string;
  shift: string;
  time: string;
  duration: string;
  additionalInfo: string;
  offerUrl?: string;
}

/**
 * Send job offer notification
 * Based on Meta template with 8 body parameters + 1 button parameter
 *
 * Template structure:
 * Body: {{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}} {{8}}
 * Button: Dynamic URL with {{1}}
 *
 * @param phoneNumber - Recipient phone number
 * @param params - Template parameters
 * @param params.candidateName - {{1}} Name of the candidate (e.g., "Ali Azizi")
 * @param params.companyName - {{2}} Company/Organization name (e.g., "CIC")
 * @param params.location - {{3}} Job location (e.g., "Presint 15")
 * @param params.date - {{4}} Start/Job date (e.g., "12/06/2025")
 * @param params.shift - {{5}} Shift number or code (e.g., "3")
 * @param params.time - {{6}} Time (e.g., "8.30pm")
 * @param params.duration - {{7}} Duration or rate (e.g., "15")
 * @param params.additionalInfo - {{8}} Additional info (e.g., "45")
 * @param params.offerUrl - Button URL parameter (e.g., "nD3larZZ")
 * @returns Response with success status and data
 */
export async function sendJobOffer(
  phoneNumber: string,
  params: JobOfferParams
): Promise<WhatsAppResponse<TemplateResponseData>> {
  try {
    // Validate required parameters
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Validate all 8 body parameters
    const requiredParams: Array<keyof Omit<JobOfferParams, 'offerUrl'>> = [
      'candidateName', 'companyName', 'location', 'date',
      'shift', 'time', 'duration', 'additionalInfo'
    ];

    for (const param of requiredParams) {
      if (!params[param]) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }

    // Build template components
    const components: TemplateComponent[] = [
      {
        type: 'body' as const,
        parameters: [
          { type: 'text' as const, text: params.candidateName },      // {{1}}
          { type: 'text' as const, text: params.companyName },        // {{2}}
          { type: 'text' as const, text: params.location },           // {{3}}
          { type: 'text' as const, text: params.date },               // {{4}}
          { type: 'text' as const, text: params.shift },              // {{5}}
          { type: 'text' as const, text: params.time },               // {{6}}
          { type: 'text' as const, text: params.duration },           // {{7}}
          { type: 'text' as const, text: params.additionalInfo }      // {{8}}
        ]
      }
    ];

    // Add button component if offerUrl is provided
    if (params.offerUrl) {
      components.push({
        type: 'button' as const,
        sub_type: 'url' as const,
        index: 0,
        parameters: [
          { type: 'text' as const, text: params.offerUrl }  // {{1}} for button URL
        ]
      });
    }

    // Build message payload
    const payload = {
      messaging_product: 'whatsapp' as const,
      to: phoneNumber,
      type: 'template' as const,
      template: {
        name: 'job_offer_v1',
        language: { code: 'ms' }, // Malay language
        components: components
      }
    };

    // Send message
    const response = await whatsappClient.sendMessage(payload);

    console.log(`Job offer sent to ${phoneNumber}:`, {
      messageId: response.messages?.[0]?.id,
      candidate: params.candidateName,
      company: params.companyName
    });

    return {
      success: true,
      data: {
        messageId: response.messages?.[0]?.id,
        recipient: phoneNumber,
        templateName: 'job_offer_v1',
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Error sending job offer:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
