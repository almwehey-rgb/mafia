import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const payloadPath = path.join(root, ".supabase-deploy-payload.json");
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
const content = payload.files[0].content;
if (!content.includes("routeHostLogin") || content.includes("LOAD_FROM_DISK")) {
  console.error("BAD_PAYLOAD");
  process.exit(2);
}
process.stdout.write(
  JSON.stringify({
    project_id: payload.project_id,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    files: [{ name: "index.ts", content }],
  }),
);
