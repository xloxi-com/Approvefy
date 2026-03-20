/**
 * Full Word-like rich text editor: headings, bold, italic, underline,
 * color, alignment, lists, link, and HTML source view.
 * Uses Shopify Polaris Icon + polaris-icons SVG.
 */

import { useRef, useEffect, useCallback, useState, useId } from "react";
import { Icon, Popover, OptionList, Button, Modal, TextField, BlockStack } from "@shopify/polaris";
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

/** Normalize legacy <font color="..."> from execCommand(foreColor) to <span style="color:..."> so sanitizer keeps color. */
function normalizeFontColor(html: string): string {
  return html.replace(/<font\s+color\s*=\s*["']([^"']+)["']\s*>/gi, (_, color) => {
    const c = String(color).trim();
    if (!c || /javascript:|on\w+=/i.test(c)) return "<span>";
    return `<span style="color: ${c.replace(/"/g, "&quot;")}">`;
  }).replace(/<\/font\s*>/gi, "</span>");
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

/** Polaris has no justify icon; use a small SVG matching Polaris style */
function JustifyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20" {...props}>
      <path d="M2 4h16v1.5H2V4zm0 5h16v1.5H2V9zm0 5h16v1.5H2V14z" />
    </svg>
  );
}

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  helpText?: string;
  /** If true, show full toolbar (format, alignment, lists, link, color, source). Default true for body, can set false for footer. */
  fullToolbar?: boolean;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Type here...",
  minHeight = 120,
  label,
  helpText,
  fullToolbar = true,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const colorPickerContainerRef = useRef<HTMLDivElement>(null);
  const isInternal = useRef(false);
  const lastValueRef = useRef<string>("");
  const savedSelectionRef = useRef<Range | null>(null);
  const savedColorSelectionRef = useRef<Range | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [formatPopoverActive, setFormatPopoverActive] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>("p");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [customColor, setCustomColor] = useState("#000000");
  const colorInputId = useId();

  const toDisplayHtml = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return "<p><br></p>";
    if (t.includes("<")) return t;
    return "<p>" + t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>") + "</p>";
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

  const handleInput = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isInternal.current = true;
    const raw = el.innerHTML;
    const safe = sanitizeHtml(raw);
    onChange(safe);
  }, [onChange]);

  const exec = useCallback(
    (cmd: string, value?: string) => {
      document.execCommand(cmd, false, value ?? undefined);
      ref.current?.focus();
      handleInput();
    },
    [handleInput]
  );

  const setFormat = useCallback(
    (tag: string) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // Expand selection to the containing block so formatBlock applies reliably (fixes h1–h4 in Chrome/Edge)
        const block = range.commonAncestorContainer?.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement
          : range.commonAncestorContainer as Element | null;
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
    [handleInput]
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

  const openColorPicker = useCallback(() => {
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
    setShowColorPicker((p) => !p);
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
      setShowColorPicker(false);
    },
    [handleInput]
  );

  const toggleSource = useCallback(() => {
    if (sourceMode) {
      const raw = sourceRef.current?.value ?? "";
      const safe = sanitizeHtml(raw);
      onChange(safe);
      lastValueRef.current = safe;
      if (ref.current) ref.current.innerHTML = toDisplayHtml(safe);
    }
    setSourceMode((prev) => !prev);
  }, [sourceMode, onChange, toDisplayHtml]);

  useEffect(() => {
    if (sourceMode && sourceRef.current) {
      sourceRef.current.value = value || "";
    }
  }, [sourceMode, value]);

  useEffect(() => {
    if (!showColorPicker) return;
    const close = (event: MouseEvent) => {
      if (colorPickerContainerRef.current?.contains(event.target as Node)) return;
      savedColorSelectionRef.current = null;
      setShowColorPicker(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showColorPicker]);

  return (
    <div className="rich-text-editor">
      <Modal
        open={linkModalOpen}
        onClose={closeLinkModal}
        title="Insert link"
        primaryAction={{
          content: "Insert link",
          onAction: applyLink,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: closeLinkModal },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="URL"
              value={linkUrl}
              onChange={setLinkUrl}
              placeholder="https://"
              autoComplete="url"
              helpText="Supports Liquid, e.g. {{ shop.url }}/pages/contact"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
      {label && <label className="Polaris-Labelled__Label">{label}</label>}
      <div className="rich-text-editor-wrapper">
        <div className="rich-text-toolbar">
          {fullToolbar && (
            <>
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
                    accessibilityLabel="Text format"
                  >
                    {formatLabel}
                  </Button>
                }
              >
                <OptionList
                  options={FORMAT_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
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
              <span className="rich-text-toolbar-divider" />
            </>
          )}
          <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("bold")} title="Bold">
            <Icon source={TextBoldIcon} tone="subdued" />
          </button>
          <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("italic")} title="Italic">
            <Icon source={TextItalicIcon} tone="subdued" />
          </button>
          <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("underline")} title="Underline">
            <Icon source={TextUnderlineIcon} tone="subdued" />
          </button>

          {fullToolbar && (
            <>
              <span className="rich-text-toolbar-divider" />
              <div ref={colorPickerContainerRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  className="rich-text-toolbar-btn"
                  onClick={openColorPicker}
                  title="Text color"
                >
                  <Icon source={TextColorIcon} tone="subdued" />
                </button>
                {showColorPicker && (
                  <div className="rich-text-color-picker">
                    <div className="rich-text-color-swatches">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="rich-text-color-swatch"
                          onClick={() => applyColor(c)}
                          style={{ background: c }}
                          title={c}
                        />
                      ))}
                    </div>
                    <div className="rich-text-color-custom">
                      <label htmlFor={colorInputId} className="rich-text-color-custom-label">Pick color</label>
                      <input
                        id={colorInputId}
                        type="color"
                        value={customColor}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomColor(v);
                          applyColor(v);
                        }}
                        title="Choose any color"
                        className="rich-text-color-input"
                      />
                      <span className="rich-text-color-hex">{customColor}</span>
                    </div>
                  </div>
                )}
              </div>
              <span className="rich-text-toolbar-divider" />
              <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("justifyLeft")} title="Align left">
                <Icon source={TextAlignLeftIcon} tone="subdued" />
              </button>
              <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("justifyCenter")} title="Align center">
                <Icon source={TextAlignCenterIcon} tone="subdued" />
              </button>
              <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("justifyRight")} title="Align right">
                <Icon source={TextAlignRightIcon} tone="subdued" />
              </button>
              <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("justifyFull")} title="Justify">
                <span className="rich-text-toolbar-icon-svg"><JustifyIcon /></span>
              </button>
              <span className="rich-text-toolbar-divider" />
              <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("insertUnorderedList")} title="Bullet list">
                <Icon source={ListBulletedIcon} tone="subdued" />
              </button>
              <button type="button" className="rich-text-toolbar-btn" onClick={() => exec("insertOrderedList")} title="Numbered list">
                <Icon source={ListNumberedIcon} tone="subdued" />
              </button>
              <span className="rich-text-toolbar-divider" />
              <button type="button" className="rich-text-toolbar-btn" onClick={openLinkModal} title="Insert link">
                <Icon source={LinkIcon} tone="subdued" />
              </button>
              <span className="rich-text-toolbar-divider" />
              <button type="button" className="rich-text-toolbar-btn" onClick={toggleSource} title="Edit HTML source">
                <Icon source={CodeIcon} tone="subdued" />
              </button>
            </>
          )}
        </div>

        {sourceMode ? (
          <textarea
            ref={sourceRef}
            className="rich-text-source"
            defaultValue={value || ""}
            onBlur={() => {
              const raw = sourceRef.current?.value ?? "";
              onChange(sanitizeHtml(raw));
            }}
            style={{ minHeight }}
            placeholder="HTML source..."
            spellCheck={false}
          />
        ) : (
          <div
            ref={ref}
            contentEditable
            className="rich-text-body"
            data-placeholder={placeholder}
            onInput={handleInput}
            onBlur={handleInput}
            style={{ minHeight }}
            suppressContentEditableWarning
          />
        )}
      </div>
      {helpText && <div className="rich-text-help">{helpText}</div>}
    </div>
  );
}
