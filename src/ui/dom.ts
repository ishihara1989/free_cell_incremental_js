type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: never) => void>>;
}

/** 小さな DOM 生成ヘルパー */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === undefined || value === false) {
      continue;
    }
    element.setAttribute(name, value === true ? "" : String(value));
  }
  if (options.style) {
    Object.assign(element.style, options.style);
  }
  for (const [eventName, handler] of Object.entries(options.on ?? {})) {
    element.addEventListener(eventName, handler as EventListener);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    element.append(child);
  }
  return element;
}

export function button(label: string, onClick: () => void, className = "btn"): HTMLButtonElement {
  return el("button", { className, text: label, attrs: { type: "button" }, on: { click: onClick } });
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

export function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}
