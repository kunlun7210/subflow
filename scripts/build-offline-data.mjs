import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const aclDirectory = resolve(root, "resources/acl4ssr");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanRule(line) {
  const clean = line.trim().replace(/^\s*-\s*/, "");
  if (!clean || clean.startsWith("#") || clean.startsWith(";") || clean === "payload:") return null;
  const parts = clean.split(",").map(item => item.trim());
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase();
  const allowed = new Set([
    "DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "DOMAIN-SET", "DOMAIN-WILDCARD",
    "IP-CIDR", "IP-CIDR6", "IP6-CIDR", "IP-ASN", "GEOIP", "PROCESS-NAME",
    "USER-AGENT", "URL-REGEX", "DEST-PORT", "SRC-IP", "SRC-PORT", "IN-PORT",
    "PROTOCOL", "SUBNET",
  ]);
  if (!allowed.has(type)) return null;
  return [type, parts[1], ...parts.slice(2).filter(part => part.toLowerCase() === "no-resolve")].join(",");
}

async function buildACL4SSR() {
  const manifest = JSON.parse(await readFile(resolve(aclDirectory, "ACL4SSR_manifest.json"), "utf8"));
  const rules = {};
  for (const [filename, metadata] of Object.entries(manifest.rulesets)) {
    const body = await readFile(resolve(aclDirectory, filename));
    if (sha256(body) !== metadata.sha256) throw new Error(`ACL4SSR checksum mismatch: ${filename}`);
    const sourcePath = new URL(metadata.source).pathname.split("/Clash/")[1];
    if (!sourcePath) throw new Error(`ACL4SSR source path is invalid: ${filename}`);
    rules[sourcePath] = body.toString("utf8").split(/\r?\n/).flatMap(line => {
      const clean = cleanRule(line);
      return clean ? [clean] : [];
    });
  }
  await mkdir(resolve(root, "public/data"), { recursive: true });
  await writeFile(
    resolve(root, "public/data/acl4ssr-snapshot.json"),
    `${JSON.stringify({ revision: manifest.revision, rules })}\n`,
  );
}

function swiftStrings(value) {
  return [...value.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(match => JSON.parse(`"${match[1]}"`));
}

async function buildCountryTable() {
  const source = await readFile(resolve(root, "resources/country/CountryTable.swift"), "utf8");
  const countries = {};
  const pattern = /^\s*"([A-Z]{2})": \.init\(chineseName: "((?:\\.|[^"\\])*)", englishName: "((?:\\.|[^"\\])*)", latitude: ([^,]+), longitude: ([^,]+), names: \[(.*)\], codes: \[(.*)\]\),$/gm;
  for (const match of source.matchAll(pattern)) {
    countries[match[1]] = {
      zh: JSON.parse(`"${match[2]}"`),
      en: JSON.parse(`"${match[3]}"`),
      names: swiftStrings(match[6]),
      codes: swiftStrings(match[7]),
    };
  }
  if (Object.keys(countries).length < 180) throw new Error("Country table extraction is incomplete");
  await writeFile(resolve(root, "lib/country-table.json"), `${JSON.stringify(countries)}\n`);
}

await Promise.all([buildACL4SSR(), buildCountryTable()]);
