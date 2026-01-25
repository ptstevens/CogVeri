/**
 * Unified Email Template System for CogVeri
 *
 * Provides consistent, professional branding across all transactional emails:
 * - Indigo primary color (#4F46E5)
 * - Professional header with logo image
 * - Consistent footer with tagline
 * - Responsive design for all email clients
 * - Dark mode support
 */

// Brand colors
export const BRAND_COLORS = {
  primary: '#4F46E5',      // Indigo - main brand color
  primaryDark: '#4338CA',  // Darker indigo for hover states
  primaryLight: '#E0E7FF', // Light indigo for backgrounds
  success: '#10B981',      // Green - approvals, completions
  successLight: '#ECFDF5', // Light green background
  successDark: '#065F46',  // Dark green text
  warning: '#F59E0B',      // Amber - reminders, pending
  warningLight: '#FFFBEB', // Light amber background
  warningDark: '#92400E',  // Dark amber text
  error: '#EF4444',        // Red - rejections, errors
  errorLight: '#FEF2F2',   // Light red background
  errorDark: '#DC2626',    // Dark red text
  text: '#1F2937',         // Dark gray - main text
  textMuted: '#6B7280',    // Medium gray - secondary text
  textLight: '#9CA3AF',    // Light gray - copyright text
  background: '#F3F4F6',   // Light gray - email background
  cardBg: '#F9FAFB',       // Slightly lighter - card backgrounds
  border: '#E5E7EB',       // Border color
  white: '#FFFFFF',
};

// Font stack for email clients
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export interface EmailTemplateOptions {
  /** Main heading text */
  title: string;
  /** Preheader text (shown in email preview) */
  preheader?: string;
  /** Main body content (HTML) */
  content: string;
  /** Primary CTA button */
  ctaButton?: {
    text: string;
    url: string;
    color?: string;
  };
  /** Secondary content after CTA */
  footer?: string;
  /** Header background color override */
  headerColor?: string;
}

/**
 * Get the logo URL for emails
 */
function getLogoUrl(): string {
  const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';
  return `${frontendUrl}/cogveri-logo-horizontal-white.png`;
}

/**
 * Generate a complete branded email HTML
 */
export function generateEmailTemplate(options: EmailTemplateOptions): string {
  const {
    title,
    preheader = '',
    content,
    ctaButton,
    footer = '',
    headerColor = BRAND_COLORS.primary,
  } = options;

  const currentYear = new Date().getFullYear();
  const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';
  const logoUrl = getLogoUrl();

  return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }

    /* Base styles */
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: ${BRAND_COLORS.background};
    }

    /* Link styles */
    a { color: ${BRAND_COLORS.primary}; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Mobile responsive */
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .content-padding { padding: 28px 24px !important; }
      .header-padding { padding: 28px 24px !important; }
      .footer-padding { padding: 24px !important; }
      .mobile-center { text-align: center !important; }
      .mobile-full-width { width: 100% !important; display: block !important; }
      .logo-img { width: 140px !important; height: auto !important; }
      .card-padding { padding: 20px !important; }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #1F2937 !important; }
      .card-bg { background-color: #374151 !important; }
      .text-primary { color: #F9FAFB !important; }
      .text-muted { color: #D1D5DB !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_COLORS.background};">
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${BRAND_COLORS.background};">
    ${preheader || title}
    &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;
    &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;
  </div>

  <!-- Email Container -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="email-bg" style="background-color: ${BRAND_COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Main Content Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="max-width: 600px; width: 100%; background-color: ${BRAND_COLORS.white}; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td class="header-padding" style="background-color: ${headerColor}; padding: 36px 40px; border-radius: 16px 16px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <!-- Logo row -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <img
                      src="${logoUrl}"
                      alt="CogVeri - Knowledge, Verified"
                      width="180"
                      class="logo-img"
                      style="display: block; width: 180px; max-width: 180px; height: auto;"
                    />
                  </td>
                </tr>
                <!-- Title row -->
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: ${BRAND_COLORS.white}; font-size: 22px; font-weight: 600; font-family: ${FONT_STACK}; letter-spacing: -0.3px; line-height: 1.3;">
                      ${title}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td class="content-padding" style="padding: 40px 48px;">
              <div style="font-family: ${FONT_STACK}; font-size: 16px; line-height: 1.6; color: ${BRAND_COLORS.text};">
                ${content}
              </div>

              ${ctaButton ? `
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 32px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: ${ctaButton.color || BRAND_COLORS.primary};">
                          <a href="${ctaButton.url}" target="_blank" style="display: inline-block; padding: 16px 32px; font-family: ${FONT_STACK}; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.white}; text-decoration: none; border-radius: 8px;">
                            <!--[if mso]>
                            <i style="letter-spacing: 32px; mso-font-width: -100%; mso-text-raise: 30pt;">&nbsp;</i>
                            <![endif]-->
                            <span style="mso-text-raise: 15pt;">${ctaButton.text}</span>
                            <!--[if mso]>
                            <i style="letter-spacing: 32px; mso-font-width: -100%;">&nbsp;</i>
                            <![endif]-->
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}

              ${footer ? `
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid ${BRAND_COLORS.border};">
                ${footer}
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 48px;">
              <div style="height: 1px; background-color: ${BRAND_COLORS.border};"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer-padding" style="padding: 28px 48px 36px 48px; border-radius: 0 0 16px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="font-family: ${FONT_STACK};">
                    <!-- Brand link -->
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND_COLORS.textMuted};">
                      Sent by <a href="${frontendUrl}" style="color: ${BRAND_COLORS.primary}; text-decoration: none; font-weight: 500;">CogVeri</a>
                    </p>
                    <!-- Tagline -->
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: ${BRAND_COLORS.primary}; font-style: italic; font-weight: 500;">
                      Knowledge, Verified.
                    </p>
                    <!-- Copyright -->
                    <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.textLight};">
                      &copy; ${currentYear} CogVeri. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Helper to create a professional info card with accent bar
 */
export function createInfoCard(content: string, accentColor: string = BRAND_COLORS.primary): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td class="card-bg" style="background-color: ${BRAND_COLORS.cardBg}; border-radius: 12px; border: 1px solid ${BRAND_COLORS.border}; overflow: hidden;">
          <!-- Top accent bar -->
          <div style="height: 4px; background-color: ${accentColor};"></div>
          <div class="card-padding" style="padding: 24px;">
            ${content}
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Helper to create a feedback/quote block (for rejection emails)
 */
export function createFeedbackBlock(feedback: string, type: 'error' | 'success' | 'warning' = 'error'): string {
  const colors = {
    error: { bg: BRAND_COLORS.errorLight, border: BRAND_COLORS.error, label: BRAND_COLORS.error },
    success: { bg: BRAND_COLORS.successLight, border: BRAND_COLORS.success, label: BRAND_COLORS.successDark },
    warning: { bg: BRAND_COLORS.warningLight, border: BRAND_COLORS.warning, label: BRAND_COLORS.warningDark },
  };
  const style = colors[type];
  const labelText = type === 'error' ? 'Reviewer Feedback' : type === 'success' ? 'Feedback' : 'Note';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="background-color: ${style.bg}; border-left: 4px solid ${style.border}; border-radius: 0 8px 8px 0; padding: 20px 24px;">
          <p style="margin: 0 0 8px 0; font-family: ${FONT_STACK}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${style.label};">
            ${labelText}
          </p>
          <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.text}; font-style: italic;">
            "${feedback}"
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Helper to create a success callout
 */
export function createSuccessCallout(message: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="background-color: ${BRAND_COLORS.successLight}; border-left: 4px solid ${BRAND_COLORS.success}; border-radius: 0 8px 8px 0; padding: 20px 24px;">
          <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.successDark};">
            ${message}
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Helper to create a warning notice
 */
export function createWarningNotice(message: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="background-color: ${BRAND_COLORS.warningLight}; border: 1px solid #FCD34D; border-radius: 8px; padding: 16px 20px;">
          <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.5; color: ${BRAND_COLORS.warningDark};">
            <strong>Note:</strong> ${message}
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Helper to create a details list with improved styling
 */
export function createDetailsList(items: Array<{ label: string; value: string }>): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 16px 0;">
      ${items.map(item => `
        <tr>
          <td style="padding: 10px 0; font-family: ${FONT_STACK}; font-size: 14px; font-weight: 600; color: ${BRAND_COLORS.textMuted}; width: 35%; vertical-align: top;">${item.label}</td>
          <td style="padding: 10px 0; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND_COLORS.text}; vertical-align: top;">${item.value}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

/**
 * Helper to create an enhanced priority badge
 */
export function createPriorityBadge(priority: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    high: { bg: '#FEE2E2', text: '#DC2626' },
    medium: { bg: '#FEF3C7', text: '#D97706' },
    low: { bg: '#D1FAE5', text: '#059669' },
  };
  const style = colors[priority.toLowerCase()] ?? colors.medium;

  return `
    <span style="display: inline-block; padding: 6px 14px; border-radius: 6px; font-family: ${FONT_STACK}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background-color: ${style!.bg}; color: ${style!.text};">
      ${priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()} Priority
    </span>
  `;
}

/**
 * Helper to create a status badge
 */
export function createStatusBadge(status: string, type: 'success' | 'warning' | 'error' | 'info' = 'info'): string {
  const colors = {
    success: { bg: '#D1FAE5', text: '#059669' },
    warning: { bg: '#FEF3C7', text: '#D97706' },
    error: { bg: '#FEE2E2', text: '#DC2626' },
    info: { bg: '#DBEAFE', text: '#2563EB' },
  };
  const style = colors[type];

  return `
    <span style="display: inline-block; padding: 6px 14px; border-radius: 6px; font-family: ${FONT_STACK}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background-color: ${style.bg}; color: ${style.text};">
      ${status}
    </span>
  `;
}

/**
 * Helper to format task type
 */
export function formatTaskType(type: string): string {
  const typeMap: Record<string, string> = {
    'recording': 'Screen Recording',
    'live_demo': 'Live Demo',
    'hybrid': 'Hybrid (Recording + Live)',
  };
  return typeMap[type] || type;
}

/**
 * Helper to create a numbered steps list
 */
export function createStepsList(steps: string[]): string {
  return `
    <ol style="margin: 20px 0; padding-left: 24px; font-family: ${FONT_STACK}; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.text};">
      ${steps.map(step => `
        <li style="padding: 6px 0; padding-left: 8px;">${step}</li>
      `).join('')}
    </ol>
  `;
}

/**
 * Helper to create a link that looks like a button (for secondary actions)
 */
export function createSecondaryButton(text: string, url: string): string {
  return `
    <a href="${url}" style="display: inline-block; padding: 12px 24px; font-family: ${FONT_STACK}; font-size: 14px; font-weight: 600; color: ${BRAND_COLORS.primary}; text-decoration: none; border: 2px solid ${BRAND_COLORS.primary}; border-radius: 8px;">
      ${text}
    </a>
  `;
}
