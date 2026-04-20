export interface ToolResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface UiNode {
  text?: string;
  desc?: string;
  res?: string;
  class?: string;
  clickable?: boolean;
  enabled?: boolean;
  bounds?: [number, number, number, number];
}

export interface DeviceInfo {
  width: number;
  height: number;
  density: number;
  orientation: number;
  focusComponent?: string;
}

export interface UiDumpResult {
  xml: string;
  timestamp: number;
}

export interface ScreenshotResult {
  path: string;
  width: number;
  height: number;
}

export interface ActionExpectation {
  textAppears?: string;
  focusChangesTo?: string;
}

export interface ActionVerification {
  timeoutMs?: number;
}

export interface PlanStep {
  action: string;
  params: Record<string, any>;
  expect?: ActionExpectation;
  verify?: ActionVerification;
}