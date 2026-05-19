import {
  Background,
  BackgroundVariant,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
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
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import portalLogo from "./assets/logo_portalmodeler.png";

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

type Guidance = {
  level: "ready" | "warning" | "blocked";
  title: string;
  items: string[];
};

const futurePlanItems = [
  ["Model import", "Load BPMN-style specs and generate PortalModeler graphs with safe script bindings."],
  ["Smart validation", "Preflight every node against artifacts, chain metadata, account balance, and contract ABI."],
  ["Team demos", "Share replayable workflow snapshots with logs, state cards, and timeline evidence."],
];

const testimonialItems = [
  [
    "The contract flow is obvious, with state checks and logs in one place.",
    "Mina Tran",
    "Web3 builder",
  ],
  [
    "The whitelist runner feels visual, useful, and still safe for local scripts.",
    "Avery Chen",
    "Protocol engineer",
  ],
  [
    "Deployment becomes a repeatable board that is easy to explain.",
    "Jon Bell",
    "Developer advocate",
  ],
  [
    "The state timeline makes the demo feel like a real product surface.",
    "Sara Nguyen",
    "Product reviewer",
  ],
];

const faqItems = [
  [
    "Is PortalModeler only a landing page?",
    "No. The landing page introduces the product, while the workbench is the actual visual board for running the local Membership contract flow.",
  ],
  [
    "Can the browser run arbitrary scripts?",
    "No. Execution goes through a whitelist in the Vite middleware so only known PortalModeler workflow nodes can call local scripts.",
  ],
  [
    "What chain does the MVP target?",
    "The MVP targets a local Portaldot/Substrate-style development node over ws://127.0.0.1:9944.",
  ],
  [
    "What is next after the hackathon MVP?",
    "The next plan is importable models, deeper validation, reusable run snapshots, and richer contract/state visualizations.",
  ],
];

const footerColumns = [
  {
    title: "Product",
    links: [
      ["Workflow", "#workflow"],
      ["Execution", "#execution"],
      ["Visualization", "#visualization"],
    ],
  },
  {
    title: "Build",
    links: [
      ["Future plan", "#future-plan"],
      ["FAQ", "#faq"],
      ["Workbench", "#"],
    ],
  },
  {
    title: "Project",
    links: [
      ["Portaldot", "#workflow"],
      ["ink! contracts", "#execution"],
      ["Local demo", "#visualization"],
    ],
  },
];

const heroVideoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

const heroPartners = ["Portaldot", "Substrate", "ink!", "Vite", "React Flow", "Local Node"];

const advancedConfigKeys = new Set(["account", "metadataPath", "wasmPath", "eventName"]);

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

function orderedSelection(nodes: PortalFlowNode[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return nodes
    .filter((node) => selected.has(node.id))
    .sort((a, b) => flowOrder.indexOf(a.data.kind) - flowOrder.indexOf(b.data.kind));
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

  if (node.data.kind !== "chainConnect" && health && !health.rpcReachable) {
    level = "blocked";
    items.push("RPC is offline. Run the local contracts node before executing this node.");
  }

  if (node.data.kind === "deployMembership") {
    if (!health?.artifactsReady) {
      level = "blocked";
      items.push("Membership artifacts are missing. Build the contract first.");
    }
    if (!isNumericString(node.data.config.fee)) {
      level = "blocked";
      items.push("Join fee must be a base-unit integer.");
    }
  }

  if (node.data.kind === "joinMembership") {
    if (!health?.contractReachable) {
      level = "blocked";
      items.push("No live contract is reachable on this chain. Deploy first.");
    }
    if (!isNumericString(node.data.config.value)) {
      level = "blocked";
      items.push("Join value must be a base-unit integer.");
    }
    if (snapshot?.state.isMember) {
      level = "warning";
      items.push("Signer is already a member. The runner will skip join() to avoid an expected assertion.");
    }
  }

  if (["checkIsMember", "readJoinedAt", "eventViewer"].includes(node.data.kind) && health && !health.contractReachable) {
    level = "blocked";
    items.push("State and events need a live contract address. Deploy Membership first.");
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
  const [openFaqIndexes, setOpenFaqIndexes] = useState<number[]>([0]);
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

  function toggleFaq(index: number) {
    setOpenFaqIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

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
            <div className="home-nav__links">
              <a href="#workflow">
                Workflow <ChevronDown size={15} />
              </a>
              <a href="#execution">Execution</a>
              <a href="#future-plan">Roadmap</a>
              <a href="#faq">
                Learning <ChevronDown size={15} />
              </a>
            </div>
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

      <section id="workflow" className="home-section reveal-section">
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
      </footer>
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
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<PortalFlowNode, Edge> | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([initialNodes[0].id]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0];
  const selectedNodes = useMemo(
    () => orderedSelection(nodes, selectedNodeIds),
    [nodes, selectedNodeIds],
  );
  const endpoint = nodes.find((node) => node.data.kind === "chainConnect")?.data.config.endpoint;
  const guidance = nodeGuidance(selectedNode, health, snapshot, endpoint);
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

  function dropTemplateOnBoard(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const templateKind = event.dataTransfer.getData("application/portal-template") as PortalNodeKind;
    const template = templates.find((item) => item.kind === templateKind);

    if (!template) {
      return;
    }

    const position = flowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addTemplate(template, position);
  }

  function selectNodes(selection: PortalFlowNode[]) {
    const ids = selection.map((node) => node.id);
    setSelectedNodeIds(ids);

    if (selection.length > 0) {
      setSelectedNodeId(selection[selection.length - 1].id);
    }
  }

  function clearBoardSelection() {
    setSelectedNodeIds([]);
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
  }

  function deleteSelectedNodes() {
    if (selectedNodeIds.length === 0) {
      return;
    }

    if (selectedNodeIds.length >= nodes.length) {
      pushLog({
        level: "warning",
        title: "Delete blocked",
        body: "Keep at least one node on the board so the inspector and runner stay anchored.",
      });
      return;
    }

    const selected = new Set(selectedNodeIds);
    const remainingNodes = nodes.filter((node) => !selected.has(node.id));
    const nextSelectedId = remainingNodes[0]?.id || initialNodes[0].id;

    setNodes(remainingNodes.map((node) => ({ ...node, selected: node.id === nextSelectedId })));
    setEdges((current) => current.filter((edge) => !selected.has(edge.source) && !selected.has(edge.target)));
    setSelectedNodeId(nextSelectedId);
    setSelectedNodeIds([nextSelectedId]);
    pushLog({
      level: "info",
      title: "Nodes deleted",
      body: `${selected.size} selected node${selected.size === 1 ? "" : "s"} removed from the visual board.`,
    });
  }

  function duplicateSelectedNodes() {
    const sourceNodes = selectedNodes.length > 0 ? selectedNodes : [selectedNode];
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
        body: [
          result.command,
          result.stdout,
          result.stderr,
          result.error,
          ...explainRunIssue(result).map((hint) => `Hint: ${hint}`),
        ]
          .filter(Boolean)
          .join("\n")
          .trim(),
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

  async function runSelectedNodes() {
    const batch = selectedNodes.length > 0 ? selectedNodes : [selectedNode];

    for (const node of batch) {
      const ok = await runNode(node);
      if (!ok) {
        pushLog({
          level: "warning",
          title: "Selection run stopped",
          body: `${node.data.label} returned an error. Fix that node before continuing the selected batch.`,
        });
        break;
      }
    }
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

  useEffect(() => {
    function handleBoardHotkeys(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeIds.length > 0) {
        event.preventDefault();
        deleteSelectedNodes();
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
            Home
          </button>
          <button className={`text-button quiet ${beginnerMode ? "active-mode" : ""}`} onClick={() => setBeginnerMode((value) => !value)}>
            Beginner mode
          </button>
          <span className={`health-pill ${health?.rpcReachable ? "online" : "offline"}`}>
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
                  <span>{template.label}</span>
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
          <div className="flow-canvas" onDragOver={allowBoardDrop} onDrop={dropTemplateOnBoard}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setFlowInstance}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedNodeIds([node.id]);
              }}
              onSelectionChange={({ nodes: selection }) => selectNodes(selection as PortalFlowNode[])}
              selectionOnDrag
              fitView
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            </ReactFlow>
            <div className="canvas-action-dock" role="dialog" aria-label="Visual board selection actions">
              <div className="canvas-action-dock__meta">
                <span>Selection ops</span>
                <strong>{selectedNodeIds.length} selected</strong>
              </div>
              <div className="canvas-action-dock__actions">
                <button className="canvas-action" title="Run selected nodes in flow order" onClick={runSelectedNodes}>
                  <Play size={14} />
                  Run selection
                </button>
                <button className="canvas-action" title="Duplicate selected nodes" onClick={duplicateSelectedNodes}>
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  className="canvas-action danger"
                  title="Delete selected nodes"
                  onClick={deleteSelectedNodes}
                  disabled={selectedNodeIds.length === 0}
                >
                  <Trash2 size={14} />
                  Delete
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
            <span className={`panel-status ${selectedNode.data.status}`}>{selectedNode.data.status}</span>
          </div>

          <div className="inspector-card">
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

          {beginnerMode ? (
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
          ) : null}
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
