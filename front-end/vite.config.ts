import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type RunRequest = {
  kind?: string;
  config?: Record<string, string | undefined>;
};

function sendJson(response: { statusCode?: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function readBody(request: NodeJS.ReadableStream) {
  return new Promise<string>((resolveBody, rejectBody) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 32_000) {
        rejectBody(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

function checkTcp(url: string) {
  return new Promise<boolean>((resolveCheck) => {
    const parsed = new URL(url);
    const socket = net.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 9944),
      timeout: 1200,
    });
    socket.on("connect", () => {
      socket.destroy();
      resolveCheck(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolveCheck(false);
    });
    socket.on("error", () => resolveCheck(false));
  });
}

function runProcess(command: string, args: string[], cwd = repoRoot) {
  return new Promise<{ ok: boolean; command: string; stdout: string; stderr: string; code: number | null }>((resolveRun) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveRun({ ok: false, command: [command, ...args].join(" "), stdout: trimOutput(stdout), stderr: trimOutput(error.message), code: null });
    });
    child.on("close", (code) => {
      resolveRun({ ok: code === 0, command: [command, ...args].join(" "), stdout: trimOutput(stdout), stderr: trimOutput(stderr), code });
    });
  });
}

function trimOutput(value: string) {
  if (value.length <= 12_000) return value;
  return `${value.slice(0, 12_000)}\n... output truncated by PortalModeler ...\n`;
}

function matchValue(source: string, pattern: RegExp) {
  return source.match(pattern)?.[1] || "";
}

function parseQueryOutput(stdout: string) {
  return {
    account: matchValue(stdout, /Account:\s*(.+)/),
    token: matchValue(stdout, /Token:\s*(.+)/) || "UNIT",
    freeBalance: matchValue(stdout, /Free balance:\s*(.+)/),
    nonce: matchValue(stdout, /"nonce":\s*(\d+)/),
  };
}

function parseIsMember(stdout: string) {
  if (stdout.includes('"Ok": true') || stdout.includes("'Ok': True")) return true;
  if (stdout.includes('"Ok": false') || stdout.includes("'Ok': False")) return false;
  return null;
}

function parseJoinedAt(stdout: string) {
  return matchValue(stdout, /Decoded value:\s*\{'Ok':\s*(\d+)\}/) || matchValue(stdout, /"Ok":\s*(\d+)/);
}

function contractMetadata() {
  const metadataPath = resolve(repoRoot, "contract/target/ink/membership.json");
  if (!existsSync(metadataPath)) return { messages: [] as string[], events: [] as string[] };

  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
    spec?: {
      messages?: Array<{ label?: string }>;
      events?: Array<{ label?: string }>;
    };
  };

  return {
    messages: metadata.spec?.messages?.map((message) => message.label || "").filter(Boolean) || [],
    events: metadata.spec?.events?.map((event) => event.label || "").filter(Boolean) || [],
  };
}

async function contractLive(endpoint: string) {
  if (!existsSync(resolve(repoRoot, "contract-address.txt"))) return false;
  const result = await runProcess("python", ["scripts/call.py", "--url", endpoint, "--action", "join_fee"]);
  return result.ok;
}

function commandForNode(kind: string, config: Record<string, string | undefined>) {
  const endpoint = config.endpoint || "ws://127.0.0.1:9944";
  const fee = config.fee || "100000000000000";
  const value = config.value || "100000000000000";

  if (kind === "chainConnect") return { command: "python", args: ["scripts/doctor.py", "--url", endpoint] };
  if (kind === "balanceQuery") return { command: "python", args: ["scripts/query.py", "--url", endpoint] };
  if (kind === "joinMembership") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", "join", "--value", value] };
  if (kind === "deployMembership") return { command: "python", args: ["scripts/deploy.py", "--url", endpoint, "--fee", fee] };
  if (kind === "checkIsMember") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", "is_member"] };
  if (kind === "readJoinedAt") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", "joined_at"] };
  return null;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "portalmodeler-safe-runner",
      configureServer(server) {
        server.middlewares.use("/api/health", async (request, response) => {
          if (request.method !== "GET") {
            sendJson(response, 405, { ok: false, error: "Method not allowed" });
            return;
          }

          const endpoint = new URL(request.url || "", "http://localhost").searchParams.get("endpoint") || "ws://127.0.0.1:9944";
          const rpcReachable = await checkTcp(endpoint);
          const addressPath = resolve(repoRoot, "contract-address.txt");
          const contractReachable = rpcReachable ? await contractLive(endpoint) : false;
          sendJson(response, 200, {
            ok: true,
            endpoint,
            rpcReachable,
            contractReachable,
            contractAddress: existsSync(addressPath) ? readFileSync(addressPath, "utf8").trim() : "",
            artifactsReady:
              existsSync(resolve(repoRoot, "contract/target/ink/membership.json")) &&
              existsSync(resolve(repoRoot, "contract/target/ink/membership.wasm")),
          });
        });

        server.middlewares.use("/api/run-node", async (request, response) => {
          if (request.method !== "POST") {
            sendJson(response, 405, { ok: false, error: "Method not allowed" });
            return;
          }

          try {
            const payload = JSON.parse(await readBody(request)) as RunRequest;
            const kind = payload.kind || "";
            const config = payload.config || {};

            if (kind === "accountSelect") {
              sendJson(response, 200, { ok: true, command: "PORTALDOT_SEED=//Alice", stdout: `Signer seed: ${config.seed || "//Alice"}\n`, stderr: "" });
              return;
            }

            if (kind === "artifactSelect") {
              const metadataPath = resolve(repoRoot, config.metadataPath || "contract/target/ink/membership.json");
              const wasmPath = resolve(repoRoot, config.wasmPath || "contract/target/ink/membership.wasm");
              sendJson(response, 200, {
                ok: existsSync(metadataPath) && existsSync(wasmPath),
                command: "artifact check",
                stdout: `metadata: ${existsSync(metadataPath) ? "ready" : "missing"}\nwasm: ${existsSync(wasmPath) ? "ready" : "missing"}\n`,
                stderr: "",
              });
              return;
            }

            if (kind === "eventViewer" || kind === "commandExport") {
              sendJson(response, 200, { ok: true, command: kind, stdout: `${kind} is generated in the browser.\n`, stderr: "" });
              return;
            }

            if (kind === "deployMembership" && (await contractLive(config.endpoint || "ws://127.0.0.1:9944"))) {
              sendJson(response, 200, {
                ok: true,
                command: "python scripts/deploy.py",
                stdout: `Existing contract-address.txt found. Reusing ${readFileSync(resolve(repoRoot, "contract-address.txt"), "utf8").trim()}.\nDelete the file to force a fresh deploy.\n`,
                stderr: "",
              });
              return;
            }

            if (kind === "joinMembership") {
              const memberCheck = await runProcess("python", ["scripts/call.py", "--url", config.endpoint || "ws://127.0.0.1:9944", "--action", "is_member"]);
              if (memberCheck.ok && (memberCheck.stdout.includes('"Ok": true') || memberCheck.stdout.includes("'Ok': True"))) {
                sendJson(response, 200, {
                  ok: true,
                  command: "python scripts/call.py --action join",
                  stdout: "Signer is already a member. Skipped join() to avoid an expected contract assertion.\n",
                  stderr: "",
                });
                return;
              }
            }

            const safeCommand = commandForNode(kind, config);
            if (!safeCommand) {
              sendJson(response, 400, { ok: false, error: `Unsupported node kind: ${kind}` });
              return;
            }

            sendJson(response, 200, await runProcess(safeCommand.command, safeCommand.args));
          } catch (error) {
            sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        });

        server.middlewares.use("/api/snapshot", async (request, response) => {
          if (request.method !== "GET") {
            sendJson(response, 405, { ok: false, error: "Method not allowed" });
            return;
          }

          const endpoint = new URL(request.url || "", "http://localhost").searchParams.get("endpoint") || "ws://127.0.0.1:9944";
          const addressPath = resolve(repoRoot, "contract-address.txt");
          const address = existsSync(addressPath) ? readFileSync(addressPath, "utf8").trim() : "";
          const metadata = contractMetadata();

          const query = await runProcess("python", ["scripts/query.py", "--url", endpoint]);
          const isMember = address ? await runProcess("python", ["scripts/call.py", "--url", endpoint, "--action", "is_member"]) : null;
          const joinedAt = address ? await runProcess("python", ["scripts/call.py", "--url", endpoint, "--action", "joined_at"]) : null;
          const isContractReachable = Boolean(isMember?.ok);
          const account = parseQueryOutput(query.stdout);
          const memberState = isMember ? parseIsMember(isMember.stdout) : null;
          const joinedAtValue = joinedAt ? parseJoinedAt(joinedAt.stdout) : "";

          sendJson(response, 200, {
            ok: query.ok,
            account,
            contract: {
              address,
              reachable: isContractReachable,
              metadataPath: "contract/target/ink/membership.json",
              wasmPath: "contract/target/ink/membership.wasm",
              messages: metadata.messages,
            },
            state: {
              isMember: memberState,
              joinedAt: joinedAtValue,
            },
            events: [
              {
                name: "Instantiated",
                status: isContractReachable ? "observed" : "waiting",
                detail: isContractReachable
                  ? `Contract ${address}`
                  : address
                    ? `Address file exists, but contract is not found on the current chain: ${address}`
                    : "No contract-address.txt yet",
              },
              {
                name: "MemberJoined",
                status: memberState ? "observed" : "waiting",
                detail: memberState ? `Joined at ${joinedAtValue || "unknown timestamp"}` : "Run join() to emit MemberJoined",
              },
              ...metadata.events.map((event) => ({
                name: event,
                status: memberState ? "decoded" : "expected",
                detail: "Declared in contract metadata",
              })),
            ],
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      "react-native": "react-native-web",
    },
  },
});
