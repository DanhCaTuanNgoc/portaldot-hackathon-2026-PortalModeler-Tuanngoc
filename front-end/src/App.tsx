import {
  ArrowRight,
  Boxes,
  CheckCircle2,
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
  RefreshCcw,
  Trash2,
  UserRound,
  WalletCards,
  Home,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import portalLogo from "./assets/logo_portalmodeler.png";

type PortalNodeKind =
  | "connectRpc"
  | "checkRuntime"
  | "checkAccount"
  | "checkBalance"
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
]);

const templates: Template[] = [
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

const flowOrder: PortalNodeKind[] = templates.map((template) => template.kind);

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

const initialNodes: PortalFlowNode[] = templates.map((template, index) => ({
  id: template.kind,
  type: "portal",
  position: { x: 80 + (index % 5) * 260, y: 80 + Math.floor(index / 5) * 190 },
  data: {
    kind: template.kind,
    label: template.label,
    description: template.description,
    command: template.command,
    status: index < 2 ? "success" : "ready",
    config: template.config,
    inputs: { ...template.config },
    outputs: {},
    dependsOn: index === 0 ? [] : [templates[index - 1].kind],
  },
}));

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
    .replace("{message}", config.message || config.action || "is_member");
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
    "connectRpc",
    "checkRuntime",
    "checkAccount",
    "checkBalance",
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
  if (node.data.kind === "transferPot") {
    outputs.recipient = node.data.config.recipient || "";
    outputs.value = node.data.config.value || "";
    outputs.fee = (result.stdout || "").match(/Estimated fee:\s*(.+)/)?.[1] || "";
    outputs.extrinsicHash = (result.stdout || "").match(/Extrinsic:\s*(.+)/)?.[1] || "";
    outputs.blockHash = (result.stdout || "").match(/Block hash:\s*(.+)/)?.[1] || "";
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
  }
  if (node.data.kind === "callMessage") {
    outputs.message = node.data.config.message || "join";
    outputs.value = node.data.config.value || "0";
  }
  if (node.data.kind === "readMessage") {
    outputs.message = node.data.config.message || "is_member";
    outputs.decodedValue = context.snapshot?.state.isMember ?? null;
  }
  if (node.data.kind === "watchEvents" || node.data.kind === "decodeEvents") {
    outputs.eventTimeline = context.snapshot?.events || [];
  }

  return outputs;
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
              <a href="#workflow">Workflow</a>
              <a href="#execution">Execution</a>
              <a href="#future-plan">Roadmap</a>
              <a href="#faq">Learning</a>
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
  const [runLogs, setRunLogs] = useState<RunLog[]>([
    {
      id: "phase2-ready",
      level: "info",
      title: "Phase 2 runner ready",
      body: "Only whitelisted PortalModeler nodes can call local scripts through the Vite middleware.",
    },
  ]);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [flowConnectMode, setFlowConnectMode] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([initialNodes[0].id]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);

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
  const setupChecklist = [
    { label: "Local RPC online", done: Boolean(health?.rpcReachable) },
    { label: "Contract artifacts ready", done: Boolean(health?.artifactsReady) },
    { label: "Live contract reachable", done: Boolean(health?.contractReachable) },
    { label: "Membership state readable", done: snapshot?.state.isMember !== null && snapshot?.state.isMember !== undefined },
  ];

  const orderedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind));
  }, [nodes]);

  const commandLines = useMemo(() => {
    return orderedNodes
      .filter((node) => !["watchEvents", "decodeEvents", "exportWorkflow", "exportCommands", "saveWorkflow", "loadWorkflow", "generateReport"].includes(node.data.kind))
      .map((node) => hydrateCommand(node.data.command, node.data.config, endpoint));
  }, [endpoint, orderedNodes]);

  const markdownExport = useMemo(() => {
    const steps = orderedNodes
      .map((node, index) => `${index + 1}. ${node.data.label}: \`${hydrateCommand(node.data.command, node.data.config, endpoint)}\``)
      .join("\n");
    return `# PortalModeler Membership Flow\n\n${steps}\n`;
  }, [endpoint, orderedNodes]);

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
      const refreshedContext = { ...context, health: nextHealth, snapshot: nextSnapshot };
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

  async function runSelectedNode() {
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

  async function runFromSelectedNode() {
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

  async function runFlow() {
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

  useEffect(() => {
    function handleBoardHotkeys(event: KeyboardEvent) {
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <PortalModelerBrand compact />
          <div>
            <div className="eyebrow">PortalModeler Workbench</div>
            <h1>Membership Flow Board</h1>
            <p>Model, execute, and inspect a local ink! membership workflow from one dev-focused surface.</p>
          </div>
        </div>
        <div className="topbar__actions">
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
                <button
                  className="canvas-action danger"
                  title="Delete selected nodes and lines"
                  onClick={deleteSelectedItems}
                  disabled={selectedNodeIds.length === 0 && selectedEdgeIds.length === 0}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
                <button className="canvas-action quiet" title="Reset the board to the default workflow" onClick={resetBoard}>
                  <RefreshCcw size={14} />
                  Reset board
                </button>
                <button className="canvas-action quiet" title="Clear current selection" onClick={clearBoardSelection}>
                  Clear
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
          {runLogs.map((log) => (
            <article key={log.id} className={`run-log ${log.level}`}>
              <div className="run-log__header">
                <span className="run-log__level">{log.level}</span>
                <strong>{log.title}</strong>
              </div>
              <pre>{log.body}</pre>
            </article>
          ))}
        </div>
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
