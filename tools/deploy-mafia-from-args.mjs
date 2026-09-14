/**
 * Deploy mafia-room using args JSON + Supabase Management API.
 * Usage: set SUPABASE_ACCESS_TOKEN then: node tools/deploy-mafia-from-args.mjs
 */
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = JSON.parse(
  fs.readFileSync(path.join(root, ".deploy-chunks", "mcp-mafia-args-full.json"), "utf8"),
);
const content = args.files[0].content;
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)");
  process.exit(2);
}

const meta = JSON.stringify({ entrypoint_path: "index.ts", verify_jwt: false });
const boundary = `----mafia${Date.now()}`;
const parts = [
  `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${meta}\r\n`,
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.ts"\r\nContent-Type: application/typescript\r\n\r\n`,
  content,
  `\r\n--${boundary}--\r\n`,
];
const body = Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "utf8") : Buffer.from(p))));

const req = https.request(
  {
    hostname: "api.supabase.com",
    path: "/v1/projects/unsxzbrpqvppecjnirqx/functions/deploy?slug=mafia-room",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
  },
  (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => {
      console.log(res.statusCode, d.slice(0, 1200));
      process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
    });
  },
);
req.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
req.write(body);
req.end();
