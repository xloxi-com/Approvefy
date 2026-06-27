/** Default wholesale registration form seeded for new shops. */
export const DEFAULT_CUSTOMER_B2B_FORM_NAME = "Customer B2B";

export type DefaultFormField = {
    label: string;
    type: string;
    required: boolean;
    enabled: boolean;
    step: number;
    isDefault?: boolean;
};

export const DEFAULT_CUSTOMER_B2B_FORM_FIELDS: DefaultFormField[] = [
    { label: "First Name", type: "first_name", required: true, enabled: true, step: 1, isDefault: true },
    { label: "Last Name", type: "last_name", required: true, enabled: true, step: 1, isDefault: true },
    { label: "Email", type: "email", required: true, enabled: true, step: 1, isDefault: true },
    { label: "Phone", type: "phone", required: true, enabled: true, step: 1 },
];

export const DEFAULT_CUSTOMER_B2B_FORM_TYPE = "wholesale" as const;
