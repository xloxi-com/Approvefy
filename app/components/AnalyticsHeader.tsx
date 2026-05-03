import {
    Grid,
    Text,
    BlockStack,
} from "@shopify/polaris";
import { SectionCard } from "./SectionCard";

interface AnalyticsHeaderProps {
    total: number;
    pending: number;
    denied: number;
}

export function AnalyticsHeader({ total, pending, denied }: AnalyticsHeaderProps) {
    return (
        <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
                <SectionCard title="Total Customers">
                    <BlockStack gap="200">
                        <Text variant="headingXl" as="h2">
                            {total}
                        </Text>
                    </BlockStack>
                </SectionCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
                <SectionCard title="Pending Approvals">
                    <BlockStack gap="200">
                        <Text variant="headingXl" as="h2" tone="caution">
                            {pending}
                        </Text>
                    </BlockStack>
                </SectionCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
                <SectionCard title="Rejected Customers">
                    <BlockStack gap="200">
                        <Text variant="headingXl" as="h2" tone="critical">
                            {denied}
                        </Text>
                    </BlockStack>
                </SectionCard>
            </Grid.Cell>
        </Grid>
    );
}
