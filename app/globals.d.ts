declare module "*.css";

import type * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      "s-link": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { href?: string };
      "s-page": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      "s-section": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { heading?: string },
        HTMLElement
      >;
      "s-button": React.DetailedHTMLProps<
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        HTMLButtonElement
      >;
      "s-spinner": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          accessibilityLabel?: string;
          size?: "base" | "large" | "large-100";
        },
        HTMLElement
      >;
      "ui-save-bar": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { id?: string },
        HTMLElement
      >;
    }
  }

  interface Window {
    shopify?: {
      saveBar?: {
        show: (id: string) => Promise<void>;
        hide: (id: string) => Promise<void>;
        toggle: (id: string) => Promise<void>;
        leaveConfirmation: () => Promise<void>;
      };
    };
  }
}

export {};
