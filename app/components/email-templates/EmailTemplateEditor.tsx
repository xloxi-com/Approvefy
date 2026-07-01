import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  Divider,
  FormLayout,
  InlineStack,
  Layout,
  RangeSlider,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import type { CustomerApprovalSettings } from "../../routes/app.settings";
import { APP_DISPLAY_NAME } from "../../lib/app-constants";
import {
  DEFAULT_APPROVE_BODY,
  DEFAULT_APPROVE_SUBJECT,
  DEFAULT_REJECT_BODY,
  DEFAULT_REJECT_SUBJECT,
  HEADER_TITLE_SIZE_OPTIONS,
  isAllowedLogoUrl,
  isSvgLogoUrl,
  LOGO_ALIGN_OPTIONS,
  type EmailAlign,
} from "../../lib/email-template-ui";
import { EmailBodyLiquidHelp } from "./EmailBodyLiquidHelp";
import { EmailTemplateColorField } from "./EmailTemplateColorField";
import type { EmailPreset } from "./EmailTemplateChooserModal";
import { EmailTemplateChooserModal } from "./EmailTemplateChooserModal";
import type { EmailTemplatePreviewData } from "./EmailTemplatePreview";
import { EmailTemplatePreview } from "./EmailTemplatePreview";

export type EmailTemplateKind = "approval" | "rejection";

type ShopContext = {
  storeName: string;
  storeEmail: string;
  storeDomain: string;
  storeLogoUrl: string | null;
};

type Props = {
  kind: EmailTemplateKind;
  settings: CustomerApprovalSettings;
  setSettings: Dispatch<SetStateAction<CustomerApprovalSettings>>;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  presets: EmailPreset[];
  shop: ShopContext;
  templateModalOpen: boolean;
  setTemplateModalOpen: (open: boolean) => void;
  richTextEditor: (props: {
    label: string;
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: number;
    helpText?: ReactNode;
    fullToolbar?: boolean;
  }) => ReactNode;
  onApplyPreset: (preset: EmailPreset) => void;
};

function fieldPrefix(kind: EmailTemplateKind): "approveEmail" | "rejectEmail" {
  return kind === "approval" ? "approveEmail" : "rejectEmail";
}

function getPreviewTitle(kind: EmailTemplateKind): string {
  return kind === "approval" ? "Approval email preview" : "Email preview";
}

function getTemplateHelpText(kind: EmailTemplateKind): string {
  return kind === "approval"
    ? "Pick one of 10 modern approval templates, then edit if needed."
    : "Pick one of 10 ready-made rejection emails, then edit if needed.";
}

function getDefaultButtonColorHelp(kind: EmailTemplateKind): string {
  return kind === "approval" ? "Empty = green (#16a34a)" : "Empty = red (#dc2626)";
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text as="p" variant="headingXs" tone="subdued">
      {children}
    </Text>
  );
}

export function EmailTemplateEditor({
  kind,
  settings,
  setSettings,
  selectedPresetId,
  setSelectedPresetId,
  presets,
  shop,
  templateModalOpen,
  setTemplateModalOpen,
  richTextEditor,
  onApplyPreset,
}: Props) {
  const prefix = fieldPrefix(kind);
  const isApproval = kind === "approval";

  const logoUrl = settings[`${prefix}LogoUrl` as keyof CustomerApprovalSettings] as string;
  const logoSize = settings[`${prefix}LogoSize` as keyof CustomerApprovalSettings] as string;
  const logoAlign = settings[`${prefix}LogoAlign` as keyof CustomerApprovalSettings] as EmailAlign;
  const headerTitle = settings[`${prefix}HeaderTitle` as keyof CustomerApprovalSettings] as string;
  const headerTitleSize = settings[`${prefix}HeaderTitleSize` as keyof CustomerApprovalSettings] as string;
  const headerTitleColor = settings[`${prefix}HeaderTitleColor` as keyof CustomerApprovalSettings] as string;
  const headerBgColor = settings[`${prefix}HeaderBgColor` as keyof CustomerApprovalSettings] as string;
  const subject = settings[`${prefix}Subject` as keyof CustomerApprovalSettings] as string;
  const body = settings[`${prefix}Body` as keyof CustomerApprovalSettings] as string;
  const buttonText = settings[`${prefix}ButtonText` as keyof CustomerApprovalSettings] as string;
  const buttonUrl = settings[`${prefix}ButtonUrl` as keyof CustomerApprovalSettings] as string;
  const buttonColor = settings[`${prefix}ButtonColor` as keyof CustomerApprovalSettings] as string;
  const buttonTextColor = settings[`${prefix}ButtonTextColor` as keyof CustomerApprovalSettings] as string;
  const buttonAlign = settings[`${prefix}ButtonAlign` as keyof CustomerApprovalSettings] as EmailAlign;
  const footerText = settings[`${prefix}FooterText` as keyof CustomerApprovalSettings] as string;
  const showPoweredBy = settings[`${prefix}ShowPoweredBy` as keyof CustomerApprovalSettings] as boolean;

  const defaultSubject = isApproval ? DEFAULT_APPROVE_SUBJECT : DEFAULT_REJECT_SUBJECT;
  const defaultBody = isApproval ? DEFAULT_APPROVE_BODY : DEFAULT_REJECT_BODY;

  const patch = (updates: Partial<CustomerApprovalSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const patchField = <K extends keyof CustomerApprovalSettings>(key: K, value: CustomerApprovalSettings[K]) => {
    setSelectedPresetId("");
    patch({ [key]: value } as Partial<CustomerApprovalSettings>);
  };

  const previewData: EmailTemplatePreviewData = {
    logoUrl,
    logoSize,
    logoAlign,
    headerTitle,
    headerTitleSize,
    headerTitleColor,
    headerBgColor,
    body,
    defaultBody,
    buttonText,
    buttonUrl,
    buttonColor,
    buttonTextColor,
    buttonAlign,
    footerText,
    showPoweredBy,
    allowActivationUrlFallback: isApproval,
  };

  const shopPreview = {
    storeName: shop.storeName,
    storeEmail: shop.storeEmail,
    storeDomain: shop.storeDomain,
  };

  const selectedPresetName =
    selectedPresetId ? (presets.find((p) => p.id === selectedPresetId)?.name ?? "Custom") : "Custom (edit below)";

  const storeLogoAction =
    shop.storeLogoUrl && !isSvgLogoUrl(shop.storeLogoUrl) ? (
      <Button size="slim" onClick={() => patchField(`${prefix}LogoUrl`, shop.storeLogoUrl ?? "")}>
        Use store logo
      </Button>
    ) : undefined;

  const logoUrlError = (() => {
    const u = (logoUrl ?? "").trim();
    if (!u) return undefined;
    if (isSvgLogoUrl(u)) return "SVG is not allowed. Use PNG, JPG or WebP only.";
    if (!isAllowedLogoUrl(u)) return "Use a PNG, JPG or WebP image URL only.";
    return undefined;
  })();

  return (
    <div className="email-template-editor">
      <Layout>
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd">
                  Choose a template
                </Text>
                <InlineStack gap="200" blockAlign="center" wrap>
                  <Button size="slim" onClick={() => setTemplateModalOpen(true)}>
                    {selectedPresetName}
                  </Button>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {getTemplateHelpText(kind)}
                  </Text>
                </InlineStack>
              </BlockStack>

              <EmailTemplateChooserModal
                open={templateModalOpen}
                onClose={() => setTemplateModalOpen(false)}
                presets={presets}
                selectedPresetId={selectedPresetId}
                onSelectPreset={(id) => {
                  setSelectedPresetId(id);
                  if (id) {
                    const preset = presets.find((p) => p.id === id);
                    if (preset) onApplyPreset(preset);
                  }
                }}
                previewData={previewData}
                shop={shopPreview}
                allowActivationUrlFallback={isApproval}
              />

              <Divider />

              <SectionLabel>Branding & header</SectionLabel>
              <FormLayout>
                <TextField
                  label="Logo URL"
                  value={logoUrl}
                  onChange={(val) => patchField(`${prefix}LogoUrl`, val)}
                  placeholder="https://... (PNG, JPG or WebP)"
                  autoComplete="off"
                  helpText={logoUrlError ? undefined : "PNG, JPG or WebP only. SVG is not allowed."}
                  error={logoUrlError}
                  connectedRight={storeLogoAction}
                />
                <FormLayout.Group condensed>
                  <RangeSlider
                    label="Logo size"
                    value={Math.min(400, Math.max(80, Number(logoSize) || 200))}
                    min={80}
                    max={400}
                    step={10}
                    output
                    suffix="px"
                    onChange={(val) =>
                      patchField(`${prefix}LogoSize`, String(typeof val === "number" ? val : val[0]))
                    }
                  />
                  <Select
                    label="Logo alignment"
                    options={LOGO_ALIGN_OPTIONS}
                    value={logoAlign || "left"}
                    onChange={(val) => patchField(`${prefix}LogoAlign`, (val as EmailAlign) || "left")}
                  />
                </FormLayout.Group>
                <TextField
                  label="Header title"
                  value={headerTitle}
                  onChange={(val) => patchField(`${prefix}HeaderTitle`, val)}
                  placeholder={
                    isApproval ? "e.g. Your Account Has Been Approved" : "e.g. Registration Update"
                  }
                  autoComplete="off"
                />
                <div className="email-template-field-row">
                  <FormLayout.Group condensed>
                    <Select
                      label="Title size"
                      options={HEADER_TITLE_SIZE_OPTIONS}
                      value={headerTitleSize || "24"}
                      onChange={(val) => patchField(`${prefix}HeaderTitleSize`, val)}
                    />
                    <EmailTemplateColorField
                      label="Title color"
                      value={headerTitleColor ?? ""}
                      onChange={(val) => patchField(`${prefix}HeaderTitleColor`, val)}
                      helpText="Empty = #111"
                    />
                    <EmailTemplateColorField
                      label="Header background"
                      value={headerBgColor ?? ""}
                      onChange={(val) => patchField(`${prefix}HeaderBgColor`, val)}
                      helpText="Empty = none"
                    />
                  </FormLayout.Group>
                </div>
              </FormLayout>

              <Divider />

              <SectionLabel>Email content</SectionLabel>
              <FormLayout>
                <TextField
                  label="Subject"
                  value={subject}
                  onChange={(val) => patchField(`${prefix}Subject`, val)}
                  placeholder={defaultSubject}
                  autoComplete="off"
                />
              </FormLayout>
              {richTextEditor({
                label: "Body",
                value: body,
                onChange: (html) => patchField(`${prefix}Body`, html),
                placeholder: defaultBody,
                minHeight: 120,
                helpText: <EmailBodyLiquidHelp kind={kind} />,
              })}

              <Divider />

              <SectionLabel>Button & footer</SectionLabel>
              <FormLayout>
                <FormLayout.Group condensed>
                  <TextField
                    label="Button text"
                    value={buttonText}
                    onChange={(val) => patchField(`${prefix}ButtonText`, val)}
                    placeholder={isApproval ? "e.g. Login" : "e.g. Contact us"}
                    autoComplete="off"
                  />
                  <TextField
                    label="Button URL"
                    value={buttonUrl}
                    onChange={(val) => patchField(`${prefix}ButtonUrl`, val)}
                    placeholder={
                      isApproval ? "Leave empty for default login link" : "e.g. {{ shop.url }}/pages/contact"
                    }
                    autoComplete="off"
                  />
                </FormLayout.Group>
                <div className="email-template-field-row">
                  <FormLayout.Group condensed>
                    <EmailTemplateColorField
                      label="Button color"
                      value={buttonColor ?? ""}
                      onChange={(val) => patchField(`${prefix}ButtonColor`, val)}
                      helpText={getDefaultButtonColorHelp(kind)}
                    />
                    <EmailTemplateColorField
                      label="Button text color"
                      value={buttonTextColor ?? ""}
                      onChange={(val) => patchField(`${prefix}ButtonTextColor`, val)}
                      helpText="Empty = #fff"
                    />
                    <Select
                      label="Button alignment"
                      options={LOGO_ALIGN_OPTIONS}
                      value={buttonAlign || "left"}
                      onChange={(val) => patchField(`${prefix}ButtonAlign`, (val as EmailAlign) || "left")}
                    />
                  </FormLayout.Group>
                </div>
              </FormLayout>

              {richTextEditor({
                label: "Footer text",
                value: footerText || "",
                onChange: (html) => patchField(`${prefix}FooterText`, html),
                placeholder: "Company name or legal text",
                minHeight: 56,
                fullToolbar: false,
              })}

              <Checkbox
                label={`Show "Powered by ${APP_DISPLAY_NAME}" in email footer`}
                checked={showPoweredBy}
                onChange={(val) => patchField(`${prefix}ShowPoweredBy`, val)}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <div className="email-template-preview-sticky">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  {getPreviewTitle(kind)}
                </Text>
                <EmailTemplatePreview data={previewData} shop={shopPreview} variant="sidebar" />
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </div>
  );
}
