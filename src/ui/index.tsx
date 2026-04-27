import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Sidebar, SidebarProps } from './sidebar';

const ROOTS = new WeakMap<HTMLElement, Root>();

export function mountSidebar(target: HTMLElement, props: SidebarProps): void {
  let root = ROOTS.get(target);
  if (!root) {
    root = createRoot(target);
    ROOTS.set(target, root);
  }
  root.render(<Sidebar {...props} />);
}

export function updateSidebar(target: HTMLElement, props: SidebarProps): void {
  const root = ROOTS.get(target);
  if (!root) {
    return;
  }
  root.render(<Sidebar {...props} />);
}

export function unmountSidebar(target: HTMLElement): void {
  const root = ROOTS.get(target);
  if (root) {
    root.unmount();
    ROOTS.delete(target);
  }
}

export { Sidebar };
export type { SidebarProps };
