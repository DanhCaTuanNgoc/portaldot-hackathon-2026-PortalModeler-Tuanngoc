import { templates } from "../domain/constants";
import type { PortalNodeConfig, PortalNodeKind } from "../domain/types";

export function hydrateCommand(template: string, config: PortalNodeConfig, endpoint = "ws://127.0.0.1:9944") {
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
    .replace("{message}", config.message || config.action || "is_member")
    .replace("{target}", config.target || "transferPot");
}

export function templateForKind(kind: PortalNodeKind) {
  return templates.find((template) => template.kind === kind);
}
