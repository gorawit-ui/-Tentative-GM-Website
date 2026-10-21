// A11 — pieces every Admin page shares (Part 3 §13 + its states table): a heading that takes the focus,
// loading / failed states with “ลองใหม่”, a status line after a save, the active/closed badge, and the
// one layout switch (mobile list → desktop table) decided by the same 1024px line as the shell.
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const WIDE = '(min-width: 1024px)';

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Desktop layout (≥ 1024px): tables; below it cards and lists — one of them is rendered, not both. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
}

export type Load<T> = { readonly kind: 'loading' } | { readonly kind: 'failed'; readonly error: unknown } | { readonly kind: 'ready'; readonly data: T };

/** One read when the page opens (no listener) and again on `reload()`; the last answer wins. */
export function useAdminData<T>(load: () => Promise<T>): { readonly state: Load<T>; readonly reload: () => Promise<void> } {
  const [state, setState] = useState<Load<T>>({ kind: 'loading' });
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const data = await load();
      if (ticket === latest.current) setState({ kind: 'ready', data });
    } catch (error) {
      if (ticket === latest.current) setState({ kind: 'failed', error });
    }
  }, [load]);
  useEffect(() => {
    void reload();
    return () => {
      latest.current += 1;
    };
  }, [reload]);
  return { state, reload };
}

export function AdminHead({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <div className="gm-page-head">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Loading({ what }: { readonly what: string }) {
  return (
    <div className="gm-admin-loading" role="status">
      <span className="gm-skeleton gm-admin-skeleton" aria-hidden="true" />
      <span className="gm-skeleton gm-admin-skeleton" aria-hidden="true" />
      <span>{what}</span>
    </div>
  );
}

export function LoadFailed({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="gm-notice gm-notice--warning" role="alert">
      <p>โหลดข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่</p>
      <div>
        <button type="button" className="gm-btn gm-btn--secondary" onClick={onRetry}>
          ลองใหม่
        </button>
      </div>
    </div>
  );
}

/** “ใช้งาน” / “ปิดใช้งานแล้ว” in words, never colour alone. */
export function ActiveBadge({ active }: { readonly active: boolean }) {
  return <span className={`gm-badge ${active ? 'gm-badge--ok' : 'gm-badge--muted'}`}>{active ? 'ใช้งาน' : 'ปิดใช้งานแล้ว'}</span>;
}

export type Saved = { readonly kind: 'idle' } | { readonly kind: 'done'; readonly text: string } | { readonly kind: 'error'; readonly text: string };

export function SaveLine({ saved }: { readonly saved: Saved }) {
  if (saved.kind === 'done')
    return (
      <p className="gm-notice gm-notice--info" role="status">
        {saved.text}
      </p>
    );
  if (saved.kind === 'error')
    return (
      <p className="gm-notice gm-notice--danger" role="alert">
        {saved.text}
      </p>
    );
  return null;
}

/**
 * A question before a change that cannot be taken back quietly (D-A11-5: deleting a holiday). Focus
 * starts on “ยกเลิก”; Escape cancels; the buttons are full-size targets on every screen.
 */
export function ConfirmDialog({
  title,
  confirm,
  children,
  onCancel,
  onConfirm,
}: {
  readonly title: string;
  readonly confirm: string;
  readonly children: ReactNode;
  readonly onCancel: () => void;
  readonly onConfirm: () => Promise<void>;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="gm-dialog-backdrop">
      <div className="gm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <div className="gm-admin-stack">{children}</div>
        <div className="gm-admin-row-buttons gm-dialog-buttons">
          <button ref={cancelRef} type="button" className="gm-btn gm-btn--secondary" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="gm-btn gm-btn--danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
