import { Banner, Button, InlineStack } from "@shopify/polaris";

export type PlanUpgradeBannerProps = {
  /** Short headline shown inside the banner */
  title?: string;
  /** Supporting sentence — explain why the section is locked */
  message: string;
  /** Minimum tier name shown on CTA (e.g. Standard, Premium) */
  requiredPlan?: string;
};

/** Polaris banner + link to in-app Pricing (upgrade path). */
export function PlanUpgradeBanner({
  title = "Unlock more features",
  message,
  requiredPlan = "Standard",
}: PlanUpgradeBannerProps) {
  return (
    <Banner tone="info" title={title}>
      <InlineStack gap="300" blockAlign="center" wrap>
        <span>{message}</span>
        <Button url="/app/pricing" variant="plain">
          {`Upgrade — ${requiredPlan}+`}
        </Button>
      </InlineStack>
    </Banner>
  );
}
