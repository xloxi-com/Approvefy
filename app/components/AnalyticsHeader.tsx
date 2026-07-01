import { memo } from "react";
import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";

interface AnalyticsHeaderProps {
  total: number;
  pending: number;
  denied: number;
}

const MetricCard = memo(function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "caution" | "critical" | "subdued";
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingLg" tone={tone}>
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
});

export const AnalyticsHeader = memo(function AnalyticsHeader({
  total,
  pending,
  denied,
}: AnalyticsHeaderProps) {
  return (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
      <MetricCard label="Total Customers" value={total} />
      <MetricCard label="Pending Approvals" value={pending} tone="caution" />
      <MetricCard label="Rejected Customers" value={denied} tone="critical" />
    </InlineGrid>
  );
});
