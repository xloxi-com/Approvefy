import type { ReactNode } from "react";

const LINE_SIZES = {
  sm: 2,
  md: 3,
  lg: 4,
} as const;

export type LoadingIndicatorType = "line-simple";
export type LoadingIndicatorSize = "sm" | "md" | "lg";

export interface LoadingIndicatorProps {
  type?: LoadingIndicatorType;
  size?: LoadingIndicatorSize;
  label?: ReactNode;
  /** When true, renders as fixed top bar (for full-page navigation loading) */
  fullWidth?: boolean;
}

export function LoadingIndicator({
  type = "line-simple",
  size = "md",
  label,
  fullWidth = false,
}: LoadingIndicatorProps) {
  if (type === "line-simple") {
    const height = LINE_SIZES[size];
    const bar = (
      <div
        role="progressbar"
        aria-label={label ? String(label) : "Loading"}
        aria-hidden={!label}
        style={{
          position: fullWidth ? "fixed" : "relative",
          top: fullWidth ? 0 : undefined,
          left: fullWidth ? 0 : undefined,
          right: fullWidth ? 0 : undefined,
          height: `${height}px`,
          backgroundColor: "var(--p-color-bg-fill-secondary, #e5e7eb)",
          overflow: "hidden",
          zIndex: fullWidth ? 9999 : undefined,
          pointerEvents: fullWidth ? "none" : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "35%",
            background: "linear-gradient(90deg, #4b6fff, #22c55e, #4b6fff)",
            boxShadow: "0 0 4px rgba(0,0,0,0.25)",
            transform: "translateX(-100%)",
            animation: "b2b-progress-move 1.1s ease-in-out infinite",
          }}
        />
      </div>
    );

    if (label && !fullWidth) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {bar}
          <span style={{ fontSize: 14, color: "var(--p-color-text-subdued, #6b7280)" }}>{label}</span>
        </div>
      );
    }

    return bar;
  }

  return null;
}
