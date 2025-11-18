import { Resend } from 'resend';

/**
 * Email Service using Resend
 * Resend uses HTTPS API (not SMTP), making it reliable in containerized environments
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Initialize Resend
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@gantify.my';

/**
 * Send email using Resend
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    if (!resend) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email sending disabled.');
      console.log('Would have sent email to:', options.to);
      console.log('Subject:', options.subject);
      return {
        success: false,
        error: 'Email service not configured. Please set RESEND_API_KEY environment variable.'
      };
    }

    console.log('📧 Sending email via Resend to:', options.to);
    const result = await resend.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    });

    if (result.error) {
      console.error('❌ Resend error:', result.error);
      throw new Error(result.error.message);
    }

    console.log('✅ Email sent successfully via Resend:', result.data?.id);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    };
  }
}

/**
 * Generate HTML email template for magic link
 */
function generateMagicLinkEmailHTML(name: string, magicLinkUrl: string, isNewUser: boolean = false): string {
  const headerTitle = isNewUser ? '👋 Welcome to Gantify' : '🔐 Gantify Sign In';
  const greeting = isNewUser ? `Welcome ${name}!` : `Hello ${name},`;
  const mainMessage = isNewUser
    ? 'Welcome to Gantify! Click the button below to verify your email and complete your order:'
    : 'You requested to sign in to your Gantify account. Click the button below to securely sign in:';
  const buttonText = isNewUser ? 'Verify Email & Continue' : 'Sign In to Gantify';
  const footerMessage = isNewUser
    ? 'This email was sent because you started creating an order on Gantify.'
    : 'This email was sent because you requested to sign in to Gantify.';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .content p {
      margin: 0 0 20px 0;
      font-size: 16px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      transition: transform 0.2s;
    }
    .button:hover {
      transform: translateY(-2px);
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .security-note {
      background-color: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .security-note p {
      margin: 5px 0;
      font-size: 14px;
      color: #666;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px 30px;
      text-align: center;
      font-size: 14px;
      color: #666;
    }
    .footer p {
      margin: 5px 0;
    }
    .link-text {
      word-break: break-all;
      color: #667eea;
      font-size: 14px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${headerTitle}</h1>
    </div>

    <div class="content">
      <p class="greeting">${greeting}</p>

      <p>${mainMessage}</p>

      <div class="button-container">
        <a href="${magicLinkUrl}" class="button">${buttonText}</a>
      </div>

      <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
      <p class="link-text">${magicLinkUrl}</p>

      <div class="security-note">
        <p><strong>🔒 Security Note:</strong></p>
        <p>• This link will expire in 15 minutes</p>
        <p>• This link can only be used once</p>
        <p>• If you didn't request this, you can safely ignore this email</p>
      </div>

      <p style="margin-top: 30px; font-size: 14px; color: #666;">
        For security reasons, this magic link will become invalid after being used once or after 15 minutes, whichever comes first.
      </p>
    </div>

    <div class="footer">
      <p><strong>Gantify</strong></p>
      <p>Childcare Staffing Platform</p>
      <p style="margin-top: 15px;">
        ${footerMessage}<br>
        If you didn't make this request, please ignore this email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send magic link email
 */
export async function sendMagicLinkEmail(
  email: string,
  name: string,
  token: string,
  isNewUser: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // Magic link should point to backend API endpoint, not frontend
  const backendUrl = process.env.API_BASE_URL || process.env.BACKEND_URL || process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
  const magicLinkUrl = `${backendUrl}/api/auth/verify-magic-link?token=${token}`;

  const html = generateMagicLinkEmailHTML(name, magicLinkUrl, isNewUser);
  const subject = isNewUser ? '👋 Welcome to Gantify - Verify Your Email' : '🔐 Sign in to Gantify';

  return sendEmail({
    to: email,
    subject,
    html
  });
}
