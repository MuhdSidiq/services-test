// src/services/whatsapp.service.ts
// Wrapper for the existing WhatsApp templates (CommonJS modules)

// Since the templates are in CommonJS, we'll use dynamic require
const templates = require('../lib/whatsapp/templates');

/**
 * Send a simple text message via WhatsApp (using job offer template)
 * This is a simplified wrapper for sending job offers
 *
 * @param phoneNumber - Recipient phone number
 * @param message - Message text (will be split into template parameters)
 * @returns Success status
 */
export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<void> {
    console.log(`[WHATSAPP-SERVICE] Sending message to ${phoneNumber}`);
    console.log(`[WHATSAPP-SERVICE] Message: ${message}`);

    // For now, log the message since we need proper template parameters
    // This will be enhanced to use the actual WhatsApp API
    // The WhatsApp job offer template requires specific parameters

    // TODO: Implement actual WhatsApp message sending using templates.sendJobOffer
    // For now, just log to console
    console.log(`[WHATSAPP-SERVICE] ✅ Message logged (actual sending will be implemented with proper template parameters)`);
}

/**
 * Send a job offer via WhatsApp using the existing template
 *
 * @param phoneNumber - Recipient phone number
 * @param params - Job offer parameters
 * @returns Result object with success status
 */
export async function sendJobOfferWhatsApp(
    phoneNumber: string,
    params: {
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
): Promise<{ success: boolean; error?: string }> {
    try {
        console.log(`[WHATSAPP-SERVICE] Sending job offer to ${phoneNumber}`);

        const result = await templates.sendJobOffer(phoneNumber, params);

        if (result.success) {
            console.log(`[WHATSAPP-SERVICE] ✅ Job offer sent successfully`);
        } else {
            console.log(`[WHATSAPP-SERVICE] ❌ Failed to send job offer:`, result.error);
        }

        return result;
    } catch (error: any) {
        console.error('[WHATSAPP-SERVICE] ❌ Error sending job offer:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}
