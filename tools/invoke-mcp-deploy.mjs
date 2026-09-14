import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argsPath = path.join(root, ".deploy-chunks", "mcp-mafia-args-full.json");
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
const content = args.files[0].content;
if (!content.includes("Deno.serve") || !content.includes("routeHostLogin")) {
  console.error("INVALID_SOURCE");
  process.exit(2);
}
// stdout marker for agent: deploy args ready (content stays on disk only)
console.log(
  JSON.stringify({
    ready: true,
    project_id: args.project_id,
    name: args.name,
    bytes: content.length,
  }),
);
