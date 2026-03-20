// Form Configuration page - lists forms (example UI: Form ID, Name, Form type, Status, Actions)
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate, useSubmit, useRevalidator, useActionData } from "react-router";
import {
    Badge,
    Box,
    EmptyState,
    Frame,
    IndexTable,
    InlineGrid,
    Layout,
    LegacyCard,
    Page,
    Text,
    Button,
    useIndexResourceState,
    Modal,
    BlockStack,
    Banner,
    InlineStack,
    Toast,
} from "@shopify/polaris";
import { EditIcon, DeleteIcon, PlusIcon, ClipboardIcon, DuplicateIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState, useCallback, useEffect } from "react";

export const FORM_TYPES = [
    { value: "wholesale", label: "Wholesale registration form", description: "Wholesale registration form helps streamline the registration process for companies that sell products to retailers or distributors.", displayCondition: "This form can show on all pages of the store-front." },
    { value: "multi_step", label: "Multi-step form", description: "Multi-step form helps gather detailed information about potential partners or distributors step by step.", displayCondition: "This form can only show on Customer Account Page after login." },
] as const;

interface FormConfigItem {
    id: string;
    shop: string;
    name: string;
    formType: string;
    status: "enabled" | "disabled";
    fieldsCount: number;
    isDefault: boolean;
    createdAt: string;
    [key: string]: unknown;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const forms: FormConfigItem[] = [];

    try {
        const dbForms = await prisma.formConfig.findMany({ where: { shop }, orderBy: { createdAt: "asc" } });
        for (const row of dbForms) {
            const fields = (row.fields ?? []) as unknown[];
            const r = row as { name?: string; formType?: string; isDefault?: boolean; enabled?: boolean };
            forms.push({
                id: row.id,
                shop: row.shop,
                name: r.name ?? "Registration Form",
                formType: r.formType ?? "wholesale",
                status: r.enabled !== false ? "enabled" : "disabled",
                fieldsCount: fields.length,
                isDefault: r.isDefault ?? false,
                createdAt: row.createdAt.toISOString(),
            });
        }
    } catch (e) {
        console.warn("Form config fetch failed:", e);
    }

    const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
    // Direct link to the theme editor on the Customer register page
    // so merchants land where they can enable the Approvefy app embed.
    const themeEditorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=customers/register&context=apps`;

    return { forms, themeEditorUrl };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "delete") {
        const formId = formData.get("formId") as string | null;
        if (!formId) return { success: false, error: "Missing form ID" };
        try {
            await prisma.formConfig.deleteMany({ where: { id: formId, shop } });
            return { success: true };
        } catch (e) {
            console.error("Form delete failed:", e);
            return { success: false, error: "Failed to delete form" };
        }
    }
    if (intent === "clone") {
        const formId = formData.get("formId") as string | null;
        if (!formId) return { success: false, error: "Missing form ID" };
        try {
            const source = await prisma.formConfig.findFirst({ where: { id: formId, shop } });
            if (!source) return { success: false, error: "Form not found" };
            const row = source as { name?: string; formType?: string; fields?: unknown; enabled?: boolean };
            const name = (row.name ?? "Registration Form").trim();
            const copyName = name.length > 0 ? `${name} (Copy)` : "Registration Form (Copy)";
            const newForm = await prisma.formConfig.create({
                data: {
                    shop,
                    name: copyName,
                    formType: row.formType ?? "wholesale",
                    fields: row.fields ?? [],
                    isDefault: false,
                    enabled: row.enabled !== false,
                } as never,
            });
            return { success: true, clonedFormId: newForm.id };
        } catch (e) {
            console.error("Form clone failed:", e);
            return { success: false, error: "Failed to clone form" };
        }
    }
    return { success: false };
};

function formTypeLabel(value: string): string {
    const v = (value || "").toLowerCase();
    if (v === "wholesale") return "Wholesale registration form";
    if (v === "multi_step") return "Multi-step form";
    return FORM_TYPES.find((t) => t.value === value)?.label ?? value;
}

export default function FormConfig() {
    const { forms, themeEditorUrl } = useLoaderData<typeof loader>();
    const actionData = useActionData<{ success?: boolean; clonedFormId?: string; error?: string }>();
    const navigate = useNavigate();
    const submit = useSubmit();
    const revalidator = useRevalidator();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [formToDelete, setFormToDelete] = useState<FormConfigItem | null>(null);
    const [copyToast, setCopyToast] = useState(false);
    const [cloneToast, setCloneToast] = useState(false);
    const resourceName = { singular: "form", plural: "forms" };
    const handleBack = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate("/app/customers");
        }
    }, [navigate]);

    const handleCopyFormId = useCallback((formId: string) => {
        navigator.clipboard.writeText(formId).then(() => {
            setCopyToast(true);
        });
    }, []);
    const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(forms);

    const handleCreateForm = useCallback(
        (formType: string) => {
            setCreateModalOpen(false);
            navigate(`/app/form-builder?new=1&formType=${encodeURIComponent(formType)}`);
        },
        [navigate]
    );

    const handleDeleteClick = useCallback((form: FormConfigItem) => {
        setFormToDelete(form);
        setDeleteModalOpen(true);
    }, []);

    const handleDeleteConfirm = useCallback(() => {
        if (!formToDelete) return;
        const fd = new FormData();
        fd.set("intent", "delete");
        fd.set("formId", formToDelete.id);
        submit(fd, { method: "post" });
        setDeleteModalOpen(false);
        setFormToDelete(null);
    }, [formToDelete, submit]);

    const handleCloneForm = useCallback(
        (form: FormConfigItem) => {
            const fd = new FormData();
            fd.set("intent", "clone");
            fd.set("formId", form.id);
            submit(fd, { method: "post" });
        },
        [submit]
    );

    useEffect(() => {
        if (actionData?.success && actionData?.clonedFormId) {
            revalidator.revalidate();
            setCloneToast(true);
        }
    }, [actionData?.success, actionData?.clonedFormId, revalidator]);

    const createFormAction = (
        <Button variant="primary" icon={PlusIcon} onClick={() => setCreateModalOpen(true)}>
            Create form
        </Button>
    );

    const emptyStateMarkup = !forms.length ? (
        <EmptyState
            heading="No forms configured"
            action={{
                content: "Create form",
                onAction: () => setCreateModalOpen(true),
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <p>Build your first registration form to start collecting B2B customer applications.</p>
        </EmptyState>
    ) : null;

    const rowMarkup = forms.map((form, index) => (
        <IndexTable.Row
            id={form.id}
            key={form.id}
            selected={selectedResources.includes(form.id)}
            position={index}
        >
            <IndexTable.Cell>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Text as="span" variant="bodyMd" tone="subdued">{form.id}</Text>
                    <Button
                        variant="plain"
                        icon={ClipboardIcon}
                        accessibilityLabel="Copy form ID for app embed"
                        onClick={() => handleCopyFormId(form.id)}
                    />
                </InlineStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Link
                    to={`/app/form-builder?formId=${encodeURIComponent(form.id)}`}
                    className="form-config-name-link"
                >
                    {form.name}
                </Link>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Badge tone="info">{formTypeLabel(form.formType)}</Badge>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Badge tone="success">{form.status === "enabled" ? "Enabled" : "Disabled"}</Badge>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                    <Button
                        variant="plain"
                        icon={EditIcon}
                        accessibilityLabel="Edit form"
                        onClick={() => navigate(`/app/form-builder?formId=${encodeURIComponent(form.id)}`)}
                    />
                    <Button variant="plain" icon={DuplicateIcon} accessibilityLabel="Clone form" onClick={() => handleCloneForm(form)} />
                    <Button variant="plain" icon={DeleteIcon} accessibilityLabel="Delete form" tone="critical" onClick={() => handleDeleteClick(form)} />
                </div>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    return (
        <Frame>
            <Modal
                open={deleteModalOpen}
                onClose={() => { setDeleteModalOpen(false); setFormToDelete(null); }}
                title="Delete form?"
                primaryAction={{
                    content: "Delete",
                    destructive: true,
                    onAction: handleDeleteConfirm,
                }}
                secondaryActions={[{ content: "Cancel", onAction: () => { setDeleteModalOpen(false); setFormToDelete(null); } }]}
            >
                <Modal.Section>
                    <Text as="p">
                        Are you sure you want to delete &quot;{formToDelete?.name}&quot;? This cannot be undone.
                    </Text>
                </Modal.Section>
            </Modal>
            <Modal
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                title="Create form"
                size="large"
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <Text as="p" tone="subdued">
                            Choose the form layout that best matches how you want customers to register. You can edit all fields later.
                        </Text>
                        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                            {FORM_TYPES.map((t) => (
                                <LegacyCard key={t.value} sectioned>
                                    <BlockStack gap="300">
                                        <Text as="h2" variant="headingMd" fontWeight="bold">
                                            {t.label}
                                        </Text>
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            {t.description}
                                        </Text>
                                        <Box paddingBlockStart="200">
                                            <Button fullWidth variant="primary" onClick={() => handleCreateForm(t.value)}>
                                                Create form
                                            </Button>
                                        </Box>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            {t.displayCondition}
                                        </Text>
                                    </BlockStack>
                                </LegacyCard>
                            ))}
                        </InlineGrid>
                    </BlockStack>
                </Modal.Section>
            </Modal>
            {copyToast && (
                <Toast content="Form ID copied. Paste it in the theme app embed block (Form to display)." onDismiss={() => setCopyToast(false)} />
            )}
            {cloneToast && (
                <Toast content="Form cloned successfully. The new form appears in the list." onDismiss={() => setCloneToast(false)} />
            )}
            <Page
                title="Form configuration"
                backAction={{ content: "Back", onAction: handleBack }}
                primaryAction={createFormAction}
            >
                <div className="app-nav-tabs-mobile">
                <Box paddingBlockEnd="200">
                    <InlineStack gap="100" wrap>
                        <Link to="/app">
                            <Button size="slim">Overview</Button>
                        </Link>
                        <Button size="slim" onClick={() => navigate("/app/customers")}>
                            Customers
                        </Button>
                        <Button size="slim" variant="primary">
                            Form Builder
                        </Button>
                        <Button size="slim" onClick={() => navigate("/app/settings")}>
                            Settings
                        </Button>
                    </InlineStack>
                </Box>
                </div>
                <Layout>
                    <Layout.Section>
                        {forms.length > 0 && (
                            <Box paddingBlockEnd="300">
                                <Banner tone="info">
                                    <BlockStack gap="200">
                                        <Text as="p">
                                            Use the Form ID in your theme: add the <strong>Approvefy</strong> app embed on the Customer register page, then paste a Form ID into &quot;Form to display&quot; to show that form. Leave it blank to use your default form.
                                        </Text>
                                        <Text as="p">
                                            In the theme editor, go to <strong>App embeds</strong> → enable <strong>Approvefy</strong> → then click <strong>Save</strong> to apply.
                                        </Text>
                                        <InlineStack gap="200">
                                            <Button url={themeEditorUrl} target="_blank">
                                                Customize theme
                                            </Button>
                                        </InlineStack>
                                    </BlockStack>
                                </Banner>
                            </Box>
                        )}
                        <LegacyCard>
                            <div className="form-config-table-wrapper">
                                {emptyStateMarkup ?? (
                                    <IndexTable
                                        resourceName={resourceName}
                                        itemCount={forms.length}
                                        selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                                        onSelectionChange={handleSelectionChange}
                                        headings={[
                                            { title: "Form ID" },
                                            { title: "Name" },
                                            { title: "Form type" },
                                            { title: "Status" },
                                            { title: "Actions" },
                                        ]}
                                        selectable={false}
                                    >
                                        {rowMarkup}
                                    </IndexTable>
                                )}
                            </div>
                        </LegacyCard>
                    </Layout.Section>
                </Layout>
            </Page>
        </Frame>
    );
}
