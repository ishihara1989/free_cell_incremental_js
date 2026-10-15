import { el } from "./dom";

export interface ModalHandle {
  root: HTMLElement;
  panel: HTMLElement;
  close(): void;
}

/** 汎用モーダル。背景クリックと Esc で閉じる。 */
export function openModal(options: {
  className?: string;
  labelledBy?: string;
  content: (close: () => void) => Node[];
  onClose?: () => void;
}): ModalHandle {
  const panel = el("div", {
    className: `modal-panel ${options.className ?? ""}`.trim(),
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": options.labelledBy },
  });
  const root = el("div", { className: "modal-backdrop" }, [panel]);
  const previousFocus = document.activeElement as HTMLElement | null;

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    root.remove();
    options.onClose?.();
    previousFocus?.focus?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };

  panel.append(...options.content(close));
  root.addEventListener("pointerdown", (event) => {
    if (event.target === root) {
      close();
    }
  });
  document.addEventListener("keydown", onKeyDown, true);
  document.body.append(root);
  panel.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  return { root, panel, close };
}

export function confirmDialog(options: {
  title: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      className: "confirm-dialog",
      labelledBy: "confirm-title",
      onClose: () => resolve(result),
      content: (close) => [
        el("h2", { className: "modal-title", text: options.title, attrs: { id: "confirm-title" } }),
        el("p", { className: "modal-message", text: options.message }),
        el("div", { className: "modal-actions" }, [
          el("button", {
            className: "btn",
            text: options.cancelLabel ?? "キャンセル",
            attrs: { type: "button" },
            on: { click: () => close() },
          }),
          el("button", {
            className: options.danger ? "btn btn-danger" : "btn btn-primary",
            text: options.okLabel ?? "OK",
            attrs: { type: "button", "data-autofocus": true },
            on: {
              click: () => {
                result = true;
                close();
              },
            },
          }),
        ]),
      ],
    });
  });
}

export function alertDialog(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    openModal({
      className: "confirm-dialog",
      labelledBy: "alert-title",
      onClose: () => resolve(),
      content: (close) => [
        el("h2", { className: "modal-title", text: title, attrs: { id: "alert-title" } }),
        el("p", { className: "modal-message", text: message }),
        el("div", { className: "modal-actions" }, [
          el("button", {
            className: "btn btn-primary",
            text: "OK",
            attrs: { type: "button", "data-autofocus": true },
            on: { click: () => close() },
          }),
        ]),
      ],
    });
  });
}
