/**
 * WhatsApp Cloud API TypeScript Types
 */

export interface WhatsAppMessageResponse {
  messages?: Array<{
    id: string;
  }>;
  error?: {
    message: string;
    type: string;
    code: number;
    error_data?: {
      messaging_product: string;
      details: string;
    };
  };
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
  date_time?: {
    fallback_value: string;
  };
  image?: {
    link: string;
  };
  document?: {
    link: string;
    filename?: string;
  };
  video?: {
    link: string;
  };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'quick_reply';
  index?: number;
  parameters: TemplateParameter[];
}

export interface WhatsAppMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template' | 'text';
  template?: {
    name: string;
    language: {
      code: string;
    };
    components: TemplateComponent[];
  };
  text?: {
    body: string;
  };
}

export interface WhatsAppResponse<T = WhatsAppMessageResponse> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TemplateResponseData {
  messageId?: string;
  recipient: string;
  templateName: string;
  timestamp: string;
}
