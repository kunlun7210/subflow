import * as yaml from "js-yaml";
import { compatibility } from "./compatibility";
import type { ClientTarget, GeneratedConfig, ProxyNode, RulePreset } from "./model";
import { groupNodesByRegion } from "./regions";
import { parseCustomRules, POLICIES, resolveRuleLines, ruleSourceURL, ruleSources, targetNeedsInlineRules, type ResolvedRule } from "./rules";

interface PolicyGroup {
  name: string;
  type: "select" | "url-test";
  members: string[];
}

// Use the plain HTTP 204 endpoint already proven by a working local Surge
// profile, so a TLS failure at the test endpoint is not reported as a proxy failure.
const TEST_URL = "http://cp.cloudflare.com/generate_204";

function safeName(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/=/g, "-").replace(/,/g, "，").replace(/#/g, "＃").replace(/;/g, "；").replace(/\[/g, "［").replace(/\]/g, "］").trim();
}

function confValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/,/g, "%2C");
}

function normalizedPath(value?: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith("/") ? value : `/${value}`;
}

function csv(value?: string): string[] {
  return String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

function uniqueNames(nodes: ProxyNode[]): ProxyNode[] {
  const counts = new Map<string, number>([
    ...Object.values(POLICIES).map(name => [safeName(name), 1] as const),
    ["DIRECT", 1], ["REJECT", 1], ["direct", 1], ["block", 1],
  ]);
  return nodes.map(node => {
    const base = safeName(node.name) || `${node.server}:${node.port}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return { ...node, name: count === 1 ? base : `${base} · ${count}` };
  });
}

function buildGroups(nodes: ProxyNode[], preset: RulePreset): PolicyGroup[] {
  const names = nodes.map(node => node.name);
  const regionGroups = groupNodesByRegion(nodes);
  const regionNames = regionGroups.map(group => group.region.name);
  const preferredRegionOrder = ["狮城", "香港", "台湾", "日本", "美国", "韩国"];
  const aclRegionNames = preferredRegionOrder.flatMap(keyword => regionNames.filter(name => name.includes(keyword)));
  const groups: PolicyGroup[] = [
    { name: POLICIES.main, type: "select", members: [POLICIES.auto, ...regionNames, POLICIES.manual, "DIRECT"] },
    { name: POLICIES.manual, type: "select", members: names.length ? names : ["DIRECT"] },
    { name: POLICIES.auto, type: "url-test", members: names.length ? names : ["DIRECT"] },
    // Keep ACL4SSR_Online_Full's original AI choices. This intentionally does
    // not force a country and may be changed by the user in the target client.
    { name: POLICIES.ai, type: "select", members: [POLICIES.main, POLICIES.auto, ...aclRegionNames, POLICIES.manual, "DIRECT"] },
  ];
  const choices = [POLICIES.main, POLICIES.auto, ...regionNames, POLICIES.manual, "DIRECT"];
  const directFirst = ["DIRECT", POLICIES.main, POLICIES.auto, ...regionNames, POLICIES.manual];
  const sourcePolicies = new Set(ruleSources(preset).map(source => source.policy));
  const add = (name: string, members: string[]) => {
    if (sourcePolicies.has(name) && !groups.some(group => group.name === name)) groups.push({ name, type: "select", members });
  };
  add(POLICIES.telegram, choices);
  add(POLICIES.youtube, choices);
  add(POLICIES.foreignMedia, choices);
  add(POLICIES.domesticMedia, ["DIRECT", ...regionNames, POLICIES.main, POLICIES.manual]);
  add(POLICIES.googleFCM, directFirst);
  add(POLICIES.apple, directFirst);
  add(POLICIES.bing, directFirst);
  add(POLICIES.oneDrive, directFirst);
  add(POLICIES.microsoft, directFirst);
  add(POLICIES.games, directFirst);
  add(POLICIES.netease, ["DIRECT", POLICIES.main, POLICIES.auto, POLICIES.manual]);
  if (sourcePolicies.has(POLICIES.netflix)) {
    const netflixNodes = nodes.filter(node => /(奈飞|Netflix|\bNF\b|解锁|Media)/i.test(node.name)).map(node => node.name);
    groups.push({ name: POLICIES.netflixNodes, type: "select", members: netflixNodes.length ? netflixNodes : [POLICIES.main] });
    add(POLICIES.netflix, [POLICIES.netflixNodes, ...choices]);
  }
  add(POLICIES.bahamut, [...regionNames.filter(name => /台湾/.test(name)), POLICIES.main, POLICIES.manual, "DIRECT"]);
  add(POLICIES.bilibili, ["DIRECT", ...regionNames.filter(name => /台湾|香港/.test(name)), POLICIES.main]);
  add(POLICIES.direct, ["DIRECT", POLICIES.main, POLICIES.auto]);
  add(POLICIES.ad, ["REJECT", "DIRECT"]);
  add(POLICIES.cleanup, ["REJECT", "DIRECT"]);
  groups.push({ name: POLICIES.final, type: "select", members: [POLICIES.main, POLICIES.auto, "DIRECT", ...regionNames] });
  // Country and region groups stay together at the very bottom of the policy list.
  for (const group of regionGroups) groups.push({ name: group.region.name, type: "url-test", members: group.nodes.map(node => node.name) });
  return groups;
}

function clashProxy(node: ProxyNode): Record<string, unknown> {
  const proxy: Record<string, unknown> = { name: node.name, type: node.protocol, server: node.server, port: node.port, udp: node.protocol !== "http" };
  if (node.protocol === "ss") {
    proxy.cipher = node.cipher ?? "aes-256-gcm";
    proxy.password = node.password ?? "";
    if (node.plugin) {
      proxy.plugin = node.plugin;
      proxy["plugin-opts"] = node.plugin === "obfs"
        ? { mode: node.pluginMode ?? "http", ...(node.host ? { host: node.host } : {}) }
        : { mode: "websocket", ...(node.tls ? { tls: true } : {}), ...(node.host ? { host: node.host } : {}), ...(normalizedPath(node.path) ? { path: normalizedPath(node.path) } : {}) };
    }
    return proxy;
  }
  if (node.protocol === "ssr") return { ...proxy, cipher: node.cipher ?? "aes-256-cfb", password: node.password ?? "", protocol: node.protocolName ?? "origin", obfs: node.obfs ?? "plain", ...(node.protocolParam ? { "protocol-param": node.protocolParam } : {}), ...(node.obfsParam ? { "obfs-param": node.obfsParam } : {}) };
  if (node.protocol === "hysteria") return { ...proxy, "auth-str": node.password ?? "", up: node.upMbps ?? 50, down: node.downMbps ?? 100, ...(node.sni ? { sni: node.sni } : {}), ...(node.obfs ? { obfs: node.obfs } : {}), ...(node.protocolName ? { protocol: node.protocolName } : {}), ...(node.alpn ? { alpn: csv(node.alpn) } : {}), ...(node.certificateFingerprint ? { fingerprint: node.certificateFingerprint } : {}), "skip-cert-verify": Boolean(node.skipCertVerify) };
  if (node.protocol === "hysteria2") return { ...proxy, password: node.password ?? "", ...(node.sni ? { sni: node.sni } : {}), ...(node.portHopping ? { ports: node.portHopping } : {}), ...(node.obfs && node.obfsPassword ? { obfs: node.obfs, "obfs-password": node.obfsPassword } : {}), ...(node.alpn ? { alpn: csv(node.alpn) } : {}), ...(node.certificateFingerprint ? { fingerprint: node.certificateFingerprint } : {}), "skip-cert-verify": Boolean(node.skipCertVerify) };
  if (node.protocol === "tuic") return { ...proxy, uuid: node.uuid ?? "", password: node.password ?? "", ...(node.sni ? { sni: node.sni } : {}), ...(node.congestionControl ? { "congestion-controller": node.congestionControl } : {}), ...(node.udpRelayMode ? { "udp-relay-mode": node.udpRelayMode } : {}), ...(node.portHopping ? { ports: node.portHopping } : {}), ...(node.alpn ? { alpn: csv(node.alpn) } : {}), ...(node.certificateFingerprint ? { fingerprint: node.certificateFingerprint } : {}), ...(node.fingerprint ? { "client-fingerprint": node.fingerprint } : {}), "skip-cert-verify": Boolean(node.skipCertVerify) };
  if (node.protocol === "wireguard") return { ...proxy, "private-key": node.wireGuardPrivateKey ?? "", "public-key": node.wireGuardPublicKey ?? "", ...(node.wireGuardIPv4 ? { ip: node.wireGuardIPv4 } : {}), ...(node.wireGuardIPv6 ? { ipv6: node.wireGuardIPv6 } : {}), "allowed-ips": csv(node.wireGuardAllowedIPs || "0.0.0.0/0,::/0"), ...(node.wireGuardPreSharedKey ? { "pre-shared-key": node.wireGuardPreSharedKey } : {}), ...(node.wireGuardReserved ? { reserved: csv(node.wireGuardReserved).map(Number) } : {}), ...(node.wireGuardMTU ? { mtu: node.wireGuardMTU } : {}), ...(node.wireGuardPersistentKeepalive ? { "persistent-keepalive": node.wireGuardPersistentKeepalive } : {}), ...(node.wireGuardDNS ? { dns: csv(node.wireGuardDNS) } : {}) };
  if (node.protocol === "anytls") return { ...proxy, password: node.password ?? "", ...(node.sni ? { sni: node.sni } : {}), ...(node.alpn ? { alpn: csv(node.alpn) } : {}), ...(node.certificateFingerprint ? { fingerprint: node.certificateFingerprint } : {}), ...(node.fingerprint ? { "client-fingerprint": node.fingerprint } : {}), "skip-cert-verify": Boolean(node.skipCertVerify), ...(node.idleSessionCheckInterval ? { "idle-session-check-interval": node.idleSessionCheckInterval } : {}), ...(node.idleSessionTimeout ? { "idle-session-timeout": node.idleSessionTimeout } : {}), ...(node.minIdleSession ? { "min-idle-session": node.minIdleSession } : {}) };
  if (node.protocol === "socks5" || node.protocol === "http") {
    if (node.username) proxy.username = node.username;
    if (node.password) proxy.password = node.password;
    proxy.tls = Boolean(node.tls);
    return proxy;
  }
  if (node.protocol === "vmess") { proxy.uuid = node.uuid ?? ""; proxy.alterId = node.alterId ?? 0; proxy.cipher = node.cipher ?? "auto"; }
  else if (node.protocol === "vless") { proxy.uuid = node.uuid ?? ""; if (node.flow) proxy.flow = node.flow; }
  else proxy.password = node.password ?? "";
  const transport = node.transport && node.transport !== "tcp" ? node.transport : undefined;
  if (transport) proxy.network = transport;
  if (node.tls) proxy.tls = true;
  if (node.sni) proxy.servername = node.sni;
  if (node.skipCertVerify) proxy["skip-cert-verify"] = true;
  if (node.fingerprint || node.realityPublicKey) proxy["client-fingerprint"] = node.fingerprint ?? "chrome";
  if (node.certificateFingerprint) proxy.fingerprint = node.certificateFingerprint;
  if (node.alpn) proxy.alpn = csv(node.alpn);
  if (transport === "ws") proxy["ws-opts"] = { ...(normalizedPath(node.path) ? { path: normalizedPath(node.path) } : {}), ...(node.host ? { headers: { Host: node.host } } : {}) };
  if (transport === "grpc") proxy["grpc-opts"] = { "grpc-service-name": node.path ?? "" };
  if (transport === "http") proxy["http-opts"] = { path: [normalizedPath(node.path) ?? "/"], ...(node.host ? { headers: { Host: [node.host] } } : {}) };
  if (transport === "h2") proxy["h2-opts"] = { path: normalizedPath(node.path) ?? "/", ...(node.host ? { host: [node.host] } : {}) };
  if (transport === "httpupgrade") {
    proxy.network = "ws";
    proxy["ws-opts"] = { path: normalizedPath(node.path) ?? "/", ...(node.host ? { headers: { Host: node.host } } : {}), "v2ray-http-upgrade": true };
  }
  if (transport === "xhttp") proxy["xhttp-opts"] = { path: normalizedPath(node.path) ?? "/", ...(node.host ? { host: node.host } : {}) };
  if (node.realityPublicKey) proxy["reality-opts"] = { "public-key": node.realityPublicKey, ...(node.realityShortId ? { "short-id": node.realityShortId } : {}) };
  return proxy;
}

function clashGroups(groups: PolicyGroup[]): Array<Record<string, unknown>> {
  return groups.map(group => group.type === "select"
    ? { name: group.name, type: "select", proxies: group.members }
    : { name: group.name, type: "url-test", proxies: group.members, url: TEST_URL, interval: 300, tolerance: 50 });
}

function customRuleLines(customText: string): string[] {
  return parseCustomRules(customText).map(rule => `${rule.line},${rule.policy}`);
}

function clash(nodes: ProxyNode[], preset: RulePreset, customText: string): string {
  const providers = Object.fromEntries(ruleSources(preset).map(source => [`ACL4SSR-${source.id}`, { type: "http", behavior: "classical", format: "text", url: ruleSourceURL(source), path: `./ruleset/acl4ssr-${source.id.toLowerCase()}.list`, interval: 86400 }]));
  const rules = [
    ...ruleSources(preset).map(source => `RULE-SET,ACL4SSR-${source.id},${source.policy}`),
    ...customRuleLines(customText),
    "GEOIP,CN,DIRECT,no-resolve",
    `MATCH,${POLICIES.final}`,
  ];
  const document = { "mixed-port": 7890, "allow-lan": false, mode: "rule", "log-level": "warning", ipv6: true, proxies: nodes.map(clashProxy), "proxy-groups": clashGroups(buildGroups(nodes, preset)), "rule-providers": providers, rules };
  return `# 由「流转」在本机生成\n# ACL4SSR 规则已固定版本；订阅凭据不会写入规则 URL\n\n${yaml.dump(document, { noRefs: true, lineWidth: -1 })}`;
}

function tlsOptions(node: ProxyNode, includeTLS = true): string[] {
  const result: string[] = [];
  if (includeTLS && node.tls) result.push("tls=true");
  if (node.sni) result.push(`sni=${confValue(node.sni)}`);
  if (node.skipCertVerify) result.push("skip-cert-verify=true");
  if (node.alpn) result.push(`alpn=${confValue(node.alpn)}`);
  return result;
}

function transportOptions(node: ProxyNode): string[] {
  const result = tlsOptions(node);
  if (node.transport === "ws") {
    result.push("ws=true");
    if (node.path) result.push(`ws-path=${confValue(normalizedPath(node.path) ?? "")}`);
    if (node.host) result.push(`ws-headers=Host:${confValue(node.host)}`);
  }
  return result;
}

function textNode(node: ProxyNode, shadowrocket: boolean, index: number): string {
  const name = safeName(node.name);
  let fields: string[];
  if (node.protocol === "ss") fields = ["ss", node.server, String(node.port), `encrypt-method=${node.cipher ?? "aes-256-gcm"}`, `password=${confValue(node.password ?? "")}`, "udp-relay=true"];
  else if (node.protocol === "ssr") {
    fields = ["ssr", node.server, String(node.port), `encrypt-method=${node.cipher ?? "aes-256-cfb"}`, `password=${confValue(node.password ?? "")}`, `protocol=${node.protocolName ?? "origin"}`, `obfs=${node.obfs ?? "plain"}`];
    if (node.protocolParam) fields.push(`protocol-param=${confValue(node.protocolParam)}`);
    if (node.obfsParam) fields.push(`obfs-param=${confValue(node.obfsParam)}`);
  } else if (node.protocol === "vmess") {
    fields = ["vmess", node.server, String(node.port), `username=${node.uuid ?? ""}`, `vmess-aead=${(node.alterId ?? 0) === 0}`, ...transportOptions(node)];
    if (!node.tls) fields.push("tls=false");
    if (!node.skipCertVerify) fields.push("skip-cert-verify=false");
    fields.push("tfo=false", "udp-relay=false");
  }
  else if (node.protocol === "vless") {
    fields = ["vless", node.server, String(node.port), `username=${node.uuid ?? ""}`, ...transportOptions(node), "udp-relay=true"];
    if (node.realityPublicKey) fields.push(`pbk=${confValue(node.realityPublicKey)}`);
    if (node.realityShortId) fields.push(`sid=${confValue(node.realityShortId)}`);
  } else if (node.protocol === "trojan") {
    fields = ["trojan", node.server, String(node.port), `password=${confValue(node.password ?? "")}`, ...transportOptions(node).filter(value => value !== "tls=true")];
    if (!node.skipCertVerify) fields.push("skip-cert-verify=false");
    fields.push("tfo=false", "udp-relay=false");
  }
  else if (node.protocol === "hysteria") {
    fields = ["hysteria", node.server, String(node.port), `auth=${confValue(node.password ?? "")}`, `upmbps=${node.upMbps ?? 50}`, `downmbps=${node.downMbps ?? 100}`, ...tlsOptions(node, false), "udp=1"];
    if (node.obfs) fields.push(`obfsParam=${confValue(node.obfs)}`);
  } else if (node.protocol === "hysteria2") {
    fields = [
      "hysteria2", node.server, String(node.port), `password=${confValue(node.password ?? "")}`,
      ...(node.sni ? [`sni=${confValue(node.sni)}`] : []),
      ...(node.skipCertVerify ? ["skip-cert-verify=true"] : []),
      ...(node.alpn ? [`alpn=${confValue(node.alpn)}`] : []),
      `download-bandwidth=${node.downMbps ?? 1000}`,
      ...(node.portHopping ? [`port-hopping=${confValue(node.portHopping.replace(/,/g, ";"))}`] : []),
      "udp-relay=true",
    ];
    if (node.obfsPassword) fields.push(`${shadowrocket ? "obfsParam" : "salamander-password"}=${confValue(node.obfsPassword)}`);
  } else if (node.protocol === "tuic") fields = [shadowrocket ? "tuic" : "tuic-v5", node.server, String(node.port), `${shadowrocket ? "user" : "uuid"}=${node.uuid ?? ""}`, `password=${confValue(node.password ?? "")}`, ...tlsOptions(node, false), shadowrocket ? "udp=1" : "udp-relay=true"];
  else if (node.protocol === "wireguard") fields = ["wireguard", `section-name=subflow-wg-${index + 1}`];
  else if (node.protocol === "anytls") fields = ["anytls", node.server, String(node.port), `password=${confValue(node.password ?? "")}`, ...tlsOptions(node, false), "udp-relay=true"];
  else if (node.protocol === "socks5") fields = [node.tls ? "socks5-tls" : "socks5", node.server, String(node.port), ...(node.username || node.password ? [confValue(node.username ?? ""), confValue(node.password ?? "")] : []), "udp-relay=true", ...tlsOptions(node, false)];
  else fields = [node.tls ? "https" : "http", node.server, String(node.port), ...(node.username || node.password ? [confValue(node.username ?? ""), confValue(node.password ?? "")] : []), ...tlsOptions(node, false)];
  return `${name} = ${fields.join(", ")}`;
}

function wireGuardSections(nodes: ProxyNode[]): string[] {
  return nodes.flatMap((node, index) => node.protocol !== "wireguard" ? [] : [
    "", `[WireGuard subflow-wg-${index + 1}]`, `private-key = ${node.wireGuardPrivateKey ?? ""}`,
    ...(node.wireGuardIPv4 ? [`self-ip = ${node.wireGuardIPv4}`] : []),
    ...(node.wireGuardIPv6 ? [`self-ip-v6 = ${node.wireGuardIPv6}`] : []),
    ...(node.wireGuardDNS ? [`dns-server = ${node.wireGuardDNS}`] : []),
    `peer = (public-key = ${node.wireGuardPublicKey ?? ""}, allowed-ips = "${node.wireGuardAllowedIPs ?? "0.0.0.0/0, ::/0"}", endpoint = ${node.server}:${node.port}${node.wireGuardPersistentKeepalive ? `, keepalive = ${node.wireGuardPersistentKeepalive}` : ""})`,
  ]);
}

function textGroups(groups: PolicyGroup[], compact = false): string[] {
  const separator = compact ? "," : ", ";
  return groups.map(group => group.type === "select"
    ? `${group.name} = select${separator}${group.members.join(separator)}`
    : `${group.name} = url-test${separator}${group.members.join(separator)}${separator}url=${TEST_URL}${separator}interval=300${separator}tolerance=50`);
}

function remoteRuleLines(preset: RulePreset): string[] {
  return ruleSources(preset).map(source => `RULE-SET,${ruleSourceURL(source)},${source.policy},update-interval=86400`);
}

function surgeLike(nodes: ProxyNode[], preset: RulePreset, customText: string, shadowrocket: boolean): string {
  const targetName = shadowrocket ? "Shadowrocket" : "Surge";
  return [
    `# 由「流转」在本机为 ${targetName} 生成`, "# ACL4SSR 公开规则由客户端直接更新", "", "[General]", "loglevel = notify", "ipv6 = true", "dns-server = 119.29.29.29, 223.5.5.5", `proxy-test-url = ${TEST_URL}`, "test-timeout = 5", "skip-proxy = 127.0.0.1, localhost, *.local",
    ...wireGuardSections(nodes), "", "[Proxy]", ...nodes.map((node, index) => textNode(node, shadowrocket, index)), "", "[Proxy Group]", ...textGroups(buildGroups(nodes, preset)), "", "[Rule]",
    ...remoteRuleLines(preset), ...customRuleLines(customText), "GEOIP,CN,DIRECT,no-resolve", `FINAL,${POLICIES.final}`, "",
  ].join("\n");
}

function loonNode(node: ProxyNode): string {
  const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
  const name = safeName(node.name);
  let fields: string[];
  if (node.protocol === "ss") fields = ["Shadowsocks", node.server, String(node.port), node.cipher ?? "aes-256-gcm", quoted(node.password ?? ""), "udp=true"];
  else if (node.protocol === "ssr") fields = ["ShadowsocksR", node.server, String(node.port), node.cipher ?? "aes-256-cfb", quoted(node.password ?? ""), `protocol=${node.protocolName ?? "origin"}`, `obfs=${node.obfs ?? "plain"}`, "udp=true"];
  else if (node.protocol === "vmess") fields = ["vmess", node.server, String(node.port), node.cipher ?? "auto", quoted(node.uuid ?? ""), `transport=${node.transport ?? "tcp"}`, `alterId=${node.alterId ?? 0}`];
  else if (node.protocol === "vless") fields = ["VLESS", node.server, String(node.port), quoted(node.uuid ?? ""), `transport=${node.transport ?? "tcp"}`];
  else if (node.protocol === "trojan") fields = ["trojan", node.server, String(node.port), quoted(node.password ?? "")];
  else if (node.protocol === "hysteria2") fields = ["Hysteria2", node.server, String(node.port), quoted(node.password ?? ""), "udp=true", "fast-open=true"];
  else if (node.protocol === "wireguard") fields = ["wireguard", `interface-ip=${node.wireGuardIPv4 ?? ""}`, `private-key=${quoted(node.wireGuardPrivateKey ?? "")}`, `peers=[{public-key=${quoted(node.wireGuardPublicKey ?? "")},allowed-ips=${quoted(node.wireGuardAllowedIPs ?? "0.0.0.0/0,::/0")},endpoint=${node.server}:${node.port}}]`, "udp=true"];
  else if (node.protocol === "anytls") fields = ["anytls", node.server, String(node.port), quoted(node.password ?? ""), "udp=true"];
  else if (node.protocol === "socks5") fields = ["Socks5", node.server, String(node.port), ...(node.username || node.password ? [quoted(node.username ?? ""), quoted(node.password ?? "")] : []), "udp=true"];
  else fields = [node.tls ? "https" : "http", node.server, String(node.port), ...(node.username || node.password ? [quoted(node.username ?? ""), quoted(node.password ?? "")] : [])];
  if (["vmess", "vless", "trojan", "hysteria2", "anytls"].includes(node.protocol)) {
    if (node.path) fields.push(`path=${confValue(normalizedPath(node.path) ?? "")}`);
    if (node.host) fields.push(`host=${confValue(node.host)}`);
    if (node.tls) fields.push("tls=true");
    if (node.sni) fields.push(`tls-name=${confValue(node.sni)}`);
    if (node.skipCertVerify) fields.push("skip-cert-verify=true");
  }
  return `${name} = ${fields.join(",")}`;
}

function loon(nodes: ProxyNode[], preset: RulePreset, customText: string): string {
  return [
    "# 由「流转」在本机为 Loon 生成", "", "[General]", "ipv6 = true", "skip-proxy = 127.0.0.1, localhost, *.local", "", "[Proxy]", ...nodes.map(loonNode), "", "[Proxy Group]", ...textGroups(buildGroups(nodes, preset), true), "", "[Remote Rule]",
    ...ruleSources(preset).map(source => `${ruleSourceURL(source)},policy=${source.policy},tag=ACL4SSR-${source.id},enabled=true`), "", "[Rule]", ...customRuleLines(customText), "GEOIP,CN,DIRECT,no-resolve", `FINAL,${POLICIES.final}`, "",
  ].join("\n");
}

function quanXNode(node: ProxyNode): string {
  const fields = [`${node.server}:${node.port}`];
  let type: string = node.protocol;
  if (node.protocol === "ss") { type = "shadowsocks"; fields.push(`method=${node.cipher ?? "aes-256-gcm"}`, `password=${confValue(node.password ?? "")}`, "udp-relay=true"); }
  else if (node.protocol === "ssr") { type = "shadowsocks"; fields.push(`method=${node.cipher ?? "aes-256-cfb"}`, `password=${confValue(node.password ?? "")}`, `ssr-protocol=${node.protocolName ?? "origin"}`, `obfs=${node.obfs ?? "plain"}`); }
  else if (node.protocol === "vmess" || node.protocol === "vless") fields.push("method=none", `password=${node.uuid ?? ""}`);
  else if (node.protocol === "trojan" || node.protocol === "anytls") fields.push(`password=${confValue(node.password ?? "")}`);
  else if (node.protocol === "socks5" || node.protocol === "http") { if (node.username) fields.push(`username=${confValue(node.username)}`); if (node.password) fields.push(`password=${confValue(node.password)}`); }
  if (node.transport === "ws") { fields.push(`obfs=${node.tls ? "wss" : "ws"}`); if (node.host || node.sni) fields.push(`obfs-host=${confValue(node.host ?? node.sni ?? "")}`); fields.push(`obfs-uri=${confValue(normalizedPath(node.path) ?? "/")}`); }
  else if (node.tls && node.protocol !== "anytls") { fields.push("obfs=over-tls"); if (node.sni) fields.push(`obfs-host=${confValue(node.sni)}`); }
  if (node.protocol === "anytls") { fields.push("over-tls=true"); if (node.sni) fields.push(`tls-host=${confValue(node.sni)}`); }
  if (node.skipCertVerify && node.tls) fields.push("tls-verification=false");
  fields.push(`tag=${safeName(node.name)}`);
  return `${type}=${fields.join(", ")}`;
}

function quanXRule(rule: ResolvedRule): string | null {
  const parts = rule.line.split(",");
  const map: Record<string, string> = { DOMAIN: "host", "DOMAIN-SUFFIX": "host-suffix", "DOMAIN-KEYWORD": "host-keyword", "IP-CIDR": "ip-cidr", "IP-CIDR6": "ip6-cidr", "IP6-CIDR": "ip6-cidr", GEOIP: "geoip", "PROCESS-NAME": "user-agent", "DEST-PORT": "dest-port", PROTOCOL: "network" };
  const type = map[parts[0]];
  return type ? `${type}, ${parts[1]}, ${rule.policy}${parts.includes("no-resolve") ? ", no-resolve" : ""}` : null;
}

function quanX(nodes: ProxyNode[], preset: RulePreset, rules: ResolvedRule[]): string {
  const policies = buildGroups(nodes, preset).map(group => group.type === "select"
    ? `static=${group.name}, ${group.members.map(member => member === "DIRECT" ? "direct" : member === "REJECT" ? "reject" : member).join(", ")}`
    : `url-latency-benchmark=${group.name}, ${group.members.join(", ")}, check-interval=300, alive-checking=false, tolerance=50`);
  return ["# 由「流转」在本机为 Quantumult X 生成", "", "[general]", "dns-server=223.5.5.5", "", "[policy]", ...policies, "", "[server_local]", ...nodes.map(quanXNode), "", "[filter_local]", ...(rules.map(quanXRule).filter(Boolean) as string[]), "geoip, cn, direct, no-resolve", `final, ${POLICIES.final}`, ""].join("\n");
}

function singBoxTLS(node: ProxyNode): Record<string, unknown> | undefined {
  if (node.protocol === "ss") return undefined;
  if (!node.tls && !["trojan", "hysteria", "hysteria2", "tuic", "anytls"].includes(node.protocol)) return undefined;
  const tls: Record<string, unknown> = { enabled: true, server_name: node.sni ?? node.host ?? node.server, insecure: Boolean(node.skipCertVerify) };
  if (node.alpn) tls.alpn = csv(node.alpn);
  if (node.realityPublicKey) tls.reality = { enabled: true, public_key: node.realityPublicKey, ...(node.realityShortId ? { short_id: node.realityShortId } : {}) };
  return tls;
}

function singBoxOutbound(node: ProxyNode): Record<string, unknown> {
  const outbound: Record<string, unknown> = { tag: node.name, type: node.protocol === "ss" ? "shadowsocks" : node.protocol === "socks5" ? "socks" : node.protocol, server: node.server, server_port: node.port };
  if (node.protocol === "ss") {
    Object.assign(outbound, { method: node.cipher ?? "aes-256-gcm", password: node.password ?? "" });
    if (node.plugin) {
      outbound.plugin = node.plugin === "obfs" ? "obfs-local" : "v2ray-plugin";
      outbound.plugin_opts = node.plugin === "obfs"
        ? [`obfs=${node.pluginMode ?? "http"}`, ...(node.host ? [`obfs-host=${node.host}`] : [])].join(";")
        : ["mode=websocket", ...(node.tls ? ["tls"] : []), ...(node.host ? [`host=${node.host}`] : []), ...(node.path ? [`path=${normalizedPath(node.path)}`] : [])].join(";");
    }
  }
  else if (node.protocol === "vmess") Object.assign(outbound, { uuid: node.uuid ?? "", security: node.cipher ?? "auto", alter_id: node.alterId ?? 0 });
  else if (node.protocol === "vless") Object.assign(outbound, { uuid: node.uuid ?? "", ...(node.flow ? { flow: node.flow } : {}) });
  else if (["trojan", "hysteria2", "anytls"].includes(node.protocol)) outbound.password = node.password ?? "";
  else if (node.protocol === "hysteria") Object.assign(outbound, { auth_str: node.password ?? "", up_mbps: node.upMbps ?? 50, down_mbps: node.downMbps ?? 100, ...(node.obfs ? { obfs: node.obfs } : {}) });
  else if (node.protocol === "tuic") Object.assign(outbound, { uuid: node.uuid ?? "", password: node.password ?? "", ...(node.congestionControl ? { congestion_control: node.congestionControl } : {}), ...(node.udpRelayMode ? { udp_relay_mode: node.udpRelayMode } : {}) });
  else if (node.protocol === "wireguard") Object.assign(outbound, { address: [node.wireGuardIPv4, node.wireGuardIPv6].filter(Boolean), private_key: node.wireGuardPrivateKey, peer_public_key: node.wireGuardPublicKey, ...(node.wireGuardPreSharedKey ? { pre_shared_key: node.wireGuardPreSharedKey } : {}) });
  else if (node.protocol === "socks5" || node.protocol === "http") { if (node.username) outbound.username = node.username; if (node.password) outbound.password = node.password; }
  if (node.protocol === "anytls") { if (node.idleSessionCheckInterval) outbound.idle_session_check_interval = `${node.idleSessionCheckInterval}s`; if (node.idleSessionTimeout) outbound.idle_session_timeout = `${node.idleSessionTimeout}s`; if (node.minIdleSession) outbound.min_idle_session = node.minIdleSession; }
  const tls = singBoxTLS(node); if (tls) outbound.tls = tls;
  if (node.transport === "ws") outbound.transport = { type: "ws", path: normalizedPath(node.path) ?? "/", ...(node.host ? { headers: { Host: node.host } } : {}) };
  if (node.transport === "grpc") outbound.transport = { type: "grpc", service_name: node.path ?? "" };
  if (node.transport === "http" || node.transport === "h2") outbound.transport = { type: "http", path: normalizedPath(node.path) ?? "/", ...(node.host ? { host: [node.host] } : {}) };
  if (node.transport === "httpupgrade") outbound.transport = { type: "httpupgrade", path: normalizedPath(node.path) ?? "/", ...(node.host ? { host: node.host } : {}) };
  return outbound;
}

function singBoxRule(rule: ResolvedRule): Record<string, unknown> | null {
  const [type, value] = rule.line.split(",");
  const fields: Record<string, string> = { DOMAIN: "domain", "DOMAIN-SUFFIX": "domain_suffix", "DOMAIN-KEYWORD": "domain_keyword", "IP-CIDR": "ip_cidr", "IP-CIDR6": "ip_cidr", "IP6-CIDR": "ip_cidr", "PROCESS-NAME": "process_name" };
  const field = fields[type];
  if (!field) return null;
  return rule.policy === "REJECT" ? { [field]: [value], action: "reject" } : { [field]: [value], outbound: rule.policy };
}

function hiddify(nodes: ProxyNode[], preset: RulePreset, rules: ResolvedRule[]): string {
  const groups = buildGroups(nodes, preset);
  const outbounds: Array<Record<string, unknown>> = [
    ...nodes.map(singBoxOutbound),
    ...groups.map(group => group.type === "select" ? { type: "selector", tag: group.name, outbounds: group.members.map(member => member === "DIRECT" ? "direct" : member === "REJECT" ? "block" : member) } : { type: "urltest", tag: group.name, outbounds: group.members, url: TEST_URL, interval: "5m" }),
    { type: "direct", tag: "direct" }, { type: "block", tag: "block" },
  ];
  return JSON.stringify({ log: { level: "warn" }, outbounds, route: { auto_detect_interface: true, rules: rules.map(singBoxRule).filter(Boolean), final: POLICIES.final } }, null, 2);
}

function egernProxy(node: ProxyNode): Record<string, unknown> {
  const body: Record<string, unknown> = { name: node.name, server: node.server, port: node.port, udp_relay: node.protocol !== "http" };
  let type: string = node.protocol;
  if (node.protocol === "ss") { type = "shadowsocks"; Object.assign(body, { method: node.cipher ?? "aes-256-gcm", password: node.password ?? "" }); }
  else if (node.protocol === "vmess") Object.assign(body, { user_id: node.uuid ?? "", security: node.cipher ?? "auto", legacy: false });
  else if (node.protocol === "vless") body.user_id = node.uuid ?? "";
  else if (node.protocol === "hysteria2") body.auth = node.password ?? "";
  else if (node.protocol === "trojan" || node.protocol === "anytls") body.password = node.password ?? "";
  else if (node.protocol === "tuic") Object.assign(body, { uuid: node.uuid ?? "", password: node.password ?? "", alpn: csv(node.alpn || "h3") });
  else if (node.protocol === "wireguard") Object.assign(body, { private_key: node.wireGuardPrivateKey, peer_public_key: node.wireGuardPublicKey, local_ipv4: node.wireGuardIPv4, local_ipv6: node.wireGuardIPv6 });
  else if (node.protocol === "socks5" || node.protocol === "http") { if (node.username) body.username = node.username; if (node.password) body.password = node.password; type = node.protocol === "socks5" ? (node.tls ? "socks5_tls" : "socks5") : (node.tls ? "https" : "http"); }
  if (node.sni) body.sni = node.sni;
  if (node.skipCertVerify && node.protocol !== "ss") body.skip_tls_verify = true;
  if (node.realityPublicKey) body.reality = { public_key: node.realityPublicKey, ...(node.realityShortId ? { short_id: node.realityShortId } : {}) };
  if (["vmess", "vless", "trojan"].includes(node.protocol) && node.transport && node.transport !== "tcp") {
    if (node.transport === "ws") body.transport = { [node.tls ? "wss" : "ws"]: { path: normalizedPath(node.path) ?? "/", ...(node.host ? { headers: { Host: node.host } } : {}), ...(node.tls && node.sni ? { sni: node.sni } : {}) } };
    else if (node.transport === "http") body.transport = { http1: { path: normalizedPath(node.path) ?? "/", ...(node.host ? { headers: { Host: node.host } } : {}) } };
    else if (node.transport === "h2") body.transport = { http2: { path: normalizedPath(node.path) ?? "/", ...(node.host ? { headers: { Host: node.host } } : {}), ...(node.sni ? { sni: node.sni } : {}) } };
    else if (node.transport === "grpc") body.transport = { grpc: { ...(node.path ? { service_name: node.path.replace(/^\//, "") } : {}), ...(node.sni ? { sni: node.sni } : {}) } };
  }
  return { [type]: body };
}

function egernRule(rule: ResolvedRule): Record<string, unknown> | null {
  const [type, value] = rule.line.split(",");
  const map: Record<string, string> = { DOMAIN: "domain", "DOMAIN-SUFFIX": "domain_suffix", "DOMAIN-KEYWORD": "domain_keyword", "IP-CIDR": "ip_cidr", "IP-CIDR6": "ip_cidr", "IP6-CIDR": "ip_cidr", GEOIP: "geoip", "DEST-PORT": "dest_port", PROTOCOL: "protocol" };
  const matcher = map[type];
  return matcher ? { [matcher]: { match: value, policy: rule.policy } } : null;
}

function egern(nodes: ProxyNode[], preset: RulePreset, rules: ResolvedRule[]): string {
  const groups = buildGroups(nodes, preset).map(group => group.type === "select" ? { select: { name: group.name, policies: group.members } } : { auto_test: { name: group.name, policies: group.members, interval: 600, tolerance: 100, timeout: 5 } });
  const document = { proxies: nodes.map(egernProxy), "proxy-groups": groups, rules: [...rules.map(egernRule).filter(Boolean), { default: { policy: POLICIES.final } }] };
  return `# 由「流转」在本机为 Egern 生成\n${yaml.dump(document, { noRefs: true, lineWidth: -1 })}`;
}

function generateWithRules(inputNodes: ProxyNode[], target: ClientTarget, preset: RulePreset, customText: string, resolvedRules: ResolvedRule[]): GeneratedConfig {
  const all = uniqueNames(inputNodes);
  const checks = all.map(node => compatibility(target, node));
  const supported = checks.filter(check => check.supported).map(check => check.node);
  const skippedReasons = [...new Set(checks.filter(check => !check.supported).flatMap(check => check.reason ? [check.reason] : []))];
  let content: string;
  if (target === "clash") content = clash(supported, preset, customText);
  else if (target === "surge") content = surgeLike(supported, preset, customText, false);
  // Shadowrocket imports standard Clash YAML as a full configuration. A
  // Surge-style .conf may import nodes but does not reliably expose its policy
  // groups in Shadowrocket's UI.
  else if (target === "shadowrocket") content = clash(supported, preset, customText);
  else if (target === "loon") content = loon(supported, preset, customText);
  else if (target === "quanx") content = quanX(supported, preset, resolvedRules);
  else if (target === "hiddify") content = hiddify(supported, preset, resolvedRules);
  else content = egern(supported, preset, resolvedRules);
  const extension: GeneratedConfig["extension"] = target === "clash" || target === "shadowrocket" || target === "egern" ? "yaml" : target === "hiddify" ? "json" : "conf";
  return {
    content,
    extension,
    supported: supported.length,
    skipped: all.length - supported.length,
    aiEligible: supported.length,
    regionGroups: groupNodesByRegion(supported).length,
    ruleCount: targetNeedsInlineRules(target) ? resolvedRules.length : ruleSources(preset).length + parseCustomRules(customText).length,
    skippedReasons,
  };
}

export function generateConfig(inputNodes: ProxyNode[], target: ClientTarget, preset: RulePreset, customText = ""): GeneratedConfig {
  return generateWithRules(inputNodes, target, preset, customText, parseCustomRules(customText));
}

export async function generateConfigAsync(inputNodes: ProxyNode[], target: ClientTarget, preset: RulePreset, customText = "", fetcher: typeof fetch = fetch): Promise<GeneratedConfig> {
  const resolved = targetNeedsInlineRules(target) ? await resolveRuleLines(preset, customText, fetcher) : parseCustomRules(customText);
  return generateWithRules(inputNodes, target, preset, customText, resolved);
}
