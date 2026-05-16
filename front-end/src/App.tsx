import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Activity,
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  Play,
  Server,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type LogLevel = "info" | "success" | "warning" | "error";

type LogLine = {
  time: string;
  level: LogLevel;
  text: string;
};

type ActionId = "bootNode" | "query" | "dryRun" | "deploy" | "join";

const actions: Record<ActionId, { label: string; command: string; lines: Omit<LogLine, "time">[] }> = {
  bootNode: {
    label: "Boot Node",
    command: "./portaldot_dev --dev --alice --name Andrea9705 --base-path /tmp/alice",
    lines: [
      { level: "info", text: "Running in --dev mode, RPC CORS has been disabled." },
      { level: "info", text: "Portaldot Node" },
      { level: "info", text: "Chain specification: Development" },
      { level: "info", text: "Node name: Andrea9705" },
      { level: "info", text: "Role: AUTHORITY" },
      { level: "info", text: "Database: RocksDb at /tmp/alice/chains/dev/db" },
      { level: "info", text: "Native runtime: portaldot-1002 (substrate-node-0.tx2.au10)" },
      { level: "info", text: "Prometheus server started at 127.0.0.1:9615" },
      { level: "success", text: "Listening for new connections on 127.0.0.1:9944." },
    ],
  },
  query: {
    label: "Query Chain",
    command: "python scripts/query.py",
    lines: [
      { level: "info", text: "Connecting to ws://127.0.0.1:9944" },
      { level: "success", text: "Connected chain: Development" },
      { level: "success", text: "Alice balance detected: 50000.000000 POT" },
    ],
  },
  dryRun: {
    label: "Dry-run Gas",
    command: "python scripts/deploy.py --fee 100000000000000 --dry-run-only",
    lines: [
      { level: "info", text: "Loading membership.json and membership.wasm" },
      { level: "warning", text: "Runtime may use legacy endowment + Compact<Weight> params" },
      { level: "info", text: "ContractsApi.instantiate dry-run requested" },
    ],
  },
  deploy: {
    label: "Deploy Local",
    command: "python scripts/deploy.py --fee 100000000000000",
    lines: [
      { level: "info", text: "Deploying Membership contract from //Alice" },
      { level: "info", text: "Using gas returned by dry-run, or fallback gas flags if unavailable" },
      { level: "success", text: "Contract address will be written to contract-address.txt" },
    ],
  },
  join: {
    label: "Call join()",
    command: "python scripts/call.py --action join --value 100000000000000",
    lines: [
      { level: "info", text: "Reading contract-address.txt" },
      { level: "info", text: "Estimating gas with contract.read(..., 'join')" },
      { level: "success", text: "MemberJoined event expected after successful extrinsic" },
    ],
  },
};

const initialLogs: LogLine[] = [
  { time: "12:01:10", level: "success", text: "Portaldot local node listening on 127.0.0.1:9944" },
  { time: "12:01:17", level: "info", text: "Accepted websocket connection from local dashboard" },
  { time: "12:02:04", level: "success", text: "Rust toolchain restored at D:\\.cargo and D:\\.rustup" },
  { time: "12:02:19", level: "success", text: "cargo check and contract unit tests passed" },
];

const statusItems = [
  { label: "Local Node", value: "Ready", tone: "green", icon: Server },
  { label: "Toolchain", value: "Rust 1.86", tone: "blue", icon: ShieldCheck },
  { label: "Contract", value: "Membership", tone: "green", icon: CircleDot },
  { label: "Gas Mode", value: "Dry-run first", tone: "yellow", icon: Zap },
];

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function levelColor(level: LogLevel) {
  if (level === "success") return "#33d17a";
  if (level === "warning") return "#f5c451";
  if (level === "error") return "#ff6b7a";
  return "#8fb3ff";
}

function statusToneStyle(tone: string) {
  if (tone === "green") return styles.greenIcon;
  if (tone === "yellow") return styles.yellowIcon;
  return styles.blueIcon;
}

type NodeLogSnapshot = {
  updatedAt?: string;
  command?: string;
  lines?: LogLine[];
};

function App() {
  const [nodeLogs, setNodeLogs] = useState(initialLogs);
  const [sessionLogs, setSessionLogs] = useState<LogLine[]>([]);
  const [activeAction, setActiveAction] = useState<ActionId>("deploy");

  const active = actions[activeAction];
  const logs = useMemo(() => [...nodeLogs, ...sessionLogs], [nodeLogs, sessionLogs]);
  const completedCount = useMemo(() => logs.filter((line) => line.level === "success").length, [logs]);

  useEffect(() => {
    let cancelled = false;

    async function loadNodeLogs() {
      try {
        const response = await fetch("/node-log.json", { cache: "no-store" });
        if (!response.ok) return;

        const snapshot = (await response.json()) as NodeLogSnapshot;
        if (cancelled || !Array.isArray(snapshot.lines)) return;

        setNodeLogs(snapshot.lines);
      } catch {
        return;
      }
    }

    void loadNodeLogs();
    const interval = window.setInterval(() => {
      void loadNodeLogs();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  function runAction(id: ActionId) {
    setActiveAction(id);
    const stamped = actions[id].lines.map((line) => ({ ...line, time: now() }));
    setSessionLogs((current) => [...current, { time: now(), level: "info", text: `$ ${actions[id].command}` }, ...stamped]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>PortalModeler Control Surface</Text>
          <Text style={styles.title}>Portaldot Local Deploy Console</Text>
        </View>
        <View style={styles.headerPill}>
          <Activity size={16} color="#33d17a" />
          <Text style={styles.headerPillText}>Desktop preview</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.leftRail}>
          <Text style={styles.sectionLabel}>Runtime Snapshot</Text>
          {statusItems.map((item) => {
            const Icon = item.icon;
            return (
              <View key={item.label} style={styles.statusCard}>
                <View style={[styles.statusIcon, statusToneStyle(item.tone)]}>
                  <Icon size={17} color="#f8fbff" />
                </View>
                <View>
                  <Text style={styles.statusLabel}>{item.label}</Text>
                  <Text style={styles.statusValue}>{item.value}</Text>
                </View>
              </View>
            );
          })}

          <View style={styles.metricPanel}>
            <Text style={styles.metricValue}>{completedCount}</Text>
            <Text style={styles.metricLabel}>successful checkpoints in this session</Text>
          </View>
        </View>

        <View style={styles.mainPanel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelTitleGroup}>
              <Terminal size={19} color="#8fb3ff" />
              <Text style={styles.panelTitle}>Deploy Terminal</Text>
            </View>
            <View style={styles.liveBadge}>
              <Clock3 size={14} color="#9da8bd" />
              <Text style={styles.liveBadgeText}>local session</Text>
            </View>
          </View>

          <ScrollView style={styles.terminal} contentContainerStyle={styles.terminalContent}>
            {logs.map((line, index) => (
              <View key={`${line.time}-${index}`} style={styles.logLine}>
                <Text style={styles.logTime}>{line.time}</Text>
                <Text style={[styles.logLevel, { color: levelColor(line.level) }]}>{line.level}</Text>
                <Text style={styles.logText}>{line.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            {(Object.keys(actions) as ActionId[]).map((id) => (
              <Pressable
                key={id}
                onPress={() => runAction(id)}
                style={[styles.actionButton, activeAction === id && styles.actionButtonActive]}
              >
                <Play size={14} color={activeAction === id ? "#071018" : "#aeb8c8"} />
                <Text style={[styles.actionText, activeAction === id && styles.actionTextActive]}>
                  {actions[id].label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.rightPanel}>
          <Text style={styles.sectionLabel}>Active Command</Text>
          <View style={styles.commandBox}>
            <Text style={styles.commandText}>{active.command}</Text>
            <Copy size={16} color="#9da8bd" />
          </View>

          <View style={styles.checklist}>
            {[
              "scripts/run_node.py writes live node-log.json",
              "python scripts/query.py",
              "contract artifacts under target/ink",
              "contract-address.txt after deploy",
            ].map((item) => (
              <View key={item} style={styles.checkItem}>
                <CheckCircle2 size={16} color="#33d17a" />
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    minHeight: 720,
    padding: 28,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  kicker: {
    color: "#6f7b91",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#f5f8ff",
    fontSize: 31,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 4,
  },
  headerPill: {
    alignItems: "center",
    backgroundColor: "rgba(51, 209, 122, 0.11)",
    borderColor: "rgba(51, 209, 122, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headerPillText: {
    color: "#c9f7dc",
    fontSize: 13,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    gap: 18,
  },
  leftRail: {
    width: 260,
    gap: 12,
  },
  sectionLabel: {
    color: "#7f8ba0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  statusCard: {
    alignItems: "center",
    backgroundColor: "rgba(17, 21, 31, 0.82)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  statusIcon: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  greenIcon: { backgroundColor: "#168650" },
  blueIcon: { backgroundColor: "#2f63d7" },
  yellowIcon: { backgroundColor: "#b37d12" },
  statusLabel: {
    color: "#7f8ba0",
    fontSize: 12,
    fontWeight: "600",
  },
  statusValue: {
    color: "#f5f8ff",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  metricPanel: {
    backgroundColor: "rgba(17, 21, 31, 0.82)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
    padding: 18,
  },
  metricValue: {
    color: "#33d17a",
    fontSize: 42,
    fontWeight: "800",
  },
  metricLabel: {
    color: "#9da8bd",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  mainPanel: {
    backgroundColor: "rgba(12, 15, 22, 0.9)",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 640,
    overflow: "hidden",
  },
  panelHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  panelTitleGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  panelTitle: {
    color: "#f5f8ff",
    fontSize: 16,
    fontWeight: "800",
  },
  liveBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  liveBadgeText: {
    color: "#9da8bd",
    fontSize: 12,
    fontWeight: "700",
  },
  terminal: {
    height: 500,
  },
  terminalContent: {
    padding: 18,
  },
  logLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 7,
  },
  logTime: {
    color: "#667085",
    fontFamily: "JetBrains Mono",
    fontSize: 12,
    width: 70,
  },
  logLevel: {
    fontFamily: "JetBrains Mono",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    width: 70,
  },
  logText: {
    color: "#d9e2f2",
    flex: 1,
    fontFamily: "JetBrains Mono",
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 10,
  },
  actionButtonActive: {
    backgroundColor: "#33d17a",
    borderColor: "#33d17a",
  },
  actionText: {
    color: "#c4cedd",
    fontSize: 13,
    fontWeight: "800",
  },
  actionTextActive: {
    color: "#071018",
  },
  rightPanel: {
    backgroundColor: "rgba(17, 21, 31, 0.82)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    width: 320,
  },
  commandBox: {
    alignItems: "flex-start",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 8,
    padding: 14,
  },
  commandText: {
    color: "#dce7ff",
    flex: 1,
    fontFamily: "JetBrains Mono",
    fontSize: 12,
    lineHeight: 18,
  },
  checklist: {
    gap: 12,
    marginTop: 18,
  },
  checkItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  checkText: {
    color: "#c6cfde",
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});

export default App;
