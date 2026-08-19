import * as yaml from "js-yaml";
import type { ClientTarget, GeneratedConfig, ProxyNode, RulePreset } from "./model";

const GROUP = "🚀 节点选择";
const AUTO = "♻️ 自动选择";

function safeName(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/=/g, "-").replace(/,/g, "，").replace(/#/g, "＃").replace(/;/g, "；").replace(/\[/g, "［").replace(/\]/g, "］").trim();
}

function path(value?: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith("/") ? value : `/${value}`;
}

function uniqueNames(nodes: ProxyNode[]): ProxyNode[] {
  const counts = new Map<string, number>();
  return nodes.map(node => {
    const base = safeName(node.name) || `${node.server}:${node.port}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return { ...node, name: count === 1 ? base : `${base} · ${count}` };
  });
}

function clashProxy(node: ProxyNode): Record<string, unknown> {
  const proxy: Record<string, unknown> = {
    name: node.name,
    type: node.protocol,
    server: node.server,
    port: node.port,
    udp: true,
  };
  if (node.protocol === "ss") {
    proxy.cipher = node.cipher ?? "aes-256-gcm";
    proxy.password = node.password ?? "";
    if (node.plugin) {
      proxy.plugin = node.plugin;
      proxy["plugin-opts"] = node.plugin === "obfs"
        ? { mode: node.pluginMode ?? "http", ...(node.host ? { host: node.host } : {}) }
        : { mode: "websocket", ...(node.tls ? { tls: true } : {}), ...(node.host ? { host: node.host } : {}), ...(path(node.path) ? { path: path(node.path) } : {}) };
    }
    return proxy;
  }
  if (node.protocol === "hysteria2") {
    proxy.password = node.password ?? "";
    if (node.sni) proxy.sni = node.sni;
    if (node.skipCertVerify) proxy["skip-cert-verify"] = true;
    if (node.portHopping) proxy.ports = node.portHopping;
    if (node.alpn) proxy.alpn = node.alpn.split(",").map(item => item.trim()).filter(Boolean);
    if (node.certificateFingerprint) proxy.fingerprint = node.certificateFingerprint;
    if (node.obfs && node.obfsPassword) {
      proxy.obfs = node.obfs;
      proxy["obfs-password"] = node.obfsPassword;
    }
    return proxy;
  }
  if (node.protocol === "vmess") {
    proxy.uuid = node.uuid ?? "";
    proxy.alterId = node.alterId ?? 0;
    proxy.cipher = node.cipher ?? "auto";
  } else if (node.protocol === "vless") {
    proxy.uuid = node.uuid ?? "";
    if (node.flow) proxy.flow = node.flow;
  } else {
    proxy.password = node.password ?? "";
  }
  const transport = node.transport && node.transport !== "tcp" ? node.transport : undefined;
  if (transport) proxy.network = transport;
  if (node.tls) proxy.tls = true;
  if (node.sni) proxy.servername = node.sni;
  if (node.skipCertVerify) proxy["skip-cert-verify"] = true;
  if (node.fingerprint) proxy["client-fingerprint"] = node.fingerprint;
  if (node.alpn) proxy.alpn = node.alpn.split(",").map(item => item.trim()).filter(Boolean);
  if (transport === "ws") {
    proxy["ws-opts"] = { ...(path(node.path) ? { path: path(node.path) } : {}), ...(node.host ? { headers: { Host: node.host } } : {}) };
  } else if (transport === "grpc") {
    proxy["grpc-opts"] = { "grpc-service-name": node.path ?? "" };
  } else if (transport === "http" || transport === "h2") {
    proxy["h2-opts"] = { ...(node.path ? { path: path(node.path) } : {}), ...(node.host ? { host: [node.host] } : {}) };
  }
  if (node.realityPublicKey) {
    proxy["reality-opts"] = { "public-key": node.realityPublicKey, ...(node.realityShortId ? { "short-id": node.realityShortId } : {}) };
  }
  return proxy;
}

function rules(preset: RulePreset): string[] {
  if (preset === "global") return [`MATCH,${GROUP}`];
  return [
    "DOMAIN-SUFFIX,local,DIRECT",
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
    "GEOIP,CN,DIRECT,no-resolve",
    `MATCH,${GROUP}`,
  ];
}

function clash(nodes: ProxyNode[], preset: RulePreset, target: ClientTarget): string {
  const names = nodes.map(node => node.name);
  const document = {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    "log-level": "warning",
    ipv6: true,
    proxies: nodes.map(clashProxy),
    "proxy-groups": [
      { name: GROUP, type: "select", proxies: [AUTO, ...names, "DIRECT"] },
      { name: AUTO, type: "url-test", url: "https://www.gstatic.com/generate_204", interval: 300, tolerance: 50, proxies: names },
    ],
    rules: rules(preset),
  };
  const client = target === "shadowrocket" ? "Shadowrocket" : "Clash / Stash";
  return `# 由「流转」在本机为 ${client} 生成\n# 订阅凭据未上传到任何转换服务\n\n${yaml.dump(document, { noRefs: true, lineWidth: -1 })}`;
}

function confValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/,/g, "%2C");
}

function surgeTransport(node: ProxyNode): string[] {
  const values: string[] = [];
  if (node.transport === "ws") {
    values.push("ws=true");
    if (node.path) values.push(`ws-path=${confValue(path(node.path) ?? "")}`);
    if (node.host) values.push(`ws-headers=Host:${confValue(node.host)}`);
  }
  if (node.tls) values.push("tls=true");
  if (node.sni) values.push(`sni=${confValue(node.sni)}`);
  if (node.skipCertVerify) values.push("skip-cert-verify=true");
  return values;
}

function surgeNode(node: ProxyNode): string {
  const name = safeName(node.name);
  let values: string[];
  if (node.protocol === "ss") {
    values = ["ss", node.server, String(node.port), `encrypt-method=${node.cipher ?? "aes-256-gcm"}`, `password=${confValue(node.password ?? "")}`, "udp-relay=true"];
    if (node.plugin === "obfs") {
      values.push(`obfs=${node.pluginMode ?? "http"}`);
      if (node.host) values.push(`obfs-host=${confValue(node.host)}`);
    }
  } else if (node.protocol === "vmess") {
    values = ["vmess", node.server, String(node.port), `username=${node.uuid ?? ""}`, `vmess-aead=${(node.alterId ?? 0) === 0}`, ...surgeTransport(node)];
  } else if (node.protocol === "hysteria2") {
    values = ["hysteria2", node.server, String(node.port), `password=${confValue(node.password ?? "")}`];
    if (node.obfs === "salamander" && node.obfsPassword) values.push(`salamander-password=${confValue(node.obfsPassword)}`);
    if (node.sni) values.push(`sni=${confValue(node.sni)}`);
    if (node.skipCertVerify) values.push("skip-cert-verify=true");
  } else {
    values = ["trojan", node.server, String(node.port), `password=${confValue(node.password ?? "")}`, ...surgeTransport(node).filter(value => value !== "tls=true")];
  }
  return `${name} = ${values.join(", ")}`;
}

function surge(nodes: ProxyNode[], preset: RulePreset): string {
  const names = nodes.map(node => safeName(node.name));
  const ruleLines = rules(preset).map(rule => rule.replace(/^MATCH,/, "FINAL,"));
  return [
    "# 由「流转」在本机为 Surge 生成",
    "# 订阅凭据未上传到任何转换服务",
    "",
    "[General]",
    "loglevel = notify",
    "ipv6 = true",
    "dns-server = 223.5.5.5, 119.29.29.29",
    "skip-proxy = 127.0.0.1, localhost, *.local",
    "",
    "[Proxy]",
    ...nodes.map(surgeNode),
    "",
    "[Proxy Group]",
    `${GROUP} = select, ${AUTO}, ${names.join(", ")}, DIRECT`,
    `${AUTO} = url-test, ${names.join(", ")}, url=https://www.gstatic.com/generate_204, interval=300, tolerance=50`,
    "",
    "[Rule]",
    ...ruleLines,
    "",
  ].join("\n");
}

function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
}

function loonNode(node: ProxyNode): string {
  const name = safeName(node.name);
  let values: string[];
  if (node.protocol === "ss") {
    values = ["Shadowsocks", node.server, String(node.port), node.cipher ?? "aes-256-gcm", quoted(node.password ?? "")];
    if (node.plugin === "obfs") {
      values.push(`obfs-name=${node.pluginMode ?? "http"}`);
      if (node.host) values.push(`obfs-host=${confValue(node.host)}`);
    }
    values.push("udp=true");
  } else if (node.protocol === "vmess") {
    values = ["vmess", node.server, String(node.port), node.cipher ?? "auto", quoted(node.uuid ?? ""), `transport=${node.transport ?? "tcp"}`, `alterId=${node.alterId ?? 0}`];
  } else if (node.protocol === "vless") {
    values = ["VLESS", node.server, String(node.port), quoted(node.uuid ?? ""), `transport=${node.transport ?? "tcp"}`];
    if (node.flow) values.push(`flow=${node.flow}`);
  } else if (node.protocol === "hysteria2") {
    values = ["Hysteria2", node.server, String(node.port), quoted(node.password ?? "")];
    if (node.skipCertVerify) values.push("skip-cert-verify=true");
    if (node.sni) values.push(`tls-name=${confValue(node.sni)}`);
    values.push("udp=true", "fast-open=true");
    return `${name} = ${values.join(", ")}`;
  } else {
    values = ["trojan", node.server, String(node.port), quoted(node.password ?? "")];
    if (node.transport && node.transport !== "tcp") values.push(`transport=${node.transport}`);
  }
  if (node.path) values.push(`path=${confValue(path(node.path) ?? "")}`);
  if (node.host) values.push(`host=${confValue(node.host)}`);
  if (node.tls) values.push("tls=true");
  if (node.sni) values.push(`tls-name=${confValue(node.sni)}`);
  if (node.skipCertVerify) values.push("skip-cert-verify=true");
  if (node.fingerprint) values.push(`client-fingerprint=${confValue(node.fingerprint)}`);
  values.push("udp=true");
  return `${name} = ${values.join(", ")}`;
}

function loon(nodes: ProxyNode[], preset: RulePreset): string {
  const names = nodes.map(node => safeName(node.name));
  const ruleLines = rules(preset).map(rule => rule.replace(/^MATCH,/, "FINAL,"));
  return [
    "# 由「流转」在本机为 Loon 生成",
    "# 订阅凭据未上传到任何转换服务",
    "",
    "[General]",
    "ipv6 = true",
    "skip-proxy = 127.0.0.1, localhost, *.local",
    "",
    "[Proxy]",
    ...nodes.map(loonNode),
    "",
    "[Proxy Group]",
    `${GROUP} = select,${AUTO},${names.join(",")},DIRECT`,
    `${AUTO} = url-test,${names.join(",")},url=https://www.gstatic.com/generate_204,interval=300,tolerance=50`,
    "",
    "[Rule]",
    ...ruleLines,
    "",
  ].join("\n");
}

export function generateConfig(inputNodes: ProxyNode[], target: ClientTarget, preset: RulePreset): GeneratedConfig {
  const all = uniqueNames(inputNodes);
  const supported = all.filter(node => {
    if (node.protocol === "hysteria2") {
      const hasObfs = Boolean(node.obfs || node.obfsPassword);
      const validObfs = !hasObfs || (node.obfs?.toLowerCase() === "salamander" && Boolean(node.obfsPassword));
      if (!validObfs) return false;
      if (target === "loon") return !hasObfs;
      return true;
    }
    const transport = (node.transport || "tcp").toLowerCase();
    if (target === "clash" || target === "shadowrocket") {
      if (node.protocol === "ss") return true;
      return ["tcp", "ws", "http", "h2", "grpc", "httpupgrade"].includes(transport)
        || (node.protocol === "vless" && transport === "xhttp");
    }
    if (target === "surge") {
      if (node.protocol === "vless") return false;
      if (node.protocol === "ss") return node.plugin !== "v2ray-plugin";
      return ["tcp", "ws"].includes(transport);
    }
    if (node.protocol === "ss") return node.plugin !== "v2ray-plugin";
    if (node.protocol === "trojan") return ["tcp", "ws"].includes(transport);
    return ["tcp", "ws", "http"].includes(transport);
  });
  const content = target === "clash" || target === "shadowrocket"
    ? clash(supported, preset, target)
    : target === "surge"
      ? surge(supported, preset)
      : loon(supported, preset);
  return {
    content,
    extension: target === "clash" || target === "shadowrocket" ? "yaml" : "conf",
    supported: supported.length,
    skipped: all.length - supported.length,
  };
}
