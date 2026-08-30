import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, process.argv[2] || "pages-dist");

async function files(directory) {
  const result = [];
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name);
    if ((await stat(path)).isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

const all = await files(output);
const shell = all
  .filter(path => !path.endsWith("/sw.js") && !path.includes(`${sep}ip-country${sep}`))
  .map(path => `./${relative(output, path).split(sep).join("/")}`)
  .filter(path => !path.endsWith("/.DS_Store"))
  .sort();
if (!shell.includes("./index.html")) throw new Error("Built site has no index.html");
shell.unshift("./");

const workerPath = resolve(output, "sw.js");
let worker = await readFile(workerPath, "utf8");
const fingerprint = createHash("sha256").update(JSON.stringify(shell)).digest("hex").slice(0, 12);
worker = worker
  .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "subflow-${fingerprint}";`)
  .replace(/const APP_SHELL = \[[^;]*\];/, `const APP_SHELL = ${JSON.stringify(shell)};`);
await writeFile(workerPath, worker);
