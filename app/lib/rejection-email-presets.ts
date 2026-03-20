/**
 * 10 ready-made rejection email templates. User can choose one in Settings to fill subject/body and styles.
 * All support Liquid placeholders: {{ shop.name }}, {{ customer.first_name }}, {{ customer.email }}, etc.
 */

export type RejectionEmailPreset = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  footerText: string;
  buttonText: string;
  buttonUrl: string;
  /** Header title (e.g. "Registration Update"). Empty = no header title. */
  headerTitle?: string;
  /** Header title font size in px: "16" | "18" | "20" | "24" | "28" */
  headerTitleSize?: string;
  /** Header title color hex (e.g. "#1f2937"). Empty = default #111 */
  headerTitleColor?: string;
  /** Header background color hex. Empty = no background */
  headerBgColor?: string;
  /** Logo/header alignment */
  logoAlign?: "left" | "center" | "right";
  /** Button background color hex. Empty = default red #dc2626 */
  buttonColor?: string;
  /** Button text color hex. Empty = default white #fff */
  buttonTextColor?: string;
  /** Button alignment */
  buttonAlign?: "left" | "center" | "right";
};

export const REJECTION_EMAIL_PRESETS: RejectionEmailPreset[] = [
  {
    id: "professional",
    name: "Professional & brief",
    subject: "Your account registration update",
    bodyHtml: "Hello {{ customer.first_name }},\n\nThank you for your interest in {{ shop.name }}.\n\nUnfortunately, we are unable to approve your registration at this time. If you have questions, please contact us or visit {{ shop.url }}/pages/contact.\n\nBest regards,\nThe {{ shop.name }} team",
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved.",
    buttonText: "Contact us",
    buttonUrl: "{{ shop.url }}/pages/contact",
    headerTitle: "Registration Update",
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
    subject: "Update on your {{ shop.name }} registration",
    bodyHtml: "Hi {{ customer.first_name }},\n\nThanks so much for applying to join {{ shop.name }}. We’ve reviewed your request and aren’t able to approve it right now.\n\nIf you think we might have missed something or you’d like to try again later, just reply to this email or visit {{ shop.url }}/pages/contact. We’re happy to help.\n\nThanks again,\n{{ shop.name }}",
    footerText: "{{ shop.name }} · Questions? Reply to this email or visit {{ shop.url }}",
    buttonText: "Reply or visit us",
    buttonUrl: "{{ shop.url }}",
    headerTitle: "Update on Your Registration",
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
    subject: "Registration not approved",
    bodyHtml: "Hi {{ customer.first_name }},\n\nYour registration was not approved. For questions, reply to this email or visit {{ shop.url }}/pages/contact.\n\n— {{ shop.name }}",
    footerText: "{{ shop.name }}",
    buttonText: "Contact {{ shop.name }}",
    buttonUrl: "{{ shop.url }}/pages/contact",
    headerTitle: "Registration Not Approved",
    headerTitleSize: "18",
    headerTitleColor: "#374151",
    headerBgColor: "",
    logoAlign: "left",
    buttonColor: "#6b7280",
    buttonTextColor: "#ffffff",
    buttonAlign: "left",
  },
  {
    id: "b2b-formal",
    name: "B2B formal",
    subject: "Account approval decision – {{ shop.name }}",
    bodyHtml: "Dear {{ customer.first_name }},\n\nThank you for submitting your account registration with {{ shop.name }}.\n\nAfter review, we are unable to approve your account at this time. This decision may be based on our current eligibility criteria or documentation requirements.\n\nIf you believe this is in error or wish to reapply, please contact us or visit {{ shop.url }}/pages/contact.\n\nSincerely,\n{{ shop.name }}",
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. Confidential.",
    buttonText: "Contact us",
    buttonUrl: "{{ shop.url }}/pages/contact",
    headerTitle: "Account Approval Decision",
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
    subject: "Your {{ shop.name }} registration – next steps",
    bodyHtml: "Hello {{ customer.first_name }},\n\nWe’ve reviewed your registration for {{ shop.name }} and aren’t able to approve it at this time.\n\nWhat you can do:\n• Reply to this email or visit {{ shop.url }}/pages/contact if you have questions.\n• Ensure your business details are complete and accurate if you reapply.\n• Check our account requirements at {{ shop.url }}/account/register.\n\nWe’re here to help if you need anything.\n\n— {{ shop.name }}",
    footerText: "{{ shop.name }} · {{ shop.url }}",
    buttonText: "View requirements",
    buttonUrl: "{{ shop.url }}/account/register",
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
    subject: "We’re sorry – update on your registration",
    bodyHtml: "Hi {{ customer.first_name }},\n\nWe’re sorry to let you know that we weren’t able to approve your registration with {{ shop.name }} at this time.\n\nWe know this isn’t the outcome you were hoping for. If you’d like to understand why or discuss your options, please reply to this email or visit {{ shop.url }}/pages/contact.\n\nThank you for your interest in {{ shop.name }}.\n\n— The team at {{ shop.name }}",
    footerText: "With care, {{ shop.name }} · © {{ 'now' | date: \"%Y\" }}",
    buttonText: "Contact us",
    buttonUrl: "{{ shop.url }}/pages/contact",
    headerTitle: "We're Sorry",
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
    subject: "Wholesale account application – {{ shop.name }}",
    bodyHtml: "Hello {{ customer.first_name }},\n\nThank you for your interest in a wholesale account with {{ shop.name }}.\n\nWe’ve reviewed your application and are unable to offer an approved account at this time. Our wholesale program has specific eligibility requirements that we use to ensure we can serve our partners well.\n\nIf you’d like to reapply in the future or have questions, visit {{ shop.url }}/pages/contact.\n\nBest regards,\n{{ shop.name }}",
    footerText: "{{ shop.name }} Wholesale · © {{ 'now' | date: \"%Y\" }}",
    buttonText: "Apply again",
    buttonUrl: "{{ shop.url }}/account/register",
    headerTitle: "Wholesale Application",
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
    subject: "Your registration – try again when ready",
    bodyHtml: "Hi {{ customer.first_name }},\n\nThanks for applying to {{ shop.name }}. We weren’t able to approve your registration this time, but you’re welcome to reapply when your information or situation has changed.\n\nNeed help? Reply to this email or visit {{ shop.url }}/pages/contact and we’ll do our best to guide you.\n\n— {{ shop.name }}",
    footerText: "{{ shop.name }} · We're here when you're ready.",
    buttonText: "Reapply when ready",
    buttonUrl: "{{ shop.url }}/account/register",
    headerTitle: "Try Again When Ready",
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
    subject: "Notice: registration decision – {{ shop.name }}",
    bodyHtml: "Dear {{ customer.first_name }},\n\nThis message is to inform you that your account registration with {{ shop.name }} has not been approved.\n\nWe are not obligated to disclose the specific reasons for this decision. If you have inquiries regarding your application, you may contact us or visit {{ shop.url }}/pages/contact.\n\n© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved.",
    footerText: "© {{ 'now' | date: \"%Y\" }} {{ shop.name }}. All rights reserved. This message is confidential.",
    buttonText: "Contact support",
    buttonUrl: "{{ shop.url }}/pages/contact",
    headerTitle: "Notice: Registration Decision",
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
    subject: "Your {{ shop.name }} account request – we’re here to help",
    bodyHtml: "Hello {{ customer.first_name }},\n\nYour registration with {{ shop.name }} wasn’t approved this time. We want to make sure you have a clear path forward.\n\nOur team can help you with:\n• Understanding why your request wasn’t approved\n• What to do if you’d like to reapply\n• Alternative ways to shop or work with us\n\nReply to this email or visit {{ shop.url }}/pages/contact and we’ll get back to you as soon as we can.\n\nThank you,\n{{ shop.name }} Support",
    footerText: "{{ shop.name }} Support · {{ shop.url }}",
    buttonText: "Get help",
    buttonUrl: "{{ shop.url }}/pages/contact",
    headerTitle: "We're Here to Help",
    headerTitleSize: "24",
    headerTitleColor: "#0284c7",
    headerBgColor: "#f0f9ff",
    logoAlign: "center",
    buttonColor: "#0284c7",
    buttonTextColor: "#ffffff",
    buttonAlign: "center",
  },
];

export function getRejectionPresetById(id: string): RejectionEmailPreset | undefined {
  return REJECTION_EMAIL_PRESETS.find((p) => p.id === id);
}
