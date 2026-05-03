import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    const params = new URLSearchParams(url.searchParams);
    params.delete("appLoadId");
    const qs = params.toString();
    throw redirect(qs ? `/app?${qs}` : "/app");
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Customers</h1>
        <p className={styles.text}>
          Manage B2B customer registrations with an approval workflow.
          Customers register, you review and approve or deny — simple and powerful.
        </p>
        {showForm && (
          <div className={styles.form}>
            <a className={styles.button} href="/auth/login">
              Sign in
            </a>
          </div>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Custom Registration Form</strong>. Build a custom B2B
            registration form with the drag-and-drop Form Builder.
          </li>
          <li>
            <strong>Approval Workflow</strong>. Review, approve, or deny
            customer registrations with one click. Bulk actions included.
          </li>
          <li>
            <strong>Auto-Tagging</strong>. Approved customers are automatically
            tagged for use with customer groups, access rules, and more.
          </li>
        </ul>
      </div>
    </div>
  );
}
