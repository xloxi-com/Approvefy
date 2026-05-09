/**
 * Fixed copy for the in-app Pricing page (Basic · Standard · Premium).
 * Keep feature lines short — UI lists them under each tier in app.pricing.tsx.
 */

/** Page title (Polaris Page heading) */
export const PRICING_PAGE_TITLE = "Pricing";

/** Hero subtext — one paragraph (no copyright or legal footer on this page) */
export const PRICING_PAGE_INTRO =
  "Pick a plan that fits your store. You can change plans anytime. Support is included on every plan.";

/** Shown in small text under each Subscribe button */
export const PRICING_TRIAL_CTA_NOTE = "7-day free trial";

export type PricingTierId = "basic" | "standard" | "premium";

export type PricingTier = {
  id: PricingTierId;
  name: string;
  /** e.g. "$19" — shown above period note */
  priceDisplay: string;
  /** Shown beside price, e.g. "per month" */
  periodNote: string;
  /** One-line hook under the name */
  tagline: string;
  badge?: string;
  /** Slightly emphasizes this column (recommended tier) */
  highlight?: boolean;
  features: string[];
  ctaLabel: string;
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "basic",
    name: "Basic",
    priceDisplay: "$4.99",
    periodNote: "per month",
    tagline: "Good for starting out: limited field types and unlimited customers.",
    features: [
      "Custom form fields (starter field types)",
      "Unlimited customers",
      "Wholesale registration form",
      "Theme app embed & storefront registration",
      "Setup guide, live counts & Home analytics",
      "Search, filters, and bulk actions",
      "Customer exports CSV",
      "Auto approval only",
      "Customer support included",
    ],
    ctaLabel: "Subscribe — Basic",
  },
  {
    id: "standard",
    name: "Standard",
    priceDisplay: "$14.99",
    periodNote: "per month",
    tagline: "Unlimited customers, templates, languages, and full email control.",
    badge: "Most popular",
    highlight: true,
    features: [
      "Unlimited form fields",
      "Unlimited customers",
      "Wholesale form and multi-step form",
      "Multiple registration forms",
      "Registration form templates",
      "Form appearance, templates & custom CSS",
      "Email alerts, SMTP, and editable email designs",
      "Approved customer tag (Shopify)",
      "Auto approval and manual approval",
      "Multiple languages on the form",
      "Customer exports CSV",
      "Customer support included",
    ],
    ctaLabel: "Subscribe — Standard",
  },
  {
    id: "premium",
    name: "Premium",
    priceDisplay: "$24.99",
    periodNote: "per month",
    tagline: "For busy stores: unlimited uploads, heavier traffic, and priority help.",
    features: [
      "Everything in Standard",
      "File upload field (unlimited storage)",
      "Customer exports CSV",
      "Built for large customer lists and big CSV exports",
      "Webhooks and store privacy (data) requests",
      "Priority support and onboarding help",
      "New app features before others",
    ],
    ctaLabel: "Subscribe — Premium",
  },
];

/** Section heading above the comparison table */
export const PRICING_COMPARE_TITLE = "Compare plans";

/** Rows: feature label + included on each tier (true = included) */
export type PricingCompareRow = {
  feature: string;
  basic: boolean;
  standard: boolean;
  premium: boolean;
};

export const PRICING_COMPARE_ROWS: PricingCompareRow[] = [
  { feature: "Unlimited form fields (all types)", basic: false, standard: true, premium: true },
  { feature: "Unlimited customers", basic: true, standard: true, premium: true },
  { feature: "Theme app embed & storefront registration", basic: true, standard: true, premium: true },
  { feature: "Wholesale registration form", basic: true, standard: true, premium: true },
  { feature: "Multi-step registration form", basic: false, standard: true, premium: true },
  { feature: "Multiple registration forms", basic: false, standard: true, premium: true },
  { feature: "Registration form templates", basic: false, standard: true, premium: true },
  {
    feature: "Form appearance, theme templates & custom CSS",
    basic: false,
    standard: true,
    premium: true,
  },
  { feature: "Email alerts, SMTP, and editable email designs", basic: false, standard: true, premium: true },
  { feature: "Auto approval", basic: true, standard: true, premium: true },
  { feature: "Manual approval", basic: false, standard: true, premium: true },
  { feature: "Multiple languages on the form", basic: false, standard: true, premium: true },
  { feature: "Approved customer tag (Shopify)", basic: false, standard: true, premium: true },
  { feature: "Home setup guide & live registration counts", basic: true, standard: true, premium: true },
  { feature: "Registration analytics on Home", basic: true, standard: true, premium: true },
  { feature: "Customer queue: search, filters, and bulk actions", basic: true, standard: true, premium: true },
  { feature: "Customer exports CSV", basic: true, standard: true, premium: true },
  { feature: "File upload field", basic: false, standard: false, premium: true },
  { feature: "Large customer lists and big CSV exports", basic: false, standard: true, premium: true },
  { feature: "Webhooks and store privacy (data requests)", basic: false, standard: false, premium: true },
  { feature: "Priority support and onboarding", basic: false, standard: false, premium: true },
  { feature: "New app features before others", basic: false, standard: false, premium: true },
  { feature: "Customer support", basic: true, standard: true, premium: true },
];
