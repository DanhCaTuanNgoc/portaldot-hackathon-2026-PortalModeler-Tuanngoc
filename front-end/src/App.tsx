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
  Link2,
  Play,
  Plus,
  RadioTower,
  SearchCheck,
  Server,
  Settings2,
  Shield,
  Sparkles,
  RefreshCcw,
  Trash2,
  Upload,
  WalletCards,
  Home,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { HomePage, PortalModelerBrand } from "./components/HomePage";
import { AiFlowModal, LightweightFlowCanvas, WriteActionConfirmModal } from "./components/LightweightFlowCanvas";
import {
  advancedConfigKeys,
  browserHelperNodeKinds,
  flowOrder,
  templates,
  writeTransactionNodeKinds,
} from "./domain/constants";
import type { FlowEdgeState, FlowHandleId } from "./domain/constants";
import type {
  AiPlannerResult,
  ApiRunResult,
  ChainSnapshot,
  Connection,
  Edge,
  EvidenceRecord,
  ExecuteResult,
  Guidance,
  HealthState,
  MetadataSummary,
  NodeDependencyRule,
  NodeStatus,
  NodeValidationRule,
  Page,
  PendingWriteRun,
  PortalFlowNode,
  PortalNodeConfig,
  PortalNodeData,
  PortalNodeKind,
  RunLog,
  RunNodeOutcome,
  SnapshotEvent,
  Template,
  ValidationResult,
  WorkflowContext,
  XYPosition,
} from "./domain/types";
import {
  buildEdgesFromAiPlan,
  buildNodesFromAiPlan,
  closestFlowHandles,
  downloadTextFile,
  flowEdgeClass,
  graphToPortalModel,
  importTextToGraph,
  initialEdges,
  initialNodes,
  makeFlowEdge,
  planWorkflowFromPrompt,
  prepareImportedGraph,
  renderInkSkeleton,
  rerouteEdgeToClosestHandles,
  workflowSequenceFromGraph,
} from "./flow/graph";
import { hydrateCommand } from "./flow/workflow";

function configEntries(config: PortalNodeConfig) {
  return Object.entries(config).filter(([, value]) => value !== undefined);
}

function orderedSelection(nodes: PortalFlowNode[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return nodes
    .filter((node) => selected.has(node.id))
    .sort((a, b) => flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind));
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
    if (!health) {
      return;
    }

    const syncedStatus: NodeStatus = health.rpcReachable ? "success" : "ready";
    setNodes((current) =>
      current.map((node) =>
        node.data.kind === "manageLocalNode" || node.data.kind === "connectRpc"
          ? {
              ...node,
              data: {
                ...node.data,
                status: node.data.status === "running" ? node.data.status : syncedStatus,
              },
            }
          : node,
      ),
    );
  }, [health]);

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
      const fallbackWarnings = [
        ...(result.warnings || []),
        ...(fallback.plan && providerError ? [`${providerError} Using the local safe planner instead.`] : []),
      ];
      setAiPlannerResult({
        plan: fallback.plan,
        source: fallback.plan ? "local" : result.source || "local",
        errors: fallback.plan
          ? []
          : [providerError || "AI planner returned no valid workflow.", ...fallback.errors.map((error) => `Local fallback: ${error}`)],
        warnings: fallbackWarnings,
      });
      if (fallback.plan) {
        pushLog({
          level: "warning",
          title: "AI planner used local fallback",
          body: `${providerError || "AI planner returned no valid workflow."} The safe local planner created ${fallback.plan.steps.length} planned node${fallback.plan.steps.length === 1 ? "" : "s"} instead.`,
        });
      }
    } catch (error) {
      const fallback = planWorkflowFromPrompt(trimmedPrompt, endpoint);
      const providerError = `AI planner unavailable: ${error instanceof Error ? error.message : String(error)}`;
      setAiPlannerResult({
        plan: fallback.plan,
        source: "local",
        errors: fallback.plan
          ? []
          : [
              providerError,
              ...fallback.errors.map((fallbackError) => `Local fallback: ${fallbackError}`),
            ],
        warnings: fallback.plan ? [`${providerError} Using the local safe planner instead.`] : [],
      });
      if (fallback.plan) {
        pushLog({
          level: "warning",
          title: "AI planner used local fallback",
          body: `${providerError} The safe local planner created ${fallback.plan.steps.length} planned node${fallback.plan.steps.length === 1 ? "" : "s"} instead.`,
        });
      }
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

  async function refreshContextAfterNode(node: PortalFlowNode, context: WorkflowContext) {
    const healthRefreshKinds = new Set<PortalNodeKind>([
      "buildContract",
      "deployContract",
      "attachContract",
      "verifyContractLive",
    ]);
    const snapshotRefreshKinds = new Set<PortalNodeKind>([
      "checkBalance",
      "transferPot",
      "deployContract",
      "attachContract",
      "verifyContractLive",
      "readMessage",
      "callMessage",
    ]);

    const [nextHealth, nextSnapshot] = await Promise.all([
      healthRefreshKinds.has(node.data.kind) ? refreshHealth() : Promise.resolve(context.health),
      snapshotRefreshKinds.has(node.data.kind) ? refreshSnapshot() : Promise.resolve(context.snapshot),
    ]);

    return {
      health: nextHealth,
      snapshot: nextSnapshot,
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
      const { health: nextHealth, snapshot: nextSnapshot } = await refreshContextAfterNode(node, context);
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
              <strong>PortalModeler Workbench</strong>
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

      <section className="proof-row" aria-label="Run output and extracted proof">
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
                Copy
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
