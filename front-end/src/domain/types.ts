import type { LucideIcon } from "lucide-react";

export type PortalNodeKind =
  | "manageLocalNode"
  | "connectRpc"
  | "checkRuntime"
  | "checkAccount"
  | "checkBalance"
  | "exploreMetadata"
  | "dryRunCall"
  | "transactionPreview"
  | "stateDiff"
  | "decodeError"
  | "buildContract"
  | "loadArtifact"
  | "deployContract"
  | "attachContract"
  | "verifyContractLive"
  | "transferPot"
  | "readMessage"
  | "callMessage"
  | "watchEvents"
  | "decodeEvents"
  | "exportWorkflow"
  | "exportCommands"
  | "saveWorkflow"
  | "loadWorkflow"
  | "generateReport";

export type NodeStatus =
  | "idle"
  | "blocked"
  | "ready"
  | "running"
  | "success"
  | "warning"
  | "error";

export type PortalNodeConfig = {
  endpoint?: string;
  seed?: string;
  account?: string;
  recipient?: string;
  fee?: string;
  value?: string;
  action?: string;
  contractDir?: string;
  constructorName?: string;
  constructorArgs?: string;
  message?: string;
  args?: string;
  gasLimit?: string;
  contractAddress?: string;
  metadataPath?: string;
  wasmPath?: string;
  eventName?: string;
  mode?: string;
  target?: string;
};

export type NodeLastRun = {
  startedAt: string;
  endedAt?: string;
  ok: boolean;
  stdout?: string;
  stderr?: string;
  errorCode?: string;
  hints?: string[];
};

export type PortalNodeData = {
  kind: PortalNodeKind;
  label: string;
  description: string;
  command: string;
  status: NodeStatus;
  config: PortalNodeConfig;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  dependsOn: string[];
  lastRun?: NodeLastRun;
} & Record<string, unknown>;

export type XYPosition = {
  x: number;
  y: number;
};

export type PortalFlowNode = {
  id: string;
  type: "portal";
  position: XYPosition;
  selected?: boolean;
  data: PortalNodeData;
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
  className?: string;
  selected?: boolean;
};

export type Connection = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type Template = {
  kind: PortalNodeKind;
  group: "Environment" | "Contract Lifecycle" | "Interaction" | "Utility";
  label: string;
  description: string;
  command: string;
  config: PortalNodeConfig;
  icon: LucideIcon;
};

export type RunLog = {
  id: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
};

export type ApiRunResult = {
  ok?: boolean;
  command?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  code?: number | null;
};

export type HealthState = {
  ok: boolean;
  rpcReachable: boolean;
  contractReachable: boolean;
  artifactsReady: boolean;
  contractAddress: string;
};

export type SnapshotEvent = {
  name: string;
  status: "observed" | "waiting" | "decoded" | "expected";
  detail: string;
};

export type ChainSnapshot = {
  ok: boolean;
  account: {
    account: string;
    token: string;
    freeBalance: string;
    nonce: string;
  };
  contract: {
    address: string;
    reachable: boolean;
    metadataPath: string;
    wasmPath: string;
    messages: string[];
  };
  state: {
    isMember: boolean | null;
    joinedAt: string;
  };
  events: SnapshotEvent[];
};

export type MetadataSummary = {
  constructors: string[];
  messages: string[];
  events: string[];
};

export type Page = "home" | "workbench";

export type Guidance = {
  level: "ready" | "warning" | "blocked";
  title: string;
  items: string[];
};

export type ValidationResult = {
  ok: boolean;
  reasons: string[];
  hints?: string[];
  warnings?: string[];
};

export type WorkflowContext = {
  nodes: PortalFlowNode[];
  edges: Edge[];
  health: HealthState | null;
  snapshot: ChainSnapshot | null;
  previousSnapshot?: ChainSnapshot | null;
  endpoint?: string;
};

export type ExecuteResult = {
  ok: boolean;
  result: ApiRunResult;
  outputs: Record<string, unknown>;
};

export type RunNodeOutcome = {
  ok: boolean;
  status: NodeStatus;
  outputs?: Record<string, unknown>;
  health?: HealthState | null;
  snapshot?: ChainSnapshot | null;
};

export type EvidenceRecord = {
  nodeLabel: string;
  status: NodeStatus;
  endedAt: string;
  fee: string;
  extrinsicHash: string;
  blockHash: string;
  events: string[];
  command: string;
};

export type AiFlowPlanStep = {
  kind: PortalNodeKind;
  config: PortalNodeConfig;
};

export type AiFlowPlan = {
  title: string;
  summary: string;
  steps: AiFlowPlanStep[];
  edges: Array<[PortalNodeKind, PortalNodeKind]>;
  autoRun?: boolean;
};

export type AiPlannerResult = {
  plan: AiFlowPlan | null;
  errors: string[];
  warnings?: string[];
  source?: "openai" | "openrouter" | "gemini" | "local";
  model?: string;
};

export type PendingWriteRun = {
  title: string;
  nodes: PortalFlowNode[];
  endpoint: string;
  commandPreview: string;
  onConfirm: () => void;
};

export type PortalModel = {
  version: "0.1";
  contract: string;
  actors: string[];
  states: Array<{ name: string; type: string }>;
  actions: Array<{ name: string; actor: string; requires?: string; emits?: string }>;
  events: Array<{ name: string; fields: string[] }>;
  workflow: Array<{ id: string; kind: PortalNodeKind; label: string; command: string }>;
};

export type ImportedGraph = {
  nodes: PortalFlowNode[];
  edges: Edge[];
  source: "flow" | "portalModel" | "metadata" | "rust";
};

export type SerializedWorkflow = {
  nodes?: Array<{
    id?: string;
    kind?: PortalNodeKind;
    position?: XYPosition;
    status?: NodeStatus;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    dependsOn?: string[];
    config?: PortalNodeConfig;
    lastRun?: NodeLastRun;
  }>;
  edges?: Array<{
    id?: string;
    source?: string;
    target?: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
};

export type NodeDependencyRule = {
  kinds: PortalNodeKind[];
  mode?: "all" | "any";
  reason: string;
  blocking?: boolean;
};

export type NodeValidationRule = {
  dependencies: NodeDependencyRule[];
  validate?: (node: PortalFlowNode, context: WorkflowContext) => ValidationResult;
};

