/// <reference types="react" />
/// <reference types="react-dom" />
/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

/** Props type that allows any props (e.g. children, title, variant) for Polaris components */
type PolarisComponentProps = Record<string, unknown>;

declare module "@shopify/polaris" {
  export const Page: React.ComponentType<PolarisComponentProps>;
  export const Text: React.ComponentType<PolarisComponentProps>;
  export const BlockStack: React.ComponentType<PolarisComponentProps>;
  export const Frame: React.ComponentType<PolarisComponentProps>;
  export const Button: React.ComponentType<PolarisComponentProps>;
  export const Box: React.ComponentType<PolarisComponentProps>;
  export const InlineStack: React.ComponentType<PolarisComponentProps>;
  export const Icon: React.ComponentType<PolarisComponentProps>;
}

declare module "@shopify/polaris-icons" {
  export const CheckIcon: React.ComponentType<PolarisComponentProps>;
}

export {};
