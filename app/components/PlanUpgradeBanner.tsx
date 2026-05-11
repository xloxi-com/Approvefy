import { useNavigate, useSearchParams } from "react-router";
import { Banner, Button, InlineStack } from "@shopify/polaris";
import { mergeEmbedParamsForAppPath } from "../lib/shopify-embed-navigation";

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <Banner tone="info" title={title}>
      <InlineStack gap="300" blockAlign="center" wrap>
        <span>{message}</span>
        <Button
          variant="plain"
          accessibilityLabel={`Open Pricing to upgrade to ${requiredPlan} or higher`}
          onClick={() =>
            navigate(mergeEmbedParamsForAppPath("/app/pricing", searchParams))
          }
        >
          {`Upgrade — ${requiredPlan}+`}
        </Button>
      </InlineStack>
    </Banner>
  );
}
