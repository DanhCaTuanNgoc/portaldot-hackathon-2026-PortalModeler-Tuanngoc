import {
  ArrowRight,
  Boxes,
  ClipboardList,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  FileCode2,
  GitBranch,
  HardDrive,
  Link2,
  Loader2,
  Play,
  Plus,
  RadioTower,
  Save,
  SearchCheck,
  Server,
  Settings2,
  Shield,
  Sparkles,
  RefreshCcw,
  Trash2,
  UserRound,
  Upload,
  WalletCards,
  Home,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import portalLogo from "./assets/logo_portalmodeler.png";

type PortalNodeKind =
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

type NodeStatus =
  | "idle"
  | "blocked"
  | "ready"
  | "running"
  | "success"
  | "warning"
  | "error";

type PortalNodeConfig = {
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

type NodeLastRun = {
  startedAt: string;
  endedAt?: string;
  ok: boolean;
  stdout?: string;
  stderr?: string;
  errorCode?: string;
  hints?: string[];
};

type PortalNodeData = {
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

type XYPosition = {
  x: number;
  y: number;
};

type PortalFlowNode = {
  id: string;
  type: "portal";
  position: XYPosition;
  selected?: boolean;
  data: PortalNodeData;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
  className?: string;
  selected?: boolean;
};

type Connection = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

type Template = {
  kind: PortalNodeKind;
  group: "Environment" | "Contract Lifecycle" | "Interaction" | "Utility";
  label: string;
  description: string;
  command: string;
  config: PortalNodeConfig;
  icon: typeof Server;
};

type RunLog = {
  id: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
};

type ApiRunResult = {
  ok?: boolean;
  command?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  code?: number | null;
};

type HealthState = {
  ok: boolean;
  rpcReachable: boolean;
  contractReachable: boolean;
  artifactsReady: boolean;
  contractAddress: string;
};

type SnapshotEvent = {
  name: string;
  status: "observed" | "waiting" | "decoded" | "expected";
  detail: string;
};

type ChainSnapshot = {
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

type MetadataSummary = {
  constructors: string[];
  messages: string[];
  events: string[];
};

type Page = "home" | "workbench";

type Guidance = {
  level: "ready" | "warning" | "blocked";
  title: string;
  items: string[];
};

type ValidationResult = {
  ok: boolean;
  reasons: string[];
  hints?: string[];
  warnings?: string[];
};

type WorkflowContext = {
  nodes: PortalFlowNode[];
  edges: Edge[];
  health: HealthState | null;
  snapshot: ChainSnapshot | null;
  previousSnapshot?: ChainSnapshot | null;
  endpoint?: string;
};

type ExecuteResult = {
  ok: boolean;
  result: ApiRunResult;
  outputs: Record<string, unknown>;
};

type RunNodeOutcome = {
  ok: boolean;
  status: NodeStatus;
  outputs?: Record<string, unknown>;
  health?: HealthState | null;
  snapshot?: ChainSnapshot | null;
};

type EvidenceRecord = {
  nodeLabel: string;
  status: NodeStatus;
  endedAt: string;
  fee: string;
  extrinsicHash: string;
  blockHash: string;
  events: string[];
  command: string;
};

type AiFlowPlanStep = {
  kind: PortalNodeKind;
  config: PortalNodeConfig;
};

type AiFlowPlan = {
  title: string;
  summary: string;
  steps: AiFlowPlanStep[];
  edges: Array<[PortalNodeKind, PortalNodeKind]>;
  autoRun?: boolean;
};

type AiPlannerResult = {
  plan: AiFlowPlan | null;
  errors: string[];
  warnings?: string[];
  source?: "openai" | "openrouter" | "gemini" | "local";
  model?: string;
};

type PendingWriteRun = {
  title: string;
  nodes: PortalFlowNode[];
  endpoint: string;
  commandPreview: string;
  onConfirm: () => void;
};

type PortalModel = {
  version: "0.1";
  contract: string;
  actors: string[];
  states: Array<{ name: string; type: string }>;
  actions: Array<{ name: string; actor: string; requires?: string; emits?: string }>;
  events: Array<{ name: string; fields: string[] }>;
  workflow: Array<{ id: string; kind: PortalNodeKind; label: string; command: string }>;
};

type ImportedGraph = {
  nodes: PortalFlowNode[];
  edges: Edge[];
  source: "flow" | "portalModel" | "metadata" | "rust";
};

type SerializedWorkflow = {
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

type NodeDependencyRule = {
  kinds: PortalNodeKind[];
  mode?: "all" | "any";
  reason: string;
  blocking?: boolean;
};

type NodeValidationRule = {
  dependencies: NodeDependencyRule[];
  validate?: (node: PortalFlowNode, context: WorkflowContext) => ValidationResult;
};

const heroVideoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

const heroPartners = ["Portaldot", "Substrate", "ink!", "Vite", "React Flow", "Local Node"];

const advancedConfigKeys = new Set([
  "account",
  "metadataPath",
  "wasmPath",
  "eventName",
  "constructorArgs",
  "args",
  "gasLimit",
  "contractAddress",
  "mode",
  "target",
]);

const browserHelperNodeKinds = new Set<PortalNodeKind>([
  "watchEvents",
  "decodeEvents",
  "exportWorkflow",
  "exportCommands",
  "saveWorkflow",
  "loadWorkflow",
  "generateReport",
]);

const writeTransactionNodeKinds = new Set<PortalNodeKind>([
  "transferPot",
  "deployContract",
  "callMessage",
]);

const templates: Template[] = [
  {
    kind: "manageLocalNode",
    group: "Environment",
    label: "Local Node Manager",
    description: "Show safe start, stop, and status commands for the local Portaldot node",
    command: "portaldot_dev --dev --alice",
    config: { action: "status" },
    icon: RadioTower,
  },
  {
    kind: "connectRpc",
    group: "Environment",
    label: "Connect RPC",
    description: "Validate websocket endpoint and chain access",
    command: "python scripts/doctor.py --url {endpoint}",
    config: { endpoint: "ws://127.0.0.1:9944" },
    icon: Server,
  },
  {
    kind: "checkRuntime",
    group: "Environment",
    label: "Check Runtime",
    description: "Confirm contracts runtime support",
    command: "python scripts/doctor.py --url {endpoint}",
    config: {},
    icon: RadioTower,
  },
  {
    kind: "checkAccount",
    group: "Environment",
    label: "Check Account",
    description: "Signer seed and SS58 account",
    command: "PORTALDOT_SEED={seed}",
    config: { seed: "//Alice", account: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" },
    icon: UserRound,
  },
  {
    kind: "checkBalance",
    group: "Environment",
    label: "Check Balance",
    description: "Read signer balance from System.Account",
    command: "python scripts/query.py --url {endpoint}",
    config: {},
    icon: WalletCards,
  },
  {
    kind: "exploreMetadata",
    group: "Contract Lifecycle",
    label: "Metadata Explorer",
    description: "Parse constructors, messages, and events from ink! metadata",
    command: "inspect metadata {metadataPath}",
    config: { metadataPath: "contract/target/ink/membership.json" },
    icon: FileCode2,
  },
  {
    kind: "transactionPreview",
    group: "Interaction",
    label: "TransactionPreview",
    description: "Estimate fee or dry-run the selected transaction before submission",
    command: "preview {target}",
    config: { target: "transferPot", value: "1000000000000", recipient: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty" },
    icon: SearchCheck,
  },
  {
    kind: "dryRunCall",
    group: "Interaction",
    label: "Dry Run Call",
    description: "Dry-run a payable contract message and capture gas evidence",
    command: "python scripts/call.py --url {endpoint} --action {message} --value {value} --dry-run-only",
    config: { message: "join", value: "100000000000000" },
    icon: ClipboardList,
  },
  {
    kind: "stateDiff",
    group: "Interaction",
    label: "State Diff",
    description: "Compare account and contract state before and after a workflow step",
    command: "portalmodeler diff state",
    config: {},
    icon: GitBranch,
  },
  {
    kind: "decodeError",
    group: "Utility",
    label: "Error Decoder",
    description: "Explain the latest failed node and suggest the next fix",
    command: "portalmodeler decode latest-error",
    config: {},
    icon: Shield,
  },
  {
    kind: "transferPot",
    group: "Interaction",
    label: "Transfer POT",
    description: "Submit a small local POT transfer and show fee evidence",
    command: "python scripts/transfer.py --url {endpoint} --amount {value}",
    config: {
      value: "1000000000000",
      recipient: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    },
    icon: ArrowRight,
  },
  {
    kind: "buildContract",
    group: "Contract Lifecycle",
    label: "Build Contract",
    command: "cd contract && cargo contract build --release",
    description: "Compile the local ink! contract artifacts",
    config: { contractDir: "contract" },
    icon: HardDrive,
  },
  {
    kind: "loadArtifact",
    group: "Contract Lifecycle",
    label: "Load Artifact",
    description: "Load metadata and Wasm without assuming Membership",
    command: "load artifact {metadataPath} {wasmPath}",
    config: {
      metadataPath: "contract/target/ink/membership.json",
      wasmPath: "contract/target/ink/membership.wasm",
    },
    icon: FileCode2,
  },
  {
    kind: "deployContract",
    group: "Contract Lifecycle",
    label: "Deploy Contract",
    description: "Instantiate contract with constructor, value, and gas checks",
    command: "python scripts/deploy.py --url {endpoint} --fee {fee}",
    config: { constructorName: "new", constructorArgs: "{}", fee: "100000000000000", value: "0" },
    icon: Download,
  },
  {
    kind: "attachContract",
    group: "Contract Lifecycle",
    label: "Attach Contract",
    description: "Attach an existing address to loaded metadata",
    command: "attach contract {contractAddress}",
    config: { contractAddress: "" },
    icon: Link2,
  },
  {
    kind: "verifyContractLive",
    group: "Contract Lifecycle",
    label: "Verify Contract",
    description: "Check that the address exists on the current chain",
    command: "python scripts/call.py --url {endpoint} --action join_fee",
    config: {},
    icon: SearchCheck,
  },
  {
    kind: "readMessage",
    group: "Interaction",
    label: "Read Message",
    description: "Run a read-only contract message",
    command: "python scripts/call.py --url {endpoint} --action {message}",
    config: { message: "is_member", args: "{}" },
    icon: SearchCheck,
  },
  {
    kind: "callMessage",
    group: "Interaction",
    label: "Call Message",
    description: "Submit a state-changing contract message",
    command: "python scripts/call.py --url {endpoint} --action {message} --value {value}",
    config: { message: "join", args: "{}", value: "100000000000000", gasLimit: "" },
    icon: Shield,
  },
  {
    kind: "watchEvents",
    group: "Interaction",
    label: "Watch Events",
    description: "Track contract and system events for this address",
    command: "watch events {eventName}",
    config: { eventName: "MemberJoined" },
    icon: RadioTower,
  },
  {
    kind: "decodeEvents",
    group: "Interaction",
    label: "Decode Events",
    description: "Decode observed contract events from metadata",
    command: "decode events from metadata",
    config: {},
    icon: ClipboardList,
  },
  {
    kind: "exportWorkflow",
    group: "Utility",
    label: "Export Workflow",
    description: "Export nodes, edges, configs, and optional outputs",
    command: "portalmodeler export --format json",
    config: {},
    icon: GitBranch,
  },
  {
    kind: "exportCommands",
    group: "Utility",
    label: "Export Commands",
    description: "Generate runnable CLI commands from the board",
    command: "portalmodeler export --format markdown",
    config: {},
    icon: Download,
  },
  {
    kind: "saveWorkflow",
    group: "Utility",
    label: "Save Workflow",
    description: "Save workflow JSON without private seeds by default",
    command: "portalmodeler save workflow",
    config: {},
    icon: Save,
  },
  {
    kind: "loadWorkflow",
    group: "Utility",
    label: "Load Workflow",
    description: "Load a saved workflow JSON",
    command: "portalmodeler load workflow",
    config: {},
    icon: FileText,
  },
  {
    kind: "generateReport",
    group: "Utility",
    label: "Generate Report",
    description: "Create a workflow run summary for sharing",
    command: "portalmodeler report",
    config: {},
    icon: ClipboardList,
  },
];

const flowOrder: PortalNodeKind[] = [
  "manageLocalNode",
  "connectRpc",
  "checkRuntime",
  "checkAccount",
  "checkBalance",
  "transactionPreview",
  "transferPot",
  "buildContract",
  "loadArtifact",
  "exploreMetadata",
  "deployContract",
  "attachContract",
  "verifyContractLive",
  "dryRunCall",
  "callMessage",
  "readMessage",
  "watchEvents",
  "decodeEvents",
  "stateDiff",
  "decodeError",
  "exportWorkflow",
  "exportCommands",
  "saveWorkflow",
  "loadWorkflow",
  "generateReport",
];

type FlowEdgeState = "planned" | "running" | "success" | "error";
type FlowHandleId = "top" | "right" | "bottom" | "left";

const portalNodeSize = { width: 220, height: 160 };
const boardZoom = {
  min: 0.25,
  max: 2.2,
  wheelSpeed: 0.001,
};
const flowHandleIds: FlowHandleId[] = ["top", "right", "bottom", "left"];

function flowEdgeId(source: string, target: string, sourceHandle = "right", targetHandle = "left") {
  return `${source}-${sourceHandle}-${targetHandle}-${target}`;
}

const initialNodes: PortalFlowNode[] = templates.map((template, index) => {
  const flowIndex = flowOrder.indexOf(template.kind);
  const previousKind = flowIndex > 0 ? flowOrder[flowIndex - 1] : undefined;
  const layoutIndex = flowIndex >= 0 ? flowIndex : index;
  return {
    id: template.kind,
    type: "portal",
    position: { x: 80 + (layoutIndex % 5) * 260, y: 80 + Math.floor(layoutIndex / 5) * 190 },
    data: {
      kind: template.kind,
      label: template.label,
      description: template.description,
      command: template.command,
      status: layoutIndex < 2 ? "success" : "ready",
      config: template.config,
      inputs: { ...template.config },
      outputs: {},
      dependsOn: previousKind ? [previousKind] : [],
    },
  };
});

function flowEdgeClass(state: FlowEdgeState) {
  return `flow-edge flow-edge--${state}`;
}

function makeFlowEdge(
  source: string,
  target: string,
  state: FlowEdgeState = "planned",
  sourceHandle: FlowHandleId = "right",
  targetHandle: FlowHandleId = "left",
): Edge {
  return {
    id: flowEdgeId(source, target, sourceHandle, targetHandle),
    source,
    target,
    sourceHandle,
    targetHandle,
    animated: state === "running",
    className: flowEdgeClass(state),
  };
}

function nodeCenter(node: PortalFlowNode) {
  return {
    x: node.position.x + portalNodeSize.width / 2,
    y: node.position.y + portalNodeSize.height / 2,
  };
}

function closestFlowHandles(sourceNode: PortalFlowNode, targetNode: PortalFlowNode) {
  const sourceCenter = nodeCenter(sourceNode);
  const targetCenter = nodeCenter(targetNode);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      sourceHandle: (dx >= 0 ? "right" : "left") as FlowHandleId,
      targetHandle: (dx >= 0 ? "left" : "right") as FlowHandleId,
    };
  }

  return {
    sourceHandle: (dy >= 0 ? "bottom" : "top") as FlowHandleId,
    targetHandle: (dy >= 0 ? "top" : "bottom") as FlowHandleId,
  };
}

function rerouteEdgeToClosestHandles(edge: Edge, nodes: PortalFlowNode[]) {
  const sourceNode = nodes.find((node) => node.id === edge.source);
  const targetNode = nodes.find((node) => node.id === edge.target);

  if (!sourceNode || !targetNode) {
    return edge;
  }

  const { sourceHandle, targetHandle } = closestFlowHandles(sourceNode, targetNode);
  return {
    ...edge,
    id: flowEdgeId(edge.source, edge.target, sourceHandle, targetHandle),
    sourceHandle,
    targetHandle,
  };
}

const initialEdges: Edge[] = flowOrder.slice(0, -1).map((kind) => {
  const targetKind = flowOrder[flowOrder.indexOf(kind) + 1];
  const sourceNode = initialNodes.find((node) => node.id === kind);
  const targetNode = initialNodes.find((node) => node.id === targetKind);
  const handles = sourceNode && targetNode ? closestFlowHandles(sourceNode, targetNode) : undefined;

  return makeFlowEdge(kind, targetKind, "planned", handles?.sourceHandle, handles?.targetHandle);
});

function hydrateCommand(template: string, config: PortalNodeConfig, endpoint = "ws://127.0.0.1:9944") {
  return template
    .replace("{endpoint}", config.endpoint || endpoint)
    .replace("{seed}", config.seed || "//Alice")
    .replace("{fee}", config.fee || "100000000000000")
    .replace("{value}", config.value || "100000000000000")
    .replace("{recipient}", config.recipient || config.account || "<recipient>")
    .replace("{metadataPath}", config.metadataPath || "contract/target/ink/membership.json")
    .replace("{wasmPath}", config.wasmPath || "contract/target/ink/membership.wasm")
    .replace("{contractAddress}", config.contractAddress || "<contract-address>")
    .replace("{eventName}", config.eventName || "MemberJoined")
    .replace("{message}", config.message || config.action || "is_member")
    .replace("{target}", config.target || "transferPot");
}

function safeRustIdent(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const ident = normalized || fallback;
  return /^[a-zA-Z_]/.test(ident) ? ident : `_${ident}`;
}

function titleCaseIdent(value: string, fallback: string) {
  const parts = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const title = parts.map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`).join("");
  return title || fallback;
}

function uniqueByName<T extends { name: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function makeImportedNode(kind: PortalNodeKind, id: string, position: XYPosition, config: PortalNodeConfig = {}, patch: Partial<PortalNodeData> = {}): PortalFlowNode {
  const template = templateForKind(kind);
  if (!template) {
    throw new Error(`Unsupported imported node kind: ${kind}`);
  }

  const nextConfig = { ...template.config, ...config };
  return {
    id,
    type: "portal",
    position,
    selected: false,
    data: {
      kind: template.kind,
      label: template.label,
      description: template.description,
      command: template.command,
      status: "ready",
      config: nextConfig,
      inputs: { ...nextConfig },
      outputs: {},
      dependsOn: [],
      ...patch,
    },
  };
}

function graphToPortalModel(nodes: PortalFlowNode[], edges: Edge[], endpoint?: string): PortalModel {
  const hasContractNodes = nodes.some((node) =>
    ["buildContract", "loadArtifact", "exploreMetadata", "deployContract", "attachContract", "verifyContractLive", "dryRunCall", "callMessage", "readMessage"].includes(node.data.kind),
  );
  const metadataEvents = nodes.flatMap((node) => (Array.isArray(node.data.outputs?.events) ? node.data.outputs.events.map(String) : []));
  const watchedEvents = nodes.map((node) => node.data.config.eventName).filter((value): value is string => Boolean(value));
  const readMessages = nodes
    .filter((node) => node.data.kind === "readMessage")
    .map((node) => node.data.config.message || "read_message");
  const mutatingMessages = nodes
    .filter((node) => node.data.kind === "callMessage" || node.data.kind === "dryRunCall")
    .map((node) => node.data.config.message || "call_message");

  const states = uniqueByName(
    [
      ...readMessages.map((message) => ({ name: safeRustIdent(message, "state"), type: "Unknown" })),
      ...(hasContractNodes
        ? [
            { name: "is_member", type: "Mapping<AccountId,bool>" },
            { name: "joined_at", type: "Mapping<AccountId,Timestamp>" },
          ]
        : []),
    ],
  );

  const actions = uniqueByName(
    [
      ...mutatingMessages.map((message) => ({
        name: safeRustIdent(message, "action"),
        actor: "User",
        requires: message === "join" ? "pay POT" : "configured inputs",
        emits: message === "join" ? "MemberJoined" : undefined,
      })),
      ...(hasContractNodes && mutatingMessages.length === 0
        ? [{ name: "join", actor: "User", requires: "pay POT", emits: "MemberJoined" }]
        : []),
    ],
  );

  const events = uniqueByName(
    [...metadataEvents, ...watchedEvents, ...(hasContractNodes ? ["MemberJoined"] : [])].map((eventName) => ({
      name: titleCaseIdent(eventName.replace(/\(.+\)$/, ""), "WorkflowEvent"),
      fields: eventName.includes("MemberJoined") ? ["account", "joined_at", "paid"] : [],
    })),
  );

  const workflow = workflowSequenceFromGraph(nodes, edges).map((node) => ({
    id: node.id,
    kind: node.data.kind,
    label: node.data.label,
    command: hydrateCommand(node.data.command, node.data.config, endpoint),
  }));

  return {
    version: "0.1",
    contract: hasContractNodes ? "Membership" : "PortalWorkflow",
    actors: ["User", "Admin"],
    states,
    actions,
    events,
    workflow,
  };
}

function renderInkSkeleton(model: PortalModel) {
  const contractName = titleCaseIdent(model.contract, "PortalWorkflow");
  const moduleName = safeRustIdent(contractName, "portal_workflow");
  const states = model.states.length
    ? model.states.map((state) => `        // ${state.name}: ${state.type}`).join("\n")
    : "        // Add generated state fields here.";
  const messages = model.actions.length
    ? model.actions
        .map((action) => {
          const name = safeRustIdent(action.name, "action");
          return `        #[ink(message)]\n        pub fn ${name}(&mut self) {\n            // actor: ${action.actor}\n            // requires: ${action.requires || "configured inputs"}\n            // emits: ${action.emits || "none"}\n            todo!("implement ${name}");\n        }`;
        })
        .join("\n\n")
    : `        #[ink(message)]\n        pub fn run(&mut self) {\n            todo!("implement workflow action");\n        }`;

  return `#![cfg_attr(not(feature = "std"), no_std, no_main)]\n\n#[ink::contract]\nmod ${moduleName} {\n    #[ink(storage)]\n    pub struct ${contractName} {\n${states}\n    }\n\n    impl ${contractName} {\n        #[ink(constructor)]\n        pub fn new() -> Self {\n            Self {}\n        }\n\n${messages}\n    }\n}\n`;
}

function deserializeWorkflowGraph(value: string): ImportedGraph {
  const parsed = JSON.parse(value) as SerializedWorkflow;
  const importedNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const nextNodes = importedNodes
    .map((node, index): PortalFlowNode | null => {
      if (!node.id || !node.kind) {
        return null;
      }
      const template = templateForKind(node.kind);
      if (!template) {
        return null;
      }
      return {
        id: node.id,
        type: "portal",
        position: {
          x: Number.isFinite(node.position?.x) ? Number(node.position?.x) : 90 + index * 260,
          y: Number.isFinite(node.position?.y) ? Number(node.position?.y) : 180,
        },
        selected: false,
        data: {
          kind: template.kind,
          label: template.label,
          description: template.description,
          command: template.command,
          status: node.status || "ready",
          config: { ...template.config, ...(node.config || {}) },
          inputs: node.inputs || {},
          outputs: node.outputs || {},
          dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn : [],
          lastRun: node.lastRun,
        },
      };
    })
    .filter((node): node is PortalFlowNode => Boolean(node));
  const nodeIds = new Set(nextNodes.map((node) => node.id));
  const nextEdges = (Array.isArray(parsed.edges) ? parsed.edges : [])
    .filter((edge) => edge.source && edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) =>
      makeFlowEdge(
        edge.source as string,
        edge.target as string,
        "planned",
        (edge.sourceHandle as FlowHandleId) || undefined,
        (edge.targetHandle as FlowHandleId) || undefined,
      ),
    );

  return { nodes: nextNodes, edges: nextEdges, source: "flow" };
}

function looksLikePortalModel(value: unknown): value is Partial<PortalModel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PortalModel>;
  return Array.isArray(candidate.workflow) || Array.isArray(candidate.actions) || Array.isArray(candidate.states) || Array.isArray(candidate.events);
}

function portalModelToGraph(model: Partial<PortalModel>): ImportedGraph {
  const contractName = model.contract || "PortalModel";
  const baseId = safeRustIdent(contractName, "portal_model");
  const nodes: PortalFlowNode[] = [];

  nodes.push(
    makeImportedNode("loadArtifact", `${baseId}-model`, { x: 90, y: 120 }, {}, {
      label: `${contractName} Model`,
      description: "Imported PortalModel architecture root",
      outputs: {
        contract: contractName,
        actors: model.actors || [],
      },
    }),
  );

  (model.actions || []).forEach((action, index) => {
    nodes.push(
      makeImportedNode("callMessage", `${baseId}-action-${safeRustIdent(action.name, `action_${index}`)}`, { x: 370, y: 80 + index * 170 }, {
        message: action.name,
        value: action.requires?.toLowerCase().includes("pot") ? "100000000000000" : "0",
      }, {
        label: `Action: ${action.name}`,
        description: `${action.actor || "User"} action imported from PortalModel`,
        outputs: {
          actor: action.actor,
          requires: action.requires,
          emits: action.emits,
        },
      }),
    );
  });

  (model.states || []).forEach((state, index) => {
    nodes.push(
      makeImportedNode("readMessage", `${baseId}-state-${safeRustIdent(state.name, `state_${index}`)}`, { x: 650, y: 90 + index * 160 }, {
        message: state.name,
      }, {
        label: `State: ${state.name}`,
        description: `Imported state ${state.type || "Unknown"}`,
        outputs: { stateType: state.type || "Unknown" },
      }),
    );
  });

  (model.events || []).forEach((event, index) => {
    nodes.push(
      makeImportedNode("watchEvents", `${baseId}-event-${safeRustIdent(event.name, `event_${index}`)}`, { x: 930, y: 100 + index * 160 }, {
        eventName: event.name,
      }, {
        label: `Event: ${event.name}`,
        description: "Imported event from PortalModel",
        outputs: { fields: event.fields || [] },
      }),
    );
  });

  const edges = nodes
    .filter((node) => node.id !== `${baseId}-model`)
    .map((node) => {
      const root = nodes[0];
      const handles = closestFlowHandles(root, node);
      return makeFlowEdge(root.id, node.id, "planned", handles.sourceHandle, handles.targetHandle);
    });

  return { nodes, edges, source: "portalModel" };
}

function metadataToGraph(metadata: unknown): ImportedGraph {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Metadata import expects an ink! metadata JSON object.");
  }
  const spec = (metadata as { spec?: unknown }).spec;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("Metadata JSON is missing spec.");
  }

  const metadataSpec = spec as {
    contract?: string;
    constructors?: Array<{ label?: string; args?: Array<{ label?: string }> }>;
    messages?: Array<{ label?: string; mutates?: boolean; payable?: boolean; args?: Array<{ label?: string }> }>;
    events?: Array<{ label?: string; args?: Array<{ label?: string }> }>;
  };
  const baseId = safeRustIdent(metadataSpec.contract || "metadata", "metadata");
  const describeArgs = (args?: Array<{ label?: string }>) => (args || []).map((arg) => arg.label || "arg");
  const nodes: PortalFlowNode[] = [
    makeImportedNode("exploreMetadata", `${baseId}-metadata`, { x: 90, y: 130 }, {}, {
      label: "ink! Metadata",
      description: "Imported constructors, messages, and events from ink! metadata",
      outputs: {
        constructors: (metadataSpec.constructors || []).map((constructor) => constructor.label || "constructor"),
        messages: (metadataSpec.messages || []).map((message) => message.label || "message"),
        events: (metadataSpec.events || []).map((event) => event.label || "event"),
      },
    }),
  ];

  (metadataSpec.constructors || []).forEach((constructor, index) => {
    nodes.push(
      makeImportedNode("deployContract", `${baseId}-constructor-${safeRustIdent(constructor.label || "", `constructor_${index}`)}`, { x: 360, y: 80 + index * 165 }, {
        constructorName: constructor.label || "new",
        constructorArgs: JSON.stringify(describeArgs(constructor.args)),
      }, {
        label: `Constructor: ${constructor.label || "new"}`,
        outputs: { args: describeArgs(constructor.args) },
      }),
    );
  });

  (metadataSpec.messages || []).forEach((message, index) => {
    const kind: PortalNodeKind = message.mutates || message.payable ? "callMessage" : "readMessage";
    nodes.push(
      makeImportedNode(kind, `${baseId}-message-${safeRustIdent(message.label || "", `message_${index}`)}`, { x: 640, y: 80 + index * 165 }, {
        message: message.label || "message",
        value: message.payable ? "100000000000000" : "0",
        args: JSON.stringify(describeArgs(message.args)),
      }, {
        label: `${message.mutates || message.payable ? "Call" : "Read"}: ${message.label || "message"}`,
        description: `${message.payable ? "Payable " : ""}${message.mutates ? "mutating" : "read-only"} message imported from metadata`,
        outputs: {
          mutates: Boolean(message.mutates),
          payable: Boolean(message.payable),
          args: describeArgs(message.args),
        },
      }),
    );
  });

  (metadataSpec.events || []).forEach((event, index) => {
    nodes.push(
      makeImportedNode("watchEvents", `${baseId}-event-${safeRustIdent(event.label || "", `event_${index}`)}`, { x: 920, y: 90 + index * 155 }, {
        eventName: event.label || "event",
      }, {
        label: `Event: ${event.label || "event"}`,
        outputs: { fields: describeArgs(event.args) },
      }),
    );
  });

  const root = nodes[0];
  const edges = nodes.slice(1).map((node) => {
    const handles = closestFlowHandles(root, node);
    return makeFlowEdge(root.id, node.id, "planned", handles.sourceHandle, handles.targetHandle);
  });
  return { nodes, edges, source: "metadata" };
}

function rustSourceToPortalModel(source: string): PortalModel {
  const moduleName = source.match(/#\s*\[\s*ink::contract\s*\]\s*mod\s+([a-zA-Z_][a-zA-Z0-9_]*)/)?.[1];
  const contractName = source.match(/#\s*\[\s*ink\s*\(\s*storage\s*\)\s*\]\s*pub\s+struct\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || titleCaseIdent(moduleName || "ImportedContract", "ImportedContract");
  const storageBody = source.match(/#\s*\[\s*ink\s*\(\s*storage\s*\)\s*\]\s*pub\s+struct\s+[A-Za-z_][A-Za-z0-9_]*\s*\{([\s\S]*?)\n\s*\}/)?.[1] || "";
  const states = uniqueByName(
    [...storageBody.matchAll(/^\s*(?:pub\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([^,\n]+),?/gm)].map((match) => ({
      name: match[1],
      type: match[2].trim(),
    })),
  );

  const events = uniqueByName(
    [...source.matchAll(/#\s*\[\s*ink\s*\(\s*event\s*\)\s*\]\s*pub\s+struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\n\s*\}/g)].map((match) => ({
      name: match[1],
      fields: [...match[2].matchAll(/^\s*(?:#\s*\[\s*ink\s*\(\s*topic\s*\)\s*\]\s*)?(?:pub\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map((field) => field[1]),
    })),
  );

  const messages = [...source.matchAll(/#\s*\[\s*ink\s*\(\s*message([^)]*)\)\s*\]\s*pub\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g)];
  const actions = uniqueByName(
    messages
      .filter((match) => /&mut\s+self/.test(match[3]) || /payable/.test(match[1]))
      .map((match) => ({
        name: match[2],
        actor: "User",
        requires: /payable/.test(match[1]) ? "pay POT" : "configured inputs",
        emits: events.find((event) => source.includes(`emit_event(${event.name}`))?.name,
      })),
  );
  const readStates = messages
    .filter((match) => !/&mut\s+self/.test(match[3]) && !actions.some((action) => action.name === match[2]))
    .map((match) => ({ name: match[2], type: "Read message" }));

  return {
    version: "0.1",
    contract: contractName,
    actors: ["User", "Admin"],
    states: uniqueByName([...states, ...readStates]),
    actions,
    events,
    workflow: [],
  };
}

function importTextToGraph(value: string, filename = ""): ImportedGraph {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Import file is empty.");
  }
  if (filename.toLowerCase().endsWith(".rs") || trimmed.includes("#[ink::contract]") || trimmed.includes("#[ink(message")) {
    return { ...portalModelToGraph(rustSourceToPortalModel(trimmed)), source: "rust" };
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as SerializedWorkflow).nodes)) {
    return deserializeWorkflowGraph(trimmed);
  }
  if (looksLikePortalModel(parsed)) {
    return portalModelToGraph(parsed);
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { spec?: unknown }).spec) {
    return metadataToGraph(parsed);
  }

  throw new Error("Unsupported import format. Use Flow JSON, PortalModel JSON, ink! metadata JSON, or an ink! Rust source file.");
}

function prepareImportedGraph(imported: ImportedGraph, mode: "replace" | "merge", currentNodes: PortalFlowNode[]): ImportedGraph {
  if (mode === "replace") {
    return imported;
  }

  const timestamp = Date.now();
  const existingIds = new Set(currentNodes.map((node) => node.id));
  const idMap = new Map<string, string>();
  imported.nodes.forEach((node) => {
    const nextId = existingIds.has(node.id) ? `import-${timestamp}-${node.id}` : node.id;
    idMap.set(node.id, nextId);
    existingIds.add(nextId);
  });

  const offset = { x: 80 + (currentNodes.length % 4) * 28, y: 80 + (currentNodes.length % 5) * 24 };
  return {
    source: imported.source,
    nodes: imported.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) || node.id,
      selected: false,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      data: {
        ...node.data,
        dependsOn: node.data.dependsOn.map((id) => idMap.get(id) || id),
      },
    })),
    edges: imported.edges
      .map((edge) => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) {
          return null;
        }
        return makeFlowEdge(source, target, "planned", (edge.sourceHandle || "right") as FlowHandleId, (edge.targetHandle || "left") as FlowHandleId);
      })
      .filter((edge): edge is Edge => Boolean(edge)),
  };
}

function downloadTextFile(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function templateForKind(kind: PortalNodeKind) {
  return templates.find((template) => template.kind === kind);
}

function parsePromptAmount(prompt: string) {
  const amountMatch = prompt.match(/(?:amount|value|so luong|số lượng|transfer|send|chuyen|chuyển)\s*(?:pot)?\s*[:=]?\s*([0-9][0-9_,.]*)/i);
  if (!amountMatch) {
    return "1000000000000";
  }

  return amountMatch[1].replace(/[_,.]/g, "");
}

function planWorkflowFromPrompt(prompt: string, currentEndpoint?: string): AiPlannerResult {
  const trimmedPrompt = prompt.trim();
  const errors: string[] = [];

  if (!trimmedPrompt) {
    return { plan: null, errors: ["Enter a prompt before generating a flow."] };
  }

  const normalizedPrompt = trimmedPrompt.toLowerCase();
  const wantsTransfer =
    /\b(transfer|send|pot)\b/i.test(trimmedPrompt) ||
    normalizedPrompt.includes("chuyển") ||
    normalizedPrompt.includes("chuyen") ||
    normalizedPrompt.includes("gui") ||
    normalizedPrompt.includes("gửi");

  if (!wantsTransfer) {
    errors.push("V1 planner only supports Transfer POT workflows.");
  }

  const endpoint = trimmedPrompt.match(/\bwss?:\/\/[^\s,;]+/i)?.[0] || currentEndpoint || "ws://127.0.0.1:9944";
  if (!/^wss?:\/\//i.test(endpoint)) {
    errors.push("RPC endpoint must start with ws:// or wss://.");
  }

  const recipient = trimmedPrompt.match(/\b5[1-9A-HJ-NP-Za-km-z]{20,}\b/)?.[0] || (/\bbob\b/i.test(trimmedPrompt) ? "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty" : "");
  if (!recipient) {
    errors.push("Transfer flow needs a recipient SS58 address that starts with 5.");
  }

  if (errors.length > 0) {
    return { plan: null, errors };
  }

  const amount = parsePromptAmount(trimmedPrompt);
  const steps: AiFlowPlanStep[] = [
    { kind: "connectRpc", config: { endpoint } },
    { kind: "checkAccount", config: { seed: "//Alice", account: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" } },
    { kind: "checkBalance", config: {} },
    { kind: "transferPot", config: { recipient, value: amount } },
  ];

  return {
    plan: {
      title: "Transfer POT flow",
      summary: `Connect to ${endpoint}, verify signer balance, then transfer ${amount} POT units to ${recipient}.`,
      steps,
      edges: [
        ["connectRpc", "checkAccount"],
        ["checkAccount", "checkBalance"],
        ["checkBalance", "transferPot"],
      ],
    },
    errors: [],
  };
}

function buildNodesFromAiPlan(plan: AiFlowPlan, idPrefix = ""): PortalFlowNode[] {
  return plan.steps.map((step, index) => {
    const template = templateForKind(step.kind);
    if (!template) {
      throw new Error(`Unsupported AI node kind: ${step.kind}`);
    }

    const id = idPrefix ? `${idPrefix}-${step.kind}` : step.kind;
    const config = { ...template.config, ...step.config };
    return {
      id,
      type: "portal",
      position: { x: 90 + index * 280, y: 180 },
      data: {
        kind: template.kind,
        label: template.label,
        description: template.description,
        command: template.command,
        status: "ready",
        config,
        inputs: { ...config },
        outputs: {},
        dependsOn: index === 0 ? [] : [idPrefix ? `${idPrefix}-${plan.steps[index - 1].kind}` : plan.steps[index - 1].kind],
      },
    };
  });
}

function buildEdgesFromAiPlan(plan: AiFlowPlan, nodes: PortalFlowNode[], idPrefix = "") {
  return plan.edges.map(([source, target]) => {
    const sourceId = idPrefix ? `${idPrefix}-${source}` : source;
    const targetId = idPrefix ? `${idPrefix}-${target}` : target;
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const targetNode = nodes.find((node) => node.id === targetId);
    const handles = sourceNode && targetNode ? closestFlowHandles(sourceNode, targetNode) : undefined;
    return makeFlowEdge(sourceId, targetId, "planned", handles?.sourceHandle, handles?.targetHandle);
  });
}

type PortalNodeCardProps = {
  node: PortalFlowNode;
  selected: boolean;
  isConnectable: boolean;
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, handle: FlowHandleId) => void;
};

const PortalNodeCard = memo(function PortalNodeCard({
  node,
  selected,
  isConnectable,
  onHandlePointerDown,
}: PortalNodeCardProps) {
  const { data } = node;
  const template = templates.find((item) => item.kind === data.kind) || templates[0];
  const Icon = template.icon;

  return (
    <div className={`portal-node ${selected ? "selected" : ""}`}>
      {flowHandleIds.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`${data.label} ${handle} connector`}
          className={`portal-node__handle portal-node__handle--${handle}`}
          data-node-id={node.id}
          data-flow-handle={handle}
          disabled={!isConnectable}
          onPointerDown={(event) => onHandlePointerDown(event, handle)}
        />
      ))}
      <div className="portal-node__top">
        <span className={`portal-node__icon ${data.status}`}>
          {data.status === "running" ? <Loader2 className="spin" size={18} /> : <Icon size={18} />}
        </span>
        <span className={`portal-node__status ${data.status}`}>{data.status}</span>
      </div>
      <div className="portal-node__title">{data.label}</div>
      <div className="portal-node__description">{data.description}</div>
    </div>
  );
});

type AiFlowModalProps = {
  open: boolean;
  prompt: string;
  result: AiPlannerResult | null;
  needsRunConfirm: boolean;
  generating: boolean;
  replaceBoard: boolean;
  onClose: () => void;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onApply: () => void;
  onApplyAndRun: () => void;
  onConfirmRunChange: (value: boolean) => void;
  onReplaceBoardChange: (value: boolean) => void;
};

function AiFlowModal({
  open,
  prompt,
  result,
  needsRunConfirm,
  generating,
  replaceBoard,
  onClose,
  onPromptChange,
  onGenerate,
  onApply,
  onApplyAndRun,
  onConfirmRunChange,
  onReplaceBoardChange,
}: AiFlowModalProps) {
  if (!open) {
    return null;
  }

  const plan = result?.plan || null;
  const errors = result?.errors || [];
  const warnings = result?.warnings || [];

  return (
    <div className="ai-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="ai-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-flow-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ai-modal__header">
          <div>
            <span className="ai-modal__eyebrow">
              {result?.source === "openai" || result?.source === "openrouter" || result?.source === "gemini"
                ? `${result.source === "gemini" ? "Gemini" : result.source === "openrouter" ? "OpenRouter" : "OpenAI"} planner${result.model ? ` · ${result.model}` : ""}`
                : "Safe planner"}
            </span>
            <h2 id="ai-flow-title">AI Flow Builder</h2>
          </div>
          <button className="icon-button ai-modal__close" type="button" aria-label="Close AI Flow Builder" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="ai-prompt">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Type your prompt here, e.g. 'Transfer 0.001 POT to Bob on my local node'"
          />
        </label>

        <div className="ai-modal__actions">
          <button className="text-button" type="button" onClick={onGenerate} disabled={generating}>
            <Sparkles size={16} />
            {generating ? "Generating..." : "Generate flow"}
          </button>
        </div>

        {errors.length > 0 ? (
          <div className="ai-errors" role="alert">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="ai-warnings" role="status">
            {warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}

        {plan ? (
          <div className="ai-plan-preview">
            <div className="ai-plan-preview__summary">
              <strong>{plan.title}</strong>
              <span>{plan.summary}</span>
            </div>
            <div className="ai-plan-list">
              {plan.steps.map((step, index) => {
                const template = templateForKind(step.kind);
                return (
                  <article key={step.kind} className="ai-plan-step">
                    <span>{index + 1}</span>
                    <div>
                      <strong>{template?.label || step.kind}</strong>
                      <small>{hydrateCommand(template?.command || "", { ...(template?.config || {}), ...step.config })}</small>
                    </div>
                  </article>
                );
              })}
            </div>
            <label className="ai-run-confirm">
              <input
                type="checkbox"
                checked={needsRunConfirm}
                onChange={(event) => onConfirmRunChange(event.target.checked)}
              />
              <span>I understand Apply & run may submit a real local transfer transaction.</span>
            </label>
            <label className="ai-run-confirm">
              <input
                type="checkbox"
                checked={replaceBoard}
                onChange={(event) => onReplaceBoardChange(event.target.checked)}
              />
              <span>Replace the current board instead of appending this AI flow.</span>
            </label>
          </div>
        ) : null}

        <div className="ai-modal__footer">
          <button className="text-button quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="text-button" type="button" onClick={onApply} disabled={!plan}>
            Apply to board
          </button>
          <button className="text-button active-mode" type="button" onClick={onApplyAndRun} disabled={!plan || !needsRunConfirm || !replaceBoard}>
            <Play size={16} />
            Apply & run
          </button>
        </div>
      </section>
    </div>
  );
}

type WriteActionConfirmModalProps = {
  pending: PendingWriteRun | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function WriteActionConfirmModal({ pending, onCancel, onConfirm }: WriteActionConfirmModalProps) {
  if (!pending) {
    return null;
  }

  return (
    <div className="ai-modal-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        className="ai-modal write-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="write-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ai-modal__header">
          <div>
            <span className="ai-modal__eyebrow">Write action</span>
            <h2 id="write-confirm-title">{pending.title}</h2>
          </div>
          <button className="icon-button ai-modal__close" type="button" aria-label="Cancel write action" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="write-confirm-summary">
          <div>
            <span>Endpoint</span>
            <strong>{pending.endpoint}</strong>
          </div>
          <div>
            <span>Write nodes</span>
            <strong>{pending.nodes.map((node) => node.data.label).join(", ")}</strong>
          </div>
        </div>

        <div className="ai-warnings" role="status">
          This action may submit a transaction or instantiate/call a contract on the current local chain. Review the command preview before continuing.
        </div>

        <label className="ai-prompt">
          <span>Command preview</span>
          <pre className="write-confirm-command">{pending.commandPreview}</pre>
        </label>

        <div className="ai-modal__footer">
          <button className="text-button quiet" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="text-button active-mode" type="button" onClick={onConfirm}>
            <Shield size={16} />
            Confirm write
          </button>
        </div>
      </section>
    </div>
  );
}

type LightweightFlowCanvasProps = {
  nodes: PortalFlowNode[];
  edges: Edge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  flowConnectMode: boolean;
  onMoveNodes: (nodeIds: string[], delta: XYPosition) => void;
  onNodeDragEnd: (nodeIds: string[]) => void;
  onSelectNode: (nodeId: string, append: boolean) => void;
  onSelectEdge: (edgeId: string, append: boolean) => void;
  onSelectCanvas: () => void;
  onConnect: (connection: Connection) => void;
  onDropTemplate: (template: Template, position: XYPosition) => void;
};

function handlePoint(node: PortalFlowNode, handle?: string | null) {
  const side = (handle || "right") as FlowHandleId;
  const { x, y } = node.position;

  if (side === "left") {
    return { x, y: y + portalNodeSize.height / 2 };
  }
  if (side === "top") {
    return { x: x + portalNodeSize.width / 2, y };
  }
  if (side === "bottom") {
    return { x: x + portalNodeSize.width / 2, y: y + portalNodeSize.height };
  }
  return { x: x + portalNodeSize.width, y: y + portalNodeSize.height / 2 };
}

function handleVector(handle?: string | null) {
  const side = (handle || "right") as FlowHandleId;

  if (side === "left") {
    return { x: -1, y: 0 };
  }
  if (side === "top") {
    return { x: 0, y: -1 };
  }
  if (side === "bottom") {
    return { x: 0, y: 1 };
  }
  return { x: 1, y: 0 };
}

function edgePath(source: XYPosition, target: XYPosition, sourceHandle?: string | null, targetHandle?: string | null) {
  const sourceVector = handleVector(sourceHandle);
  const targetVector = handleVector(targetHandle);
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const controlDistance = Math.min(180, Math.max(44, distance * 0.34));
  const sourceControl = {
    x: source.x + sourceVector.x * controlDistance,
    y: source.y + sourceVector.y * controlDistance,
  };
  const targetControl = {
    x: target.x + targetVector.x * controlDistance,
    y: target.y + targetVector.y * controlDistance,
  };

  return `M ${source.x} ${source.y} C ${sourceControl.x} ${sourceControl.y}, ${targetControl.x} ${targetControl.y}, ${target.x} ${target.y}`;
}

type ConnectingState = {
  source: string;
  sourceHandle: FlowHandleId;
  target: XYPosition;
};

function LightweightFlowCanvas({
  nodes,
  edges,
  selectedNodeIds,
  selectedEdgeIds,
  flowConnectMode,
  onMoveNodes,
  onNodeDragEnd,
  onSelectNode,
  onSelectEdge,
  onSelectCanvas,
  onConnect,
  onDropTemplate,
}: LightweightFlowCanvasProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ nodeIds: string[]; delta: XYPosition } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    nodeIds: string[];
    origin: XYPosition;
    lastDelta: XYPosition;
  } | null>(null);
  const panRef = useRef<{ pointerId: number; origin: XYPosition; viewport: XYPosition } | null>(null);
  const [viewport, setViewport] = useState({ x: 28, y: 28, zoom: 0.88 });
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function screenToFlow(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  }

  function flushMove() {
    rafRef.current = null;
    const pending = pendingMoveRef.current;
    if (!pending) {
      return;
    }
    pendingMoveRef.current = null;
    onMoveNodes(pending.nodeIds, pending.delta);
  }

  function scheduleMove(nodeIds: string[], delta: XYPosition) {
    pendingMoveRef.current = { nodeIds, delta };
    if (rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(flushMove);
    }
  }

  function startNodeDrag(event: PointerEvent<HTMLDivElement>, nodeId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-flow-handle]")) {
      return;
    }

    const append = event.shiftKey || event.metaKey || event.ctrlKey;
    onSelectNode(nodeId, append);
    const nodeIds = selectedNodeIds.includes(nodeId) && !append ? selectedNodeIds : [nodeId];
    dragRef.current = {
      pointerId: event.pointerId,
      nodeIds,
      origin: { x: event.clientX, y: event.clientY },
      lastDelta: { x: 0, y: 0 },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveNodeDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const nextDelta = {
      x: (event.clientX - drag.origin.x) / viewport.zoom,
      y: (event.clientY - drag.origin.y) / viewport.zoom,
    };
    const frameDelta = {
      x: nextDelta.x - drag.lastDelta.x,
      y: nextDelta.y - drag.lastDelta.y,
    };
    drag.lastDelta = nextDelta;
    scheduleMove(drag.nodeIds, frameDelta);
  }

  function stopNodeDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      flushMove();
    }
    dragRef.current = null;
    onNodeDragEnd(drag.nodeIds);
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    event.preventDefault();
    panRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      viewport: { x: viewport.x, y: viewport.y },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }
    setViewport((current) => ({
      ...current,
      x: pan.viewport.x + event.clientX - pan.origin.x,
      y: pan.viewport.y + event.clientY - pan.origin.y,
    }));
  }

  function stopPan(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }
  }

  const zoomBoard = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const deltaModeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const wheelDeltaX = event.deltaX * deltaModeScale;
    const wheelDeltaY = event.deltaY * deltaModeScale;
    const shouldZoom = event.ctrlKey || event.metaKey || event.altKey;

    if (!shouldZoom) {
      setViewport((current) => ({
        ...current,
        x: current.x - (event.shiftKey ? wheelDeltaY : wheelDeltaX),
        y: current.y - (event.shiftKey ? 0 : wheelDeltaY),
      }));
      return;
    }

    setViewport((current) => {
      const nextZoom = Math.min(boardZoom.max, Math.max(boardZoom.min, current.zoom - wheelDeltaY * boardZoom.wheelSpeed));
      const flow = {
        x: (pointer.x - current.x) / current.zoom,
        y: (pointer.y - current.y) / current.zoom,
      };

      return {
        zoom: nextZoom,
        x: pointer.x - flow.x * nextZoom,
        y: pointer.y - flow.y * nextZoom,
      };
    });
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return;
    }

    const wheelTarget = board.parentElement || board;
    wheelTarget.addEventListener("wheel", zoomBoard, { passive: false });
    return () => wheelTarget.removeEventListener("wheel", zoomBoard);
  }, [zoomBoard]);

  function startConnection(event: PointerEvent<HTMLButtonElement>, nodeId: string, sourceHandle: FlowHandleId) {
    if (!flowConnectMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const sourceNode = nodesById.get(nodeId);
    setConnecting({
      source: nodeId,
      sourceHandle,
      target: sourceNode ? handlePoint(sourceNode, sourceHandle) : screenToFlow(event.clientX, event.clientY),
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveConnection(event: PointerEvent<HTMLDivElement>) {
    if (!connecting) {
      return;
    }
    const pointer = screenToFlow(event.clientX, event.clientY);
    setConnecting((current) => current ? { ...current, target: pointer } : null);
  }

  function finishConnection(event: PointerEvent<HTMLDivElement>) {
    if (!connecting) {
      return;
    }

    const hitTarget = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-node-id][data-flow-handle]");

    if (hitTarget && hitTarget.dataset.nodeId !== connecting.source) {
      onConnect({
        source: connecting.source,
        target: hitTarget.dataset.nodeId || null,
        sourceHandle: connecting.sourceHandle,
        targetHandle: hitTarget.dataset.flowHandle || "left",
      });
    }
    setConnecting(null);
  }

  function dropTemplate(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const templateKind = event.dataTransfer.getData("application/portal-template") as PortalNodeKind;
    const template = templates.find((item) => item.kind === templateKind);
    if (template) {
      onDropTemplate(template, screenToFlow(event.clientX, event.clientY));
    }
  }

  return (
    <div
      ref={boardRef}
      className={`flow-board ${flowConnectMode ? "flow-board--connect" : ""}`}
      onPointerDown={(event) => {
        const interactiveTarget = (event.target as HTMLElement).closest(".flow-board__node, .flow-board__edge");
        if (!interactiveTarget) {
          onSelectCanvas();
          startPan(event);
        }
      }}
      onPointerMove={(event) => {
        movePan(event);
        moveConnection(event);
      }}
      onPointerUp={(event) => {
        stopPan(event);
        finishConnection(event);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={dropTemplate}
    >
      <div
        className="flow-board__grid"
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        }}
      />
      <div
        className="flow-board__world"
        style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})` }}
      >
        <svg className="flow-board__edges" width="2600" height="1200" viewBox="0 0 2600 1200">
          <defs>
            <marker id="flow-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 2 2 L 10 6 L 2 10 z" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) {
              return null;
            }
            const sourcePoint = handlePoint(source, edge.sourceHandle);
            const targetPoint = handlePoint(target, edge.targetHandle);
            return (
              <g
                key={edge.id}
                tabIndex={0}
                role="button"
                aria-label={`Line from ${source.data.label} to ${target.data.label}`}
                className={`flow-board__edge ${edge.className || ""} ${selectedEdgeIds.includes(edge.id) ? "selected" : ""}`}
                onFocus={() => onSelectEdge(edge.id, false)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectEdge(edge.id, event.shiftKey || event.metaKey || event.ctrlKey);
                }}
              >
                <path className="flow-board__edge-hit" d={edgePath(sourcePoint, targetPoint, edge.sourceHandle, edge.targetHandle)} />
                <path
                  className="flow-board__edge-path"
                  d={edgePath(sourcePoint, targetPoint, edge.sourceHandle, edge.targetHandle)}
                  markerEnd="url(#flow-arrow)"
                />
              </g>
            );
          })}
          {connecting ? (
            <path
              className="flow-board__edge-path flow-board__edge-preview"
              d={edgePath(
                handlePoint(nodesById.get(connecting.source)!, connecting.sourceHandle),
                connecting.target,
                connecting.sourceHandle,
                null,
              )}
            />
          ) : null}
        </svg>
        {nodes.map((node) => (
          <div
            key={node.id}
            tabIndex={0}
            role="button"
            aria-label={node.data.label}
            className="flow-board__node"
            style={{ transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)` }}
            onFocus={() => onSelectNode(node.id, false)}
            onPointerDown={(event) => startNodeDrag(event, node.id)}
            onPointerMove={moveNodeDrag}
            onPointerUp={stopNodeDrag}
            onPointerCancel={stopNodeDrag}
          >
            <PortalNodeCard
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              isConnectable={flowConnectMode}
              onHandlePointerDown={(event, handle) => startConnection(event, node.id, handle)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function configEntries(config: PortalNodeConfig) {
  return Object.entries(config).filter(([, value]) => value !== undefined);
}

function orderedSelection(nodes: PortalFlowNode[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return nodes
    .filter((node) => selected.has(node.id))
    .sort((a, b) => flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind));
}

function sortNodesForFallback(nodes: PortalFlowNode[]) {
  return [...nodes].sort((a, b) => {
    const kindOrder = flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id);
  });
}

function workflowSequenceFromGraph(nodes: PortalFlowNode[], edges: Edge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const graphEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  if (graphEdges.length === 0) {
    return sortNodesForFallback(nodes);
  }

  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  graphEdges.forEach((edge) => {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
  });

  const byFallback = sortNodesForFallback(nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const ready = byFallback.filter((node) => incomingCount.get(node.id) === 0);
  const visited = new Set<string>();
  const sequence: PortalFlowNode[] = [];

  while (ready.length > 0) {
    const node = ready.shift();
    if (!node || visited.has(node.id)) {
      continue;
    }

    visited.add(node.id);
    sequence.push(node);

    (outgoing.get(node.id) || []).forEach((targetId) => {
      incomingCount.set(targetId, (incomingCount.get(targetId) || 0) - 1);
      if (incomingCount.get(targetId) === 0) {
        const targetNode = nodeById.get(targetId);
        if (targetNode) {
          ready.push(targetNode);
          ready.sort((a, b) => byFallback.indexOf(a) - byFallback.indexOf(b));
        }
      }
    });
  }

  return [...sequence, ...byFallback.filter((node) => !visited.has(node.id))];
}

function dependencyIdsForNode(node: PortalFlowNode, context: WorkflowContext) {
  const explicit = node.data.dependsOn || [];
  const incoming = context.edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => edge.source);

  return Array.from(new Set([...explicit, ...incoming])).filter((id) =>
    context.nodes.some((candidate) => candidate.id === id),
  );
}

function dependencyOutputsForNode(node: PortalFlowNode, context: WorkflowContext) {
  return dependencyIdsForNode(node, context).reduce<Record<string, unknown>>((outputs, dependencyId) => {
    const dependencyNode = context.nodes.find((candidate) => candidate.id === dependencyId);
    if (!dependencyNode) {
      return outputs;
    }

    return {
      ...outputs,
      [dependencyId]: dependencyNode.data.outputs || {},
    };
  }, {});
}

const workflowValidationRules: Partial<Record<PortalNodeKind, NodeValidationRule>> = {
  manageLocalNode: {
    dependencies: [],
  },
  connectRpc: {
    dependencies: [],
    validate: (node) => {
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (!node.data.config.endpoint) {
        reasons.push("RPC endpoint is required.");
      } else if (!/^wss?:\/\//.test(node.data.config.endpoint)) {
        reasons.push("RPC endpoint must start with ws:// or wss://.");
      } else if (!isLocalEndpoint(node.data.config.endpoint)) {
        warnings.push("Connected endpoint is not the default local profile.");
      }

      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  checkRuntime: {
    dependencies: [{ kinds: ["connectRpc"], reason: "Check Runtime requires a successful Connect RPC node." }],
  },
  checkAccount: {
    dependencies: [],
    validate: (node) => {
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (!node.data.config.seed && !node.data.config.account) {
        reasons.push("A seed or selected account is required.");
      }
      if (node.data.config.account && node.data.config.account.length < 32) {
        warnings.push("Selected account looks shorter than an SS58 address.");
      }

      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  checkBalance: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Check Balance requires a successful Connect RPC node." },
      { kinds: ["checkAccount"], reason: "Check Balance requires a successful Check Account node." },
    ],
  },
  exploreMetadata: {
    dependencies: [
      {
        kinds: ["buildContract", "loadArtifact"],
        mode: "any",
        reason: "Metadata Explorer works best after Build Contract or Load Artifact.",
        blocking: false,
      },
    ],
    validate: (node, context) => {
      const warnings: string[] = [];
      const reasons: string[] = [];
      if (!node.data.config.metadataPath) {
        reasons.push("Metadata JSON path is required.");
      }
      if (!context.health?.artifactsReady) {
        warnings.push("Metadata may be missing. Build the contract or point this node at a metadata JSON file.");
      }
      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  transactionPreview: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Transaction Preview requires a successful Connect RPC node." },
      { kinds: ["checkAccount"], reason: "Transaction Preview requires a successful Check Account node." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const hints: string[] = [];
      if (!context.health?.rpcReachable) {
        reasons.push("RPC endpoint is offline.");
      }
      if ((node.data.config.target || "transferPot") === "transferPot" && !isNumericString(node.data.config.value)) {
        reasons.push("Transfer preview amount must be a base-unit integer.");
      }
      if ((node.data.config.target || "transferPot") === "callMessage" && !node.data.config.message) {
        reasons.push("Contract call preview needs a message.");
      }
      hints.push("Preview nodes estimate or dry-run only; they do not submit state changes.");
      return { ok: reasons.length === 0, reasons, hints };
    },
  },
  dryRunCall: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Dry Run Call requires a successful Connect RPC node." },
      { kinds: ["loadArtifact"], reason: "Dry Run Call requires loaded metadata." },
      { kinds: ["deployContract", "attachContract", "verifyContractLive"], mode: "any", reason: "Dry Run Call requires a live deployed or attached contract." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const warnings: string[] = [];
      if (!context.health?.contractReachable) {
        reasons.push("A live contract address is required on the current chain.");
      }
      if ((node.data.config.message || "join") !== "join") {
        warnings.push("The current Python call script can dry-run the Membership join message. Other messages are metadata-visible but not executable yet.");
      }
      if (!isNumericString(node.data.config.value)) {
        reasons.push("Dry-run value must be a base-unit integer.");
      }
      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  stateDiff: { dependencies: [] },
  decodeError: { dependencies: [] },
  transferPot: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Transfer POT requires a successful Connect RPC node." },
      { kinds: ["checkAccount"], reason: "Transfer POT requires a successful Check Account node." },
      { kinds: ["checkBalance"], reason: "Transfer POT requires a successful Check Balance node." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const hints: string[] = [];

      if (!context.health?.rpcReachable) {
        reasons.push("RPC endpoint is offline.");
        hints.push("Start the local node at ws://127.0.0.1:9944, then refresh local health.");
      }
      if (!isNumericString(node.data.config.value)) {
        reasons.push("Transfer amount must be a base-unit integer.");
      }
      if (!node.data.config.recipient) {
        reasons.push("Recipient account is required.");
      }
      if (!context.snapshot?.account.freeBalance) {
        hints.push("Run Check Balance first so fee and balance evidence are visible.");
      }

      return { ok: reasons.length === 0, reasons, hints };
    },
  },
  buildContract: {
    dependencies: [],
    validate: (node) => {
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (!node.data.config.contractDir) {
        reasons.push("Contract directory is required.");
      } else if (!["contract", "./contract"].includes(node.data.config.contractDir)) {
        warnings.push("Contract directory is custom. Build may fail if Cargo.toml is not present there.");
      }

      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  loadArtifact: {
    dependencies: [
      {
        kinds: ["buildContract"],
        mode: "any",
        reason: "Load Artifact needs a successful Build Contract node or explicit metadata/Wasm paths.",
        blocking: false,
      },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (!node.data.config.metadataPath) {
        reasons.push("Metadata JSON path is required.");
      }
      if (!node.data.config.wasmPath) {
        reasons.push("Wasm path is required.");
      }
      if (!context.health?.artifactsReady) {
        warnings.push("Artifact files are not marked ready yet. Run Load Artifact to verify paths.");
      }

      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  deployContract: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Deploy Contract requires a successful Connect RPC node." },
      { kinds: ["checkAccount"], reason: "Deploy Contract requires a successful Check Account node." },
      { kinds: ["checkBalance"], reason: "Deploy Contract requires a successful Check Balance node." },
      { kinds: ["loadArtifact"], reason: "Deploy Contract requires a successful Load Artifact node." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const hints: string[] = [];

      if (!context.health?.rpcReachable) {
        reasons.push("RPC endpoint is offline.");
        hints.push("Start the local node at ws://127.0.0.1:9944, then refresh local health.");
      }
      if (!context.health?.artifactsReady) {
        reasons.push("Contract metadata and Wasm artifacts are missing.");
        hints.push("Build the contract first with cargo contract build --release.");
      }
      if (!node.data.config.constructorName) {
        reasons.push("Constructor must be selected.");
      }
      if (!isNumericString(node.data.config.fee)) {
        reasons.push("Join fee must be a base-unit integer.");
      }
      if (node.data.config.value && !isNumericString(node.data.config.value)) {
        reasons.push("Deployment value/endowment must be a base-unit integer.");
      }

      return { ok: reasons.length === 0, reasons, hints };
    },
  },
  attachContract: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Attach Contract requires a successful Connect RPC node." },
      { kinds: ["loadArtifact"], reason: "Attach Contract requires loaded metadata." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (!node.data.config.contractAddress && !context.health?.contractAddress) {
        reasons.push("Contract address is required before attaching.");
      }
      if (!context.health?.artifactsReady) {
        reasons.push("Metadata must be loaded before attaching an existing contract.");
      }
      if (context.health?.contractAddress && !context.health.contractReachable) {
        warnings.push("Address exists locally but is not live on the current chain.");
      }

      return { ok: reasons.length === 0, reasons, warnings };
    },
  },
  verifyContractLive: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Verify Contract requires a successful Connect RPC node." },
      { kinds: ["deployContract", "attachContract"], mode: "any", reason: "Verify Contract requires Deploy Contract or Attach Contract first." },
    ],
  },
  readMessage: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Read Message requires a successful Connect RPC node." },
      { kinds: ["loadArtifact"], reason: "Read Message requires loaded metadata." },
      { kinds: ["deployContract", "attachContract", "verifyContractLive"], mode: "any", reason: "Read Message requires a live deployed or attached contract." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];

      if (!context.health?.contractReachable) {
        reasons.push("A live contract address is required on the current chain.");
      }
      if (!node.data.config.message) {
        reasons.push("Read message must be selected.");
      }

      return { ok: reasons.length === 0, reasons };
    },
  },
  callMessage: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Call Message requires a successful Connect RPC node." },
      { kinds: ["loadArtifact"], reason: "Call Message requires loaded metadata." },
      { kinds: ["checkBalance"], reason: "Call Message requires a successful Check Balance node." },
      { kinds: ["deployContract", "attachContract", "verifyContractLive"], mode: "any", reason: "Call Message requires a live deployed or attached contract." },
    ],
    validate: (node, context) => {
      const reasons: string[] = [];
      const hints: string[] = [];
      const warnings: string[] = [];

      if (!context.health?.contractReachable) {
        reasons.push("A live contract address is required on the current chain.");
      }
      if (!node.data.config.message) {
        reasons.push("Call message must be selected.");
      }
      if (!isNumericString(node.data.config.value)) {
        reasons.push("Transaction value must be a base-unit integer.");
      }
      if (context.snapshot?.state.isMember && (node.data.config.message || "join") === "join") {
        warnings.push("Signer is already a member. The backend will skip join() to avoid an expected assertion.");
      }
      if (!context.snapshot?.account.freeBalance) {
        hints.push("Account balance could not be read. Run Check Balance before submitting a transaction.");
      }

      return { ok: reasons.length === 0, reasons, hints, warnings };
    },
  },
  watchEvents: {
    dependencies: [
      { kinds: ["connectRpc"], reason: "Watch Events requires a successful Connect RPC node." },
      { kinds: ["deployContract", "attachContract", "verifyContractLive"], mode: "any", reason: "Watch Events works best after a contract is deployed or attached.", blocking: false },
    ],
    validate: (_node, context) => {
      const warnings: string[] = [];

      if (!context.health?.contractReachable) {
        warnings.push("No live contract address yet. Event watcher will show expected events only.");
      }

      return { ok: true, reasons: [], warnings };
    },
  },
  decodeEvents: {
    dependencies: [
      { kinds: ["loadArtifact"], reason: "Decode Events requires loaded metadata." },
      { kinds: ["watchEvents"], reason: "Decode Events requires Watch Events output.", blocking: false },
    ],
  },
  exportWorkflow: { dependencies: [] },
  exportCommands: { dependencies: [] },
  saveWorkflow: { dependencies: [] },
  loadWorkflow: { dependencies: [] },
  generateReport: { dependencies: [] },
};

function nodeByKind(context: WorkflowContext, kind: PortalNodeKind) {
  return context.nodes.find((candidate) => candidate.data.kind === kind);
}

function nodeSucceeded(node?: PortalFlowNode) {
  return Boolean(node && (node.data.status === "success" || node.data.status === "warning"));
}

function validateDependencyRule(rule: NodeDependencyRule, context: WorkflowContext) {
  const mode = rule.mode || "all";
  const matched = rule.kinds.map((kind) => nodeByKind(context, kind));
  const ok =
    mode === "any"
      ? matched.some((node) => nodeSucceeded(node))
      : matched.every((node) => nodeSucceeded(node));

  return {
    ok,
    message: rule.reason,
    blocking: rule.blocking !== false,
  };
}

function executableNodeKinds() {
  return new Set<PortalNodeKind>([
    "manageLocalNode",
    "connectRpc",
    "checkRuntime",
    "checkAccount",
    "checkBalance",
    "exploreMetadata",
    "transactionPreview",
    "dryRunCall",
    "stateDiff",
    "decodeError",
    "transferPot",
    "buildContract",
    "loadArtifact",
    "deployContract",
    "attachContract",
    "verifyContractLive",
    "readMessage",
    "callMessage",
    "watchEvents",
    "decodeEvents",
    "exportWorkflow",
    "exportCommands",
    "saveWorkflow",
    "loadWorkflow",
    "generateReport",
  ]);
}

function preflightValidate(node: PortalFlowNode, context: WorkflowContext): ValidationResult {
  const reasons: string[] = [];
  const hints: string[] = [];
  const warnings: string[] = [];
  const rule = workflowValidationRules[node.data.kind];
  const dependencies = dependencyIdsForNode(node, context)
    .map((dependencyId) => context.nodes.find((candidate) => candidate.id === dependencyId))
    .filter(Boolean) as PortalFlowNode[];

  dependencies.forEach((dependency) => {
    if (dependency.data.status === "error") {
      reasons.push(`${dependency.data.label} failed. Fix it before running ${node.data.label}.`);
    } else if (dependency.data.status === "blocked") {
      reasons.push(`${dependency.data.label} is blocked. Complete its missing inputs first.`);
    } else if (dependency.data.status !== "success" && dependency.data.status !== "warning") {
      reasons.push(`${dependency.data.label} has not produced a successful output yet.`);
    }
  });

  if (!executableNodeKinds().has(node.data.kind)) {
    reasons.push(`${node.data.kind} is not supported by the safe runner.`);
  }

  rule?.dependencies.forEach((dependencyRule) => {
    const result = validateDependencyRule(dependencyRule, context);
    if (result.ok) {
      return;
    }

    if (result.blocking) {
      reasons.push(result.message);
    } else {
      warnings.push(result.message);
    }
  });

  const ruleValidation = rule?.validate?.(node, context);
  if (ruleValidation) {
    reasons.push(...ruleValidation.reasons);
    hints.push(...(ruleValidation.hints || []));
    warnings.push(...(ruleValidation.warnings || []));
  }

  return { ok: reasons.length === 0, reasons, hints, warnings };
}

function collectNodeOutputs(node: PortalFlowNode, result: ApiRunResult, context: WorkflowContext) {
  const outputs: Record<string, unknown> = {
    command: result.command || hydrateCommand(node.data.command, node.data.config, context.endpoint),
    stdout: result.stdout || "",
  };

  if (node.data.kind === "manageLocalNode") {
    outputs.action = node.data.config.action || "status";
    outputs.endpoint = context.endpoint || "ws://127.0.0.1:9944";
  }
  if (node.data.kind === "connectRpc") {
    outputs.endpoint = node.data.config.endpoint || context.endpoint || "ws://127.0.0.1:9944";
    outputs.rpcReachable = Boolean(result.ok);
  }
  if (node.data.kind === "checkRuntime") {
    outputs.endpoint = context.endpoint || "ws://127.0.0.1:9944";
    outputs.rpcReachable = Boolean(result.ok);
    outputs.contractsPalletAvailable = Boolean(result.ok);
  }
  if (node.data.kind === "checkAccount") {
    outputs.seed = node.data.config.seed || "//Alice";
    outputs.address = node.data.config.account || "";
  }
  if (node.data.kind === "checkBalance") {
    outputs.freeBalance = context.snapshot?.account.freeBalance || "";
    outputs.tokenSymbol = context.snapshot?.account.token || "";
    outputs.nonce = context.snapshot?.account.nonce || "";
  }
  if (node.data.kind === "exploreMetadata") {
    const parsed = parseMetadataSummary(result.stdout || "");
    outputs.constructors = parsed.constructors;
    outputs.messages = parsed.messages;
    outputs.events = parsed.events;
  }
  if (node.data.kind === "transactionPreview") {
    outputs.target = node.data.config.target || "transferPot";
    outputs.estimatedFee = (result.stdout || "").match(/Estimated fee:\s*(.+)/)?.[1] || "";
    outputs.gasRequired = (result.stdout || "").match(/Dry-run gas required:\s*(.+)/)?.[1] || "";
  }
  if (node.data.kind === "dryRunCall") {
    outputs.message = node.data.config.message || "join";
    outputs.value = node.data.config.value || "0";
    outputs.gasRequired = (result.stdout || "").match(/Dry-run gas required:\s*(.+)/)?.[1] || "";
  }
  if (node.data.kind === "transferPot") {
    outputs.recipient = node.data.config.recipient || "";
    outputs.value = node.data.config.value || "";
    outputs.fee = (result.stdout || "").match(/Estimated fee:\s*(.+)/)?.[1] || "";
    outputs.extrinsicHash = (result.stdout || "").match(/Extrinsic:\s*(.+)/)?.[1] || "";
    outputs.blockHash = (result.stdout || "").match(/Block hash:\s*(.+)/)?.[1] || "";
    outputs.events = parseReceiptEvents(result.stdout || "");
  }
  if (node.data.kind === "buildContract") {
    outputs.metadataPath = "contract/target/ink/membership.json";
    outputs.wasmPath = "contract/target/ink/membership.wasm";
    outputs.contractBundlePath = "contract/target/ink/membership.contract";
    outputs.buildLog = result.stdout || result.stderr || "";
  }
  if (node.data.kind === "loadArtifact") {
    outputs.metadataPath = node.data.config.metadataPath || "contract/target/ink/membership.json";
    outputs.wasmPath = node.data.config.wasmPath || "contract/target/ink/membership.wasm";
    outputs.messages = context.snapshot?.contract.messages || [];
  }
  if (node.data.kind === "deployContract" || node.data.kind === "attachContract" || node.data.kind === "verifyContractLive") {
    outputs.contractAddress = context.health?.contractAddress || "";
    outputs.contractReachable = Boolean(context.health?.contractReachable);
    outputs.gasRequired = (result.stdout || "").match(/Dry-run gas_required:\s*(.+)/)?.[1] || "";
    outputs.storageDeposit = (result.stdout || "").match(/Dry-run storage_deposit:\s*(.+)/)?.[1] || "";
    outputs.extrinsicHash = (result.stdout || "").match(/Extrinsic:\s*(.+)/)?.[1] || "";
    outputs.events = parseReceiptEvents(result.stdout || "");
  }
  if (node.data.kind === "callMessage") {
    outputs.message = node.data.config.message || "join";
    outputs.value = node.data.config.value || "0";
    outputs.gasRequired = (result.stdout || "").match(/Dry-run gas required:\s*(.+)/)?.[1] || "";
    outputs.extrinsicHash = (result.stdout || "").match(/Extrinsic:\s*(.+)/)?.[1] || "";
    outputs.events = parseReceiptEvents(result.stdout || "");
  }
  if (node.data.kind === "readMessage") {
    outputs.message = node.data.config.message || "is_member";
    outputs.decodedValue = context.snapshot?.state.isMember ?? null;
  }
  if (node.data.kind === "watchEvents" || node.data.kind === "decodeEvents") {
    outputs.eventTimeline = context.snapshot?.events || [];
  }
  if (node.data.kind === "stateDiff") {
    outputs.diff = buildStateDiff(context.snapshot, context.previousSnapshot as ChainSnapshot | null | undefined);
  }
  if (node.data.kind === "decodeError") {
    outputs.explanation = decodeLatestRunError(context.nodes);
  }

  return outputs;
}

function parseMetadataSummary(stdout: string): MetadataSummary {
  try {
    const marker = "Metadata summary JSON:";
    const jsonText = stdout.includes(marker) ? stdout.slice(stdout.indexOf(marker) + marker.length).trim() : stdout.trim();
    const parsed = JSON.parse(jsonText) as Partial<MetadataSummary>;
    return {
      constructors: parsed.constructors || [],
      messages: parsed.messages || [],
      events: parsed.events || [],
    };
  } catch {
    return { constructors: [], messages: [], events: [] };
  }
}

function buildStateDiff(current?: ChainSnapshot | null, previous?: ChainSnapshot | null) {
  if (!current) {
    return ["Snapshot is not loaded yet."];
  }

  const rows = [
    ["account.freeBalance", previous?.account.freeBalance || "unknown", current.account.freeBalance || "unknown"],
    ["account.nonce", previous?.account.nonce || "unknown", current.account.nonce || "unknown"],
    ["contract.reachable", previous?.contract.reachable === undefined ? "unknown" : String(previous.contract.reachable), String(current.contract.reachable)],
    ["state.isMember", previous?.state.isMember === undefined ? "unknown" : String(previous.state.isMember), String(current.state.isMember)],
    ["state.joinedAt", previous?.state.joinedAt || "unknown", current.state.joinedAt || "unknown"],
  ];

  return rows.map(([label, before, after]) => `${label}: ${before} -> ${after}`);
}

function parseReceiptEvents(stdout: string) {
  const lines = stdout.split(/\r?\n/);
  const eventStart = lines.findIndex((line) => line.trim() === "Events:");
  if (eventStart >= 0) {
    return lines
      .slice(eventStart + 1)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2));
  }

  const contractMatch = stdout.match(/Contract events:\s*(\[[\s\S]*?\])\s*(?:\n[A-Z][^:\n]+:|$)/);
  if (!contractMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(contractMatch[1]) as unknown[];
    return parsed.map((event) => JSON.stringify(event));
  } catch {
    return contractMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
}

function outputString(outputs: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = outputs[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function evidenceFromNodes(nodes: PortalFlowNode[], endpoint?: string): EvidenceRecord[] {
  return nodes
    .map((node) => {
      const outputs = node.data.outputs || {};
      const stdout = typeof outputs.stdout === "string" ? outputs.stdout : node.data.lastRun?.stdout || "";
      const events = [
        ...parseReceiptEvents(stdout),
        ...(Array.isArray(outputs.eventTimeline)
          ? outputs.eventTimeline.map((event) => {
              if (event && typeof event === "object" && "name" in event) {
                const typedEvent = event as SnapshotEvent;
                return `${typedEvent.status}: ${typedEvent.name} - ${typedEvent.detail}`;
              }
              return String(event);
            })
          : []),
        ...(Array.isArray(outputs.events) ? outputs.events.map(String) : []),
      ].filter(Boolean);

      return {
        nodeLabel: node.data.label,
        status: node.data.status,
        endedAt: node.data.lastRun?.endedAt || node.data.lastRun?.startedAt || "",
        fee: outputString(outputs, ["estimatedFee", "fee"]),
        extrinsicHash: outputString(outputs, ["extrinsicHash"]),
        blockHash: outputString(outputs, ["blockHash"]),
        events: Array.from(new Set(events)).slice(0, 8),
        command: outputString(outputs, ["command"]) || hydrateCommand(node.data.command, node.data.config, endpoint),
      };
    })
    .filter((record) => record.fee || record.extrinsicHash || record.blockHash || record.events.length > 0);
}

function renderEvidenceReport(records: EvidenceRecord[], snapshot: ChainSnapshot | null, endpoint?: string) {
  const evidenceRows = records.length
    ? records
        .map((record, index) => {
          const events = record.events.length ? record.events.map((event) => `  - ${event}`).join("\n") : "  - none captured";
          return [
            `### ${index + 1}. ${record.nodeLabel}`,
            `- Status: ${record.status}`,
            `- Finished: ${record.endedAt || "not recorded"}`,
            `- Command: \`${record.command}\``,
            `- Fee estimate: ${record.fee || "not captured"}`,
            `- Extrinsic hash: ${record.extrinsicHash || "not captured"}`,
            `- Block hash: ${record.blockHash || "not captured"}`,
            "- Events:",
            events,
          ].join("\n");
        })
        .join("\n\n")
    : "No fee, extrinsic, block, or event evidence has been captured yet.";

  return [
    "# PortalModeler Evidence Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Endpoint: ${endpoint || "ws://127.0.0.1:9944"}`,
    "",
    "## Snapshot",
    "",
    `- Account: ${snapshot?.account.account || "unknown"}`,
    `- Balance: ${snapshot?.account.freeBalance || "not loaded"}`,
    `- Contract: ${snapshot?.contract.address || "not deployed"}`,
    `- Contract reachable: ${snapshot ? String(snapshot.contract.reachable) : "unknown"}`,
    `- is_member: ${snapshot?.state.isMember === undefined || snapshot?.state.isMember === null ? "unknown" : String(snapshot.state.isMember)}`,
    `- joined_at: ${snapshot?.state.joinedAt || "not joined"}`,
    "",
    "## Evidence",
    "",
    evidenceRows,
    "",
  ].join("\n");
}

function decodeLatestRunError(nodes: PortalFlowNode[]) {
  const failed = [...nodes].reverse().find((node) => node.data.status === "error" || node.data.status === "blocked");
  if (!failed) {
    return "No failed or blocked node found on the board.";
  }

  const text = [failed.data.lastRun?.stdout, failed.data.lastRun?.stderr, ...(failed.data.lastRun?.hints || [])].filter(Boolean).join("\n");
  const hints = explainRunIssue({ stdout: failed.data.lastRun?.stdout, stderr: failed.data.lastRun?.stderr });
  return [
    `Latest issue: ${failed.data.label} (${failed.data.status})`,
    text || "No stderr/stdout was captured for this node.",
    ...hints.map((hint) => `Suggested fix: ${hint}`),
  ].join("\n");
}

function postValidate(node: PortalFlowNode, executeResult: ExecuteResult, context: WorkflowContext): ValidationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!executeResult.ok) {
    reasons.push(`${node.data.label} executed but returned a failure.`);
  }

  if (executeResult.ok && node.data.kind === "connectRpc" && !executeResult.outputs.rpcReachable) {
    reasons.push("RPC did not become reachable after Chain Connect.");
  }
  if (executeResult.ok && node.data.kind === "deployContract" && context.health?.contractAddress && !context.health.contractReachable) {
    warnings.push("A contract address exists, but it may be stale for the current chain.");
  }
  if (executeResult.ok && node.data.kind === "transferPot" && !String(executeResult.result.stdout || "").includes("ExtrinsicSuccess")) {
    warnings.push("Transfer completed, but ExtrinsicSuccess was not found in the captured output.");
  }

  return { ok: reasons.length === 0, reasons, warnings };
}

function isNumericString(value?: string) {
  return Boolean(value && /^\d+$/.test(value));
}

function isLocalEndpoint(endpoint?: string) {
  return Boolean(endpoint?.startsWith("ws://127.0.0.1") || endpoint?.startsWith("ws://localhost"));
}

function explainRunIssue(result: ApiRunResult) {
  const text = [result.stdout, result.stderr, result.error].filter(Boolean).join("\n");
  const hints: string[] = [];

  if (/not reachable|ECONNREFUSED|Connection refused|offline/i.test(text)) {
    hints.push("Local RPC is not reachable. Start the contracts node and keep it running on ws://127.0.0.1:9944.");
  }
  if (/No contract found|not found on chain/i.test(text)) {
    hints.push("The contract address is stale for this --tmp chain. Run Deploy Membership again.");
  }
  if (/missing.*metadata|missing.*wasm|No .*artifact/i.test(text)) {
    hints.push("Contract artifacts are missing. Build the contract before deploying.");
  }
  if (/already a member/i.test(text)) {
    hints.push("The signer has already joined. You can continue to state reads.");
  }
  if (/dry-run gas unavailable|ContractsApi\.instantiate|Enum type mapping/i.test(text)) {
    hints.push("Gas dry-run is unavailable for this runtime. The deploy script falls back to explicit gas flags.");
  }
  if (/insufficient|balance/i.test(text)) {
    hints.push("Check the account balance and transferred value before running payable calls.");
  }

  return hints;
}

function nodeGuidance(
  node: PortalFlowNode,
  health: HealthState | null,
  snapshot: ChainSnapshot | null,
  endpoint = "ws://127.0.0.1:9944",
): Guidance {
  const items: string[] = [];
  let level: Guidance["level"] = "ready";

  if (!isLocalEndpoint(endpoint)) {
    level = "warning";
    items.push("This endpoint is not the default local profile. Avoid mainnet while learning or testing.");
  }

  if (node.data.kind !== "connectRpc" && health && !health.rpcReachable) {
    level = "blocked";
    items.push("RPC is offline. Run the local contracts node before executing this node.");
  }

  if (node.data.kind === "deployContract") {
    if (!health?.artifactsReady) {
      level = "blocked";
      items.push("Contract artifacts are missing. Build or load artifacts first.");
    }
    if (!isNumericString(node.data.config.fee)) {
      level = "blocked";
      items.push("Join fee must be a base-unit integer.");
    }
  }

  if (node.data.kind === "callMessage") {
    if (!health?.contractReachable) {
      level = "blocked";
      items.push("No live contract is reachable on this chain. Deploy or attach first.");
    }
    if (!isNumericString(node.data.config.value)) {
      level = "blocked";
      items.push("Transaction value must be a base-unit integer.");
    }
    if (snapshot?.state.isMember) {
      level = "warning";
      items.push("Signer is already a member. The demo runner will skip join() to avoid an expected assertion.");
    }
  }

  if (["verifyContractLive", "readMessage", "watchEvents", "decodeEvents"].includes(node.data.kind) && health && !health.contractReachable) {
    level = "blocked";
    items.push("State and events need a live contract address. Deploy or attach a contract first.");
  }

  if (items.length === 0) {
    items.push("This node is ready with the local beginner-safe defaults.");
  }

  return {
    level,
    title: level === "blocked" ? "Action needed" : level === "warning" ? "Check before running" : "Ready to run",
    items,
  };
}

function useRevealOnScroll() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".reveal-section"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
}

function PortalModelerBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`} aria-label="PortalModeler">
      <img className="brand-mark__symbol" src={portalLogo} alt="" aria-hidden="true" />
      {!compact && (
        <strong className="brand-mark__word">
          Portal<span>Modeler</span>
        </strong>
      )}
    </div>
  );
}

function HomePage({ onOpenWorkbench }: { onOpenWorkbench: () => void }) {
  useRevealOnScroll();
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) {
      return;
    }

    let animationFrame = 0;
    let replayTimer = 0;
    const fadeSeconds = 0.5;

    function updateOpacity() {
      if (video.duration && Number.isFinite(video.duration)) {
        const remaining = video.duration - video.currentTime;
        let opacity = 1;

        if (video.currentTime < fadeSeconds) {
          opacity = video.currentTime / fadeSeconds;
        } else if (remaining < fadeSeconds) {
          opacity = Math.max(0, remaining / fadeSeconds);
        }

        video.style.opacity = String(opacity);
      }

      animationFrame = window.requestAnimationFrame(updateOpacity);
    }

    function replayVideo() {
      video.style.opacity = "0";
      video.currentTime = 0;
      replayTimer = window.setTimeout(() => {
        void video.play();
      }, 100);
    }

    video.style.opacity = "0";
    video.addEventListener("ended", replayVideo);
    void video.play();
    animationFrame = window.requestAnimationFrame(updateOpacity);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(replayTimer);
      video.removeEventListener("ended", replayVideo);
    };
  }, []);

  return (
    <main className="home-shell">
      <section className="home-hero">
        <video
          ref={heroVideoRef}
          className="home-hero__video"
          src={heroVideoUrl}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="home-hero__blur" aria-hidden="true" />

        <div className="home-hero__layer">
          <nav className="home-nav">
            <PortalModelerBrand />
            {/* <div className="home-nav__links">
              <span className="home-nav__tag">Dev Tool</span>
              <span className="home-nav__tag">Blockchain</span>
              <span className="home-nav__tag">Rust</span>
              <span className="home-nav__tag">Substrate</span>
              <span className="home-nav__tag">Portaldot</span>
            </div> */}
            <div className="home-nav__actions">
              <button className="home-nav__button hero-secondary" onClick={onOpenWorkbench}>
                Open Workbench
              </button>
            </div>
          </nav>
          <div className="home-nav__divider" />

          <div className="home-hero__center">
            <div className="home-hero__content">
              <h1>
                Model <span>Flows</span>
              </h1>
              <p>
                Build, run, and verify Portaldot smart-contract workflows from one visual workbench.
              </p>
              <button className="hero-secondary home-hero__cta" onClick={onOpenWorkbench}>
                Launch Workbench
              </button>
            </div>
          </div>

          <div className="hero-marquee" aria-label="PortalModeler stack">
            <div className="hero-marquee__inner">
              <div className="hero-marquee__label">
                <span>Built for local</span>
                <span>contract demos</span>
              </div>
              <div className="hero-marquee__track">
                <div className="hero-marquee__row">
                  {[...heroPartners, ...heroPartners].map((name, index) => (
                    <div key={`${name}-${index}`} className="hero-logo">
                      <span className="liquid-glass">{name.slice(0, 1)}</span>
                      <strong>{name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* <section id="workflow" className="home-section reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Visual source of truth</span>
          <h2>One graph for the entire local contract path.</h2>
          <p>
            The board maps each step to real repo scripts while keeping configuration visible: endpoint, signer,
            artifacts, deploy fee, call value, and state reads.
          </p>
        </div>
        <div className="feature-grid">
          {[
            ["Chain Connect", "Validate local RPC and runtime readiness."],
            ["Deploy Membership", "Instantiate the ink! contract using safe defaults."],
            ["Read State", "Inspect is_member and joined_at without digging through terminal output."],
          ].map(([title, body]) => (
            <article key={title} className="feature-card">
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="execution" className="home-section home-section--split reveal-section">
        <div className="section-copy">
          <span className="section-label">Developer-safe execution</span>
          <h2>Run nodes without turning the browser into a shell.</h2>
          <p>
            Phase 2 exposes a whitelist runner through Vite middleware. The UI can run known workflow nodes, refresh
            health, and stream command output into structured logs.
          </p>
        </div>
        <div className="terminal-showcase">
          <div>$ python scripts/query.py --url ws://127.0.0.1:9944</div>
          <div className="terminal-success">Connected chain: Development</div>
          <div>$ python scripts/call.py --action is_member</div>
          <div className="terminal-success">Decoded value: {"{'Ok': True}"}</div>
        </div>
      </section>

      <section id="visualization" className="home-section home-section--stats reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">On-chain context</span>
          <h2>State and events are visible as product data.</h2>
          <p>
            Phase 3 adds account, contract, state, and event timeline cards so a hackathon demo can explain what
            happened on-chain without scrolling raw logs.
          </p>
        </div>
        <div className="metric-grid">
          <article>
            <strong>4</strong>
            <span>completed phases</span>
          </article>
          <article>
            <strong>10</strong>
            <span>MVP node templates</span>
          </article>
          <article>
            <strong>1</strong>
            <span>executable Membership flow</span>
          </article>
        </div>
      </section>

      <section className="home-testimonial reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Testimonial</span>
          <h2>Trusted by builders who need demos to behave like products.</h2>
          <p>
            PortalModeler is designed for the moment where contract logic, execution safety, and product storytelling
            need to land in the same screen.
          </p>
        </div>
        <div className="testimonial-marquee" aria-label="User reviews">
          {[0, 1].map((row) => (
            <div key={row} className="testimonial-row" style={{ marginLeft: row === 1 ? 200 : 0 }}>
              {[...testimonialItems, ...testimonialItems, ...testimonialItems].map(([quote, name, role], index) => (
                <article key={`${row}-${name}-${index}`} className="user-review">
                  <p>{quote}</p>
                  <div className="user-review__person">
                    <span>{name.slice(0, 1)}</span>
                    <div>
                      <strong>{name}</strong>
                      <small>{role}</small>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id="future-plan" className="home-section reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Future plan</span>
          <h2>From hackathon workbench to reusable Web3 modeling layer.</h2>
          <p>
            PortalModeler can grow from an executable demo board into a repeatable product workflow for teams building,
            testing, and explaining contract systems.
          </p>
        </div>
        <div className="plan-grid">
          {futurePlanItems.map(([title, body], index) => (
            <article key={title} className="plan-card">
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="home-section home-section--faq reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">FAQ</span>
          <h2>Answers for reviewers and builders.</h2>
          <p>
            The important product constraints are visible: what runs locally, what is protected, and how the MVP can
            evolve after the demo.
          </p>
        </div>
        <div className="faq-list">
          {faqItems.map(([question, answer], index) => {
            const isOpen = openFaqIndexes.includes(index);
            return (
              <article key={question} className={`faq-item ${isOpen ? "open" : ""}`}>
                <button type="button" className="faq-question" onClick={() => toggleFaq(index)}>
                  <span>{question}</span>
                  <strong>{isOpen ? "-" : "+"}</strong>
                </button>
                <div className="faq-answer">
                  <p>{answer}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-action reveal-section">
        <div className="section-copy section-copy--center">
          <span className="section-label">Build visually</span>
          <h2>Open the workbench and run the Membership flow.</h2>
          <p>
            Use the board to connect the local chain, deploy the contract, call membership actions, read state, and
            export the graph.
          </p>
        </div>
        <button className="primary-cta" onClick={onOpenWorkbench}>
          Launch workbench
          <ArrowRight size={18} />
        </button>
      </section>

      <footer className="home-footer">
        <div className="home-footer__main">
          <div className="home-footer__brand">
            <PortalModelerBrand />
            <p>Executable visual modeling for local Web3 contract workflows.</p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.title} className="home-footer__column">
              <span>{column.title}</span>
              {column.links.map(([label, href]) =>
                label === "Workbench" ? (
                  <button key={label} type="button" onClick={onOpenWorkbench}>
                    {label}
                  </button>
                ) : (
                  <a key={label} href={href}>
                    {label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="home-footer__bottom">© 2026 PortalModeler. All rights reserved.</div>
      </footer> */}
    </main>
  );
}

function WorkbenchPage({ onOpenHome }: { onOpenHome: () => void }) {
  const [nodes, setNodes] = useState<PortalFlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0].id);
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [beginnerMode] = useState(true);
  const [flowConnectMode, setFlowConnectMode] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([initialNodes[0].id]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPlannerResult, setAiPlannerResult] = useState<AiPlannerResult | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiRunConfirm, setAiRunConfirm] = useState(false);
  const [aiReplaceBoard, setAiReplaceBoard] = useState(false);
  const [runAfterAiApply, setRunAfterAiApply] = useState(false);
  const [pendingWriteRun, setPendingWriteRun] = useState<PendingWriteRun | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const importFlowInputRef = useRef<HTMLInputElement | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedNodes = useMemo(
    () => orderedSelection(nodes, selectedNodeIds),
    [nodes, selectedNodeIds],
  );
  const endpoint = nodes.find((node) => node.data.kind === "connectRpc")?.data.config.endpoint;
  const guidance = selectedNode
    ? nodeGuidance(selectedNode, health, snapshot, endpoint)
    : {
        level: "ready" as const,
        title: "Board cleared",
        items: ["The visual board is empty. Add a node from the palette to start a new workflow."],
      };
  const orderedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind));
  }, [nodes]);

  const commandLines = useMemo(() => {
    return orderedNodes
      .filter((node) => !browserHelperNodeKinds.has(node.data.kind))
      .map((node) => hydrateCommand(node.data.command, node.data.config, endpoint));
  }, [endpoint, orderedNodes]);

  const evidenceRecords = useMemo(() => evidenceFromNodes(orderedNodes, endpoint), [endpoint, orderedNodes]);
  const evidenceReport = useMemo(() => renderEvidenceReport(evidenceRecords, snapshot, endpoint), [endpoint, evidenceRecords, snapshot]);

  const markdownExport = useMemo(() => {
    const steps = orderedNodes
      .map((node, index) => `${index + 1}. ${node.data.label}: \`${hydrateCommand(node.data.command, node.data.config, endpoint)}\``)
      .join("\n");
    const evidence = orderedNodes
      .filter((node) => Object.keys(node.data.outputs || {}).length > 0)
      .map((node) => {
        const outputs = node.data.outputs || {};
        const important = [
          outputs.extrinsicHash ? `extrinsic: ${outputs.extrinsicHash}` : "",
          outputs.blockHash ? `block: ${outputs.blockHash}` : "",
          outputs.estimatedFee ? `estimated fee: ${outputs.estimatedFee}` : "",
          outputs.gasRequired ? `gas required: ${outputs.gasRequired}` : "",
          Array.isArray(outputs.messages) && outputs.messages.length ? `messages: ${outputs.messages.join(", ")}` : "",
          Array.isArray(outputs.diff) && outputs.diff.length ? `state diff: ${outputs.diff.join("; ")}` : "",
          outputs.explanation ? `error explanation: ${outputs.explanation}` : "",
        ].filter(Boolean);
        return important.length ? `- ${node.data.label}: ${important.join(" | ")}` : "";
      })
      .filter(Boolean)
      .join("\n");
    return `# PortalModeler Membership Flow\n\n## Commands\n\n${steps}\n\n## Evidence Summary\n\n${evidence || "No run evidence captured yet."}\n\n## Evidence Report\n\n${evidenceReport}\n`;
  }, [endpoint, evidenceReport, orderedNodes]);

  const graphExport = useMemo(() => {
    return JSON.stringify(
      {
        nodes: nodes.map(({ id, position, data }) => ({
          id,
          kind: data.kind,
          position,
          status: data.status,
          inputs: data.inputs,
          outputs: data.outputs,
          dependsOn: data.dependsOn,
          config: data.config,
          lastRun: data.lastRun,
        })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
        })),
      },
      null,
      2,
    );
  }, [edges, nodes]);
  const portalModel = useMemo(() => graphToPortalModel(nodes, edges, endpoint), [edges, endpoint, nodes]);
  const portalModelExport = useMemo(() => JSON.stringify(portalModel, null, 2), [portalModel]);
  const inkSkeletonExport = useMemo(() => renderInkSkeleton(portalModel), [portalModel]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === null || connection.target === null) {
        return;
      }

      const sourceId: string = connection.source;
      const targetId: string = connection.target;

      setEdges((current) => {
        const sourceNode = nodes.find((node) => node.id === sourceId);
        const targetNode = nodes.find((node) => node.id === targetId);
        const handles = sourceNode && targetNode ? closestFlowHandles(sourceNode, targetNode) : null;
        const sourceHandle = (connection.sourceHandle as FlowHandleId) || handles?.sourceHandle || "right";
        const targetHandle = (connection.targetHandle as FlowHandleId) || handles?.targetHandle || "left";
        const exists = current.some(
          (edge) =>
            edge.source === sourceId &&
            edge.target === targetId,
        );
        if (exists) {
          return current;
        }

        return [
          ...current,
          makeFlowEdge(
            sourceId,
            targetId,
            "planned",
            sourceHandle,
            targetHandle,
          ),
        ];
      });
    },
    [nodes, setEdges],
  );

  function rerouteConnectedEdges(nextNodes: PortalFlowNode[], changedNodeIds?: string[]) {
    const changed = changedNodeIds ? new Set(changedNodeIds) : null;

    setEdges((current) =>
      current.map((edge) =>
        !changed || changed.has(edge.source) || changed.has(edge.target)
          ? rerouteEdgeToClosestHandles(edge, nextNodes)
          : edge,
      ),
    );
  }

  function resetFlowEdgeStates(sequence: PortalFlowNode[]) {
    const sequenceIds = new Set(sequence.map((node) => node.id));

    setEdges((current) =>
      current.map((edge) =>
        sequenceIds.has(edge.source) && sequenceIds.has(edge.target)
          ? {
              ...edge,
              animated: false,
              className: flowEdgeClass("planned"),
            }
          : edge,
      ),
    );
  }

  function updateIncomingFlowEdges(targetId: string, completedNodeIds: Set<string>, state: FlowEdgeState) {
    setEdges((current) =>
      current.map((edge) =>
        edge.target === targetId && completedNodeIds.has(edge.source)
          ? {
              ...edge,
              animated: state === "running",
              className: flowEdgeClass(state),
            }
          : edge,
      ),
    );
  }

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch(`/api/health?endpoint=${encodeURIComponent(endpoint || "ws://127.0.0.1:9944")}`);
      const nextHealth = (await response.json()) as HealthState;
      setHealth(nextHealth);
      return nextHealth;
    } catch {
      const fallbackHealth = { ok: false, rpcReachable: false, contractReachable: false, artifactsReady: false, contractAddress: "" };
      setHealth(fallbackHealth);
      return fallbackHealth;
    }
  }, [endpoint]);

  const refreshSnapshot = useCallback(async () => {
    try {
      const response = await fetch(`/api/snapshot?endpoint=${encodeURIComponent(endpoint || "ws://127.0.0.1:9944")}`);
      const nextSnapshot = (await response.json()) as ChainSnapshot;
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch {
      setSnapshot(null);
      return null;
    }
  }, [endpoint]);

  useEffect(() => {
    void refreshHealth();
    void refreshSnapshot();
  }, [refreshHealth, refreshSnapshot]);

  useEffect(() => {
    setEdges((current) => current.map((edge) => rerouteEdgeToClosestHandles(edge, nodes)));
  }, [nodes]);

  function pushLog(log: Omit<RunLog, "id">) {
    setRunLogs((current) => [{ id: `${Date.now()}-${current.length}`, ...log }, ...current].slice(0, 18));
  }

  async function copyTextArtifact(label: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      pushLog({
        level: "success",
        title: `${label} copied`,
        body: `${label} is now on the clipboard.`,
      });
    } catch (error) {
      pushLog({
        level: "error",
        title: `${label} copy failed`,
        body: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function downloadArtifact(label: string, filename: string, content: string, type = "text/plain") {
    downloadTextFile(filename, content, type);
    pushLog({
      level: "success",
      title: `${label} exported`,
      body: `${filename} was generated from the current visual board.`,
    });
  }

  async function importFlowFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const imported = prepareImportedGraph(importTextToGraph(text, file.name), importMode, nodes);
      if (imported.nodes.length === 0) {
        pushLog({
          level: "warning",
          title: "Import skipped",
          body: "The selected file did not contain supported PortalModeler nodes.",
        });
        return;
      }

      if (importMode === "merge") {
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...imported.nodes]);
        setEdges((current) => [...current.map((edge) => ({ ...edge, selected: false })), ...imported.edges]);
      } else {
        setNodes(imported.nodes);
        setEdges(imported.edges);
      }
      setSelectedNodeId(imported.nodes[0]?.id || "");
      setSelectedNodeIds(imported.nodes[0] ? [imported.nodes[0].id] : []);
      setSelectedEdgeIds([]);
      pushLog({
        level: "success",
        title: `${imported.source === "flow" ? "Flow" : imported.source === "portalModel" ? "PortalModel" : imported.source === "metadata" ? "Metadata" : "Rust source"} imported`,
        body: `${importMode === "merge" ? "Merged" : "Loaded"} ${imported.nodes.length} node${imported.nodes.length === 1 ? "" : "s"} and ${imported.edges.length} line${imported.edges.length === 1 ? "" : "s"} from ${file.name}.`,
      });
    } catch (error) {
      pushLog({
        level: "error",
        title: "Flow import failed",
        body: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function pasteRustSourceImport() {
    try {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = window.prompt("Paste ink! Rust source code to generate a visual board:") || "";
      }
      const imported = prepareImportedGraph(importTextToGraph(text, "pasted.rs"), importMode, nodes);
      if (importMode === "merge") {
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...imported.nodes]);
        setEdges((current) => [...current.map((edge) => ({ ...edge, selected: false })), ...imported.edges]);
      } else {
        setNodes(imported.nodes);
        setEdges(imported.edges);
      }
      setSelectedNodeId(imported.nodes[0]?.id || "");
      setSelectedNodeIds(imported.nodes[0] ? [imported.nodes[0].id] : []);
      setSelectedEdgeIds([]);
      pushLog({
        level: "success",
        title: "Rust source imported",
        body: `${importMode === "merge" ? "Merged" : "Loaded"} ${imported.nodes.length} architecture node${imported.nodes.length === 1 ? "" : "s"} from pasted ink! source. Rust source parsing is a guarded prototype for common ink! patterns.`,
      });
    } catch (error) {
      pushLog({
        level: "error",
        title: "Rust source import failed",
        body: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function addTemplate(template: Template, position?: { x: number; y: number }) {
    const id = `${template.kind}-${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: "portal",
        position: position || { x: 160 + current.length * 18, y: 120 + current.length * 12 },
        data: {
          kind: template.kind,
          label: template.label,
          description: template.description,
          command: template.command,
          status: "ready",
          config: template.config,
          inputs: { ...template.config },
          outputs: {},
          dependsOn: [],
        },
      },
    ]);
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
  }

  function startPaletteDrag(event: DragEvent<HTMLButtonElement>, template: Template) {
    event.dataTransfer.setData("application/portal-template", template.kind);
    event.dataTransfer.effectAllowed = "copy";
  }

  function allowBoardDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function clearBoardSelection() {
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }

  function selectNode(nodeId: string, append: boolean) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeIds([]);
    setSelectedNodeIds((current) => {
      if (!append) {
        return [nodeId];
      }
      return current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
    });
  }

  function selectEdge(edgeId: string, append: boolean) {
    setSelectedNodeIds([]);
    setSelectedEdgeIds((current) => {
      if (!append) {
        return [edgeId];
      }
      return current.includes(edgeId) ? current.filter((id) => id !== edgeId) : [...current, edgeId];
    });
  }

  function moveBoardNodes(nodeIds: string[], delta: XYPosition) {
    const moving = new Set(nodeIds);
    setNodes((current) =>
      current.map((node) =>
        moving.has(node.id)
          ? {
              ...node,
              position: {
                x: Math.round(node.position.x + delta.x),
                y: Math.round(node.position.y + delta.y),
              },
            }
          : node,
      ),
    );
  }

  function deleteSelectedItems() {
    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
      return;
    }

    const selectedNodesSet = new Set(selectedNodeIds);
    const selectedEdgesSet = new Set(selectedEdgeIds);
    const remainingNodes = nodes.filter((node) => !selectedNodesSet.has(node.id));
    const nextSelectedId = remainingNodes[0]?.id || "";

    setNodes(remainingNodes.map((node) => ({ ...node, selected: node.id === nextSelectedId })));
    setEdges((current) =>
      current.filter(
        (edge) =>
          !selectedEdgesSet.has(edge.id) &&
          !selectedNodesSet.has(edge.source) &&
          !selectedNodesSet.has(edge.target),
      ),
    );
    setSelectedNodeId(nextSelectedId);
    setSelectedNodeIds(nextSelectedId ? [nextSelectedId] : []);
    setSelectedEdgeIds([]);
    pushLog({
      level: "info",
      title: "Selection deleted",
      body: `${selectedNodesSet.size} node${selectedNodesSet.size === 1 ? "" : "s"} and ${selectedEdgesSet.size} line${selectedEdgesSet.size === 1 ? "" : "s"} removed from the visual board.`,
    });
  }

  function rerouteNodeEdgesAfterDrag(nodeIds: string[]) {
    rerouteConnectedEdges(nodes, nodeIds);
  }

  function duplicateSelectedNodes() {
    const sourceNodes = selectedNodes.length > 0 ? selectedNodes : selectedNode ? [selectedNode] : [];
    if (sourceNodes.length === 0) {
      pushLog({
        level: "warning",
        title: "Duplicate skipped",
        body: "There are no nodes on the board to duplicate.",
      });
      return;
    }
    const timestamp = Date.now();
    const duplicates = sourceNodes.map((node, index) => ({
      ...node,
      id: `${node.data.kind}-${timestamp}-${index}`,
      selected: true,
      position: { x: node.position.x + 42, y: node.position.y + 42 },
      data: {
        ...node.data,
        status: "ready" as const,
        config: { ...node.data.config },
        inputs: { ...node.data.inputs },
        outputs: {},
        lastRun: undefined,
      },
    }));

    const duplicateIds = duplicates.map((node) => node.id);
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...duplicates,
    ]);
    setSelectedNodeId(duplicateIds[duplicateIds.length - 1]);
    setSelectedNodeIds(duplicateIds);
    pushLog({
      level: "info",
      title: "Nodes duplicated",
      body: `${duplicateIds.length} node${duplicateIds.length === 1 ? "" : "s"} duplicated without copying edges.`,
    });
  }

  function resetBoard() {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId("");
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setFlowConnectMode(false);
    pushLog({
      level: "info",
      title: "Board reset",
      body: "Visual board cleared. Add nodes from the palette to build a new workflow.",
    });
  }

  function closeAiModal() {
    setAiModalOpen(false);
    setAiRunConfirm(false);
  }

  function closeWriteConfirmModal() {
    setPendingWriteRun(null);
  }

  function confirmPendingWriteRun() {
    const pending = pendingWriteRun;
    setPendingWriteRun(null);
    pending?.onConfirm();
  }

  function writeNodesFromBatch(batch: PortalFlowNode[]) {
    return batch.filter((node) => writeTransactionNodeKinds.has(node.data.kind));
  }

  function confirmWriteRun(title: string, batch: PortalFlowNode[], onConfirm: () => void) {
    const writeNodes = writeNodesFromBatch(batch);

    if (writeNodes.length === 0) {
      onConfirm();
      return;
    }

    setPendingWriteRun({
      title,
      nodes: writeNodes,
      endpoint: endpoint || "ws://127.0.0.1:9944",
      commandPreview: writeNodes
        .map((node) => `${node.data.label}: ${hydrateCommand(node.data.command, node.data.config, endpoint)}`)
        .join("\n"),
      onConfirm,
    });
  }

  function updateAiPrompt(value: string) {
    setAiPrompt(value);
    setAiPlannerResult(null);
    setAiRunConfirm(false);
  }

  function providerLabel(source?: AiPlannerResult["source"]) {
    if (source === "gemini") return "Gemini";
    if (source === "openrouter") return "OpenRouter";
    if (source === "openai") return "OpenAI";
    return "AI";
  }

  async function generateAiFlow() {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) {
      setAiPlannerResult({ plan: null, errors: ["Enter a prompt before generating a flow."], source: "local" });
      setAiRunConfirm(false);
      return;
    }

    setAiGenerating(true);
    setAiPlannerResult(null);
    setAiRunConfirm(false);

    try {
      const response = await fetch("/api/ai-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          endpoint: endpoint || "ws://127.0.0.1:9944",
          availableKinds: templates.map((template) => template.kind),
        }),
      });
      const result = (await response.json()) as AiPlannerResult;
      if (response.ok && result.plan) {
        setAiPlannerResult(result);
        pushLog({
          level: "info",
          title: "AI planner generated flow",
          body: `${result.source === "gemini" ? "Gemini" : result.source === "openrouter" ? "OpenRouter" : result.source === "openai" ? "OpenAI" : "Local fallback"} created ${result.plan.steps.length} planned node${result.plan.steps.length === 1 ? "" : "s"}.`,
        });
        return;
      }

      const fallback = planWorkflowFromPrompt(trimmedPrompt, endpoint);
      const providerError = result.errors?.length ? `${providerLabel(result.source)} planner unavailable: ${result.errors.join(" ")}` : "";
      setAiPlannerResult({
        plan: fallback.plan,
        source: fallback.plan && !providerError ? result.source || "local" : "local",
        model: fallback.plan && !providerError ? result.model : undefined,
        errors: fallback.plan
          ? providerError ? [providerError] : []
          : [providerError || "AI planner returned no valid workflow.", ...fallback.errors.map((error) => `Local fallback: ${error}`)],
        warnings: result.warnings || [],
      });
    } catch (error) {
      const fallback = planWorkflowFromPrompt(trimmedPrompt, endpoint);
      setAiPlannerResult({
        plan: fallback.plan,
        source: "local",
        errors: fallback.plan
          ? [`AI planner unavailable: ${error instanceof Error ? error.message : String(error)}`]
          : [
              `AI planner unavailable: ${error instanceof Error ? error.message : String(error)}`,
              ...fallback.errors.map((fallbackError) => `Local fallback: ${fallbackError}`),
            ],
      });
    } finally {
      setAiGenerating(false);
    }
  }

  function applyAiPlan(runAfterApply = false) {
    if (!aiPlannerResult?.plan) {
      return;
    }

    const idPrefix = aiReplaceBoard ? "" : `ai-${Date.now()}`;
    const nextNodes = buildNodesFromAiPlan(aiPlannerResult.plan, idPrefix);
    const nextEdges = buildEdgesFromAiPlan(aiPlannerResult.plan, nextNodes, idPrefix);
    const selectedId = nextNodes[nextNodes.length - 1]?.id || "";

    if (aiReplaceBoard) {
      setNodes(nextNodes.map((node) => ({ ...node, selected: node.id === selectedId })));
      setEdges(nextEdges);
    } else {
      setNodes((current) => [
        ...current.map((node) => ({ ...node, selected: false })),
        ...nextNodes.map((node) => ({
          ...node,
          selected: node.id === selectedId,
          position: { x: node.position.x + 80, y: node.position.y + 80 },
        })),
      ]);
      setEdges((current) => [...current.map((edge) => ({ ...edge, selected: false })), ...nextEdges]);
    }
    setSelectedNodeId(selectedId);
    setSelectedNodeIds(selectedId ? [selectedId] : []);
    setSelectedEdgeIds([]);
    setFlowConnectMode(false);
    setAiModalOpen(false);
    setAiRunConfirm(false);
    setRunAfterAiApply(runAfterApply);
    pushLog({
      level: "info",
      title: "AI flow applied",
      body: `${aiPlannerResult.plan.title} ${aiReplaceBoard ? "replaced the board with" : "appended"} ${nextNodes.length} nodes and ${nextEdges.length} lines from the ${aiPlannerResult.source === "gemini" ? "Gemini planner" : aiPlannerResult.source === "openrouter" ? "OpenRouter planner" : aiPlannerResult.source === "openai" ? "OpenAI planner" : "local planner"}.`,
    });
  }

  function updateConfig(key: keyof PortalNodeConfig, value: string) {
    if (!selectedNode) {
      return;
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                config: { ...node.data.config, [key]: value },
                inputs: { ...node.data.inputs, [key]: value },
              },
            }
          : node,
      ),
    );
  }

  function setNodeStatus(nodeId: string, status: PortalNodeData["status"], patch?: Partial<PortalNodeData>) {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch, status } } : node)),
    );
  }

  async function execute(node: PortalFlowNode, context: WorkflowContext): Promise<ExecuteResult> {
    const response = await fetch("/api/run-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: node.data.kind,
        config: {
          ...node.data.config,
          ...dependencyOutputsForNode(node, context),
          endpoint: context.endpoint,
        },
      }),
    });
    const result = (await response.json()) as ApiRunResult;
    const ok = response.ok && Boolean(result.ok);
    return {
      ok,
      result,
      outputs: {},
    };
  }

  async function runNode(node: PortalFlowNode, contextOverride?: WorkflowContext): Promise<RunNodeOutcome> {
    const startedAt = new Date().toISOString();
    const context = contextOverride || { nodes, edges, health, snapshot, endpoint };
    const preflight = preflightValidate(node, context);

    if (!preflight.ok) {
      setNodeStatus(node.id, "blocked", {
        lastRun: {
          startedAt,
          endedAt: new Date().toISOString(),
          ok: false,
          errorCode: "PREFLIGHT_BLOCKED",
          hints: preflight.hints,
        },
      });
      pushLog({
        level: "warning",
        title: `${node.data.label} blocked`,
        body: [
          `${node.data.label} is blocked because:`,
          ...preflight.reasons.map((reason) => `- ${reason}`),
          ...(preflight.hints || []).map((hint) => `Hint: ${hint}`),
        ].join("\n"),
      });
      return { ok: false, status: "blocked" };
    }

    setNodeStatus(node.id, "running", {
      inputs: { ...node.data.config, dependencyOutputs: dependencyOutputsForNode(node, context) },
      lastRun: { startedAt, ok: false },
    });
    pushLog({
      level: "info",
      title: `Running ${node.data.label}`,
      body: [
        hydrateCommand(node.data.command, node.data.config, endpoint),
        ...(preflight.warnings || []).map((warning) => `Preflight warning: ${warning}`),
        ...(preflight.hints || []).map((hint) => `Hint: ${hint}`),
      ].join("\n"),
    });

    try {
      const executed = await execute(node, context);
      const nextHealth = await refreshHealth();
      const nextSnapshot = await refreshSnapshot();
      const refreshedContext = { ...context, health: nextHealth, snapshot: nextSnapshot, previousSnapshot: context.snapshot };
      const outputs = collectNodeOutputs(node, { ...executed.result, ok: executed.ok }, refreshedContext);
      executed.outputs = outputs;
      const postflight = postValidate(node, executed, refreshedContext);
      const ok = executed.ok && postflight.ok;
      const hints = explainRunIssue(executed.result);
      const status: NodeStatus = ok ? (postflight.warnings?.length ? "warning" : "success") : "error";

      setNodeStatus(node.id, status, {
        outputs,
        lastRun: {
          startedAt,
          endedAt: new Date().toISOString(),
          ok,
          stdout: executed.result.stdout,
          stderr: executed.result.stderr,
          errorCode: executed.result.code === null || executed.result.code === undefined ? undefined : String(executed.result.code),
          hints,
        },
      });
      pushLog({
        level: ok ? (status === "warning" ? "warning" : "success") : "error",
        title: `${node.data.label} ${ok ? (status === "warning" ? "completed with warning" : "completed") : "failed"}`,
        body: [
          executed.result.command,
          executed.result.stdout,
          executed.result.stderr,
          executed.result.error,
          ...postflight.reasons.map((reason) => `Post-validate: ${reason}`),
          ...(postflight.warnings || []).map((warning) => `Warning: ${warning}`),
          ...hints.map((hint) => `Hint: ${hint}`),
        ]
          .filter(Boolean)
          .join("\n")
          .trim(),
      });
      return { ok, status, outputs, health: nextHealth, snapshot: nextSnapshot };
    } catch (error) {
      setNodeStatus(node.id, "error", {
        lastRun: {
          startedAt,
          endedAt: new Date().toISOString(),
          ok: false,
          stderr: error instanceof Error ? error.message : String(error),
          errorCode: "EXECUTE_EXCEPTION",
        },
      });
      pushLog({
        level: "error",
        title: `${node.data.label} failed`,
        body: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, status: "error" };
    }
  }

  async function runSelectedNodeConfirmed() {
    if (!selectedNode) {
      pushLog({
        level: "warning",
        title: "Run skipped",
        body: "No node is selected because the board is empty.",
      });
      return;
    }
    await runNode(selectedNode);
  }

  function runSelectedNode() {
    if (!selectedNode) {
      void runSelectedNodeConfirmed();
      return;
    }

    confirmWriteRun("Confirm selected node", [selectedNode], () => {
      void runSelectedNodeConfirmed();
    });
  }

  function updateRunContext(context: WorkflowContext, node: PortalFlowNode, outcome: RunNodeOutcome) {
    return {
      ...context,
      health: outcome.health === undefined ? context.health : outcome.health,
      snapshot: outcome.snapshot === undefined ? context.snapshot : outcome.snapshot,
      nodes: context.nodes.map((candidate) =>
        candidate.id === node.id
          ? {
              ...candidate,
              data: {
                ...candidate.data,
                status: outcome.status,
                outputs: outcome.outputs || candidate.data.outputs,
              },
            }
          : candidate,
      ),
    };
  }

  async function runFromSelectedNodeConfirmed() {
    if (!selectedNode) {
      pushLog({
        level: "warning",
        title: "Run from node skipped",
        body: "No node is selected because the board is empty.",
      });
      return;
    }
    const graphOrderedNodes = workflowSequenceFromGraph(nodes, edges);
    const selectedIndex = graphOrderedNodes.findIndex((node) => node.id === selectedNode.id);
    const batch = graphOrderedNodes.slice(Math.max(selectedIndex, 0));
    const completedNodeIds = new Set(
      graphOrderedNodes.slice(0, Math.max(selectedIndex, 0)).map((node) => node.id),
    );
    let context: WorkflowContext = { nodes, edges, health, snapshot, endpoint };
    resetFlowEdgeStates(batch);

    for (const node of batch) {
      updateIncomingFlowEdges(node.id, completedNodeIds, "running");
      const outcome = await runNode(node, context);
      context = updateRunContext(context, node, outcome);

      updateIncomingFlowEdges(node.id, completedNodeIds, outcome.ok ? "success" : "error");

      if (!outcome.ok) {
        pushLog({
          level: "warning",
          title: "Run from node stopped",
          body: `${node.data.label} could not continue. Fix the blocked or failed node before resuming.`,
        });
        break;
      }

      completedNodeIds.add(node.id);
    }
  }

  function runFromSelectedNode() {
    if (!selectedNode) {
      void runFromSelectedNodeConfirmed();
      return;
    }

    const graphOrderedNodes = workflowSequenceFromGraph(nodes, edges);
    const selectedIndex = graphOrderedNodes.findIndex((node) => node.id === selectedNode.id);
    const batch = graphOrderedNodes.slice(Math.max(selectedIndex, 0));

    confirmWriteRun("Confirm run from selected node", batch, () => {
      void runFromSelectedNodeConfirmed();
    });
  }

  async function runFlowConfirmed() {
    const graphOrderedNodes = workflowSequenceFromGraph(nodes, edges);
    const completedNodeIds = new Set<string>();
    let context: WorkflowContext = { nodes, edges, health, snapshot, endpoint };
    resetFlowEdgeStates(graphOrderedNodes);

    for (const node of graphOrderedNodes) {
      updateIncomingFlowEdges(node.id, completedNodeIds, "running");
      const outcome = await runNode(node, context);
      context = updateRunContext(context, node, outcome);

      updateIncomingFlowEdges(node.id, completedNodeIds, outcome.ok ? "success" : "error");

      if (!outcome.ok) {
        pushLog({
          level: "warning",
          title: "Flow stopped",
          body: `${node.data.label} returned an error. Fix that node before continuing.`,
        });
        break;
      }

      completedNodeIds.add(node.id);
    }
  }

  function runFlow() {
    const graphOrderedNodes = workflowSequenceFromGraph(nodes, edges);
    confirmWriteRun("Confirm full flow", graphOrderedNodes, () => {
      void runFlowConfirmed();
    });
  }

  useEffect(() => {
    function handleBoardHotkeys(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingWriteRun) {
        event.preventDefault();
        closeWriteConfirmModal();
        return;
      }

      if (event.key === "Escape" && aiModalOpen) {
        event.preventDefault();
        closeAiModal();
        return;
      }

      if (event.target instanceof HTMLInputElement) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0)) {
        event.preventDefault();
        deleteSelectedItems();
      }
    }

    window.addEventListener("keydown", handleBoardHotkeys);
    return () => window.removeEventListener("keydown", handleBoardHotkeys);
  });

  useEffect(() => {
    if (!runAfterAiApply) {
      return;
    }

    setRunAfterAiApply(false);
    void runFlow();
  }, [runAfterAiApply]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <PortalModelerBrand compact />
          <div>
            <div className="eyebrow">Portaldot Hackathon 2026</div>
            <h1>PortalModeler Workbench</h1>
            <p>Design, run, and inspect smart-contract workflows from a visual blockchain developer console.</p>
          </div>
        </div>
        <div className="topbar__actions">
          <button className="text-button active-mode" title="Open AI Flow Builder" onClick={() => setAiModalOpen(true)}>
            <Sparkles size={17} />
            AI
          </button>
          <button className="text-button quiet" title="Back to homepage" onClick={onOpenHome}>
            <Home size={17} />
            Home
          </button>
          {/* <button className={`text-button quiet ${beginnerMode ? "active-mode" : ""}`} onClick={() => setBeginnerMode((value) => !value)}>
            Beginner mode
          </button> */}
          <button className="text-button" title="Run selected node" onClick={runSelectedNode}>
            <Play size={17} />
            Run node
          </button>
          <button className="text-button" title="Run from selected node" onClick={runFromSelectedNode}>
            <ArrowRight size={17} />
            Run from node
          </button>
          <button className="text-button" title="Run nodes in flow order" onClick={runFlow}>
            <GitBranch size={17} />
            Run flow
          </button>
        </div>
      </header>

      <AiFlowModal
        open={aiModalOpen}
        prompt={aiPrompt}
        result={aiPlannerResult}
        needsRunConfirm={aiRunConfirm}
        generating={aiGenerating}
        replaceBoard={aiReplaceBoard}
        onClose={closeAiModal}
        onPromptChange={updateAiPrompt}
        onGenerate={generateAiFlow}
        onApply={() => applyAiPlan(false)}
        onApplyAndRun={() => applyAiPlan(true)}
        onConfirmRunChange={setAiRunConfirm}
        onReplaceBoardChange={setAiReplaceBoard}
      />

      <WriteActionConfirmModal
        pending={pendingWriteRun}
        onCancel={closeWriteConfirmModal}
        onConfirm={confirmPendingWriteRun}
      />

      <section className="workflow-strip" aria-label="Membership workflow readiness">
        {[
          ["RPC endpoint", health?.rpcReachable ? "online" : "offline", health?.rpcReachable ? "ready" : "blocked"],
          ["Artifacts", health?.artifactsReady ? "ready" : "missing", health?.artifactsReady ? "ready" : "blocked"],
          [
            "Contract",
            health?.contractReachable ? "live" : health?.contractAddress ? "stale" : "pending",
            health?.contractReachable ? "ready" : health?.contractAddress ? "warning" : "idle",
          ],
          [
            "Membership",
            snapshot?.state.isMember ? "joined" : snapshot?.state.isMember === false ? "not joined" : "unknown",
            snapshot?.state.isMember ? "ready" : "idle",
          ],
        ].map(([label, value, tone]) => (
          <div key={label} className={`workflow-chip ${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="workspace">
        <aside className="palette-panel" aria-label="Node palette">
          <div className="panel-heading panel-heading--split">
            <span className="panel-heading__label">
              <Boxes size={18} />
              Palette
            </span>
            <span className="panel-count">{templates.length} nodes</span>
          </div>
          <div className="palette-list">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.kind}
                  className="palette-item"
                  draggable
                  onClick={() => addTemplate(template)}
                  onDragStart={(event) => startPaletteDrag(event, template)}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{template.label}</strong>
                    <small>{template.group}</small>
                  </span>
                  <Plus size={15} />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="board-panel" aria-label="Visual node board">
          <div className="board-toolbar">
            <div>
              <span>Flow Canvas</span>
              <strong>Membership local workflow</strong>
            </div>
            <div className="board-toolbar__meta">
              <span>{nodes.length} nodes</span>
              <span>{edges.length} edges</span>
              <span>{beginnerMode ? "guided" : "expert"}</span>
              <span className={selectedNodeIds.length > 0 ? "selection-active" : ""}>
                {selectedNodeIds.length} selected
              </span>
            </div>
          </div>
          <div
            className="flow-canvas"
            onDragOver={allowBoardDrop}
          >
            <LightweightFlowCanvas
              nodes={nodes}
              edges={edges}
              selectedNodeIds={selectedNodeIds}
              selectedEdgeIds={selectedEdgeIds}
              flowConnectMode={flowConnectMode}
              onMoveNodes={moveBoardNodes}
              onNodeDragEnd={rerouteNodeEdgesAfterDrag}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              onSelectCanvas={clearBoardSelection}
              onConnect={onConnect}
              onDropTemplate={addTemplate}
            />
            <div className="canvas-action-dock" role="dialog" aria-label="Visual board selection actions">
              <div className="canvas-action-dock__meta">
                <span>Selection ops</span>
                <strong>
                  {selectedNodeIds.length} node{selectedNodeIds.length === 1 ? "" : "s"} / {selectedEdgeIds.length} line
                  {selectedEdgeIds.length === 1 ? "" : "s"}
                </strong>
              </div>
              <div className="canvas-action-dock__actions">
                <button
                  className={`canvas-action ${flowConnectMode ? "active" : ""}`}
                  title="Toggle custom node connection mode"
                  onClick={() => setFlowConnectMode((value) => !value)}
                >
                  <Link2 size={14} />
                  Flow connect
                </button>
        
                <button className="canvas-action" title="Duplicate selected nodes" onClick={duplicateSelectedNodes}>
                  <Copy size={14} />
                  Duplicate
                </button>
                <button className="canvas-action quiet" title="Reset the board to the default workflow" onClick={resetBoard}>
                  <RefreshCcw size={14} />
                  Reset board
                </button>
                <button
                  className="canvas-action danger"
                  title="Delete selected nodes and lines"
                  onClick={deleteSelectedItems}
                  disabled={selectedNodeIds.length === 0 && selectedEdgeIds.length === 0}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
                
              </div>
            </div>
          </div>
        </section>

        <aside className="inspector-panel" aria-label="Node inspector">
          <div className="panel-heading panel-heading--split">
            <span className="panel-heading__label">
              <Settings2 size={18} />
              Inspector
            </span>
            <span className={`panel-status ${selectedNode?.data.status || "idle"}`}>
              {selectedNode?.data.status || "idle"}
            </span>
          </div>

          <div className="inspector-card">
            {selectedNode ? (
              <>
                <div className="inspector-title">{selectedNode.data.label}</div>
                <div className="inspector-description">{selectedNode.data.description}</div>
                <div className="field-stack">
                  {configEntries(selectedNode.data.config)
                    .filter(([key]) => showAdvancedFields || !advancedConfigKeys.has(key))
                    .map(([key, value]) => (
                      <label key={key} className="field">
                        <span>{key}</span>
                        <input value={String(value)} onChange={(event) => updateConfig(key as keyof PortalNodeConfig, event.target.value)} />
                      </label>
                    ))}
                  {configEntries(selectedNode.data.config).length === 0 ? (
                    <div className="empty-note">This node has no editable fields.</div>
                  ) : null}
                  {configEntries(selectedNode.data.config).some(([key]) => advancedConfigKeys.has(key)) ? (
                    <button className="advanced-toggle" onClick={() => setShowAdvancedFields((value) => !value)}>
                      {showAdvancedFields ? "Hide advanced fields" : "Show advanced fields"}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="empty-note">The board is empty. Drag a node from the palette to begin.</div>
            )}
          </div>

          {beginnerMode ? (
            <div className={`guidance-card ${guidance.level}`}>
              <div className="guidance-title">{guidance.title}</div>
              <ul>
                {guidance.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel-heading small">
            <Code2 size={17} />
            <span>Command</span>
          </div>
          <pre className="command-preview">
            {selectedNode ? hydrateCommand(selectedNode.data.command, selectedNode.data.config, endpoint) : "No node selected"}
          </pre>

          <div className="panel-heading small">
            <Server size={17} />
            <span>Local Health</span>
          </div>
          <div className="health-grid">
            <span>RPC</span>
            <strong>{health?.rpcReachable ? "online" : "offline"}</strong>
            <span>Artifacts</span>
            <strong>{health?.artifactsReady ? "ready" : "missing"}</strong>
            <span>Contract</span>
            <strong>
              {health?.contractAddress
                ? health.contractReachable
                  ? health.contractAddress
                  : `${health.contractAddress} (stale)`
                : "not deployed"}
            </strong>
          </div>

          {/* {beginnerMode ? (
            <div className="setup-checklist">
              <div className="panel-heading small">
                <ClipboardList size={17} />
                <span>Setup Checklist</span>
              </div>
              {setupChecklist.map((item) => (
                <div key={item.label} className={`setup-check ${item.done ? "done" : ""}`}>
                  <CheckCircle2 size={15} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : null} */}
        </aside>
      </section>

      <section className="terminal-panel" aria-label="Run logs terminal">
        <div className="terminal-panel__bar">
          <div className="terminal-panel__title">
            <FileText size={18} />
            <span>Run Logs</span>
          </div>
          <div className="terminal-panel__meta">
            <span>{runLogs.length} entries</span>
            <span>{selectedNode?.data.label || "No node selected"}</span>
            <span className={`terminal-status ${selectedNode?.data.status || "idle"}`}>
              {selectedNode?.data.status || "idle"}
            </span>
          </div>
        </div>
        <div className="terminal-screen">
          {runLogs.length > 0 ? (
            runLogs.map((log) => (
              <article key={log.id} className={`run-log ${log.level}`}>
                <div className="run-log__header">
                  <span className="run-log__level">{log.level}</span>
                  <strong>{log.title}</strong>
                </div>
                <pre>{log.body}</pre>
              </article>
            ))
          ) : (
            <div className="terminal-empty" aria-label="Run logs standby">
              <div className="terminal-empty__prompt">
                <span className="terminal-empty__user">portalmodeler@local</span>
                <span>:</span>
                <span className="terminal-empty__path">~/workbench</span>
                <span>$</span>
                <strong> waiting for node execution</strong>
              </div>
              <div className="terminal-empty__grid">
                <span>rpc</span>
                <strong>{endpoint || "ws://127.0.0.1:9944"}</strong>
                <span>selected</span>
                <strong>{selectedNode?.data.label || "no node selected"}</strong>
                <span>runner</span>
                <strong>standby</strong>
                <span>output</span>
                <strong>extrinsic hash, block hash, events, stderr</strong>
              </div>
              <pre>{`> choose a workflow node
> run node / run from node / run flow
> transaction traces will stream here`}</pre>
            </div>
          )}
        </div>
      </section>

      <section className="evidence-panel" aria-label="On-chain evidence panel">
        <div className="evidence-panel__header">
          <div className="panel-heading">
            <Shield size={18} />
            <span>Proof Evidence</span>
          </div>
          <div className="evidence-panel__actions">
            <button className="text-button quiet" title="Copy evidence report" onClick={() => copyTextArtifact("Evidence report", evidenceReport)}>
              <Copy size={16} />
              Copy report
            </button>
            <button className="text-button quiet" title="Download evidence report as Markdown" onClick={() => downloadArtifact("Evidence report", "portalmodeler-evidence-report.md", evidenceReport, "text/markdown")}>
              <Download size={16} />
              Report.md
            </button>
          </div>
        </div>
        {evidenceRecords.length > 0 ? (
          <div className="evidence-grid">
            {evidenceRecords.map((record) => (
              <article key={`${record.nodeLabel}-${record.endedAt || record.command}`} className={`evidence-card ${record.status}`}>
                <div className="evidence-card__top">
                  <span>{record.status}</span>
                  <strong>{record.nodeLabel}</strong>
                </div>
                <dl className="evidence-list">
                  <dt>Fee estimate</dt>
                  <dd>{record.fee || "not captured"}</dd>
                  <dt>Extrinsic</dt>
                  <dd>{record.extrinsicHash || "not captured"}</dd>
                  <dt>Block hash</dt>
                  <dd>{record.blockHash || "not captured"}</dd>
                </dl>
                <div className="evidence-events">
                  <span>Events</span>
                  {record.events.length > 0 ? (
                    record.events.map((event) => <p key={event}>{event}</p>)
                  ) : (
                    <p>none captured</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="evidence-empty">
            Run Transaction Preview, Transfer POT, Deploy Contract, or Call Message to capture fee, extrinsic, block, and event proof.
          </div>
        )}
      </section>

      <section className="snapshot-panel" aria-label="State and event visualization">
        <article className="snapshot-card account-card">
          <div className="panel-heading">
            <WalletCards size={18} />
            <span>Account</span>
          </div>
          <dl className="snapshot-list">
            <dt>Address</dt>
            <dd>{snapshot?.account.account || "unknown"}</dd>
            <dt>Balance</dt>
            <dd>{snapshot?.account.freeBalance || "not loaded"}</dd>
            <dt>Nonce</dt>
            <dd>{snapshot?.account.nonce || "0"}</dd>
          </dl>
        </article>

        <article className="snapshot-card contract-card">
          <div className="panel-heading">
            <Database size={18} />
            <span>Contract</span>
          </div>
          <dl className="snapshot-list">
            <dt>Address</dt>
            <dd>
              {snapshot?.contract.address
                ? snapshot.contract.reachable
                  ? snapshot.contract.address
                  : `${snapshot.contract.address} (not on current chain)`
                : "not deployed"}
            </dd>
            <dt>Metadata</dt>
            <dd>{snapshot?.contract.metadataPath || "missing"}</dd>
            <dt>Messages</dt>
            <dd>{snapshot?.contract.messages.join(", ") || "not loaded"}</dd>
          </dl>
        </article>

        <article className="snapshot-card state-card">
          <div className="panel-heading">
            <SearchCheck size={18} />
            <span>State</span>
          </div>
          <div className="state-grid">
            <div>
              <span>is_member</span>
              <strong className={snapshot?.state.isMember ? "state-good" : "state-wait"}>
                {snapshot?.state.isMember === null || snapshot?.state.isMember === undefined
                  ? "unknown"
                  : String(snapshot.state.isMember)}
              </strong>
            </div>
            <div>
              <span>joined_at</span>
              <strong>{snapshot?.state.joinedAt || "not joined"}</strong>
            </div>
          </div>
        </article>

        <article className="snapshot-card timeline-card">
          <div className="panel-heading">
            <RadioTower size={18} />
            <span>Event Timeline</span>
          </div>
          <div className="timeline-list">
            {(snapshot?.events || []).map((event, index) => (
              <div key={`${event.name}-${index}`} className={`timeline-item ${event.status}`}>
                <span>{event.status}</span>
                <strong>{event.name}</strong>
                <p>{event.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="bottom-panel">
        <div className="export-toolbar" aria-label="One-click export and conversion">
          <div className="export-toolbar__title">
            <Download size={18} />
            <div>
              <span>One-click artifacts</span>
            </div>
          </div>
          <div className="export-toolbar__actions">
            <button className="text-button quiet" title="Copy generated command sheet" onClick={() => copyTextArtifact("Command sheet", commandLines.join("\n"))}>
              <Copy size={16} />
              Copy commands
            </button>
            <button className="text-button quiet" title="Download workflow commands as Markdown" onClick={() => downloadArtifact("Commands", "portalmodeler-commands.md", markdownExport, "text/markdown")}>
              <Download size={16} />
              Commands.md
            </button>
            <button className="text-button quiet" title="Download on-chain evidence report" onClick={() => downloadArtifact("Evidence report", "portalmodeler-evidence-report.md", evidenceReport, "text/markdown")}>
              <Shield size={16} />
              Evidence.md
            </button>
            <button className="text-button quiet" title="Download draggable graph JSON" onClick={() => downloadArtifact("Flow JSON", "portalmodeler-flow.json", graphExport, "application/json")}>
              <GitBranch size={16} />
              Flow JSON
            </button>
            <button className="text-button quiet" title="Download normalized PortalModel JSON" onClick={() => downloadArtifact("PortalModel JSON", "portalmodel.json", portalModelExport, "application/json")}>
              <FileText size={16} />
              Model JSON
            </button>
            <button className="text-button quiet" title="Download generated ink! skeleton" onClick={() => downloadArtifact("ink skeleton", "generated-lib.rs", inkSkeletonExport, "text/plain")}>
              <FileCode2 size={16} />
              ink! skeleton
            </button>
            <button className={`text-button quiet ${importMode === "merge" ? "active-mode" : ""}`} title="Toggle whether imports replace the board or merge into it" onClick={() => setImportMode((mode) => (mode === "replace" ? "merge" : "replace"))}>
              <Plus size={16} />
              {importMode === "merge" ? "Merge import" : "Replace import"}
            </button>
            <button className="text-button quiet" title="Import Flow JSON, PortalModel JSON, ink! metadata JSON, or an ink! Rust source file" onClick={() => importFlowInputRef.current?.click()}>
              <Upload size={16} />
              Import file
            </button>
            <button className="text-button quiet" title="Paste ink! Rust source from clipboard and generate a visual board" onClick={pasteRustSourceImport}>
              <FileCode2 size={16} />
              Paste code
            </button>
            <input ref={importFlowInputRef} className="visually-hidden" type="file" accept="application/json,.json,.rs,text/plain" onChange={importFlowFile} />
          </div>
        </div>
        <div className="export-pane">
          <div className="panel-heading">
            <GitBranch size={18} />
            <span>Command Sheet</span>
          </div>
          <pre>{commandLines.join("\n")}</pre>
        </div>
        <div className="export-pane">
          <div className="panel-heading">
            <Link2 size={18} />
            <span>Graph JSON</span>
          </div>
          <pre>{graphExport}</pre>
        </div>
        <div className="export-pane">
          <div className="panel-heading">
            <Download size={18} />
            <span>Markdown Export</span>
          </div>
          <pre>{markdownExport}</pre>
        </div>
        <div className="export-pane">
          <div className="panel-heading">
            <ClipboardList size={18} />
            <span>Selected Outputs</span>
          </div>
          <pre>{selectedNode ? JSON.stringify(selectedNode.data.outputs || {}, null, 2) : "No node selected"}</pre>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [page, setPage] = useState<Page>("home");

  if (page === "workbench") {
    return <WorkbenchPage onOpenHome={() => setPage("home")} />;
  }

  return <HomePage onOpenWorkbench={() => setPage("workbench")} />;
}

export default App;
