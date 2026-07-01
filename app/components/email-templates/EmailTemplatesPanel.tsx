import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Banner, BlockStack, Box, Text } from "@shopify/polaris";
import type { CustomerApprovalSettings } from "../../routes/app.settings";
import { APPROVAL_EMAIL_PRESETS } from "../../lib/approval-email-presets";
import { REJECTION_EMAIL_PRESETS } from "../../lib/rejection-email-presets";
import type { EmailPreset } from "./EmailTemplateChooserModal";
import { EmailTemplateCollapsibleSection } from "./EmailTemplateCollapsibleSection";
import { EmailTemplateEditor } from "./EmailTemplateEditor";

type ShopContext = {
  storeName: string;
  storeEmail: string;
  storeDomain: string;
  storeLogoUrl: string | null;
};

type Props = {
  disabled?: boolean;
  settings: CustomerApprovalSettings;
  setSettings: Dispatch<SetStateAction<CustomerApprovalSettings>>;
  selectedApprovalPresetId: string;
  setSelectedApprovalPresetId: (id: string) => void;
  selectedRejectionPresetId: string;
  setSelectedRejectionPresetId: (id: string) => void;
  approvedSectionOpen: boolean;
  setApprovedSectionOpen: (open: boolean) => void;
  rejectedSectionOpen: boolean;
  setRejectedSectionOpen: (open: boolean) => void;
  approvalTemplateModalOpen: boolean;
  setApprovalTemplateModalOpen: (open: boolean) => void;
  rejectionTemplateModalOpen: boolean;
  setRejectionTemplateModalOpen: (open: boolean) => void;
  shop: ShopContext;
  richTextEditor: (props: {
    label: string;
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: number;
    helpText?: ReactNode;
    fullToolbar?: boolean;
  }) => ReactNode;
};

function applyApprovalPreset(settings: CustomerApprovalSettings, preset: EmailPreset): CustomerApprovalSettings {
  return {
    ...settings,
    approveEmailSubject: preset.subject,
    approveEmailBody: preset.bodyHtml,
    approveEmailFooterText: preset.footerText,
    approveEmailButtonText: preset.buttonText,
    approveEmailButtonUrl: preset.buttonUrl,
    approveEmailHeaderTitle: preset.headerTitle ?? "",
    approveEmailHeaderTitleSize: preset.headerTitleSize ?? "24",
    approveEmailHeaderTitleColor: preset.headerTitleColor ?? "",
    approveEmailHeaderBgColor: preset.headerBgColor ?? "",
    approveEmailLogoAlign: preset.logoAlign ?? "left",
    approveEmailButtonColor: preset.buttonColor ?? "",
    approveEmailButtonTextColor: preset.buttonTextColor ?? "",
    approveEmailButtonAlign: preset.buttonAlign ?? "left",
  };
}

function applyRejectionPreset(settings: CustomerApprovalSettings, preset: EmailPreset): CustomerApprovalSettings {
  return {
    ...settings,
    rejectEmailSubject: preset.subject,
    rejectEmailBody: preset.bodyHtml,
    rejectEmailFooterText: preset.footerText,
    rejectEmailButtonText: preset.buttonText,
    rejectEmailButtonUrl: preset.buttonUrl,
    rejectEmailHeaderTitle: preset.headerTitle ?? "",
    rejectEmailHeaderTitleSize: preset.headerTitleSize ?? "24",
    rejectEmailHeaderTitleColor: preset.headerTitleColor ?? "",
    rejectEmailHeaderBgColor: preset.headerBgColor ?? "",
    rejectEmailLogoAlign: preset.logoAlign ?? "left",
    rejectEmailButtonColor: preset.buttonColor ?? "",
    rejectEmailButtonTextColor: preset.buttonTextColor ?? "",
    rejectEmailButtonAlign: preset.buttonAlign ?? "left",
  };
}

export function EmailTemplatesPanel({
  disabled = false,
  settings,
  setSettings,
  selectedApprovalPresetId,
  setSelectedApprovalPresetId,
  selectedRejectionPresetId,
  setSelectedRejectionPresetId,
  approvedSectionOpen,
  setApprovedSectionOpen,
  rejectedSectionOpen,
  setRejectedSectionOpen,
  approvalTemplateModalOpen,
  setApprovalTemplateModalOpen,
  rejectionTemplateModalOpen,
  setRejectionTemplateModalOpen,
  shop,
  richTextEditor,
}: Props) {
  return (
    <fieldset disabled={disabled} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd" tone="subdued">
          Customize the emails sent when you approve or reject a customer. Expand each section to edit the template.
        </Text>

        <Banner tone="info" title="Important">
          Approval and rejection emails are sent only when <strong>Send email</strong> is checked for that template. If
          the checkbox is unchecked, no email will be sent for that action.
        </Banner>

        <BlockStack gap="400">
          <EmailTemplateCollapsibleSection
            id="template-approved"
            title="Customer approved email"
            open={approvedSectionOpen}
            onToggle={() => setApprovedSectionOpen(!approvedSectionOpen)}
            sendEmailLabel="Send approval email"
            sendEmailChecked={settings.emailOnApprove}
            onSendEmailChange={(val) => setSettings((prev) => ({ ...prev, emailOnApprove: val }))}
          >
            <EmailTemplateEditor
              kind="approval"
              settings={settings}
              setSettings={setSettings}
              selectedPresetId={selectedApprovalPresetId}
              setSelectedPresetId={setSelectedApprovalPresetId}
              presets={APPROVAL_EMAIL_PRESETS}
              shop={shop}
              templateModalOpen={approvalTemplateModalOpen}
              setTemplateModalOpen={setApprovalTemplateModalOpen}
              richTextEditor={richTextEditor}
              onApplyPreset={(preset) => setSettings((prev) => applyApprovalPreset(prev, preset))}
            />
          </EmailTemplateCollapsibleSection>

          <EmailTemplateCollapsibleSection
            id="template-rejected"
            title="Customer rejected email"
            open={rejectedSectionOpen}
            onToggle={() => setRejectedSectionOpen(!rejectedSectionOpen)}
            sendEmailLabel="Send rejection email"
            sendEmailChecked={settings.emailOnReject}
            onSendEmailChange={(val) => setSettings((prev) => ({ ...prev, emailOnReject: val }))}
          >
            <EmailTemplateEditor
              kind="rejection"
              settings={settings}
              setSettings={setSettings}
              selectedPresetId={selectedRejectionPresetId}
              setSelectedPresetId={setSelectedRejectionPresetId}
              presets={REJECTION_EMAIL_PRESETS}
              shop={shop}
              templateModalOpen={rejectionTemplateModalOpen}
              setTemplateModalOpen={setRejectionTemplateModalOpen}
              richTextEditor={richTextEditor}
              onApplyPreset={(preset) => setSettings((prev) => applyRejectionPreset(prev, preset))}
            />
          </EmailTemplateCollapsibleSection>
        </BlockStack>

        <Box paddingBlockStart="200">
          <Text as="p" variant="bodyMd" tone="subdued">
            Click <strong>Save</strong> at the top of this page to apply your template settings.
          </Text>
        </Box>
      </BlockStack>
    </fieldset>
  );
}
