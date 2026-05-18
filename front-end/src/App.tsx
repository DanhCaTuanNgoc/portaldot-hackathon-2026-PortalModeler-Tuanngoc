import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Code2,
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
  UserRound,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import heroImage from "./assets/hero.png";

type PortalNodeKind =
  | "chainConnect"
  | "accountSelect"
  | "balanceQuery"
  | "artifactSelect"
  | "deployMembership"
  | "joinMembership"
  | "checkIsMember"
  | "readJoinedAt"
  | "eventViewer"
  | "commandExport";

type PortalNodeConfig = {
  endpoint?: string;
  seed?: string;
  account?: string;
  fee?: string;
  value?: string;
  action?: string;
  metadataPath?: string;
  wasmPath?: string;
  eventName?: string;
};

type PortalNodeData = {
  kind: PortalNodeKind;
  label: string;
  description: string;
  command: string;
  status: "ready" | "running" | "success" | "warning" | "error";
  config: PortalNodeConfig;
} & Record<string, unknown>;

type PortalFlowNode = Node<PortalNodeData, "portal">;

type Template = {
  kind: PortalNodeKind;
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

const templates: Template[] = [
  {
    kind: "chainConnect",
    label: "Chain Connect",
    description: "Local websocket and network profile",
    command: "python scripts/doctor.py --url {endpoint}",
    config: { endpoint: "ws://127.0.0.1:9944" },
    icon: Server,
  },
  {
    kind: "accountSelect",
    label: "Account Select",
    description: "Signer seed and SS58 account",
    command: "PORTALDOT_SEED={seed}",
    config: { seed: "//Alice", account: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" },
    icon: UserRound,
  },
  {
    kind: "balanceQuery",
    label: "Balance Query",
    description: "Read signer balance from System.Account",
    command: "python scripts/query.py --url {endpoint}",
    config: {},
    icon: WalletCards,
  },
  {
    kind: "artifactSelect",
    label: "Artifact Select",
    description: "Membership metadata and Wasm output",
    command: "cd contract && cargo contract build --release",
    config: {
      metadataPath: "contract/target/ink/membership.json",
      wasmPath: "contract/target/ink/membership.wasm",
    },
    icon: FileCode2,
  },
  {
    kind: "deployMembership",
    label: "Deploy Membership",
    description: "Instantiate Membership with join fee",
    command: "python scripts/deploy.py --url {endpoint} --fee {fee}",
    config: { fee: "100000000000000" },
    icon: HardDrive,
  },
  {
    kind: "joinMembership",
    label: "Join Membership",
    description: "Execute payable join()",
    command: "python scripts/call.py --url {endpoint} --action join --value {value}",
    config: { value: "100000000000000", action: "join" },
    icon: Shield,
  },
  {
    kind: "checkIsMember",
    label: "Check Is Member",
    description: "Read is_member(account)",
    command: "python scripts/call.py --url {endpoint} --action is_member",
    config: { action: "is_member" },
    icon: SearchCheck,
  },
  {
    kind: "readJoinedAt",
    label: "Read Joined At",
    description: "Read joined_at(account)",
    command: "python scripts/call.py --url {endpoint} --action joined_at",
    config: { action: "joined_at" },
    icon: ClipboardList,
  },
  {
    kind: "eventViewer",
    label: "Event Viewer",
    description: "Expected decoded contract event",
    command: "MemberJoined(account, joined_at, paid)",
    config: { eventName: "MemberJoined" },
    icon: RadioTower,
  },
  {
    kind: "commandExport",
    label: "Command Export",
    description: "Export graph commands and checklist",
    command: "portalmodeler export --format markdown",
    config: {},
    icon: Download,
  },
];

const flowOrder: PortalNodeKind[] = templates.map((template) => template.kind);

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
  },
}));

const initialEdges: Edge[] = flowOrder.slice(0, -1).map((kind, index) => ({
  id: `${kind}-${flowOrder[index + 1]}`,
  source: kind,
  target: flowOrder[index + 1],
  animated: index < 2,
}));

function hydrateCommand(template: string, config: PortalNodeConfig, endpoint = "ws://127.0.0.1:9944") {
  return template
    .replace("{endpoint}", config.endpoint || endpoint)
    .replace("{seed}", config.seed || "//Alice")
    .replace("{fee}", config.fee || "100000000000000")
    .replace("{value}", config.value || "100000000000000");
}

function PortalNode({ data, selected }: NodeProps<PortalFlowNode>) {
  const template = templates.find((item) => item.kind === data.kind) || templates[0];
  const Icon = template.icon;

  return (
    <div className={`portal-node ${selected ? "selected" : ""}`}>
      <div className="portal-node__top">
        <span className={`portal-node__icon ${data.status}`}>
          {data.status === "running" ? <Loader2 className="spin" size={18} /> : <Icon size={18} />}
        </span>
        <span className={`portal-node__status ${data.status}`}>{data.status}</span>
      </div>
      <div className="portal-node__title">{data.label}</div>
      <div className="portal-node__description">{data.description}</div>
      <div className="portal-node__command">{hydrateCommand(data.command, data.config)}</div>
    </div>
  );
}

const nodeTypes = { portal: PortalNode };

function configEntries(config: PortalNodeConfig) {
  return Object.entries(config).filter(([, value]) => value !== undefined);
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

function HomePage({ onOpenWorkbench }: { onOpenWorkbench: () => void }) {
  useRevealOnScroll();

  return (
    <main className="home-shell">
      <nav className="home-nav">
        <div className="brand-mark">
          <span>PM</span>
          <strong>PortalModeler</strong>
        </div>
        <div className="home-nav__links">
          <a href="#workflow">Workflow</a>
          <a href="#execution">Execution</a>
          <a href="#visualization">Visualization</a>
          <button className="home-nav__button" onClick={onOpenWorkbench}>
            Open app
          </button>
        </div>
      </nav>

      <section className="home-hero">
        <img className="home-hero__asset" src={heroImage} alt="" loading="eager" />
        <div className="home-hero__grid" aria-hidden="true" />
        <div className="home-hero__content">
          <div className="hero-kicker">Model-driven contract workflows for Portaldot</div>
          <h1>Build, run, and explain blockchain contract flows from a visual dev board.</h1>
          <p>
            PortalModeler turns Portaldot setup, contract deployment, calls, state reads, and event review into one
            executable visual model.
          </p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={onOpenWorkbench}>
              Launch workbench
              <ArrowRight size={18} />
            </button>
            <a className="secondary-cta" href="#workflow">
              Explore the flow
            </a>
          </div>
        </div>
        <div className="hero-status-strip">
          <span>Phase 0 ready</span>
          <span>Visual board</span>
          <span>Safe script runner</span>
          <span>State timeline</span>
        </div>
      </section>

      <section id="workflow" className="home-section reveal-section">
        <div className="section-copy">
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

      <section id="execution" className="home-section reveal-section">
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

      <section id="visualization" className="home-section reveal-section">
        <div className="section-copy">
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
    </main>
  );
}

function WorkbenchPage({ onOpenHome }: { onOpenHome: () => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<PortalFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
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

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0];
  const endpoint = nodes.find((node) => node.data.kind === "chainConnect")?.data.config.endpoint;

  const orderedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind));
  }, [nodes]);

  const commandLines = useMemo(() => {
    return orderedNodes
      .filter((node) => node.data.kind !== "eventViewer" && node.data.kind !== "commandExport")
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
        nodes: nodes.map(({ id, position, data }) => ({ id, kind: data.kind, position, config: data.config })),
        edges: edges.map(({ id, source, target }) => ({ id, source, target })),
      },
      null,
      2,
    );
  }, [edges, nodes]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true }, current)),
    [setEdges],
  );

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch(`/api/health?endpoint=${encodeURIComponent(endpoint || "ws://127.0.0.1:9944")}`);
      const nextHealth = (await response.json()) as HealthState;
      setHealth(nextHealth);
    } catch {
      setHealth({ ok: false, rpcReachable: false, contractReachable: false, artifactsReady: false, contractAddress: "" });
    }
  }, [endpoint]);

  const refreshSnapshot = useCallback(async () => {
    try {
      const response = await fetch(`/api/snapshot?endpoint=${encodeURIComponent(endpoint || "ws://127.0.0.1:9944")}`);
      setSnapshot((await response.json()) as ChainSnapshot);
    } catch {
      setSnapshot(null);
    }
  }, [endpoint]);

  useEffect(() => {
    void refreshHealth();
    void refreshSnapshot();
  }, [refreshHealth, refreshSnapshot]);

  function pushLog(log: Omit<RunLog, "id">) {
    setRunLogs((current) => [{ id: `${Date.now()}-${current.length}`, ...log }, ...current].slice(0, 18));
  }

  function addTemplate(template: Template) {
    const id = `${template.kind}-${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: "portal",
        position: { x: 160 + current.length * 18, y: 120 + current.length * 12 },
        data: {
          kind: template.kind,
          label: template.label,
          description: template.description,
          command: template.command,
          status: "ready",
          config: template.config,
        },
      },
    ]);
    setSelectedNodeId(id);
  }

  function updateConfig(key: keyof PortalNodeConfig, value: string) {
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } }
          : node,
      ),
    );
  }

  function setNodeStatus(nodeId: string, status: PortalNodeData["status"]) {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, status } } : node)),
    );
  }

  async function runNode(node: PortalFlowNode) {
    setNodeStatus(node.id, "running");
    pushLog({
      level: "info",
      title: `Running ${node.data.label}`,
      body: hydrateCommand(node.data.command, node.data.config, endpoint),
    });

    try {
      const response = await fetch("/api/run-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: node.data.kind,
          config: { ...node.data.config, endpoint },
        }),
      });
      const result = (await response.json()) as ApiRunResult;
      const ok = response.ok && result.ok;
      setNodeStatus(node.id, ok ? "success" : "error");
      pushLog({
        level: ok ? "success" : "error",
        title: `${node.data.label} ${ok ? "completed" : "failed"}`,
        body: [result.command, result.stdout, result.stderr, result.error].filter(Boolean).join("\n").trim(),
      });
      await refreshHealth();
      await refreshSnapshot();
      return ok;
    } catch (error) {
      setNodeStatus(node.id, "error");
      pushLog({
        level: "error",
        title: `${node.data.label} failed`,
        body: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function runSelectedNode() {
    await runNode(selectedNode);
  }

  async function runFlow() {
    for (const node of orderedNodes) {
      const ok = await runNode(node);
      if (!ok) {
        pushLog({
          level: "warning",
          title: "Flow stopped",
          body: `${node.data.label} returned an error. Fix that node before continuing.`,
        });
        break;
      }
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">PortalModeler</div>
          <h1>Membership Flow Board</h1>
        </div>
        <div className="topbar__actions">
          <button className="text-button quiet" title="Back to homepage" onClick={onOpenHome}>
            Home
          </button>
          <span className="health-pill">
            <CheckCircle2 size={16} />
            {health?.rpcReachable ? "RPC online" : "RPC offline"}
          </span>
          <button className="text-button" title="Run selected node" onClick={runSelectedNode}>
            <Play size={17} />
            Run node
          </button>
          <button className="text-button" title="Run nodes in flow order" onClick={runFlow}>
            <GitBranch size={17} />
            Run flow
          </button>
          <button className="icon-button" title="Refresh local health" onClick={refreshHealth}>
            <CheckCircle2 size={17} />
          </button>
          <button className="icon-button" title="Export graph JSON">
            <Save size={17} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="palette-panel" aria-label="Node palette">
          <div className="panel-heading">
            <Boxes size={18} />
            <span>Palette</span>
          </div>
          <div className="palette-list">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <button key={template.kind} className="palette-item" onClick={() => addTemplate(template)}>
                  <Icon size={17} />
                  <span>{template.label}</span>
                  <Plus size={15} />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="board-panel" aria-label="Visual node board">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <MiniMap pannable zoomable nodeColor="#254f85" maskColor="rgba(4, 8, 14, 0.72)" />
            <Controls />
          </ReactFlow>
        </section>

        <aside className="inspector-panel" aria-label="Node inspector">
          <div className="panel-heading">
            <Settings2 size={18} />
            <span>Inspector</span>
          </div>

          <div className="inspector-card">
            <div className="inspector-title">{selectedNode.data.label}</div>
            <div className="inspector-description">{selectedNode.data.description}</div>
            <div className="field-stack">
              {configEntries(selectedNode.data.config).map(([key, value]) => (
                <label key={key} className="field">
                  <span>{key}</span>
                  <input value={String(value)} onChange={(event) => updateConfig(key as keyof PortalNodeConfig, event.target.value)} />
                </label>
              ))}
              {configEntries(selectedNode.data.config).length === 0 ? (
                <div className="empty-note">This node has no editable fields.</div>
              ) : null}
            </div>
          </div>

          <div className="panel-heading small">
            <Code2 size={17} />
            <span>Command</span>
          </div>
          <pre className="command-preview">{hydrateCommand(selectedNode.data.command, selectedNode.data.config, endpoint)}</pre>

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
        </aside>
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
        <div className="export-pane logs-pane">
          <div className="panel-heading">
            <FileText size={18} />
            <span>Run Logs</span>
          </div>
          <div className="run-log-list">
            {runLogs.map((log) => (
              <article key={log.id} className={`run-log ${log.level}`}>
                <div>{log.title}</div>
                <pre>{log.body}</pre>
              </article>
            ))}
          </div>
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
