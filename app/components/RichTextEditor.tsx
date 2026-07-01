import { useRef, useEffect, useCallback, useState, useId, type ReactNode } from "react";
import {
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Divider,
  InlineStack,
  Labelled,
  Modal,
  OptionList,
  Popover,
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
import {
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextColorIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  LinkIcon,
  CodeIcon,
} from "@shopify/polaris-icons";

const ALLOWED_TAGS = /^(b|i|u|strong|em|p|br|span|a|ul|ol|li|div|h1|h2|h3|h4)$/i;
const ALLOWED_ATTRS: Record<string, string[]> = {
  span: ["style", "class"],
  a: ["href", "target", "rel"],
  p: ["style", "align"],
  div: ["style", "align"],
  h1: ["style", "align"],
  h2: ["style", "align"],
  h3: ["style", "align"],
  h4: ["style", "align"],
};

function normalizeFontColor(html: string): string {
  return html
    .replace(/<font\s+color\s*=\s*["']([^"']+)["']\s*>/gi, (_, color) => {
      const c = String(color).trim();
      if (!c || /javascript:|on\w+=/i.test(c)) return "<span>";
      return `<span style="color: ${c.replace(/"/g, "&quot;")}">`;
    })
    .replace(/<\/font\s*>/gi, "</span>");
}

function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") return "";
  const normalized = normalizeFontColor(html);
  const doc = new DOMParser().parseFromString(normalized, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.test(tag)) return Array.from(node.childNodes).map(walk).join("");
    let out = "<" + tag;
    const allowed = ALLOWED_ATTRS[tag];
    if (allowed) {
      for (const a of allowed) {
        const v = el.getAttribute(a);
        if (v && !/javascript:|on\w+=/i.test(v)) out += ` ${a}="${v.replace(/"/g, "&quot;")}"`;
      }
    }
    if (tag === "br") return "<br/>";
    out += ">";
    out += Array.from(node.childNodes).map(walk).join("");
    out += `</${tag}>`;
    return out;
  };
  return Array.from(doc.body.childNodes).map(walk).join("").trim();
}

const COLORS = ["#000000", "#374151", "#6b7280", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed"];

const FORMAT_OPTIONS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
] as const;

type AlignState = "left" | "center" | "right" | "full";

type ToolbarActive = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: AlignState;
};

function JustifyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20" aria-hidden {...props}>
      <path d="M2 4h16v1.5H2V4zm0 5h16v1.5H2V9zm0 5h16v1.5H2V14z" />
    </svg>
  );
}

function ToolbarTooltipButton({
  label,
  onClick,
  icon,
  pressed,
  customIcon,
}: {
  label: string;
  onClick: () => void;
  icon?: typeof TextBoldIcon;
  pressed?: boolean;
  customIcon?: ReactNode;
}) {
  const button = customIcon ? (
    <Button variant="plain" size="slim" onClick={onClick} accessibilityLabel={label} pressed={pressed}>
      {customIcon}
    </Button>
  ) : (
    <Button variant="plain" size="slim" icon={icon} onClick={onClick} accessibilityLabel={label} pressed={pressed} />
  );

  return <Tooltip content={label}>{button}</Tooltip>;
}

function readToolbarActive(): ToolbarActive {
  let align: AlignState = "left";
  if (document.queryCommandState("justifyCenter")) align = "center";
  else if (document.queryCommandState("justifyRight")) align = "right";
  else if (document.queryCommandState("justifyFull")) align = "full";
  return {
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    align,
  };
}

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  helpText?: ReactNode;
  fullToolbar?: boolean;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Type here...",
  minHeight = 120,
  label = "Body",
  helpText,
  fullToolbar = true,
}: RichTextEditorProps) {
  const editorId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const isInternal = useRef(false);
  const lastValueRef = useRef<string>("");
  const savedSelectionRef = useRef<Range | null>(null);
  const savedColorSelectionRef = useRef<Range | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
  const [colorPopoverActive, setColorPopoverActive] = useState(false);
  const [formatPopoverActive, setFormatPopoverActive] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>("p");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [customColor, setCustomColor] = useState("#000000");
  const [toolbarActive, setToolbarActive] = useState<ToolbarActive>({
    bold: false,
    italic: false,
    underline: false,
    align: "left",
  });
  const colorInputId = useId();

  const refreshToolbarActive = useCallback(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    setToolbarActive(readToolbarActive());
  }, []);

  const toDisplayHtml = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return "<p><br></p>";
    if (t.includes("<")) return t;
    return (
      "<p>" +
      t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>") +
      "</p>"
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isInternal.current) {
      isInternal.current = false;
      lastValueRef.current = value;
      return;
    }
    if (document.activeElement === el) return;
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    el.innerHTML = toDisplayHtml(value);
  }, [value, toDisplayHtml]);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshToolbarActive);
    return () => document.removeEventListener("selectionchange", refreshToolbarActive);
  }, [refreshToolbarActive]);

  const handleInput = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isInternal.current = true;
    onChange(sanitizeHtml(el.innerHTML));
    refreshToolbarActive();
  }, [onChange, refreshToolbarActive]);

  const exec = useCallback(
    (cmd: string, cmdValue?: string) => {
      document.execCommand(cmd, false, cmdValue ?? undefined);
      ref.current?.focus();
      handleInput();
    },
    [handleInput],
  );

  const setFormat = useCallback(
    (tag: string) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const block =
          range.commonAncestorContainer?.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : (range.commonAncestorContainer as Element | null);
        if (block && el.contains(block)) {
          const blockEl = block.nodeType === Node.ELEMENT_NODE ? (block as Element) : block.parentElement;
          if (blockEl && el.contains(blockEl)) {
            try {
              const r = document.createRange();
              r.selectNodeContents(blockEl);
              sel.removeAllRanges();
              sel.addRange(r);
            } catch {
              // ignore
            }
          }
        }
      }
      document.execCommand("formatBlock", false, tag);
      setSelectedFormat(tag);
      handleInput();
    },
    [handleInput],
  );

  const formatLabel = FORMAT_OPTIONS.find((o) => o.value === selectedFormat)?.label ?? "Paragraph";

  const openLinkModal = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let initialUrl = "https://";
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        try {
          savedSelectionRef.current = range.cloneRange();
        } catch {
          savedSelectionRef.current = null;
        }
      }
      let node: Node | null = sel.anchorNode;
      while (node && node !== el) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "A") {
          initialUrl = (node as HTMLAnchorElement).getAttribute("href") || "https://";
          break;
        }
        node = node.parentNode;
      }
    } else {
      savedSelectionRef.current = null;
    }
    setLinkUrl(initialUrl);
    setLinkModalOpen(true);
  }, []);

  const applyLink = useCallback(() => {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setLinkModalOpen(false);
      return;
    }
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
    const el = ref.current;
    if (el) {
      el.focus();
      const sel = window.getSelection();
      const saved = savedSelectionRef.current;
      if (sel && saved && el.contains(saved.startContainer) && el.contains(saved.endContainer)) {
        try {
          sel.removeAllRanges();
          sel.addRange(saved);
        } catch {
          // ignore
        }
      }
      savedSelectionRef.current = null;
    }
    document.execCommand("createLink", false, url);
    handleInput();
    setLinkModalOpen(false);
    setLinkUrl("");
  }, [linkUrl, handleInput]);

  const closeLinkModal = useCallback(() => {
    savedSelectionRef.current = null;
    setLinkModalOpen(false);
    setLinkUrl("");
    ref.current?.focus();
  }, []);

  const saveColorSelection = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        try {
          savedColorSelectionRef.current = range.cloneRange();
        } catch {
          savedColorSelectionRef.current = null;
        }
      } else {
        savedColorSelectionRef.current = null;
      }
    } else {
      savedColorSelectionRef.current = null;
    }
  }, []);

  const applyColor = useCallback(
    (color: string) => {
      const el = ref.current;
      if (el) {
        el.focus();
        const sel = window.getSelection();
        const saved = savedColorSelectionRef.current;
        if (sel && saved && el.contains(saved.startContainer) && el.contains(saved.endContainer)) {
          try {
            sel.removeAllRanges();
            sel.addRange(saved);
          } catch {
            // ignore
          }
        }
        savedColorSelectionRef.current = null;
      }
      document.execCommand("foreColor", false, color);
      handleInput();
      setColorPopoverActive(false);
    },
    [handleInput],
  );

  const toggleSource = useCallback(() => {
    if (sourceMode) {
      const safe = sanitizeHtml(sourceValue);
      onChange(safe);
      lastValueRef.current = safe;
      if (ref.current) ref.current.innerHTML = toDisplayHtml(safe);
    } else {
      setSourceValue(value || "");
    }
    setSourceMode((prev) => !prev);
  }, [sourceMode, sourceValue, value, onChange, toDisplayHtml]);

  const colorPicker = (
    <Box padding="300" minWidth="200px">
      <BlockStack gap="300">
        <InlineStack gap="150" wrap>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="rich-text-color-swatch"
              onClick={() => applyColor(c)}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </InlineStack>
        <Divider />
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="bodySm" tone="subdued">
            Custom
          </Text>
          <input
            id={colorInputId}
            type="color"
            value={customColor}
            onChange={(e) => {
              const v = e.target.value;
              setCustomColor(v);
              applyColor(v);
            }}
            className="rich-text-color-input"
            aria-label="Pick custom color"
          />
          <Text as="span" variant="bodySm" tone="subdued">
            {customColor}
          </Text>
        </InlineStack>
      </BlockStack>
    </Box>
  );

  const toolbar = (
    <Box background="bg-surface-secondary" padding="150" paddingInline="200">
      <InlineStack gap="200" blockAlign="center" wrap>
        {fullToolbar ? (
          <Popover
            active={formatPopoverActive}
            autofocusTarget="first-node"
            onClose={() => setFormatPopoverActive(false)}
            activator={
              <Button
                size="slim"
                variant="plain"
                disclosure={formatPopoverActive ? "up" : "down"}
                onClick={() => setFormatPopoverActive((p) => !p)}
              >
                {formatLabel}
              </Button>
            }
          >
            <OptionList
              options={FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={[selectedFormat]}
              onChange={(selected: string[]) => {
                const v = selected[0];
                if (v) {
                  setFormat(v);
                  setFormatPopoverActive(false);
                }
              }}
            />
          </Popover>
        ) : null}

        <ButtonGroup>
          <ToolbarTooltipButton
            label="Bold"
            icon={TextBoldIcon}
            pressed={toolbarActive.bold}
            onClick={() => exec("bold")}
          />
          <ToolbarTooltipButton
            label="Italic"
            icon={TextItalicIcon}
            pressed={toolbarActive.italic}
            onClick={() => exec("italic")}
          />
          <ToolbarTooltipButton
            label="Underline"
            icon={TextUnderlineIcon}
            pressed={toolbarActive.underline}
            onClick={() => exec("underline")}
          />
        </ButtonGroup>

        {fullToolbar ? (
          <>
            <Popover
              active={colorPopoverActive}
              autofocusTarget="none"
              onClose={() => {
                savedColorSelectionRef.current = null;
                setColorPopoverActive(false);
              }}
              activator={
                <Tooltip content="Text color">
                  <Button
                    variant="plain"
                    size="slim"
                    icon={TextColorIcon}
                    accessibilityLabel="Text color"
                    onClick={() => {
                      saveColorSelection();
                      setColorPopoverActive((active) => !active);
                    }}
                  />
                </Tooltip>
              }
            >
              {colorPicker}
            </Popover>

            <ButtonGroup variant="segmented">
              <ToolbarTooltipButton
                label="Align left"
                icon={TextAlignLeftIcon}
                pressed={toolbarActive.align === "left"}
                onClick={() => exec("justifyLeft")}
              />
              <ToolbarTooltipButton
                label="Align center"
                icon={TextAlignCenterIcon}
                pressed={toolbarActive.align === "center"}
                onClick={() => exec("justifyCenter")}
              />
              <ToolbarTooltipButton
                label="Align right"
                icon={TextAlignRightIcon}
                pressed={toolbarActive.align === "right"}
                onClick={() => exec("justifyRight")}
              />
              <ToolbarTooltipButton
                label="Justify"
                pressed={toolbarActive.align === "full"}
                onClick={() => exec("justifyFull")}
                customIcon={<JustifyIcon />}
              />
            </ButtonGroup>

            <ButtonGroup>
              <ToolbarTooltipButton
                label="Bullet list"
                icon={ListBulletedIcon}
                onClick={() => exec("insertUnorderedList")}
              />
              <ToolbarTooltipButton
                label="Numbered list"
                icon={ListNumberedIcon}
                onClick={() => exec("insertOrderedList")}
              />
            </ButtonGroup>

            <ButtonGroup>
              <ToolbarTooltipButton label="Insert link" icon={LinkIcon} onClick={openLinkModal} />
              <ToolbarTooltipButton
                label={sourceMode ? "Visual editor" : "HTML source"}
                icon={CodeIcon}
                pressed={sourceMode}
                onClick={toggleSource}
              />
            </ButtonGroup>
          </>
        ) : null}
      </InlineStack>
    </Box>
  );

  const editorSurface = sourceMode ? (
    <Box padding="200">
      <TextField
        id={`${editorId}-source`}
        label="HTML source"
        labelHidden
        value={sourceValue}
        onChange={(val) => {
          setSourceValue(val);
          onChange(sanitizeHtml(val));
        }}
        multiline={Math.max(4, Math.ceil(minHeight / 24))}
        monospaced
        autoComplete="off"
        placeholder="HTML source..."
      />
    </Box>
  ) : (
    <div
      ref={ref}
      id={editorId}
      role="textbox"
      aria-multiline
      aria-label={label}
      contentEditable
      className="rich-text-body"
      data-placeholder={placeholder}
      onInput={handleInput}
      onBlur={handleInput}
      onFocus={refreshToolbarActive}
      onKeyUp={refreshToolbarActive}
      onMouseUp={refreshToolbarActive}
      style={{ minHeight }}
      suppressContentEditableWarning
    />
  );

  return (
    <BlockStack gap="100">
      <Modal
        open={linkModalOpen}
        onClose={closeLinkModal}
        title="Insert link"
        primaryAction={{ content: "Insert link", onAction: applyLink }}
        secondaryActions={[{ content: "Cancel", onAction: closeLinkModal }]}
      >
        <Modal.Section>
          <TextField
            label="URL"
            value={linkUrl}
            onChange={setLinkUrl}
            placeholder="https://"
            autoComplete="url"
            helpText="Supports Liquid, e.g. {{ shop.url }}/pages/contact"
          />
        </Modal.Section>
      </Modal>

      <Labelled id={sourceMode ? `${editorId}-source` : editorId} label={label}>
        <Box
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          background="bg-surface"
          overflow="hidden"
          className="rich-text-editor-wrapper"
        >
          {toolbar}
          <Divider borderColor="border" />
          {editorSurface}
        </Box>
      </Labelled>

      {helpText ? (
        <Box paddingBlockStart="100">
          {typeof helpText === "string" ? (
            <Text as="p" variant="bodySm" tone="subdued">
              {helpText}
            </Text>
          ) : (
            helpText
          )}
        </Box>
      ) : null}
    </BlockStack>
  );
}
