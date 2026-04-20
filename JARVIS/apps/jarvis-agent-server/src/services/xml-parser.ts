import { XMLParser } from "fast-xml-parser";
import type { UiNode, UiTree } from "../types/ui-node.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
});

export function parseUiDump(xml: string): UiTree {
  const parsed = parser.parse(xml);
  const hierarchy = parsed?.hierarchy;
  if (!hierarchy) {
    return { nodes: [], timestamp: Date.now(), packageName: "" };
  }

  const rootPackage = hierarchy["@_package"] ?? "";
  const nodes = flattenNodes(hierarchy.node ?? hierarchy);
  return { nodes, timestamp: Date.now(), packageName: rootPackage };
}

function flattenNodes(node: any, result: UiNode[] = [], index = { val: 0 }): UiNode[] {
  if (!node) return result;

  if (Array.isArray(node)) {
    for (const n of node) {
      flattenNodes(n, result, index);
    }
    return result;
  }

  const bounds = node["@_bounds"] ?? "";
  const { centerX, centerY } = parseBounds(bounds);

  const uiNode: UiNode = {
    index: index.val++,
    text: node["@_text"] ?? "",
    resourceId: node["@_resource-id"] ?? "",
    className: node["@_class"] ?? "",
    packageName: node["@_package"] ?? "",
    contentDesc: node["@_content-desc"] ?? "",
    checkable: node["@_checkable"] === "true",
    checked: node["@_checked"] === "true",
    clickable: node["@_clickable"] === "true",
    enabled: node["@_enabled"] === "true",
    focusable: node["@_focusable"] === "true",
    focused: node["@_focused"] === "true",
    scrollable: node["@_scrollable"] === "true",
    longClickable: node["@_long-clickable"] === "true",
    selected: node["@_selected"] === "true",
    bounds,
    centerX,
    centerY,
    children: [],
  };

  // Only include nodes that have text, content-desc, or are interactive
  if (uiNode.text || uiNode.contentDesc || uiNode.clickable || uiNode.scrollable) {
    result.push(uiNode);
  }

  // Process children
  if (node.node) {
    flattenNodes(node.node, result, index);
  }

  return result;
}

function parseBounds(bounds: string): { centerX: number; centerY: number } {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return { centerX: 0, centerY: 0 };
  const [, x1, y1, x2, y2] = match.map(Number);
  return {
    centerX: Math.round((x1 + x2) / 2),
    centerY: Math.round((y1 + y2) / 2),
  };
}
