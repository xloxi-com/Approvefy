import {
    LegacyCard,
    Grid,
    Text,
    BlockStack,
} from "@shopify/polaris";

interface AnalyticsHeaderProps {
    total: number;
    pending: number;
    denied: number;
}

export function AnalyticsHeader({ total, pending, denied }: AnalyticsHeaderProps) {
    return (
        <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
                <LegacyCard sectioned title="Total Customers">
                    <BlockStack gap="200">
                        <Text variant="headingXl" as="h2">
                            {total}
                        </Text>
                    </BlockStack>
                </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
                <LegacyCard sectioned title="Pending Approvals">
                    <BlockStack gap="200">
                        <Text variant="headingXl" as="h2" tone="caution">
                            {pending}
                        </Text>
                    </BlockStack>
                </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4, xl: 4 }}>
                <LegacyCard sectioned title="Rejected Customers">
                    <BlockStack gap="200">
                        <Text variant="headingXl" as="h2" tone="critical">
                            {denied}
                        </Text>
                    </BlockStack>
                </LegacyCard>
            </Grid.Cell>
        </Grid>
    );
}
