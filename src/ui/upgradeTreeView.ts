import type { UpgradeDefinition } from "../progress/definitions";
import { el, escapeHtml, px } from "./dom";
import { NODE_SIZE, renderUpgradeNodeSvg, type NodeStateName } from "./upgradeNodeSvg";

const GRID_STEP = { x: 176, y: 148 };
const TREE_PADDING = { x: 84, y: 84 };
const ZOOM_STEP = 1.15;
const MIN_ZOOM_FLOOR = 0.2;
/** これより短い間隔の 2 回目のクリックはダブルクリックとして扱う */
const DOUBLE_CLICK_MS = 300;

export interface TreeItem {
  upgrade: UpgradeDefinition;
  state: NodeStateName;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * アップグレード / 転生ツリー。Godot 版 upgrade_tree_view.gd の移植。
 * 空白ドラッグでパン、ホイールで拡大縮小、クリックで選択、ダブルクリックで取得。
 */
export class UpgradeTreeView {
  readonly element: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly nodes: HTMLElement;
  private items: TreeItem[] = [];
  private purchasedIds = new Set<string>();
  private selectedId = "";
  private pan = { x: 72, y: 86 };
  private zoom = 1;
  private contentRect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private dragging: { pointerId: number; lastX: number; lastY: number; moved: boolean } | null = null;
  private pendingClick: { id: string; timer: number } | null = null;
  private wheelAccumulator = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly handlers: {
      onSelect: (upgradeId: string) => void;
      onActivate: (upgradeId: string) => void;
    },
    ariaLabel: string,
  ) {
    this.lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.lines.classList.add("tree-lines");
    this.nodes = el("div", { className: "tree-nodes" });
    this.layer = el("div", { className: "tree-layer" }, [this.lines, this.nodes]);
    this.element = el("div", { className: "tree-view", attrs: { role: "group", "aria-label": ariaLabel } }, [this.layer]);
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.relayout());
    this.resizeObserver.observe(this.element);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    if (this.pendingClick) {
      clearTimeout(this.pendingClick.timer);
    }
  }

  setTreeData(items: TreeItem[], selectedId: string, purchasedIds: Iterable<string>): void {
    this.items = items;
    this.selectedId = selectedId;
    this.purchasedIds = new Set(purchasedIds);
    this.refreshContentRect();
    this.renderContent();
    this.relayout();
  }

  setSelected(upgradeId: string): void {
    this.selectedId = upgradeId;
    this.renderContent();
  }

  private nodeTopLeft(upgrade: UpgradeDefinition): { x: number; y: number } {
    return {
      x: TREE_PADDING.x + upgrade.tree_position.x * GRID_STEP.x,
      y: TREE_PADDING.y + upgrade.tree_position.y * GRID_STEP.y,
    };
  }

  private refreshContentRect(): void {
    if (this.items.length === 0) {
      this.contentRect = { x: TREE_PADDING.x / 2, y: TREE_PADDING.y / 2, w: NODE_SIZE + TREE_PADDING.x, h: NODE_SIZE + TREE_PADDING.y };
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { upgrade } of this.items) {
      const topLeft = this.nodeTopLeft(upgrade);
      minX = Math.min(minX, topLeft.x);
      minY = Math.min(minY, topLeft.y);
      maxX = Math.max(maxX, topLeft.x + NODE_SIZE);
      maxY = Math.max(maxY, topLeft.y + NODE_SIZE);
    }
    const padX = TREE_PADDING.x / 2;
    const padY = TREE_PADDING.y / 2;
    this.contentRect = { x: minX - padX, y: minY - padY, w: maxX - minX + padX * 2, h: maxY - minY + padY * 2 };
  }

  /** ノードと接続線を、ズーム前の座標で描く（拡大縮小は CSS transform で行う） */
  private renderContent(): void {
    const byId = new Map(this.items.map((item) => [item.upgrade.id, item]));
    const rect = this.contentRect;
    const extentW = rect.x + rect.w + GRID_STEP.x;
    const extentH = rect.y + rect.h + GRID_STEP.y;
    const svgParts: string[] = [];

    // 背景の格子点
    for (let gx = -1; TREE_PADDING.x + gx * GRID_STEP.x <= extentW; gx++) {
      for (let gy = -1; TREE_PADDING.y + gy * GRID_STEP.y <= extentH; gy++) {
        svgParts.push(`<circle cx="${TREE_PADDING.x + gx * GRID_STEP.x}" cy="${TREE_PADDING.y + gy * GRID_STEP.y}" r="2" class="tree-dot"/>`);
      }
    }

    for (const { upgrade } of this.items) {
      const end = this.nodeTopLeft(upgrade);
      const endX = end.x + NODE_SIZE / 2;
      const endY = end.y + NODE_SIZE / 2;
      for (const prerequisiteId of upgrade.prerequisites) {
        const prerequisite = byId.get(prerequisiteId);
        if (!prerequisite) {
          continue;
        }
        const start = this.nodeTopLeft(prerequisite.upgrade);
        const startX = start.x + NODE_SIZE / 2;
        const startY = start.y + NODE_SIZE / 2;
        const midX = startX + (endX - startX) * 0.55;
        const purchased = this.purchasedIds.has(prerequisiteId) && this.purchasedIds.has(upgrade.id);
        svgParts.push(
          `<polyline points="${startX},${startY} ${midX},${startY} ${midX},${endY} ${endX},${endY}" ` +
            `class="tree-link${purchased ? " is-purchased" : ""}"/>`,
        );
      }
    }

    this.lines.setAttribute("width", String(extentW));
    this.lines.setAttribute("height", String(extentH));
    this.lines.innerHTML = svgParts.join("");

    const active = document.activeElement;
    const focusedId = active && this.nodes.contains(active) ? active.closest(".tree-node")?.getAttribute("data-id") : null;
    this.nodes.innerHTML = this.items
      .map(({ upgrade, state }) => {
        const topLeft = this.nodeTopLeft(upgrade);
        const selected = upgrade.id === this.selectedId;
        const tooltip = `${upgrade.title}\n${upgrade.description}`;
        return (
          `<button type="button" class="tree-node state-${state}${selected ? " is-selected" : ""}" data-id="${escapeHtml(upgrade.id)}" ` +
          `style="left:${topLeft.x}px;top:${topLeft.y}px" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(upgrade.title)}" ` +
          `aria-pressed="${selected}">${renderUpgradeNodeSvg(upgrade, state, selected)}</button>`
        );
      })
      .join("");
    if (focusedId) {
      this.nodes.querySelector<HTMLElement>(`.tree-node[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    }
  }

  private viewportSize(): { x: number; y: number } {
    return { x: this.element.clientWidth, y: this.element.clientHeight };
  }

  private minZoom(): number {
    const size = this.viewportSize();
    if (size.x <= 1 || size.y <= 1) {
      return MIN_ZOOM_FLOOR;
    }
    return Math.min(1, Math.max(MIN_ZOOM_FLOOR, Math.min(size.x / this.contentRect.w, size.y / this.contentRect.h)));
  }

  private relayout(): void {
    this.zoom = Math.min(Math.max(this.zoom, this.minZoom()), 1);
    this.clampPan();
    this.applyTransform();
  }

  private clampPan(): void {
    const size = this.viewportSize();
    const clampAxis = (current: number, start: number, length: number, viewport: number) => {
      if (length <= viewport) {
        return (viewport - length) / 2 - start;
      }
      return Math.min(Math.max(current, viewport - (start + length)), -start);
    };
    this.pan.x = clampAxis(this.pan.x, this.contentRect.x * this.zoom, this.contentRect.w * this.zoom, size.x);
    this.pan.y = clampAxis(this.pan.y, this.contentRect.y * this.zoom, this.contentRect.h * this.zoom, size.y);
  }

  private applyTransform(): void {
    this.layer.style.transform = `translate(${px(this.pan.x)}, ${px(this.pan.y)}) scale(${this.zoom})`;
    this.element.style.setProperty("--tree-zoom", String(this.zoom));
  }

  private zoomAt(anchorX: number, anchorY: number, multiplier: number): void {
    const newZoom = Math.min(Math.max(this.zoom * multiplier, this.minZoom()), 1);
    if (Math.abs(newZoom - this.zoom) < 0.0001) {
      return;
    }
    const contentX = (anchorX - this.pan.x) / Math.max(this.zoom, 0.001);
    const contentY = (anchorY - this.pan.y) / Math.max(this.zoom, 0.001);
    this.zoom = newZoom;
    this.pan.x = anchorX - contentX * this.zoom;
    this.pan.y = anchorY - contentY * this.zoom;
    this.clampPan();
    this.applyTransform();
  }

  private bindEvents(): void {
    this.element.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 600 : 1;
        this.wheelAccumulator += event.deltaY * unit;
        if (Math.abs(this.wheelAccumulator) >= 80) {
          const rect = this.element.getBoundingClientRect();
          this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, this.wheelAccumulator < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
          this.wheelAccumulator = 0;
        }
      },
      { passive: false },
    );

    this.element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      this.dragging = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: false };
    });
    this.element.addEventListener("pointermove", (event) => {
      const drag = this.dragging;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) {
        return;
      }
      if (!drag.moved) {
        drag.moved = true;
        this.element.setPointerCapture(event.pointerId);
        this.element.classList.add("is-panning");
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      this.pan.x += dx;
      this.pan.y += dy;
      this.clampPan();
      this.applyTransform();
    });
    const endDrag = (event: PointerEvent) => {
      const drag = this.dragging;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      this.dragging = null;
      this.element.classList.remove("is-panning");
      if (drag.moved) {
        return;
      }
      const node = (event.target as HTMLElement).closest<HTMLElement>(".tree-node");
      if (node?.dataset.id && event.type === "pointerup") {
        this.onNodeClick(node.dataset.id);
      }
    };
    this.element.addEventListener("pointerup", endDrag);
    this.element.addEventListener("pointercancel", endDrag);
    // キーボード操作（Enter / Space）でもノードを選べるようにする
    this.element.addEventListener("keydown", (event) => {
      const node = (event.target as HTMLElement).closest<HTMLElement>(".tree-node");
      if (node?.dataset.id && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        this.select(node.dataset.id);
      }
    });
  }

  /** シングルクリックは少し待って詳細表示、続けてクリックされたら取得する */
  private onNodeClick(upgradeId: string): void {
    if (this.pendingClick && this.pendingClick.id === upgradeId) {
      clearTimeout(this.pendingClick.timer);
      this.pendingClick = null;
      this.selectedId = upgradeId;
      this.handlers.onActivate(upgradeId);
      return;
    }
    if (this.pendingClick) {
      clearTimeout(this.pendingClick.timer);
    }
    this.selectedId = upgradeId;
    this.renderContent();
    const timer = window.setTimeout(() => {
      this.pendingClick = null;
      this.select(upgradeId);
    }, DOUBLE_CLICK_MS);
    this.pendingClick = { id: upgradeId, timer };
  }

  private select(upgradeId: string): void {
    this.selectedId = upgradeId;
    this.renderContent();
    this.handlers.onSelect(upgradeId);
  }
}
