import { Card, BlockStack, Text } from "@shopify/polaris";
import type { ReactNode } from "react";

type Props = {
  /** Card heading (matches former LegacyCard title). */
  title?: string;
  children: ReactNode;
};

/**
 * Polaris Card with optional title — replaces deprecated LegacyCard with `sectioned`.
 */
export function SectionCard({ title, children }: Props) {
  return (
    <div className="app-backend-card">
      <Card>
        <BlockStack gap="400">
          {title ? (
            <Text as="h2" variant="headingMd">
              {title}
            </Text>
          ) : null}
          {children}
        </BlockStack>
      </Card>
    </div>
  );
}
