import { useEffect } from "react";

type AppSaveBarProps = {
  id: string;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
};

/** Programmatic App Bridge save bar with Polaris loading on Save. */
export function AppSaveBar({ id, isSaving, onSave, onDiscard }: AppSaveBarProps) {
  return (
    <ui-save-bar id={id}>
      <button
        type="button"
        {...({ variant: "primary" } as Record<string, unknown>)}
        {...({ loading: isSaving ? "" : undefined } as Record<string, unknown>)}
        disabled={isSaving}
        onClick={() => {
          if (isSaving) return;
          onSave();
        }}
      >
        Save
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => {
          if (isSaving) return;
          onDiscard();
        }}
      >
        Discard
      </button>
    </ui-save-bar>
  );
}

/** Keep save bar visible while saving so the loading spinner can show. */
export function useProgrammaticSaveBar(
  saveBarId: string,
  hasUnsavedChanges: boolean,
  isSaving: boolean,
  options?: { delayedSyncMs?: number; hideOnUnmount?: boolean },
) {
  const { delayedSyncMs, hideOnUnmount = false } = options ?? {};
  useEffect(() => {
    const shouldShow = hasUnsavedChanges || isSaving;
    const saveBar = typeof window !== "undefined" ? window.shopify?.saveBar : undefined;
    if (!saveBar) return;
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const p = shouldShow ? saveBar.show(saveBarId) : saveBar.hide(saveBarId);
      void p.catch(() => {});
    };
    sync();
    const raf = requestAnimationFrame(sync);
    const timeoutId =
      delayedSyncMs != null ? window.setTimeout(sync, delayedSyncMs) : undefined;
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (hideOnUnmount || !shouldShow) {
        void saveBar.hide(saveBarId).catch(() => {});
      }
    };
  }, [hasUnsavedChanges, isSaving, saveBarId, delayedSyncMs, hideOnUnmount]);
}
