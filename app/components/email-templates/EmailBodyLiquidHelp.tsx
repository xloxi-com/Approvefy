import { Text } from "@shopify/polaris";
import type { EmailTemplateKind } from "./EmailTemplateEditor";

export function EmailBodyLiquidHelp({ kind }: { kind: EmailTemplateKind }) {
  const tags =
    kind === "approval"
      ? "{{ shop.name }}, {{ shop.url }}, {{ customer.first_name }}, {{ activation_url }}"
      : "{{ shop.name }}, {{ shop.email }}, {{ shop.url }}, {{ customer.first_name }}, {{ customer.email }}, {{ email }}";

  return (
    <Text as="p" variant="bodySm" tone="subdued">
      Liquid: {tags}
    </Text>
  );
}
