export interface UiNode {
  index: number;
  text: string;
  resourceId: string;
  className: string;
  packageName: string;
  contentDesc: string;
  checkable: boolean;
  checked: boolean;
  clickable: boolean;
  enabled: boolean;
  focusable: boolean;
  focused: boolean;
  scrollable: boolean;
  longClickable: boolean;
  selected: boolean;
  bounds: string;
  centerX: number;
  centerY: number;
  children: UiNode[];
}

export interface UiTree {
  nodes: UiNode[];
  timestamp: number;
  packageName: string;
}
