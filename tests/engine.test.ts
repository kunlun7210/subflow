import assert from "node:assert/strict";
import test from "node:test";
import * as yaml from "js-yaml";
import { generateConfig } from "../lib/generator.ts";
import { parseSubscription } from "../lib/parser.ts";
import { isHttpSubscriptionURL, isIpSubscriptionURL, loadSubscriptionInput, SubscriptionLoadError } from "../lib/source.ts";

const ss = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@hk.example.com:8388#Hong%20Kong";
const vless = "vless://11111111-1111-1111-1111-111111111111@edge.example.com:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws&sni=origin.example.com#VLESS%20HK";
const trojan = "trojan://shared-secret@jp.example.com:443?sni=jp.example.com#Tokyo";
const hysteria2 = "hy2://hy2-secret@hy.example.com:443?sni=hy.example.com&insecure=1&obfs=salamander&obfs-password=masking-secret&mport=20000-30000#HY2%20SG";

function vmessLink() {
  const value = JSON.stringify({ v: "2", ps: "VMess US", add: "us.example.com", port: "443", id: "22222222-2222-2222-2222-222222222222", aid: "0", net: "ws", host: "cdn.example.com", path: "/gateway", tls: "tls", sni: "us.example.com" });
  return `vmess://${Buffer.from(value).toString("base64")}`;
}

test("parses and deduplicates the five supported protocols", () => {
  const encoded = Buffer.from([ss, vmessLink(), vless, trojan, hysteria2, ss].join("\n")).toString("base64");
  const result = parseSubscription(encoded);
  assert.equal(result.nodes.length, 5);
  assert.deepEqual(new Set(result.nodes.map(node => node.protocol)), new Set(["ss", "vmess", "vless", "trojan", "hysteria2"]));
  const vmess = result.nodes.find(node => node.protocol === "vmess");
  assert.equal(vmess?.host, "cdn.example.com");
  assert.equal(vmess?.tls, true);
  const hy2 = result.nodes.find(node => node.protocol === "hysteria2");
  assert.equal(hy2?.password, "hy2-secret");
  assert.equal(hy2?.obfs, "salamander");
  assert.equal(hy2?.obfsPassword, "masking-secret");
  assert.equal(hy2?.portHopping, "20000-30000");
  assert.equal(hy2?.skipCertVerify, true);
});

test("reads Clash YAML without losing transport fields", () => {
  const document = `proxies:\n  - name: Clash VLESS\n    type: vless\n    server: v.example.com\n    port: 443\n    uuid: 33333333-3333-3333-3333-333333333333\n    network: grpc\n    tls: true\n    servername: origin.example.com\n    grpc-opts:\n      grpc-service-name: tunnel\n`;
  const result = parseSubscription(document);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].transport, "grpc");
  assert.equal(result.nodes[0].path, "tunnel");
  assert.equal(result.nodes[0].sni, "origin.example.com");
});

test("generates valid Clash YAML and preserves credentials", () => {
  const nodes = parseSubscription([ss, vmessLink(), vless, trojan, hysteria2].join("\n")).nodes;
  const generated = generateConfig(nodes, "clash", "balanced");
  const parsed = yaml.load(generated.content.replace(/^#.*\n#.*\n\n/, "")) as Record<string, unknown>;
  assert.equal((parsed.proxies as unknown[]).length, 5);
  assert.equal(generated.supported, 5);
  assert.match(generated.content, /shared-secret/);
  assert.match(generated.content, /obfs-password: masking-secret/);
  assert.match(generated.content, /ports: 20000-30000/);
  assert.match(generated.content, /GEOIP,CN,DIRECT/);
  const groups = parsed["proxy-groups"] as Array<{ name: string; proxies: string[] }>;
  const ai = groups.find(group => group.name === "🤖 AI 服务");
  const aiAuto = groups.find(group => group.name === "⚡ AI 日新自动");
  assert.deepEqual(ai?.proxies, ["⚡ AI 日新自动", "Tokyo", "HY2 SG"]);
  assert.deepEqual(aiAuto?.proxies, ["Tokyo", "HY2 SG"]);
  assert.doesNotMatch(JSON.stringify(ai), /DIRECT|Hong Kong|VLESS HK/);
  const providers = parsed["rule-providers"] as Record<string, { format: string; url: string }>;
  assert.equal(providers["ACL4SSR-AI"].format, "text");
  assert.match(providers["ACL4SSR-AI"].url, /ACL4SSR\/ACL4SSR\/master\/Clash\/Ruleset\/AI\.list/);
  assert.equal(generated.aiEligible, 2);
});

test("writes compatible Hysteria 2 syntax and skips unsupported obfs on Loon", () => {
  const node = parseSubscription(hysteria2).nodes;
  const surge = generateConfig(node, "surge", "global");
  assert.match(surge.content, /hysteria2, hy\.example\.com, 443, password=hy2-secret/);
  assert.match(surge.content, /salamander-password=masking-secret/);
  const loon = generateConfig(node, "loon", "global");
  assert.equal(loon.supported, 0);
  assert.equal(loon.skipped, 1);

  const plain = parseSubscription("hysteria2://plain-secret@plain.example.com:443?sni=plain.example.com#Plain%20HY2").nodes;
  const plainLoon = generateConfig(plain, "loon", "global");
  assert.equal(plainLoon.supported, 1);
  assert.match(plainLoon.content, /Hysteria2, plain\.example\.com, 443, "plain-secret"/);
});

test("reports VLESS as skipped for Surge instead of emitting a broken node", () => {
  const nodes = parseSubscription([ss, vless, trojan].join("\n")).nodes;
  const generated = generateConfig(nodes, "surge", "balanced");
  assert.equal(generated.supported, 2);
  assert.equal(generated.skipped, 1);
  assert.doesNotMatch(generated.content, /VLESS HK/);
  assert.match(generated.content, /\[Proxy\]/);
  assert.match(generated.content, /🤖 AI 服务 = select, ⚡ AI 日新自动, Tokyo/);
  assert.match(generated.content, /RULE-SET,https:\/\/raw\.githubusercontent\.com\/ACL4SSR\/ACL4SSR\/master\/Clash\/Ruleset\/AI\.list,🤖 AI 服务/);
});

test("neutralizes config syntax in untrusted node names", () => {
  const malicious = "trojan://pw@safe.example.com:443#Bad%5BRule%5D%0AFINAL%2CREJECT";
  const node = parseSubscription(malicious).nodes;
  const generated = generateConfig(node, "loon", "global");
  assert.doesNotMatch(generated.content, /Bad\[Rule\]/);
  assert.match(generated.content, /Bad［Rule］ FINAL，REJECT/);
});

test("blocks AI traffic instead of falling back to Hong Kong, Macau, or direct", () => {
  const nodes = parseSubscription([
    ss,
    "trojan://pw@mo.example.com:443#Macau",
    "trojan://pw2@hk2.example.com:443#HK-02",
  ].join("\n")).nodes;
  const generated = generateConfig(nodes, "clash", "balanced");
  const parsed = yaml.load(generated.content.replace(/^#.*\n#.*\n\n/, "")) as Record<string, unknown>;
  const groups = parsed["proxy-groups"] as Array<{ name: string; proxies: string[] }>;
  assert.deepEqual(groups.find(group => group.name === "🤖 AI 服务")?.proxies, ["REJECT"]);
  assert.equal(generated.aiEligible, 0);
});

test("emits ACL4SSR remote rules for Loon", () => {
  const nodes = parseSubscription([trojan, hysteria2].join("\n")).nodes;
  const generated = generateConfig(nodes, "loon", "balanced");
  assert.match(generated.content, /\[Remote Rule\]/);
  assert.match(generated.content, /Ruleset\/AI\.list,policy=🤖 AI 服务,tag=ACL4SSR-AI,enabled=true/);
  assert.match(generated.content, /ProxyLite\.list,policy=🚀 节点选择/);
  assert.doesNotMatch(generated.content.match(/🤖 AI 服务 = .*$/m)?.[0] ?? "", /DIRECT|Hong Kong|Macau/);
});

test("recognizes IP-host subscription URLs without exposing them in errors", async () => {
  const example = "https://192.0.2.10:8443/subscription?token=example-only";
  assert.equal(isHttpSubscriptionURL(example), true);
  assert.equal(isIpSubscriptionURL(example), true);
  let requested = "";
  const loaded = await loadSubscriptionInput(example, async input => {
    requested = input;
    return new Response(`${ss}\n${trojan}`, { status: 200 });
  });
  assert.equal(requested, example);
  assert.equal(loaded.kind, "url");
  assert.equal(loaded.ipHost, true);
  assert.equal(parseSubscription(loaded.text).nodes.length, 2);

  await assert.rejects(
    loadSubscriptionInput(example, async () => { throw new TypeError("Load failed"); }),
    error => error instanceof SubscriptionLoadError
      && error.code === "network"
      && error.ipHost
      && !error.message.includes(example),
  );
});
