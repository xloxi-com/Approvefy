/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

import type * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-page": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      "s-section": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { heading?: string };
      "s-text-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        name?: string;
        label?: string;
        details?: string;
        value?: string;
        autocomplete?: string;
        error?: string;
        onChange?: (e: unknown) => void;
      };
      "s-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { type?: string };
    }
  }
}

export {};
