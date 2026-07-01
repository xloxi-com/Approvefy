import {
  Badge,
  BlockStack,
  Box,
  InlineStack,
  Modal,
  OptionList,
  Text,
} from "@shopify/polaris";
import type { EmailTemplatePreviewData } from "./EmailTemplatePreview";
import { EmailTemplatePreview } from "./EmailTemplatePreview";

export type EmailPreset = {
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

type ShopPreviewContext = {
  storeName: string;
  storeEmail: string;
  storeDomain: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  presets: EmailPreset[];
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  previewData: EmailTemplatePreviewData;
  shop: ShopPreviewContext;
  allowActivationUrlFallback?: boolean;
};

export function EmailTemplateChooserModal({
  open,
  onClose,
  presets,
  selectedPresetId,
  onSelectPreset,
  previewData,
  shop,
  allowActivationUrlFallback,
}: Props) {
  const preview: EmailTemplatePreviewData = {
    ...previewData,
    allowActivationUrlFallback,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a template"
      size="large"
      primaryAction={{ content: "Apply template", onAction: onClose }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <div className="email-template-chooser">
          <Box
            background="bg-surface-secondary"
            borderWidth="025"
            borderColor="border"
            borderRadius="200"
            padding="300"
            minWidth="240px"
          >
            <OptionList
              options={[
                { value: "", label: "Custom (edit below)" },
                ...presets.map((p) => ({ value: p.id, label: p.name })),
              ]}
              selected={[selectedPresetId ?? ""]}
              onChange={(selected) => onSelectPreset((selected[0] ?? "").trim())}
            />
          </Box>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Email preview
              </Text>
              <Badge tone="info">Approximate</Badge>
            </InlineStack>
            <EmailTemplatePreview data={preview} shop={shop} variant="modal" />
          </BlockStack>
        </div>
      </Modal.Section>
    </Modal>
  );
}
