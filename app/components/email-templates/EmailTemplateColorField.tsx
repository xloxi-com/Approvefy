import { useMemo, useState } from "react";
import {
  Box,
  ColorPicker,
  hexToRgb,
  hsbToHex,
  Popover,
  rgbToHsb,
  TextField,
} from "@shopify/polaris";

type Props = {
  label: string;
  value: string;
  onChange: (val: string) => void;
  helpText?: string;
};

export function EmailTemplateColorField({ label, value, onChange, helpText }: Props) {
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

  const swatch = (
    <button
      type="button"
      className="email-template-color-swatch"
      onClick={() => setPopoverActive((active) => !active)}
      aria-label={`Open color picker for ${label}`}
      style={{ background: safe }}
    />
  );

  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      helpText={helpText}
      autoComplete="off"
      connectedRight={
        <Popover
          active={popoverActive}
          autofocusTarget="first-node"
          preferredPosition="below"
          preferredAlignment="right"
          onClose={() => setPopoverActive(false)}
          activator={swatch}
        >
          <Box padding="300">
            <ColorPicker color={hsbColor} onChange={(color) => onChange(hsbToHex(color))} />
          </Box>
        </Popover>
      }
    />
  );
}
