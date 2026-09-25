import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const passwords = [...new Set([process.env.SHAMSY_DEMO_ADVISER_PASSWORD, process.env.SHAMSY_DEMO_OWNER_PASSWORD, process.env.PROOF_ADVISER_PASSWORD, process.env.PROOF_OWNER_PASSWORD].filter(Boolean))];
if (passwords.length < 2) throw new Error("Load the trial account environment to scan for actual password exposure.");
const needles = passwords.flatMap(value => [value, encodeURIComponent(value), Buffer.from(value).toString("base64")]);
const containsSecret = value => needles.some(secret => value.includes(secret));
for (const [name, value] of Object.entries(process.env)) if (name.startsWith("NEXT_PUBLIC_") && containsSecret(value || "")) throw new Error(`Secret exposed through ${name}`);
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(file => file && existsSync(file));
const staticRoot = ".next/static";
if (!existsSync(staticRoot)) throw new Error("Run the production build before scanning browser assets.");
function collect(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(join(dir, entry.name)) : [join(dir, entry.name)]); }
const assets = collect(staticRoot);
for (const file of [...files, ...assets]) if (containsSecret(readFileSync(file, "utf8"))) throw new Error(`Demo password found in ${file}`);
console.log(`PASS no demo passwords in ${files.length} repository files, ${assets.length} browser assets/source maps, or NEXT_PUBLIC variables.`);
