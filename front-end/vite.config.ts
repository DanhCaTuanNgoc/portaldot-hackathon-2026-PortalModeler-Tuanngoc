import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontEndRoot = dirname(fileURLToPath(import.meta.url));

type RunRequest = {
  kind?: string;
  config?: Record<string, string | undefined>;
};

type AiPlanRequest = {
  prompt?: string;
  endpoint?: string;
  availableKinds?: string[];
};

type AiFlowStep = {
  kind: string;
  config?: Record<string, string>;
};

type AiFlowPlan = {
  title?: string;
  summary?: string;
  steps?: AiFlowStep[];
  edges?: Array<[string, string]>;
  autoRun?: boolean;
};

const SAFE_AI_NODE_KINDS = new Set([
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

const READ_ONLY_AI_NODE_KINDS = new Set([
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
  "loadArtifact",
  "attachContract",
  "verifyContractLive",
  "readMessage",
  "watchEvents",
  "decodeEvents",
  "exportWorkflow",
  "exportCommands",
  "saveWorkflow",
  "loadWorkflow",
  "generateReport",
]);

const DEFAULT_ALICE_ADDRESS = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const DEFAULT_BOB_ADDRESS = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

const AI_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    autoRun: { type: "boolean" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: Array.from(SAFE_AI_NODE_KINDS) },
          config: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["kind", "config"],
      },
    },
    edges: {
      type: "array",
      maxItems: 16,
      items: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "string", enum: Array.from(SAFE_AI_NODE_KINDS) },
      },
    },
  },
  required: ["title", "summary", "autoRun", "steps", "edges"],
};

const GEMINI_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    endpoint: { type: "string" },
    seed: { type: "string" },
    account: { type: "string" },
    recipient: { type: "string" },
    to: { type: "string" },
    value: { type: "string" },
    amount: { type: "string" },
    target: { type: "string" },
    action: { type: "string" },
    message: { type: "string" },
    format: { type: "string" },
    scope: { type: "string" },
    asset: { type: "string" },
    metadataPath: { type: "string" },
    wasmPath: { type: "string" },
  },
};

const GEMINI_AI_PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    autoRun: { type: "boolean" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          kind: { type: "string" },
          config: GEMINI_CONFIG_SCHEMA,
        },
        required: ["kind", "config"],
      },
    },
    edges: {
      type: "array",
      maxItems: 16,
      items: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "string" },
      },
    },
  },
  required: ["title", "summary", "autoRun", "steps", "edges"],
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
      constructors?: Array<{ label?: string; args?: Array<{ label?: string; type?: unknown }> }>;
      messages?: Array<{ label?: string }>;
      events?: Array<{ label?: string }>;
    };
  };

  return {
    constructors: metadata.spec?.constructors?.map((constructor) => constructor.label || "").filter(Boolean) || [],
    messages: metadata.spec?.messages?.map((message) => message.label || "").filter(Boolean) || [],
    events: metadata.spec?.events?.map((event) => event.label || "").filter(Boolean) || [],
  };
}

function contractMetadataSummary(metadataPath = "contract/target/ink/membership.json") {
  const resolved = resolve(repoRoot, metadataPath);
  if (!existsSync(resolved)) {
    return { ok: false, path: resolved, constructors: [] as string[], messages: [] as string[], events: [] as string[], error: "metadata file is missing" };
  }

  const metadata = JSON.parse(readFileSync(resolved, "utf8")) as {
    spec?: {
      constructors?: Array<{ label?: string; args?: Array<{ label?: string; type?: unknown }> }>;
      messages?: Array<{ label?: string; mutates?: boolean; payable?: boolean; args?: Array<{ label?: string; type?: unknown }> }>;
      events?: Array<{ label?: string; args?: Array<{ label?: string; type?: unknown }> }>;
    };
  };

  const describeArgs = (args?: Array<{ label?: string }>) => (args || []).map((arg) => arg.label || "arg").join(", ");
  return {
    ok: true,
    path: resolved,
    constructors: (metadata.spec?.constructors || []).map((constructor) => `${constructor.label || "constructor"}(${describeArgs(constructor.args)})`),
    messages: (metadata.spec?.messages || []).map((message) => {
      const flags = [message.mutates ? "mutates" : "read", message.payable ? "payable" : ""].filter(Boolean).join(", ");
      return `${message.label || "message"}(${describeArgs(message.args)})${flags ? ` [${flags}]` : ""}`;
    }),
    events: (metadata.spec?.events || []).map((event) => `${event.label || "event"}(${describeArgs(event.args)})`),
    error: "",
  };
}

function extractResponseText(responseJson: Record<string, unknown>) {
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text;
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const chunks: string[] = [];
  output.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    content.forEach((part) => {
      if (!part || typeof part !== "object") return;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    });
  });
  return chunks.join("\n").trim();
}

function extractChatCompletionText(responseJson: Record<string, unknown>) {
  const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function extractGeminiText(responseJson: Record<string, unknown>) {
  const candidates = Array.isArray(responseJson.candidates) ? responseJson.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  const content = (first as { content?: unknown }).content;
  if (!content || typeof content !== "object") {
    return "";
  }

  const parts = Array.isArray((content as { parts?: unknown }).parts) ? (content as { parts: unknown[] }).parts : [];
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n")
    .trim();
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function sanitizeAiConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  return Object.entries(config as Record<string, unknown>).reduce<Record<string, string>>((safeConfig, [key, value]) => {
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) && value !== undefined && value !== null) {
      safeConfig[key] = String(value);
    }
    return safeConfig;
  }, {});
}

function firstConfigValue(config: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (config[key]) return config[key];
  }
  return "";
}

function explicitSs58AddressFromPrompt(prompt: string) {
  return prompt.match(/\b5[1-9A-HJ-NP-Za-km-z]{20,}\b/)?.[0] || "";
}

function looksLikeSeedUri(value?: string) {
  return Boolean(value?.startsWith("//"));
}

function normalizeAiStep(step: { kind: string; config: Record<string, string> }, prompt = "") {
  const config = { ...step.config };
  const promptAddress = explicitSs58AddressFromPrompt(prompt);
  const promptWantsBob = /\bbob\b/i.test(prompt);
  const promptWantsTransfer = /\btransfer\b|\bsend\b|\bsends\b/i.test(prompt);

  if (step.kind === "connectRpc" && !config.endpoint) {
    config.endpoint = "ws://127.0.0.1:9944";
  }

  if (step.kind === "checkAccount") {
    config.seed = config.seed || config.fromSeed || "//Alice";
    config.account = config.account || config.address || config.fromAddress || DEFAULT_ALICE_ADDRESS;
  }

  if (step.kind === "transactionPreview") {
    config.target = config.target || config.action || "transferPot";
    config.value = firstConfigValue(config, ["value", "amount", "amountBaseUnits"]);
    config.recipient = firstConfigValue(config, ["recipient", "to", "toAddress", "account"]);
    if (config.target === "transferPot" && promptWantsBob && !promptAddress) {
      config.recipient = DEFAULT_BOB_ADDRESS;
    }
    if (config.target === "transferPot" && looksLikeSeedUri(config.recipient)) {
      config.recipient = DEFAULT_BOB_ADDRESS;
    }
    if (config.target === "transferPot" && promptWantsTransfer && !config.recipient && !promptAddress) {
      config.recipient = DEFAULT_BOB_ADDRESS;
    }
  }

  if (step.kind === "transferPot") {
    config.value = firstConfigValue(config, ["value", "amount", "amountBaseUnits"]);
    config.recipient = firstConfigValue(config, ["recipient", "to", "toAddress", "account"]);
    if (promptWantsBob && !promptAddress) {
      config.recipient = DEFAULT_BOB_ADDRESS;
    }
    if (looksLikeSeedUri(config.recipient)) {
      config.recipient = DEFAULT_BOB_ADDRESS;
    }
    if (promptWantsTransfer && !config.recipient && !promptAddress) {
      config.recipient = DEFAULT_BOB_ADDRESS;
    }
  }

  if (step.kind === "dryRunCall") {
    config.message = config.message || config.action || "join";
    config.value = firstConfigValue(config, ["value", "amount", "amountBaseUnits"]) || "0";
  }

  return { kind: step.kind, config };
}

function validateAiPlan(rawPlan: AiFlowPlan, endpoint: string, prompt = "") {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenKinds = new Set<string>();
  const rawSteps = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  const steps = rawSteps
    .filter((step) => step && SAFE_AI_NODE_KINDS.has(step.kind))
    .map((step) => normalizeAiStep({ kind: step.kind, config: sanitizeAiConfig(step.config) }, prompt))
    .filter((step) => {
      if (
        step.kind === "dryRunCall" &&
        [step.config.message, step.config.action, step.config.call, step.config.callType, step.config.txType, step.config.target].some((value) => value === "transferPot")
      ) {
        warnings.push("Removed Dry Run Call for transferPot because Transfer POT uses Transaction Preview for fee-only dry-run.");
        return false;
      }
      if (step.kind === "exploreMetadata" && !step.config.metadataPath) {
        warnings.push("Removed Metadata Explorer because no contract metadata path was provided.");
        return false;
      }
      if (seenKinds.has(step.kind)) {
        warnings.push(`Removed duplicate ${step.kind} step because the current board uses node kind as the node id.`);
        return false;
      }
      seenKinds.add(step.kind);
      return true;
    })
    .slice(0, 12)
    .map((step) => step);

  if (steps.length === 0) {
    errors.push("AI did not return any supported workflow steps.");
  }

  if (!steps.some((step) => step.kind === "connectRpc")) {
    steps.unshift({ kind: "connectRpc", config: { endpoint } });
  } else {
    steps.forEach((step) => {
      if (step.kind === "connectRpc" && !step.config.endpoint) {
        step.config.endpoint = endpoint;
      }
    });
  }

  const stepKinds = new Set(steps.map((step) => step.kind));
  const rawEdges = Array.isArray(rawPlan.edges) ? rawPlan.edges : [];
  const edges = rawEdges
    .filter((edge): edge is [string, string] => Array.isArray(edge) && edge.length === 2 && edge[0] !== edge[1] && stepKinds.has(edge[0]) && stepKinds.has(edge[1]))
    .slice(0, 16);

  if (edges.length === 0 && steps.length > 1) {
    for (let index = 0; index < steps.length - 1; index += 1) {
      edges.push([steps[index].kind, steps[index + 1].kind]);
    }
  }

  const wantsUnsafeAutoRun = Boolean(rawPlan.autoRun) && steps.some((step) => !READ_ONLY_AI_NODE_KINDS.has(step.kind));

  return {
    plan: {
      title: rawPlan.title || "AI generated Portaldot flow",
      summary: rawPlan.summary || "A safe workflow generated from the prompt and validated against PortalModeler node kinds.",
      autoRun: Boolean(rawPlan.autoRun) && !wantsUnsafeAutoRun,
      steps,
      edges,
    },
    errors,
    warnings: [
      ...warnings,
      ...(wantsUnsafeAutoRun ? ["State-changing nodes require manual confirmation before Apply & run."] : []),
    ],
  };
}

async function requestOpenAiPlan(prompt: string, endpoint: string, availableKinds: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            "You are PortalModeler AI Flow Builder.",
            "Return only a JSON workflow that matches the supplied schema.",
            "Use only supported node kinds and string config values.",
            "Prefer local-safe, inspectable flows: connectRpc, checkAccount, checkBalance, transactionPreview, exploreMetadata, dryRunCall, stateDiff, decodeError.",
            "For state-changing actions such as transferPot, deployContract, and callMessage, include preview or dry-run steps before the action and set autoRun to false.",
            "Never invent shell commands. The app runner maps node kinds to whitelisted commands.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            endpoint,
            availableKinds,
            defaultAccounts: {
              aliceSeed: "//Alice",
              alice: DEFAULT_ALICE_ADDRESS,
              bob: DEFAULT_BOB_ADDRESS,
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "portalmodeler_ai_flow",
          schema: AI_PLAN_SCHEMA,
          strict: false,
        },
      },
      max_output_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 2048),
    }),
  });

  const responseJson = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const errorMessage = JSON.stringify(responseJson);
    throw new Error(`OpenAI request failed: ${errorMessage}`);
  }

  const outputText = extractResponseText(responseJson);
  if (!outputText) {
    throw new Error("OpenAI returned no JSON text.");
  }

  return {
    model,
    plan: JSON.parse(outputText) as AiFlowPlan,
  };
}

async function requestOpenRouterPlan(prompt: string, endpoint: string, availableKinds: string[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }

  const model = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-5.2";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:5173",
      "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME || "PortalModeler",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are PortalModeler AI Flow Builder.",
            "Return only JSON matching the supplied schema.",
            "Use only supported node kinds and string config values.",
            "Prefer local-safe, inspectable flows: connectRpc, checkAccount, checkBalance, transactionPreview, exploreMetadata, dryRunCall, stateDiff, decodeError.",
            "For state-changing actions such as transferPot, deployContract, and callMessage, include preview or dry-run steps before the action and set autoRun to false.",
            "Never invent shell commands. The app runner maps node kinds to whitelisted commands.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            endpoint,
            availableKinds,
            defaultAccounts: {
              aliceSeed: "//Alice",
              alice: DEFAULT_ALICE_ADDRESS,
              bob: DEFAULT_BOB_ADDRESS,
            },
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "portalmodeler_ai_flow",
          strict: false,
          schema: AI_PLAN_SCHEMA,
        },
      },
      max_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 2048),
      temperature: 0.2,
    }),
  });

  const responseJson = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${JSON.stringify(responseJson)}`);
  }

  const outputText = extractChatCompletionText(responseJson);
  if (!outputText) {
    throw new Error("OpenRouter returned no JSON text.");
  }

  return {
    model,
    plan: JSON.parse(outputText) as AiFlowPlan,
  };
}

async function requestGeminiPlan(prompt: string, endpoint: string, availableKinds: string[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are PortalModeler AI Flow Builder.",
                "Return only JSON matching the supplied schema.",
                "Use only supported node kinds and string config values.",
                "Prefer local-safe, inspectable flows: connectRpc, checkAccount, checkBalance, transactionPreview, exploreMetadata, dryRunCall, stateDiff, decodeError.",
                "For state-changing actions such as transferPot, deployContract, and callMessage, include preview or dry-run steps before the action and set autoRun to false.",
                "Never invent shell commands. The app runner maps node kinds to whitelisted commands.",
                JSON.stringify({
                  prompt,
                  endpoint,
                  availableKinds,
                  defaultAccounts: {
                    aliceSeed: "//Alice",
                    alice: DEFAULT_ALICE_ADDRESS,
                    bob: DEFAULT_BOB_ADDRESS,
                  },
                }),
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_AI_PLAN_SCHEMA,
        maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 2048),
        temperature: 0.2,
      },
    };

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      lastError = `Gemini request failed: ${JSON.stringify(responseJson)}`;
      const retryable = response.status === 429 || response.status === 500 || response.status === 503;
      if (retryable && attempt < 3) {
        await sleep(750 * attempt);
        continue;
      }
      throw new Error(lastError);
    }

    const outputText = extractGeminiText(responseJson);
    if (!outputText) {
      throw new Error("Gemini returned no JSON text.");
    }

    return {
      model,
      plan: JSON.parse(outputText) as AiFlowPlan,
    };
  }

  throw new Error(lastError || "Gemini request failed.");
}

async function requestAiPlan(prompt: string, endpoint: string, availableKinds: string[]) {
  const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENROUTER_API_KEY ? "openrouter" : "openai")).toLowerCase();
  if (provider === "gemini") {
    const result = await requestGeminiPlan(prompt, endpoint, availableKinds);
    return { ...result, provider: "gemini" as const };
  }
  if (provider === "openrouter") {
    const result = await requestOpenRouterPlan(prompt, endpoint, availableKinds);
    return { ...result, provider: "openrouter" as const };
  }

  const result = await requestOpenAiPlan(prompt, endpoint, availableKinds);
  return { ...result, provider: "openai" as const };
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
  if (kind === "transactionPreview") {
    if ((config.target || "transferPot") === "callMessage") {
      return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", message, "--value", value, "--dry-run-only"] };
    }
    const args = ["scripts/transfer.py", "--url", endpoint, "--amount", value, "--dry-run-only"];
    if (recipient) args.push("--to", recipient);
    return { command: "python", args };
  }
  if (kind === "dryRunCall") return { command: "python", args: ["scripts/call.py", "--url", endpoint, "--action", message, "--value", value, "--dry-run-only"] };
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

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, repoRoot, ""), loadEnv(mode, frontEndRoot, ""));

  return {
  plugins: [
    react(),
    {
      name: "portalmodeler-safe-runner",
      configureServer(server) {
        server.middlewares.use("/api/ai-plan", async (request, response) => {
          if (request.method !== "POST") {
            sendJson(response, 405, { plan: null, errors: ["Method not allowed"], source: "openai" });
            return;
          }

          try {
            const payload = JSON.parse(await readBody(request)) as AiPlanRequest;
            const prompt = (payload.prompt || "").trim();
            const endpoint = payload.endpoint || "ws://127.0.0.1:9944";
            const availableKinds = (payload.availableKinds || Array.from(SAFE_AI_NODE_KINDS)).filter((kind) => SAFE_AI_NODE_KINDS.has(kind));

            if (!prompt) {
              sendJson(response, 400, { plan: null, errors: ["Prompt is required."], source: "openai" });
              return;
            }

            const aiResult = await requestAiPlan(prompt, endpoint, availableKinds);
            const validated = validateAiPlan(aiResult.plan, endpoint, prompt);
            sendJson(response, validated.errors.length ? 422 : 200, {
              plan: validated.errors.length ? null : validated.plan,
              errors: validated.errors,
              warnings: validated.warnings,
              source: aiResult.provider,
              model: aiResult.model,
            });
          } catch (error) {
            const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENROUTER_API_KEY ? "openrouter" : "openai")).toLowerCase();
            sendJson(response, 503, {
              plan: null,
              errors: [error instanceof Error ? error.message : String(error)],
              source: provider,
            });
          }
        });

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

            if (kind === "manageLocalNode") {
              const endpoint = config.endpoint || "ws://127.0.0.1:9944";
              const reachable = await checkTcp(endpoint);
              const action = config.action || "status";
              const startCommand = "python scripts/run_node.py";
              const stopCommand = "wsl pkill -f portaldot_dev";
              sendJson(response, 200, {
                ok: true,
                command: action === "stop" ? stopCommand : startCommand,
                stdout: [
                  `Requested action: ${action}`,
                  `RPC ${endpoint}: ${reachable ? "online" : "offline"}`,
                  `Start command: ${startCommand}`,
                  `Stop command: ${stopCommand}`,
                  "PortalModeler keeps these commands explicit so the local node lifecycle is reproducible.",
                ].join("\n"),
                stderr: "",
              });
              return;
            }

            if (kind === "checkAccount") {
              sendJson(response, 200, { ok: true, command: "PORTALDOT_SEED=//Alice", stdout: `Signer seed: ${config.seed || "//Alice"}\n`, stderr: "" });
              return;
            }

            if (kind === "exploreMetadata") {
              try {
                const summary = contractMetadataSummary(config.metadataPath);
                sendJson(response, 200, {
                  ok: summary.ok,
                  command: `inspect metadata ${config.metadataPath || "contract/target/ink/membership.json"}`,
                  stdout: [
                    `Metadata path: ${summary.path}`,
                    `Constructors: ${summary.constructors.length}`,
                    `Messages: ${summary.messages.length}`,
                    `Events: ${summary.events.length}`,
                    "Metadata summary JSON:",
                    JSON.stringify(
                      {
                        constructors: summary.constructors,
                        messages: summary.messages,
                        events: summary.events,
                      },
                      null,
                      2,
                    ),
                  ].join("\n"),
                  stderr: summary.error,
                });
              } catch (error) {
                sendJson(response, 200, {
                  ok: false,
                  command: "inspect metadata",
                  stdout: "",
                  stderr: error instanceof Error ? error.message : String(error),
                });
              }
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

            if (["stateDiff", "decodeError", "watchEvents", "decodeEvents", "exportWorkflow", "exportCommands", "saveWorkflow", "loadWorkflow", "generateReport"].includes(kind)) {
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
  };
});
