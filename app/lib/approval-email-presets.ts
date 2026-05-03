/**
 * Ready-made approval (success) email templates. User can choose one in Settings to fill subject/body and styles.
 * All support Liquid: {{ shop.name }}, {{ customer.first_name }}, {{ activation_url }}, etc.
 * {{ activation_url }} opens the Shopify customer account invite / login flow for your storefront.
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

export const APPROVAL_EMAIL_PRESETS: ApprovalEmailPreset[] = [
  {
    id: "professional",
    name: "Professional & brief",
    subject: "Your account has been approved – {{ shop.name }}",
    bodyHtml:
      "Hello {{ customer.first_name }},\n\nThank you for registering with {{ shop.name }}.\n\nYour customer account has been approved. You can log in to the store and start shopping. Use the link below to open your customer login (if this is your first time, Shopify will guide you to finish activating your account).\n\nBest regards,\nThe {{ shop.name }} team",
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved.",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account Approved",
    headerTitleSize: "20",
    headerTitleColor: "#1f2937",
    headerBgColor: "",
    logoAlign: "left",
    buttonColor: "#2563eb",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "friendly",
    name: "Friendly & warm",
    subject: "Welcome to {{ shop.name }} – you're in!",
    bodyHtml:
      "Hi {{ customer.first_name }},\n\nGreat news! We've approved your registration for {{ shop.name }}. You're all set to start shopping.\n\nClick the button below to log in to your customer account. If you have any questions, just reply to this email – we're happy to help.\n\nThanks for joining us!\n{{ shop.name }}",
    footerText: "{{ shop.name }} · Questions? Reply to this email or visit {{ shop.url }}",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "You're In!",
    headerTitleSize: "24",
    headerTitleColor: "#059669",
    headerBgColor: "#ecfdf5",
    logoAlign: "center",
    buttonColor: "#059669",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "minimal",
    name: "Minimal (short)",
    subject: "Account approved – {{ shop.name }}",
    bodyHtml:
      "Hi {{ customer.first_name }},\n\nYour customer account has been approved. Use the link below to log in.\n\n— {{ shop.name }}",
    footerText: "{{ shop.name }}",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account Approved",
    headerTitleSize: "18",
    headerTitleColor: "#374151",
    headerBgColor: "",
    logoAlign: "left",
    buttonColor: "#16a34a",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "b2b-formal",
    name: "B2B formal",
    subject: "Account approval confirmation – {{ shop.name }}",
    bodyHtml:
      "Dear {{ customer.first_name }},\n\nThank you for submitting your account registration with {{ shop.name }}.\n\nWe are pleased to inform you that your customer account has been approved. You may access your account using the customer login link below.\n\nIf you have any questions, please contact us or visit {{ shop.url }}/pages/contact.\n\nSincerely,\n{{ shop.name }}",
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. Confidential.",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account Approval Confirmation",
    headerTitleSize: "22",
    headerTitleColor: "#111827",
    headerBgColor: "#f3f4f6",
    logoAlign: "left",
    buttonColor: "#1f2937",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "with-next-steps",
    name: "With next steps",
    subject: "Your {{ shop.name }} account is ready – next steps",
    bodyHtml:
      "Hello {{ customer.first_name }},\n\nYour registration for {{ shop.name }} has been approved.\n\nNext steps:\n• Use the button below to log in to your customer account (link expires in 30 days).\n• Complete your profile after you sign in if needed.\n• Start shopping – we're glad to have you.\n\nIf you need help, visit {{ shop.url }}/pages/contact.\n\n— {{ shop.name }}",
    footerText: "{{ shop.name }} · {{ shop.url }}",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Next Steps",
    headerTitleSize: "24",
    headerTitleColor: "#1d4ed8",
    headerBgColor: "#eff6ff",
    logoAlign: "center",
    buttonColor: "#2563eb",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "empathetic",
    name: "Empathetic",
    subject: "Good news – your {{ shop.name }} account is approved",
    bodyHtml:
      "Hi {{ customer.first_name }},\n\nWe're happy to let you know that your registration with {{ shop.name }} has been approved. We know you've been waiting, and we're glad to welcome you.\n\nUse the link below to log in to your customer account. If anything doesn't work or you have questions, just reply to this email – we're here to help.\n\nThank you for your patience.\n— The team at {{ shop.name }}",
    footerText: "With care, {{ shop.name }} · © {{ 'now' | date: \"%Y\" }}",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "You're Approved",
    headerTitleSize: "24",
    headerTitleColor: "#7c3aed",
    headerBgColor: "#f5f3ff",
    logoAlign: "center",
    buttonColor: "#7c3aed",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "wholesale",
    name: "Wholesale / trade",
    subject: "Wholesale account approved – {{ shop.name }}",
    bodyHtml:
      "Hello {{ customer.first_name }},\n\nThank you for applying for a wholesale account with {{ shop.name }}.\n\nWe're pleased to confirm that your customer account has been approved. Use the link below to log in and access your wholesale catalog and account benefits.\n\nIf you have any questions about your account, visit {{ shop.url }}/pages/contact.\n\nBest regards,\n{{ shop.name }} Wholesale",
    footerText: "{{ shop.name }} Wholesale · © {{ 'now' | date: \"%Y\" }}",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Wholesale Account Approved",
    headerTitleSize: "20",
    headerTitleColor: "#b45309",
    headerBgColor: "#fffbeb",
    logoAlign: "center",
    buttonColor: "#d97706",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "reapply",
    name: "Encourage reapply",
    subject: "Welcome – your {{ shop.name }} account is ready",
    bodyHtml:
      "Hi {{ customer.first_name }},\n\nThanks for applying to {{ shop.name }}. We're glad to tell you your customer account has been approved and you're all set.\n\nClick below to log in. If you need help or have questions, reply to this email or visit {{ shop.url }}/pages/contact – we're here to guide you.\n\n— {{ shop.name }}",
    footerText: "{{ shop.name }} · We're here when you need us.",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "You're All Set",
    headerTitleSize: "22",
    headerTitleColor: "#0d9488",
    headerBgColor: "",
    logoAlign: "center",
    buttonColor: "#0d9488",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
  {
    id: "legal-style",
    name: "Legal / compliance tone",
    subject: "Notice: account approval – {{ shop.name }}",
    bodyHtml:
      "Dear {{ customer.first_name }},\n\nThis message is to confirm that your customer account registration with {{ shop.name }} has been approved.\n\nYou may access your customer account using the secure login link below. This link will expire in 30 days. If you have inquiries regarding your account, you may contact us or visit {{ shop.url }}/pages/contact.\n\n© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved.",
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved. This message is confidential.",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Notice: Account Approved",
    headerTitleSize: "18",
    headerTitleColor: "#1f2937",
    headerBgColor: "#f9fafb",
    logoAlign: "left",
    buttonColor: "#4b5563",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "support-focused",
    name: "Support-focused",
    subject: "Your {{ shop.name }} account is ready – we're here to help",
    bodyHtml:
      "Hello {{ customer.first_name }},\n\nYour customer account with {{ shop.name }} has been approved. We want to make sure you get started smoothly.\n\nWhat you can do now:\n• Log in using the customer account link below\n• Explore your account after you sign in\n• Contact us if you need any help\n\nReply to this email or visit {{ shop.url }}/pages/contact and we'll get back to you as soon as we can.\n\nThank you,\n{{ shop.name }} Support",
    footerText: "{{ shop.name }} Support · {{ shop.url }}",
    buttonText: "Login",
    buttonUrl: "{{ activation_url }}",
    headerTitle: "Account Ready",
    headerTitleSize: "24",
    headerTitleColor: "#0284c7",
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
