import assert from "node:assert/strict";
import test from "node:test";
import * as yaml from "js-yaml";
import { configurationFilename, formatDownloadDate } from "../lib/filename.ts";
import { generateConfig, generateConfigAsync } from "../lib/generator.ts";
import { parseSubscription } from "../lib/parser.ts";
import { PRESET_META } from "../lib/rules.ts";
import { isHttpSubscriptionURL, isIpSubscriptionURL, loadSubscriptionInput, SubscriptionLoadError } from "../lib/source.ts";

const ss = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@hk.example.com:8388#Hong%20Kong";
const vless = "vless://11111111-1111-1111-1111-111111111111@edge.example.com:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws&sni=origin.example.com#VLESS%20Taiwan";
const trojan = "trojan://shared-secret@jp.example.com:443?sni=jp.example.com#Tokyo";
const hysteria = "hysteria://hy-secret@hy1.example.com:443?upmbps=20&downmbps=80&peer=hy1.example.com#Hysteria%20Germany";
const hysteria2 = "hy2://hy2-secret@hy2.example.com:443?sni=hy2.example.com#HY2%20SG";
const tuic = "tuic://33333333-3333-3333-3333-333333333333:tuic-secret@tuic.example.com:443?sni=tuic.example.com&congestion_control=bbr#TUIC%20US";
const wireguard = "wireguard://private-key-example@wg.example.com:51820?publickey=public-key-example&address=10.0.0.2%2F32%2C2001%3Adb8%3A%3A2%2F128&allowedips=0.0.0.0%2F0%2C%3A%3A%2F0#WireGuard%20Canada";
const anytls = "anytls://anytls-secret@any.example.com:443?sni=any.example.com#AnyTLS%20Korea";
const socks5 = "socks5://user:secret@socks.example.com:1080#SOCKS%20UK";
const httpProxy = "https://user:secret@proxy.example.com:8443#HTTPS%20France";

function vmessLink() {
  const value = JSON.stringify({ v: "2", ps: "VMess US", add: "us.example.com", port: "443", id: "22222222-2222-2222-2222-222222222222", aid: "0", net: "ws", host: "cdn.example.com", path: "/gateway", tls: "tls", sni: "us.example.com" });
  return `vmess://${Buffer.from(value).toString("base64")}`;
}

function vmessTCPLink() {
  const value = JSON.stringify({ v: "2", ps: "Synthetic VMess", add: "us.example.com", port: "443", id: "22222222-2222-2222-2222-222222222222", aid: "0", net: "tcp", host: "", path: "", tls: "", sni: "" });
  return `vmess://${Buffer.from(value).toString("base64")}`;
}

function ssrLink() {
  const remarks = Buffer.from("SSR Netherlands").toString("base64url");
  const password = Buffer.from("ssr-secret").toString("base64url");
  return `ssr://${Buffer.from(`ssr.example.com:8389:origin:aes-256-cfb:plain:${password}/?remarks=${remarks}`).toString("base64url")}`;
}

const allLinks = [ss, ssrLink(), vmessLink(), vless, trojan, hysteria, hysteria2, tuic, wireguard, anytls, socks5, httpProxy];

test("parses, deduplicates, and preserves all 12 supported protocols", () => {
  const encoded = Buffer.from([...allLinks, ss].join("\n")).toString("base64");
  const result = parseSubscription(encoded);
  assert.equal(result.nodes.length, 12);
  assert.deepEqual(new Set(result.nodes.map(node => node.protocol)), new Set(["ss", "ssr", "vmess", "vless", "trojan", "hysteria", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"]));
  assert.equal(result.nodes.find(node => node.protocol === "wireguard")?.wireGuardIPv6, "2001:db8::2/128");
  assert.equal(result.nodes.find(node => node.protocol === "tuic")?.congestionControl, "bbr");
  assert.equal(result.nodes.find(node => node.protocol === "http")?.tls, true);
});

test("reads Clash YAML without losing transport fields", () => {
  const document = `proxies:\n  - name: Clash VLESS\n    type: vless\n    server: v.example.com\n    port: 443\n    uuid: 33333333-3333-3333-3333-333333333333\n    network: grpc\n    tls: true\n    servername: origin.example.com\n    grpc-opts:\n      grpc-service-name: tunnel\n`;
  const result = parseSubscription(document);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].transport, "grpc");
  assert.equal(result.nodes[0].path, "tunnel");
});

test("generates Clash with 12 nodes, regional groups, and ACL4SSR default AI choices", () => {
  const generated = generateConfig(parseSubscription(allLinks.join("\n")).nodes, "clash", "full");
  const parsed = yaml.load(generated.content.replace(/^#.*\n#.*\n\n/, "")) as Record<string, unknown>;
  assert.equal((parsed.proxies as unknown[]).length, 12);
  assert.equal(generated.regionGroups, 11);
  const groups = parsed["proxy-groups"] as Array<{ name: string; proxies: string[] }>;
  const ai = groups.find(group => group.name === "🤖 AI 服务");
  assert.deepEqual(ai?.proxies, ["🚀 节点选择", "♻️ 自动选择", "🇸🇬 狮城节点", "🇭🇰 香港节点", "🇹🇼 台湾节点", "🇯🇵 日本节点", "🇺🇸 美国节点", "🇰🇷 韩国节点", "🚀 手动切换", "DIRECT"]);
  assert.doesNotMatch(JSON.stringify(groups), /AI 日新自动/);
  assert.match(generated.content, /Ruleset\/AI\.list/);
  const regionNames = groups.filter(group => /节点$/.test(group.name)).map(group => group.name);
  assert.deepEqual(groups.slice(-regionNames.length).map(group => group.name), regionNames);
  assert.ok(groups.findIndex(group => group.name === "🐟 漏网之鱼") < groups.findIndex(group => /节点$/.test(group.name)));
});

test("custom Full preset omits requested groups while keeping SteamCN", () => {
  assert.equal(PRESET_META.full.description, "完整分流，定制版");
  const content = generateConfig(parseSubscription([ss, trojan].join("\n")).nodes, "clash", "full").content;
  for (const removed of ["Bing.list", "OneDrive.list", "Microsoft.list", "NetEaseMusic.list", "Epic.list", "Origin.list", "Sony.list", "Steam.list", "Nintendo.list", "Netflix.list", "Bahamut.list"]) assert.doesNotMatch(content, new RegExp(`/${removed.replace(".", "\\.")}`));
  for (const group of ["微软Bing", "微软云盘", "微软服务", "网易音乐", "游戏平台", "巴哈姆特", "奈飞视频"]) assert.doesNotMatch(content, new RegExp(group));
  assert.match(content, /Ruleset\/SteamCN\.list/);
});

test("heavy Full preset restores the complete ACL4SSR groups", () => {
  const content = generateConfig(parseSubscription([ss, trojan].join("\n")).nodes, "clash", "heavy").content;
  for (const source of ["Bing.list", "OneDrive.list", "Microsoft.list", "NetEaseMusic.list", "Epic.list", "Origin.list", "Sony.list", "Steam.list", "Nintendo.list", "Netflix.list", "Bahamut.list"]) assert.match(content, new RegExp(`/${source.replace(".", "\\.")}`));
  for (const group of ["微软 Bing", "微软云盘", "微软服务", "网易音乐", "游戏平台", "巴哈姆特", "奈飞视频"]) assert.match(content, new RegExp(group));
});

test("adds local calendar date to downloaded configuration filenames", () => {
  const date = new Date(2026, 7, 19, 23, 30);
  assert.equal(formatDownloadDate(date), "2026.08.19");
  assert.equal(configurationFilename("clash", "yaml", date), "subflow-clash 2026.08.19.yaml");
});

test("seven clients expose honest compatibility counts", () => {
  const nodes = parseSubscription(allLinks.join("\n")).nodes;
  const expected: Record<string, number> = { clash: 12, surge: 9, shadowrocket: 12, loon: 10, quanx: 8, hiddify: 11, egern: 10 };
  for (const [target, count] of Object.entries(expected)) {
    const generated = generateConfig(nodes, target as Parameters<typeof generateConfig>[1], "mini");
    assert.equal(generated.supported, count, target);
    assert.equal(generated.skipped, 12 - count, target);
    assert.ok(generated.content.length > 100, target);
  }
});

test("Shadowrocket receives Clash YAML with visible ACL policy groups", () => {
  const generated = generateConfig(parseSubscription(allLinks.join("\n")).nodes, "shadowrocket", "heavy");
  assert.equal(generated.extension, "yaml");
  const parsed = yaml.load(generated.content.replace(/^#.*\n#.*\n\n/, "")) as Record<string, unknown>;
  assert.equal((parsed.proxies as unknown[]).length, 12);
  const groups = parsed["proxy-groups"] as Array<{ name: string; proxies: string[] }>;
  assert.ok(groups.length > 10);
  assert.ok(groups.some(group => group.name === "🤖 AI 服务"));
  assert.ok(groups.some(group => group.name === "🚀 节点选择"));
  assert.ok(Array.isArray(parsed.rules));
});

test("Surge 5 profile uses documented testing and remote-rule parameters", () => {
  const realShape = [
    vmessTCPLink(),
    "trojan://synthetic-secret@trojan.invalid:443?sni=trojan.invalid#Synthetic%20Trojan",
    "vless://11111111-1111-1111-1111-111111111111@192.0.2.55:443?security=none&type=tcp#Unsupported%20VLESS",
  ].join("\n");
  const generated = generateConfig(parseSubscription(realShape).nodes, "surge", "full");
  assert.equal(generated.supported, 2);
  assert.equal(generated.skipped, 1);
  assert.match(generated.content, /proxy-test-url = http:\/\/cp\.cloudflare\.com\/generate_204/);
  assert.doesNotMatch(generated.content, /encrypted-dns-server/);
  assert.match(generated.content, / = url-test, .+url=http:\/\/cp\.cloudflare\.com\/generate_204/);
  assert.match(generated.content, /RULE-SET,https:\/\/raw\.githubusercontent\.com\/.+,update-interval=86400/);
  assert.match(generated.content, / = vmess, us\.example\.com, 443, username=.+vmess-aead=true, tls=false, skip-cert-verify=false, tfo=false, udp-relay=false/);
  assert.match(generated.content, / = trojan, trojan\.invalid, 443, password=synthetic-secret, sni=trojan\.invalid, skip-cert-verify=false, tfo=false, udp-relay=false/);
  assert.doesNotMatch(generated.content, /Unsupported VLESS/);
});

test("Surge preserves Hysteria 2 certificate and bandwidth settings", () => {
  const explicit = parseSubscription("hy2://secret@hy2.invalid:443?sni=hy2.invalid&skip-cert-verify=false&download-bandwidth=5000#Synthetic%20HY2").nodes;
  const generated = generateConfig(explicit, "surge", "mini");
  assert.match(generated.content, / = hysteria2, hy2\.invalid, 443, password=secret, sni=hy2\.invalid, skip-cert-verify=false, download-bandwidth=5000, udp-relay=true/);

  const compatibleDefault = parseSubscription("hy2://secret@hy2.invalid:443?sni=hy2.invalid#Synthetic%20HY2").nodes;
  assert.match(generateConfig(compatibleDefault, "surge", "mini").content, /skip-cert-verify=true, download-bandwidth=1000, udp-relay=true/);
});

test("inline-rule clients resolve public rules without sending node data", async () => {
  const requested: string[] = [];
  const fakeFetch: typeof fetch = async input => {
    requested.push(String(input));
    return new Response("DOMAIN-SUFFIX,example.ai\nIP-CIDR,192.0.2.0/24,no-resolve\n");
  };
  const nodes = parseSubscription([ss, trojan].join("\n")).nodes;
  for (const target of ["quanx", "hiddify", "egern"] as const) {
    const generated = await generateConfigAsync(nodes, target, "mini", "DOMAIN,custom.example,AI", fakeFetch);
    assert.ok(generated.ruleCount > 1);
    assert.match(generated.content, /custom\.example/);
  }
  assert.ok(requested.every(url => url.startsWith("https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/")));
  assert.ok(requested.every(url => !url.includes("shared-secret") && !url.includes("hk.example.com")));
});

test("neutralizes config syntax in untrusted node names", () => {
  const malicious = "trojan://pw@safe.example.com:443#Bad%5BRule%5D%0AFINAL%2CREJECT";
  const generated = generateConfig(parseSubscription(malicious).nodes, "loon", "mini");
  assert.doesNotMatch(generated.content, /Bad\[Rule\]/);
  assert.match(generated.content, /Bad［Rule］ FINAL，REJECT/);
});

test("recognizes IP-host subscription URLs without exposing them in errors", async () => {
  const example = "https://192.0.2.10:8443/subscription?token=example-only";
  assert.equal(isHttpSubscriptionURL(example), true);
  assert.equal(isIpSubscriptionURL(example), true);
  let requested = "";
  const loaded = await loadSubscriptionInput(example, async input => { requested = input; return new Response(`${ss}\n${trojan}`, { status: 200 }); });
  assert.equal(requested, example);
  assert.equal(parseSubscription(loaded.text).nodes.length, 2);
  await assert.rejects(loadSubscriptionInput(example, async () => { throw new TypeError("Load failed"); }), error => error instanceof SubscriptionLoadError && error.code === "network" && error.ipHost && !error.message.includes(example));
});
