/**
 * 10 modern approval email templates. Rich HTML bodies + styled headers for preview and sent mail.
 * Liquid: {{ shop.name }}, {{ customer.first_name }}, {{ activation_url }}, {{ shop.url }}, etc.
 */

export type ApprovalEmailPreset = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  footerText: string;
  buttonText: string;
  buttonUrl: string;
  headerTitle?: string;
  headerTitleSize?: string;
  headerTitleColor?: string;
  headerBgColor?: string;
  logoAlign?: "left" | "center" | "right";
  buttonColor?: string;
  buttonTextColor?: string;
  buttonAlign?: "left" | "center" | "right";
};

const P = "margin:0 0 14px;font-size:15px;line-height:1.65;color:#334155;";
const P_SM = "margin:0 0 12px;font-size:14px;line-height:1.6;color:#64748b;";
const STRONG = "color:#0f172a;font-weight:600;";
const UL = "margin:0 0 16px;padding:0 0 0 20px;color:#334155;font-size:15px;line-height:1.7;";
const CARD =
  "margin:0 0 16px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.6;color:#475569;";

export const APPROVAL_EMAIL_PRESETS: ApprovalEmailPreset[] = [
  {
    id: "professional",
    name: "Modern Classic",
    subject: "Your account is approved — {{ shop.name }}",
    bodyHtml: `<p style="${P}">Hello <span style="${STRONG}">{{ customer.first_name }}</span>,</p><p style="${P}">Thank you for registering with <span style="${STRONG}">{{ shop.name }}</span>. Your customer account has been approved and is ready to use.</p><p style="${P}">Use the button below to sign in. If this is your first visit, Shopify will guide you through activating your account.</p><p style="${P_SM}">Best regards,<br/>The {{ shop.name }} team</p>`,
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved.",
    buttonText: "Sign in to your account",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account Approved",
    headerTitleSize: "22",
    headerTitleColor: "#0f172a",
    headerBgColor: "#f8fafc",
    logoAlign: "center",
    buttonColor: "#2563eb",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "friendly",
    name: "Modern Welcome",
    subject: "Welcome to {{ shop.name }} — you're in!",
    bodyHtml: `<p style="${P}">Hi {{ customer.first_name }},</p><p style="${P}">Great news — we've approved your registration for <span style="${STRONG}">{{ shop.name }}</span>. You're all set to explore the store.</p><div style="${CARD}">Tap the button below to log in. Questions? Reply to this email — we're happy to help.</div><p style="${P_SM}">Thanks for joining us!<br/>{{ shop.name }}</p>`,
    footerText: "{{ shop.name }} · Reply to this email or visit {{ shop.url }}",
    buttonText: "Get started",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Welcome aboard",
    headerTitleSize: "24",
    headerTitleColor: "#047857",
    headerBgColor: "#ecfdf5",
    logoAlign: "center",
    buttonColor: "#059669",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "minimal",
    name: "Modern Minimal",
    subject: "Account approved — {{ shop.name }}",
    bodyHtml: `<p style="${P}">Hi {{ customer.first_name }},</p><p style="${P}">Your account has been approved. Use the link below to sign in.</p><p style="${P_SM}">— {{ shop.name }}</p>`,
    footerText: "{{ shop.name }}",
    buttonText: "Sign in",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Approved",
    headerTitleSize: "20",
    headerTitleColor: "#18181b",
    headerBgColor: "",
    logoAlign: "left",
    buttonColor: "#18181b",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "b2b-formal",
    name: "Modern Corporate",
    subject: "Account approval confirmation — {{ shop.name }}",
    bodyHtml: `<p style="${P}">Dear {{ customer.first_name }},</p><p style="${P}">Thank you for submitting your registration with <span style="${STRONG}">{{ shop.name }}</span>.</p><p style="${P}">We are pleased to confirm that your customer account has been approved. You may access your account using the secure login link below.</p><p style="${P_SM}">For assistance, visit {{ shop.url }}/pages/contact.</p><p style="${P_SM}">Sincerely,<br/>{{ shop.name }}</p>`,
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. Confidential.",
    buttonText: "Access your account",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Approval Confirmation",
    headerTitleSize: "20",
    headerTitleColor: "#1e293b",
    headerBgColor: "#f1f5f9",
    logoAlign: "left",
    buttonColor: "#1e293b",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "with-next-steps",
    name: "Modern Steps",
    subject: "Your {{ shop.name }} account is ready",
    bodyHtml: `<p style="${P}">Hello {{ customer.first_name }},</p><p style="${P}">Your registration for <span style="${STRONG}">{{ shop.name }}</span> has been approved. Here's what to do next:</p><ul style="${UL}"><li style="margin-bottom:8px;">Sign in with the button below</li><li style="margin-bottom:8px;">Complete your profile if needed</li><li style="margin-bottom:8px;">Start shopping — we're glad to have you</li></ul><p style="${P_SM}">Need help? Visit {{ shop.url }}/pages/contact</p>`,
    footerText: "{{ shop.name }} · {{ shop.url }}",
    buttonText: "Continue to login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "You're all set",
    headerTitleSize: "22",
    headerTitleColor: "#1d4ed8",
    headerBgColor: "#eff6ff",
    logoAlign: "center",
    buttonColor: "#2563eb",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "empathetic",
    name: "Modern Warm",
    subject: "Good news — your {{ shop.name }} account is approved",
    bodyHtml: `<p style="${P}">Hi {{ customer.first_name }},</p><p style="${P}">We're happy to let you know your registration with <span style="${STRONG}">{{ shop.name }}</span> has been approved. Thank you for your patience.</p><div style="${CARD}">Click below to log in. If anything doesn't work, reply to this email — we're here for you.</div><p style="${P_SM}">With thanks,<br/>The team at {{ shop.name }}</p>`,
    footerText: "{{ shop.name }} · © {{ 'now' | date: \"%Y\" }}",
    buttonText: "Log in now",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "You're approved",
    headerTitleSize: "24",
    headerTitleColor: "#6d28d9",
    headerBgColor: "#f5f3ff",
    logoAlign: "center",
    buttonColor: "#7c3aed",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "wholesale",
    name: "Modern Trade",
    subject: "Wholesale account approved — {{ shop.name }}",
    bodyHtml: `<p style="${P}">Hello {{ customer.first_name }},</p><p style="${P}">Your wholesale application with <span style="${STRONG}">{{ shop.name }}</span> has been approved.</p><p style="${P}">Sign in below to access your trade catalog, pricing, and account tools.</p><p style="${P_SM}">Questions about your account? Visit {{ shop.url }}/pages/contact</p><p style="${P_SM}">Best regards,<br/>{{ shop.name }} Wholesale</p>`,
    footerText: "{{ shop.name }} Wholesale · © {{ 'now' | date: \"%Y\" }}",
    buttonText: "Open wholesale account",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Trade account active",
    headerTitleSize: "22",
    headerTitleColor: "#b45309",
    headerBgColor: "#fffbeb",
    logoAlign: "center",
    buttonColor: "#d97706",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "reapply",
    name: "Modern Fresh",
    subject: "Welcome — your {{ shop.name }} account is ready",
    bodyHtml: `<p style="${P}">Hi {{ customer.first_name }},</p><p style="${P}">Thanks for applying to <span style="${STRONG}">{{ shop.name }}</span>. Your account is approved and ready to go.</p><p style="${P}">Tap the button below to sign in. We're here if you need anything along the way.</p><p style="${P_SM}">— {{ shop.name }}</p>`,
    footerText: "{{ shop.name }} · We're here when you need us",
    buttonText: "Start shopping",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Ready when you are",
    headerTitleSize: "22",
    headerTitleColor: "#0f766e",
    headerBgColor: "#f0fdfa",
    logoAlign: "center",
    buttonColor: "#0d9488",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "legal-style",
    name: "Modern Notice",
    subject: "Notice: account approval — {{ shop.name }}",
    bodyHtml: `<p style="${P}">Dear {{ customer.first_name }},</p><p style="${P}">This message confirms that your customer account registration with <span style="${STRONG}">{{ shop.name }}</span> has been approved.</p><p style="${P}">Access your account using the secure link below. For inquiries, contact us at {{ shop.url }}/pages/contact.</p><p style="${P_SM}">© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved.</p>`,
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. This message is confidential.",
    buttonText: "Secure login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account approved",
    headerTitleSize: "18",
    headerTitleColor: "#374151",
    headerBgColor: "#f9fafb",
    logoAlign: "left",
    buttonColor: "#4b5563",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "support-focused",
    name: "Modern Support",
    subject: "Your {{ shop.name }} account is ready — we're here to help",
    bodyHtml: `<p style="${P}">Hello {{ customer.first_name }},</p><p style="${P}">Your account with <span style="${STRONG}">{{ shop.name }}</span> has been approved. We want your first sign-in to go smoothly.</p><p style="${P}"><span style="${STRONG}">What you can do now:</span></p><ul style="${UL}"><li style="margin-bottom:8px;">Log in using the button below</li><li style="margin-bottom:8px;">Explore your account after you sign in</li><li style="margin-bottom:8px;">Contact us if you need any help</li></ul><p style="${P_SM}">Reply to this email or visit {{ shop.url }}/pages/contact — we'll get back to you soon.</p><p style="${P_SM}">Thank you,<br/>{{ shop.name }} Support</p>`,
    footerText: "{{ shop.name }} Support · {{ shop.url }}",
    buttonText: "Log in to your account",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account ready",
    headerTitleSize: "22",
    headerTitleColor: "#0369a1",
    headerBgColor: "#f0f9ff",
    logoAlign: "center",
    buttonColor: "#0284c7",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
];

export function getApprovalPresetById(id: string): ApprovalEmailPreset | undefined {
  return APPROVAL_EMAIL_PRESETS.find((p) => p.id === id);
}
