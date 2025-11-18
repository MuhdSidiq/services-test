import 'dotenv/config';
import { WhatsAppMessagePayload, WhatsAppMessageResponse } from './types';

/**
 * WhatsApp Cloud API Client using native fetch
 */
class WhatsAppClient {
  private accessToken: string | undefined;
  private phoneNumberId: string | undefined;
  private apiVersion: string;
  private baseUrl: string;

  constructor() {
    this.accessToken = process.env.WA_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    // Validate credentials
    if (!this.accessToken || !this.phoneNumberId) {
      console.error('Missing required WhatsApp environment variables');
      console.error('Please set WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID in .env file');
    }
  }

  /**
   * Send a message via WhatsApp Cloud API
   * @param messageData - Message payload
   * @returns API response
   */
  async sendMessage(messageData: WhatsAppMessagePayload): Promise<WhatsAppMessageResponse> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      });

      const data = await response.json() as WhatsAppMessageResponse;

      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data;

    } catch (error) {
      console.error('WhatsApp API Error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
}

// Export singleton instance
export default new WhatsAppClient();
