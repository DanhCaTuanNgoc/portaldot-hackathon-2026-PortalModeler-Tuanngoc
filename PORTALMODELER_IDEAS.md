# PortalModeler Ideas

## 1. Product Vision

PortalModeler is a visual node-board for designing, running, and explaining Portaldot contract workflows.

Instead of starting from terminal commands, Rust/ink!, contract metadata, gas flags, account seeds, and scattered scripts, developers start from a visual flow:

```txt
Chain Connect -> Account Select -> Balance Query -> Deploy Contract -> Call Action -> Read State -> Event Viewer
```

The key product idea is:

> Drag nodes, connect a workflow, inspect generated commands, run steps against a local Portaldot node, and understand what happened on-chain.

PortalModeler should feel like a model-driven dev console: visual first, command-aware, local-chain friendly, and beginner-safe.

## 2. Core Positioning

PortalModeler is not only a dashboard and not only a command generator.

The main product identity should be:

> A drag-and-drop workflow modeler for Portaldot developers.

The node board is the center of the product. Everything else supports the board:

- Command generator proves the graph has executable meaning.
- Local node feedback proves the flow can interact with a real chain.
- State and event visualization proves the user can understand the result.
- Beginner defaults reduce setup friction.
- Export turns a visual flow into shareable documentation.

## 3. Target Users

### New Portaldot Developers

They want to understand how account, balance, contract deployment, call actions, state, event, gas, metadata, and wasm artifacts fit together.

They need:

- Safe local defaults.
- Guided flow.
- Clear command preview.
- Error hints.
- Visual state and event feedback.

### Hackathon Builders

They want to prototype fast, show a working contract flow, and explain what happens on-chain without spending the demo inside terminal output.

They need:

- A fast local workflow.
- Reusable node templates.
- Exportable command sheet/checklist.
- A visual demo surface.

### Experienced Devs

They may not need beginner guidance, but they can still use PortalModeler to document, reproduce, and share contract workflows.

They need:

- Custom node config.
- Multi-step execution.
- Flow JSON export/import.
- Reliable command generation.

## 4. Pain Points

- New developers must understand chain connection, account seeds, SS58, token decimals, gas, metadata, wasm, events, contract addresses, and runtime APIs too early.
- Query, deploy, call, and read-state flows are split across scripts, docs, and terminal output.
- Manual values like `--value`, gas fallback, address, metadata path, and wasm path are easy to enter incorrectly.
- Local node setup has many steps before the user sees a meaningful result.
- Terminal output is hard to explain in a hackathon demo.
- There is no visual representation of the relationship between account, contract, action, state, and event.

## 5. Product Principle

PortalModeler should make each node answer three questions:

1. What input does this node need?
2. What output does this node produce?
3. What command or chain operation does this node represent?

Every node should have:

- A visible role on the board.
- A config panel.
- A generated command preview when relevant.
- A run status.
- A clear success or error result.

## 6. Node Board as the Main Feature

The node board should be the first screen.

The user should be able to:

- Drag nodes from a palette.
- Move nodes around the board.
- Connect compatible node handles.
- Click a node to edit configuration.
- See generated commands from the graph.
- Run one node or run the whole flow.
- Inspect logs, state, and events.
- Export the graph as JSON or Markdown.

The board should not be decorative. It must produce executable or exportable artifacts.

## 7. Recommended Node Set

### Phase 1 Demo Nodes

These nodes are enough to make the product feel like a real visual modeler while staying feasible.

| Node | Purpose | Example Output |
| --- | --- | --- |
| Chain Connect | Select RPC endpoint and network mode | `ws://127.0.0.1:9944` |
| Account Select | Select signer or dev seed | `//Alice` |
| Balance Query | Read account balance | `python scripts/query.py` |
| Artifact Select | Select metadata and wasm artifact | `contract/target/ink/*.json`, `*.wasm` |
| Deploy Membership | Deploy Membership contract | `python scripts/deploy.py --fee ...` |
| Join Membership | Call `join()` with value | `python scripts/call.py --action join --value ...` |
| Check Is Member | Read `is_member` state | `python scripts/call.py --action is_member` |
| Read Joined At | Read `joined_at` state | `python scripts/call.py --action joined_at` |
| Event Viewer | Show expected or decoded contract event | `MemberJoined` |
| Command Export | Export command sheet/checklist | Markdown or JSON |

### Phase 2 Nodes

| Node | Purpose |
| --- | --- |
| Gas Estimator | Dry-run gas and fallback gas config |
| State Viewer | Visual state cards and before/after diff |
| Error Explainer | Convert common script errors into user-friendly hints |
| Local Faucet Hint | Explain how to top up with local Alice |
| Condition Node | Check if balance, contract address, or artifact exists |
| Contract Address Store | Read/write `contract-address.txt` |

### Phase 3 Nodes

| Node | Purpose |
| --- | --- |
| Branch Node | Conditional workflow path |
| Batch Call Node | Run multiple calls |
| Loop Accounts Node | Run flow across accounts |
| Compare Snapshot Node | Compare state before and after actions |
| Multi-contract Node | Model interactions between contracts |
| Docs Generator Node | Generate docs from the flow |

## 8. MVP Flow

The strongest demo flow should be:

```txt
Chain Connect
  -> Account Select
  -> Balance Query
  -> Artifact Select
  -> Deploy Membership
  -> Join Membership
  -> Check Is Member
  -> Read Joined At
  -> Event Viewer
  -> Command Export
```

This flow proves:

- The board is interactive.
- Nodes can be connected.
- The graph has meaning.
- Commands are generated from the graph.
- The flow maps to real scripts in the repo.
- The user can understand contract state and events visually.

## 9. MVP Scope

### Must Have

- Drag-and-drop node board.
- Node palette.
- 8-10 predefined node templates.
- Connectable edges between nodes.
- Node inspector panel.
- Generated command preview.
- Simulated or real run output per node.
- Export graph JSON.
- Export Markdown command checklist.

### Should Have

- RPC health check for local node.
- Balance query using existing `scripts/query.py`.
- Deploy/call command mapping using existing scripts.
- Simple event timeline.
- Beginner defaults:
  - `ws://127.0.0.1:9944`
  - `//Alice`
  - SS58 `42`
  - token `POT`

### Nice To Have

- Real-time local node log polling.
- Real contract result parsing.
- Before/after state diff.
- Import previously exported flow JSON.
- Multiple flow tabs.

## 10. Technical Direction

### Frontend

Recommended library:

- `@xyflow/react` for the node board.

Recommended UI layout:

```txt
┌────────────────────────────────────────────────────────────┐
│ Header: PortalModeler / network status / run flow          │
├───────────────┬────────────────────────────┬───────────────┤
│ Node Palette  │ Visual Node Board          │ Inspector     │
│               │                            │ Command Panel │
├───────────────┴────────────────────────────┴───────────────┤
│ Logs / Events / Export Preview                              │
└────────────────────────────────────────────────────────────┘
```

Core frontend state:

```ts
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
};

type PortalFlowModel = {
  nodes: PortalNode[];
  edges: PortalEdge[];
};
```

### Backend / Script Layer

The repo already has a useful base:

- `scripts/query.py`
- `scripts/deploy.py`
- `scripts/call.py`
- `scripts/run_node.py`
- `model/generate.py`
- `model/membership.json`

PortalModeler should not replace these scripts at first. It should generate and orchestrate them.

### Flow Engine

Phase 1 does not need a complex graph engine.

Start with:

- Validate allowed edge pairs.
- Generate command list by topological order or by known demo flow order.
- Store node config inside the graph.
- Produce command sheet from node types.

Later:

- Add input/output types.
- Add validation rules.
- Add execution dependencies.
- Add conditional branches.

## 11. Phase Plan

## Phase 0: Stabilize Proof Foundation

Goal: make sure the current repo has reliable scripts and docs.

Tasks:

- Verify `scripts/query.py` can connect to local Portaldot node.
- Verify contract build path and artifact discovery.
- Verify deploy script can write `contract-address.txt`.
- Verify `join`, `is_member`, and `joined_at` commands.
- Keep `LOCAL_SETUP.md` as the setup source of truth.
- Fix encoding issues in docs if needed.

Exit criteria:

- A developer can follow setup docs and run query/deploy/call manually.
- The command flow is known and stable enough to be generated by the UI.

## Phase 1: Visual Node Board MVP

Goal: make drag-and-drop the main product experience.

Tasks:

- Add React Flow / XYFlow board.
- Create node palette.
- Implement draggable nodes.
- Implement connectable edges.
- Create custom node UI for the 10 MVP nodes.
- Add inspector panel for selected node.
- Add command preview panel.
- Add graph JSON export.
- Add Markdown checklist export.
- Seed the board with a default Membership flow.

Exit criteria:

- User can open the app and visually edit the Membership flow.
- User can drag nodes, connect nodes, configure nodes, and see generated commands.
- The board is clearly the center of the product.

## Phase 2: Script-Aware Execution

Goal: make the visual flow interact with existing local scripts.

Tasks:

- Add a safe execution layer for query/deploy/call.
- Connect `Balance Query` to `scripts/query.py`.
- Connect `Deploy Membership` to `scripts/deploy.py`.
- Connect action nodes to `scripts/call.py`.
- Show status per node:
  - idle
  - running
  - success
  - warning
  - error
- Show logs under the board.
- Add local node health check.
- Read `contract-address.txt` after deploy.

Exit criteria:

- User can run at least one node from the UI.
- Ideally, user can run the full Membership flow against a local node.
- Errors are visible and understandable.

## Phase 3: State and Event Visualization

Goal: make on-chain result easy to understand.

Tasks:

- Add simple account card:
  - address
  - balance
  - token
  - nonce if available
- Add contract card:
  - contract address
  - metadata path
  - wasm path
  - available messages
- Add state cards:
  - `is_member`
  - `joined_at`
- Add event timeline:
  - deploy events
  - call events
  - `MemberJoined`
- Add before/after snapshot for action nodes.

Exit criteria:

- User can explain what happened after running `join()`.
- The UI is more informative than raw terminal output.

## Phase 4: Guided Beginner Mode

Goal: make the tool beginner-safe.

Tasks:

- Add default local profile.
- Hide advanced fields by default.
- Add node-level validation.
- Add warnings for mainnet vs local dev.
- Add setup checklist node.
- Add common error hints:
  - local node not running
  - missing artifacts
  - missing balance
  - missing contract address
  - wrong RPC endpoint
  - dry-run gas unavailable

Exit criteria:

- A new user can understand what to do next without reading all scripts first.
- The UI prevents common mistakes before execution.

## Phase 5: Shareable Modeler

Goal: turn the board into a reusable modeling artifact.

Tasks:

- Add flow import.
- Add named flows.
- Add generated docs.
- Add screenshot/export diagram.
- Add model-to-node generation from `model/membership.json`.
- Add node-to-model export.
- Support custom action templates.

Exit criteria:

- A visual flow can be shared, restored, documented, and reused.
- PortalModeler becomes more than a one-off demo UI.

## 12. Feasibility Analysis

### What Is Highly Feasible

- Drag-and-drop board with predefined node templates.
- Command generation from node config.
- JSON/Markdown export.
- Simulated run logs.
- Static event and state visualizer.
- Beginner defaults.

### What Is Moderately Feasible

- Running Python scripts from the UI.
- Reading local script output.
- Parsing contract address after deploy.
- Showing local node health.
- Showing real balance query output.

### What Is Risky

- Fully generic contract metadata parsing.
- Fully generic graph execution engine.
- Advanced gas estimation across runtime versions.
- Real event decoding for every possible contract.
- Branching, loops, and batch execution too early.

## 13. Recommended Hackathon Strategy

The hackathon demo should not try to prove every future feature.

It should prove one strong story:

1. Start from a visual board.
2. Drag or inspect Membership workflow nodes.
3. Show that the graph generates real commands.
4. Run or simulate query/deploy/call.
5. Show state/event result.
6. Export the flow as docs or JSON.

The ideal demo line:

> This is not just a dashboard. The visual model is the source of truth, and commands, checklist, logs, and state views are generated from it.

## 14. Success Metrics

### MVP Success

- User understands the contract flow without reading scripts first.
- User can edit the flow visually.
- User can generate the correct commands.
- User can export the flow.
- Demo audience understands account -> deploy -> call -> state -> event relationship.

### Product Success

- New devs reach first successful local contract call faster.
- Hackathon teams can present Portaldot workflows visually.
- Repeated contract flows become reusable templates.
- The visual graph becomes useful documentation.

## 15. Final Recommendation

Keep the drag-and-drop node board as the main feature.

Do not reduce PortalModeler into a terminal dashboard. The dashboard, command preview, local logs, and state visualizer should all serve the graph.

The best near-term version is:

> A visual Membership workflow builder for Portaldot local development, with draggable nodes, generated commands, runnable steps, and explainable state/event output.

This scope is focused enough to finish, visual enough to stand out, and technical enough to prove real value.
