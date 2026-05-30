import { flowOrder, portalNodeSize, templates } from "../domain/constants";
import type {
  AiFlowPlan,
  AiFlowPlanStep,
  AiPlannerResult,
  Edge,
  ImportedGraph,
  PortalFlowNode,
  PortalModel,
  PortalNodeConfig,
  PortalNodeData,
  PortalNodeKind,
  SerializedWorkflow,
  XYPosition,
} from "../domain/types";
import type { FlowEdgeState, FlowHandleId } from "../domain/constants";
import { hydrateCommand, templateForKind } from "./workflow";

export function flowEdgeId(source: string, target: string, sourceHandle = "right", targetHandle = "left") {
  return `${source}-${sourceHandle}-${targetHandle}-${target}`;
}

export const initialBoardKinds = new Set<PortalNodeKind>(["manageLocalNode", "connectRpc"]);

export const initialNodes: PortalFlowNode[] = templates.filter((template) => initialBoardKinds.has(template.kind)).map((template, index) => {
  const flowIndex = flowOrder.indexOf(template.kind);
  const previousKind = flowIndex > 0 ? flowOrder[flowIndex - 1] : undefined;
  return {
    id: template.kind,
    type: "portal",
    position: { x: 80 + index * 280, y: 80 },
    data: {
      kind: template.kind,
      label: template.label,
      description: template.description,
      command: template.command,
      status: "ready",
      config: template.config,
      inputs: { ...template.config },
      outputs: {},
      dependsOn: previousKind ? [previousKind] : [],
    },
  };
});

export function flowEdgeClass(state: FlowEdgeState) {
  return `flow-edge flow-edge--${state}`;
}

export function makeFlowEdge(
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

export function nodeCenter(node: PortalFlowNode) {
  return {
    x: node.position.x + portalNodeSize.width / 2,
    y: node.position.y + portalNodeSize.height / 2,
  };
}

export function closestFlowHandles(sourceNode: PortalFlowNode, targetNode: PortalFlowNode) {
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

export function rerouteEdgeToClosestHandles(edge: Edge, nodes: PortalFlowNode[]) {
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

export const initialEdges: Edge[] = (() => {
  const sourceKind: PortalNodeKind = "manageLocalNode";
  const targetKind: PortalNodeKind = "connectRpc";
  const sourceNode = initialNodes.find((node) => node.id === sourceKind);
  const targetNode = initialNodes.find((node) => node.id === targetKind);
  const handles = sourceNode && targetNode ? closestFlowHandles(sourceNode, targetNode) : undefined;

  return [makeFlowEdge(sourceKind, targetKind, "planned", handles?.sourceHandle, handles?.targetHandle)];
})();

export function safeRustIdent(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const ident = normalized || fallback;
  return /^[a-zA-Z_]/.test(ident) ? ident : `_${ident}`;
}

export function titleCaseIdent(value: string, fallback: string) {
  const parts = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const title = parts.map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`).join("");
  return title || fallback;
}

export function uniqueByName<T extends { name: string }>(items: T[]) {
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

export function makeImportedNode(kind: PortalNodeKind, id: string, position: XYPosition, config: PortalNodeConfig = {}, patch: Partial<PortalNodeData> = {}): PortalFlowNode {
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

export function graphToPortalModel(nodes: PortalFlowNode[], edges: Edge[], endpoint?: string): PortalModel {
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

export function renderInkSkeleton(model: PortalModel) {
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

export function deserializeWorkflowGraph(value: string): ImportedGraph {
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

export function looksLikePortalModel(value: unknown): value is Partial<PortalModel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PortalModel>;
  return Array.isArray(candidate.workflow) || Array.isArray(candidate.actions) || Array.isArray(candidate.states) || Array.isArray(candidate.events);
}

export function portalModelToGraph(model: Partial<PortalModel>): ImportedGraph {
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

export function metadataToGraph(metadata: unknown): ImportedGraph {
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

export function rustSourceToPortalModel(source: string): PortalModel {
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

export function importTextToGraph(value: string, filename = ""): ImportedGraph {
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

export function prepareImportedGraph(imported: ImportedGraph, mode: "replace" | "merge", currentNodes: PortalFlowNode[]): ImportedGraph {
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

export function downloadTextFile(filename: string, content: string, type = "text/plain") {
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

export function parsePromptAmount(prompt: string) {
  const amountMatch = prompt.match(/(?:amount|value|so luong|số lượng|transfer|send|chuyen|chuyển)\s*(?:pot)?\s*[:=]?\s*([0-9][0-9_,.]*)/i);
  if (!amountMatch) {
    return "1000000000000";
  }

  return amountMatch[1].replace(/[_,.]/g, "");
}

export function planWorkflowFromPrompt(prompt: string, currentEndpoint?: string): AiPlannerResult {
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

export function buildNodesFromAiPlan(plan: AiFlowPlan, idPrefix = ""): PortalFlowNode[] {
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

export function buildEdgesFromAiPlan(plan: AiFlowPlan, nodes: PortalFlowNode[], idPrefix = "") {
  return plan.edges.map(([source, target]) => {
    const sourceId = idPrefix ? `${idPrefix}-${source}` : source;
    const targetId = idPrefix ? `${idPrefix}-${target}` : target;
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const targetNode = nodes.find((node) => node.id === targetId);
    const handles = sourceNode && targetNode ? closestFlowHandles(sourceNode, targetNode) : undefined;
    return makeFlowEdge(sourceId, targetId, "planned", handles?.sourceHandle, handles?.targetHandle);
  });
}



export function sortNodesForFallback(nodes: PortalFlowNode[]) {
  return [...nodes].sort((a, b) => {
    const kindOrder = flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id);
  });
}

export function workflowSequenceFromGraph(nodes: PortalFlowNode[], edges: Edge[]) {
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
