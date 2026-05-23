import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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
  const message = config.message || config.action || "is_member";
  const recipient = config.account || config.recipient || "";

  if (kind === "connectRpc" || kind === "checkRuntime") return { command: "python", args: ["scripts/doctor.py", "--url", endpoint] };
  if (kind === "checkBalance") return { command: "python", args: ["scripts/query.py", "--url", endpoint] };
  if (kind === "transferPot") {
    const args = ["scripts/transfer.py", "--url", endpoint, "--amount", value];
    if (recipient) args.push("--to", recipient);
    return { command: "python", args };
  }
  if (kind === "buildContract") return { command: "cargo", args: ["contract", "build", "--release"], cwd: resolve(repoRoot, config.contractDir || "contract") };
  if (kind === "deployContract") return { command: "python", args: ["scripts/deploy.py", "--url", endpoint, "--fee", fee] };
  if (kind === "verifyContractLive") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", "join_fee"] };
  if (kind === "readMessage") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", message] };
  if (kind === "callMessage") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", message, "--value", value] };
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

            if (kind === "checkAccount") {
              sendJson(response, 200, { ok: true, command: "PORTALDOT_SEED=//Alice", stdout: `Signer seed: ${config.seed || "//Alice"}\n`, stderr: "" });
              return;
            }

            if (kind === "loadArtifact") {
              const metadataPath = resolve(repoRoot, config.metadataPath || "contract/target/ink/membership.json");
              const wasmPath = resolve(repoRoot, config.wasmPath || "contract/target/ink/membership.wasm");
              const metadataExists = existsSync(metadataPath);
              const wasmExists = existsSync(wasmPath);
              let metadataParsed = false;
              let messageCount = 0;
              let eventCount = 0;
              let parseError = "";

              if (metadataExists) {
                try {
                  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
                    spec?: {
                      messages?: unknown[];
                      events?: unknown[];
                    };
                  };
                  metadataParsed = true;
                  messageCount = metadata.spec?.messages?.length || 0;
                  eventCount = metadata.spec?.events?.length || 0;
                } catch (error) {
                  parseError = error instanceof Error ? error.message : String(error);
                }
              }

              const wasmSize = wasmExists ? statSync(wasmPath).size : 0;
              const ok = metadataExists && wasmExists && metadataParsed && messageCount > 0 && wasmSize > 0;
              sendJson(response, 200, {
                ok,
                command: "artifact check",
                stdout: [
                  `metadata: ${metadataExists ? "ready" : "missing"}`,
                  `metadata parse: ${metadataParsed ? "ok" : "failed"}`,
                  `messages: ${messageCount}`,
                  `events: ${eventCount}`,
                  `wasm: ${wasmExists ? "ready" : "missing"}`,
                  `wasm bytes: ${wasmSize}`,
                ].join("\n"),
                stderr: parseError,
              });
              return;
            }

            if (kind === "attachContract") {
              const addressPath = resolve(repoRoot, "contract-address.txt");
              const address = config.contractAddress || (existsSync(addressPath) ? readFileSync(addressPath, "utf8").trim() : "");
              sendJson(response, 200, {
                ok: Boolean(address),
                command: "attach contract",
                stdout: address ? `Attached contract address: ${address}\n` : "No contract address provided.\n",
                stderr: "",
              });
              return;
            }

            if (["watchEvents", "decodeEvents", "exportWorkflow", "exportCommands", "saveWorkflow", "loadWorkflow", "generateReport"].includes(kind)) {
              sendJson(response, 200, { ok: true, command: kind, stdout: `${kind} is generated in the browser.\n`, stderr: "" });
              return;
            }

            if (kind === "deployContract" && (await contractLive(config.endpoint || "ws://127.0.0.1:9944"))) {
              sendJson(response, 200, {
                ok: true,
                command: "python scripts/deploy.py",
                stdout: `Existing contract-address.txt found. Reusing ${readFileSync(resolve(repoRoot, "contract-address.txt"), "utf8").trim()}.\nDelete the file to force a fresh deploy.\n`,
                stderr: "",
              });
              return;
            }

            if (kind === "callMessage" && (config.message || "join") === "join") {
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

            sendJson(response, 200, await runProcess(safeCommand.command, safeCommand.args, safeCommand.cwd));
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
