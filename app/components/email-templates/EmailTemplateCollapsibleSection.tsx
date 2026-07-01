import type { ReactNode } from "react";
import { Box, Button, Card, Checkbox, Collapsible, Divider, InlineStack } from "@shopify/polaris";

type Props = {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  sendEmailLabel: string;
  sendEmailChecked: boolean;
  onSendEmailChange: (checked: boolean) => void;
  children: ReactNode;
};

export function EmailTemplateCollapsibleSection({
  id,
  title,
  open,
  onToggle,
  sendEmailChecked,
  onSendEmailChange,
  children,
}: Props) {
  return (
    <Card padding="0">
      <Box padding="300">
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
          <Button variant="plain" onClick={onToggle} textAlign="start" disclosure={open ? "up" : "down"}>
            {title}
          </Button>
          <Box onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Checkbox label="Send email" checked={sendEmailChecked} onChange={onSendEmailChange} />
          </Box>
        </InlineStack>
      </Box>
      <Collapsible open={open} id={id} expandOnPrint>
        <Divider />
        <Box padding="300" background="bg-surface-secondary">
          {children}
        </Box>
      </Collapsible>
    </Card>
  );
}
