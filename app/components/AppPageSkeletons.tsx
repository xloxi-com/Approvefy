import {
  BlockStack,
  Box,
  Card,
  InlineStack,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonPage,
  SkeletonTabs,
} from "@shopify/polaris";

/** Settings layout: sidebar nav + main card (streams while shop meta loads). */
export function SettingsPageSkeleton() {
  const navItems = ["store", "languages", "approval", "email", "appearance"] as const;
  return (
    <div className="settings-page-wrapper">
      <SkeletonPage title="Settings" primaryAction backAction fullWidth>
        <div className="settings-layout-main">
          <div className="settings-layout-row">
            <aside className="settings-sidebar-nav" aria-hidden>
              <BlockStack gap="100">
                {navItems.map((id) => (
                  <Box
                    key={id}
                    background="bg-fill-tertiary"
                    borderRadius="200"
                    minHeight="36px"
                    width="100%"
                  />
                ))}
              </BlockStack>
            </aside>
            <Box minWidth="0" width="100%">
              <Card>
                <BlockStack gap="500">
                  <SkeletonTabs count={4} />
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={8} />
                </BlockStack>
              </Card>
            </Box>
          </div>
        </div>
      </SkeletonPage>
    </div>
  );
}

type FormConfigTableSkeletonProps = {
  rows?: number;
};

/** Form configuration list — matches IndexTable section inside Page. */
export function FormConfigTableSkeleton({ rows = 5 }: FormConfigTableSkeletonProps) {
  const rowKeys = Array.from({ length: rows }, (_, i) => `row-${i}`);
  return (
    <div className="app-backend-card">
      <Card padding="0">
        <Box padding="400">
          <BlockStack gap="400">
            <InlineStack gap="400" wrap={false}>
              <Box minWidth="120px" maxWidth="140px">
                <SkeletonDisplayText size="small" />
              </Box>
              <Box minWidth="120px" maxWidth="160px">
                <SkeletonDisplayText size="small" />
              </Box>
              <Box minWidth="80px" maxWidth="100px">
                <SkeletonDisplayText size="small" />
              </Box>
              <Box minWidth="64px" maxWidth="80px">
                <SkeletonDisplayText size="small" />
              </Box>
              <Box minWidth="72px" maxWidth="96px">
                <SkeletonDisplayText size="small" />
              </Box>
            </InlineStack>
            {rowKeys.map((key) => (
              <Box key={key} paddingBlockStart="100" paddingBlockEnd="100">
                <SkeletonBodyText lines={1} />
              </Box>
            ))}
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}

/** Rich text editor chunk while the lazy editor bundle loads. */
export function RichTextEditorSkeleton({ minHeight = 120 }: { minHeight?: number }) {
  return (
    <Box paddingBlockStart="200" minHeight={`${minHeight}px`}>
      <SkeletonBodyText lines={4} />
    </Box>
  );
}

/** Compact card skeleton (e.g. home “Live status”). */
export function CardBodySkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card padding="500">
      <BlockStack gap="300">
        <SkeletonDisplayText size="small" />
        <SkeletonBodyText lines={lines} />
      </BlockStack>
    </Card>
  );
}
