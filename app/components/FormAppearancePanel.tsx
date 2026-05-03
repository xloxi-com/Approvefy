import { useMemo, useState, useId, type Dispatch, type SetStateAction } from "react";
import {
    BlockStack,
    Box,
    Button,
    Card,
    InlineStack,
    Popover,
    RangeSlider,
    Select,
    Text,
    Divider,
    TextField,
    ColorPicker,
    hexToRgb,
    rgbToHsb,
    hsbToHex,
} from "@shopify/polaris";
import {
    APPEARANCE_TEMPLATES,
    getAppearanceTemplate,
    getAppearanceTemplateId,
    type AppearanceTemplateId,
} from "../lib/appearance-templates";
import {
    normalizeThemeSettings,
    THEME_DEFAULTS,
    type ThemeSettings,
    type TextAlignOption,
} from "../lib/theme-settings";
import "../styles/settings.css";

const STOREFRONT_TEXT_ALIGN_OPTIONS: { label: string; value: TextAlignOption }[] = [
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" },
];

function ColorPickerField({
    label,
    value,
    onChange,
    helpText,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    helpText?: string;
}) {
    const fieldId = useId();
    const [popoverActive, setPopoverActive] = useState(false);
    const safe =
        typeof value === "string" && value.trim().match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
            ? value.trim()
            : "#000000";

    const hsbColor = useMemo(() => {
        const rgb = hexToRgb(safe);
        if (!Number.isFinite(rgb.red) || !Number.isFinite(rgb.green) || !Number.isFinite(rgb.blue)) {
            return rgbToHsb({ red: 0, green: 0, blue: 0 });
        }
        return rgbToHsb(rgb);
    }, [safe]);

    return (
        <div className="settings-appearance-color-field">
            <BlockStack gap="150">
                <label htmlFor={fieldId} className="settings-appearance-color-label">
                    {label}
                </label>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Box minWidth="0" width="100%">
                        <TextField id={fieldId} label={label} labelHidden value={value} onChange={onChange} autoComplete="off" />
                    </Box>
                    <Box flexShrink="0">
                        <Popover
                            active={popoverActive}
                            autofocusTarget="first-node"
                            preferredPosition="below"
                            preferredAlignment="right"
                            onClose={() => setPopoverActive(false)}
                            activator={
                                <button
                                    type="button"
                                    onClick={() => setPopoverActive((a) => !a)}
                                    aria-label={`Open color picker for ${label}`}
                                    className="settings-appearance-color-swatch"
                                    style={{ background: safe }}
                                />
                            }
                        >
                            <Box padding="300">
                                <ColorPicker color={hsbColor} onChange={(color) => onChange(hsbToHex(color))} />
                            </Box>
                        </Popover>
                    </Box>
                </InlineStack>
                {helpText ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                        {helpText}
                    </Text>
                ) : null}
            </BlockStack>
        </div>
    );
}

export type FormAppearancePanelProps = {
    themeSettings: ThemeSettings;
    setThemeSettings: React.Dispatch<React.SetStateAction<ThemeSettings>>;
    customCss: string;
    setCustomCss: (v: string) => void;
    appearanceTemplateId: AppearanceTemplateId;
    setAppearanceTemplateId: Dispatch<SetStateAction<AppearanceTemplateId>>;
    disabled?: boolean;
    /** Shown in the intro text (e.g. "Save Configuration"). */
    saveActionLabel: string;
};

/**
 * Storefront registration form appearance controls (templates, typography, colors, custom CSS).
 * Layout matches Settings → Appearance; omit the mini preview when the page already has a live preview.
 */
export function FormAppearancePanel({
    themeSettings,
    setThemeSettings,
    customCss,
    setCustomCss,
    appearanceTemplateId,
    setAppearanceTemplateId,
    disabled = false,
    saveActionLabel,
}: FormAppearancePanelProps) {
    const previewTheme = useMemo(() => normalizeThemeSettings(themeSettings), [themeSettings]);

    const onTemplateSelect = (val: string) => {
        const id = getAppearanceTemplateId(val);
        const tpl = getAppearanceTemplate(id);
        setAppearanceTemplateId(id);
        setThemeSettings(tpl.theme);
        setCustomCss("");
    };

    return (
        <div className="settings-appearance-card" style={{ minWidth: 0 }}>
            <BlockStack gap="500">
                <Card>
                    <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                            Appearance
                        </Text>
                        <Text as="p" tone="subdued">
                            Customize the look of the storefront registration form. Use <strong>{saveActionLabel}</strong> to save
                            appearance together with this form.
                        </Text>
                        <div className="settings-appearance-actions">
                            <Button onClick={() => setThemeSettings(THEME_DEFAULTS)} disabled={disabled} variant="secondary">
                                Reset to defaults
                            </Button>
                        </div>
                    </BlockStack>
                </Card>

                <Card>
                    <BlockStack gap="300">
                        <Text as="h2" variant="headingSm">
                            Templates
                        </Text>
                        <Text as="p" tone="subdued">
                            Pick a ready-made look. It updates the preview immediately and the storefront after you click{" "}
                            <strong>{saveActionLabel}</strong>.
                        </Text>
                        <InlineStack gap="400" wrap blockAlign="center">
                            <Box maxWidth="420px" width="100%">
                                <Select
                                    id="fb-appearance-template"
                                    label="Template"
                                    options={APPEARANCE_TEMPLATES.map((tpl) => ({
                                        label: tpl.label,
                                        value: tpl.id,
                                    }))}
                                    value={getAppearanceTemplateId(appearanceTemplateId)}
                                    onChange={onTemplateSelect}
                                    disabled={disabled}
                                />
                            </Box>
                        </InlineStack>
                    </BlockStack>
                </Card>

                <Card>
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingSm">
                            Font
                        </Text>
                        <div className="settings-appearance-font-section">
                            <BlockStack gap="300">
                                <Box maxWidth="480px" width="100%">
                                    <Select
                                        id="fb-appearance-font-family"
                                        label="Font family"
                                        disabled={disabled}
                                        options={[
                                            {
                                                label: "System (Shopify default)",
                                                value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                                            },
                                            { label: "Arial", value: 'Arial, Helvetica, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Helvetica", value: 'Helvetica, Arial, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Verdana", value: 'Verdana, Geneva, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Tahoma", value: 'Tahoma, Geneva, Verdana, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Open Sans", value: '"Open Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Roboto", value: '"Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Lato", value: '"Lato", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Montserrat", value: '"Montserrat", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                            { label: "Poppins", value: '"Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
                                        ]}
                                        value={
                                            themeSettings.fontFamily === 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                                                ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                                                : themeSettings.fontFamily
                                        }
                                        onChange={(val) => setThemeSettings((prev) => ({ ...prev, fontFamily: val }))}
                                    />
                                </Box>
                                <InlineStack gap="400" blockAlign="start" wrap>
                                    <Box minWidth="0">
                                        <RangeSlider
                                            label="Storefront heading size"
                                            id="fb-appearance-form-title-size"
                                            min={14}
                                            max={48}
                                            value={parseInt(previewTheme.formTitleFontSize || "28", 10)}
                                            onChange={(v) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    formTitleFontSize: `${typeof v === "number" ? v : v[0]}px`,
                                                }))
                                            }
                                            output
                                            suffix="px"
                                            disabled={disabled}
                                        />
                                    </Box>
                                    <Box minWidth="0">
                                        <RangeSlider
                                            label="Storefront description size"
                                            id="fb-appearance-form-description-size"
                                            min={12}
                                            max={24}
                                            value={parseInt(previewTheme.formDescriptionFontSize || "15", 10)}
                                            onChange={(v) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    formDescriptionFontSize: `${typeof v === "number" ? v : v[0]}px`,
                                                }))
                                            }
                                            output
                                            suffix="px"
                                            disabled={disabled}
                                        />
                                    </Box>
                                    <Box minWidth="0">
                                        <RangeSlider
                                            label="Label size"
                                            id="fb-appearance-label-size"
                                            min={11}
                                            max={20}
                                            value={parseInt(previewTheme.labelFontSize || "15", 10)}
                                            onChange={(v) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    labelFontSize: `${typeof v === "number" ? v : v[0]}px`,
                                                }))
                                            }
                                            output
                                            suffix="px"
                                            disabled={disabled}
                                        />
                                    </Box>
                                    <Box minWidth="0">
                                        <RangeSlider
                                            label="Input size"
                                            id="fb-appearance-input-size"
                                            min={10}
                                            max={24}
                                            value={parseInt(previewTheme.inputFontSize || "15", 10)}
                                            onChange={(v) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    inputFontSize: `${typeof v === "number" ? v : v[0]}px`,
                                                }))
                                            }
                                            output
                                            suffix="px"
                                            disabled={disabled}
                                        />
                                    </Box>
                                    <Box minWidth="0">
                                        <RangeSlider
                                            label="Button font size"
                                            id="fb-appearance-button-font-size"
                                            min={10}
                                            max={24}
                                            value={parseInt(previewTheme.buttonFontSize || "15", 10)}
                                            onChange={(v) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    buttonFontSize: `${typeof v === "number" ? v : v[0]}px`,
                                                }))
                                            }
                                            output
                                            suffix="px"
                                            disabled={disabled}
                                        />
                                    </Box>
                                </InlineStack>
                                <Divider />
                                <Text as="h3" variant="headingSm">
                                    Storefront heading and description
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Text alignment for the main title and subtitle shown above the form fields on your store.
                                </Text>
                                <InlineStack gap="400" wrap blockAlign="start">
                                    <Box minWidth="200px" maxWidth="100%">
                                        <Select
                                            label="Heading alignment"
                                            options={STOREFRONT_TEXT_ALIGN_OPTIONS}
                                            value={previewTheme.formTitleTextAlign}
                                            onChange={(val) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    formTitleTextAlign: val as TextAlignOption,
                                                }))
                                            }
                                            disabled={disabled}
                                        />
                                    </Box>
                                    <Box minWidth="200px" maxWidth="100%">
                                        <Select
                                            label="Description alignment"
                                            options={STOREFRONT_TEXT_ALIGN_OPTIONS}
                                            value={previewTheme.formDescriptionTextAlign}
                                            onChange={(val) =>
                                                setThemeSettings((prev) => ({
                                                    ...prev,
                                                    formDescriptionTextAlign: val as TextAlignOption,
                                                }))
                                            }
                                            disabled={disabled}
                                        />
                                    </Box>
                                </InlineStack>
                            </BlockStack>
                        </div>
                    </BlockStack>
                </Card>

                <Card>
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingSm">
                            Colors
                        </Text>
                        <div className="settings-appearance-colors-grid">
                            <ColorPickerField
                                label="Card background"
                                value={themeSettings.cardBg}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, cardBg: val }))}
                                helpText="Hex, e.g. #ffffff"
                            />
                            <ColorPickerField
                                label="Card text"
                                value={themeSettings.cardText}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, cardText: val }))}
                            />
                            <ColorPickerField
                                label="Storefront heading"
                                value={themeSettings.headingColor}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, headingColor: val }))}
                                helpText="Main title above the form (h2)."
                            />
                            <ColorPickerField
                                label="Storefront description"
                                value={themeSettings.formDescriptionColor}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, formDescriptionColor: val }))}
                                helpText="Subtitle paragraph under the heading."
                            />
                            <ColorPickerField
                                label="Button background"
                                value={themeSettings.primaryButtonBg}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, primaryButtonBg: val }))}
                            />
                            <ColorPickerField
                                label="Button text"
                                value={themeSettings.primaryButtonText}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, primaryButtonText: val }))}
                            />
                            <ColorPickerField
                                label="Input background"
                                value={themeSettings.inputBg}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, inputBg: val }))}
                            />
                            <ColorPickerField
                                label="Input border"
                                value={themeSettings.inputBorder}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, inputBorder: val }))}
                            />
                            <ColorPickerField
                                label="Accent (focus, checkbox, radio)"
                                value={themeSettings.accentColor}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, accentColor: val }))}
                                helpText="Focus border and checked state"
                            />
                            <ColorPickerField
                                label="Error (required *, validation messages)"
                                value={themeSettings.errorColor}
                                onChange={(val) => setThemeSettings((prev) => ({ ...prev, errorColor: val }))}
                                helpText="Required asterisk and error text"
                            />
                        </div>
                    </BlockStack>
                </Card>

                <Card>
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingSm">
                            Radius & spacing
                        </Text>
                        <div className="settings-appearance-radius-grid">
                            <RangeSlider
                                label="Input border radius"
                                id="fb-appearance-input-radius"
                                min={0}
                                max={24}
                                value={parseInt(previewTheme.inputRadius || "8", 10)}
                                onChange={(v) =>
                                    setThemeSettings((prev) => ({
                                        ...prev,
                                        inputRadius: `${typeof v === "number" ? v : v[0]}px`,
                                    }))
                                }
                                output
                                suffix="px"
                                helpText="Applies to all inputs: text, date, dropdown, country, phone."
                                disabled={disabled}
                            />
                            <RangeSlider
                                label="Button border radius"
                                id="fb-appearance-button-radius"
                                min={0}
                                max={40}
                                value={Math.min(parseInt(previewTheme.buttonRadius || "24", 10), 40)}
                                onChange={(v) => {
                                    const n = typeof v === "number" ? v : v[0];
                                    setThemeSettings((prev) => ({ ...prev, buttonRadius: `${Math.min(n, 40)}px` }));
                                }}
                                output
                                suffix="px"
                                disabled={disabled}
                            />
                            <RangeSlider
                                label="Form max width"
                                id="fb-appearance-container-max-width"
                                min={320}
                                max={1500}
                                value={parseInt(previewTheme.containerMaxWidth || "700", 10)}
                                onChange={(v) =>
                                    setThemeSettings((prev) => ({
                                        ...prev,
                                        containerMaxWidth: `${typeof v === "number" ? v : v[0]}px`,
                                    }))
                                }
                                output
                                suffix="px"
                                disabled={disabled}
                            />
                        </div>
                    </BlockStack>
                </Card>

                <Card>
                    <BlockStack gap="300">
                        <Text as="h2" variant="headingSm">
                            Custom CSS
                        </Text>
                        <TextField
                            label=""
                            value={customCss}
                            onChange={setCustomCss}
                            multiline={12}
                            autoComplete="off"
                            disabled={disabled}
                            helpText="Leave empty to use styles from the controls above. Only what you type here is saved as custom CSS."
                        />
                    </BlockStack>
                </Card>
            </BlockStack>
        </div>
    );
}
