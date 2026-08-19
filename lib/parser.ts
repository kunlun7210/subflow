import * as yaml from "js-yaml";
import type { ParseResult, ProxyNode, ProxyProtocol } from "./model";

const SUPPORTED_SCHEMES = ["ss://", "vmess://", "vless://", "trojan://", "hysteria2://", "hy2://"];

function safeDecode(value: string): string {
  try { return decodeURIComponent(value.replace(/\+/g, "%20")); } catch { return value; }
}

function decodeBase64(value: string): string | null {
  try {
    const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return null; }
}

function hasNodeScheme(value: string): boolean {
  const lower = value.toLowerCase();
  return SUPPORTED_SCHEMES.some(scheme => lower.includes(scheme));
}

function normalizedName(value: unknown, fallback: string): string {
  const name = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  return name || fallback;
}

function portNumber(value: unknown): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function parseEndpoint(value: string): { server: string; port: number } | null {
  const clean = value.trim();
  if (clean.startsWith("[")) {
    const closing = clean.indexOf("]");
    if (closing < 0 || clean[closing + 1] !== ":") return null;
    const port = portNumber(clean.slice(closing + 2));
    return port ? { server: clean.slice(1, closing), port } : null;
  }
  const separator = clean.lastIndexOf(":");
  if (separator <= 0) return null;
  const port = portNumber(clean.slice(separator + 1));
  return port ? { server: clean.slice(0, separator), port } : null;
}

function parsePlugin(value: string | null): Pick<ProxyNode, "plugin" | "pluginMode" | "host" | "path" | "tls" | "transport"> | null {
  if (!value) return {};
  const parts = safeDecode(value).split(";");
  const plugin = parts.shift()?.toLowerCase();
  const options = Object.fromEntries(parts.map(item => {
    const [key, ...rest] = item.split("=");
    return [key.toLowerCase(), rest.join("=")];
  }));
  if (["obfs", "obfs-local", "simple-obfs"].includes(plugin ?? "")) {
    return { plugin: "obfs", pluginMode: options.obfs || options.mode || "http", host: options["obfs-host"] || options.host };
  }
  if (plugin === "v2ray-plugin" && ["", "websocket", "ws"].includes((options.mode || "").toLowerCase())) {
    return { plugin: "v2ray-plugin", transport: "ws", host: options.host, path: options.path, tls: "tls" in options || options.tls === "true" };
  }
  return null;
}

function parseSS(raw: string): ProxyNode | null {
  const [withoutFragment, fragment = ""] = raw.split("#", 2);
  const body = withoutFragment.slice(5);
  const queryIndex = body.indexOf("?");
  const payload = queryIndex >= 0 ? body.slice(0, queryIndex) : body;
  const query = new URLSearchParams(queryIndex >= 0 ? body.slice(queryIndex + 1) : "");
  const plugin = parsePlugin(query.get("plugin"));
  if (plugin === null) return null;

  let auth: string;
  let endpoint: string;
  const at = payload.lastIndexOf("@");
  if (at >= 0) {
    const encodedAuth = payload.slice(0, at);
    auth = decodeBase64(encodedAuth) ?? safeDecode(encodedAuth);
    endpoint = payload.slice(at + 1);
  } else {
    const decoded = decodeBase64(payload);
    const decodedAt = decoded?.lastIndexOf("@") ?? -1;
    if (!decoded || decodedAt < 0) return null;
    auth = decoded.slice(0, decodedAt);
    endpoint = decoded.slice(decodedAt + 1);
  }
  const separator = auth.indexOf(":");
  const address = parseEndpoint(endpoint);
  if (separator <= 0 || !address) return null;
  return {
    protocol: "ss",
    name: normalizedName(safeDecode(fragment), `Shadowsocks · ${address.server}`),
    ...address,
    cipher: auth.slice(0, separator),
    password: auth.slice(separator + 1),
    ...plugin,
  };
}

function parseVMess(raw: string): ProxyNode | null {
  const encoded = raw.slice("vmess://".length).split(/[?#]/, 1)[0];
  const decoded = decodeBase64(encoded);
  if (!decoded) return null;
  try {
    const value = JSON.parse(decoded) as Record<string, unknown>;
    const server = String(value.add ?? "").trim();
    const port = portNumber(value.port);
    const uuid = String(value.id ?? "").trim();
    if (!server || !port || !uuid) return null;
    const tlsValue = String(value.tls ?? "").toLowerCase();
    return {
      protocol: "vmess",
      name: normalizedName(value.ps, `VMess · ${server}`),
      server,
      port,
      uuid,
      cipher: String(value.scy ?? "auto"),
      alterId: Number(value.aid ?? 0) || 0,
      transport: String(value.net ?? value.network ?? "tcp").toLowerCase(),
      tls: tlsValue === "tls" || tlsValue === "true" || tlsValue === "1",
      sni: value.sni ? String(value.sni) : undefined,
      host: value.host ? String(value.host) : undefined,
      path: value.path ? String(value.path) : undefined,
      alpn: value.alpn ? String(value.alpn) : undefined,
      skipCertVerify: [true, "true", "1"].includes(value.allowInsecure as never),
    };
  } catch { return null; }
}

function parseStandard(raw: string, protocol: "vless" | "trojan"): ProxyNode | null {
  try {
    const url = new URL(raw);
    const server = url.hostname.replace(/^\[|\]$/g, "");
    const port = portNumber(url.port);
    const credential = safeDecode(url.username);
    if (!server || !port || !credential) return null;
    const query = url.searchParams;
    const security = (query.get("security") || query.get("tls") || "").toLowerCase();
    const transport = (query.get("type") || query.get("network") || "tcp").toLowerCase();
    const realityPublicKey = query.get("pbk") || query.get("public-key") || undefined;
    const tls = protocol === "trojan" || ["tls", "reality", "true", "1"].includes(security) || Boolean(realityPublicKey);
    return {
      protocol,
      name: normalizedName(safeDecode(url.hash.slice(1)), `${protocol.toUpperCase()} · ${server}`),
      server,
      port,
      ...(protocol === "vless" ? { uuid: credential } : { password: credential }),
      transport,
      tls,
      sni: query.get("sni") || query.get("servername") || query.get("peer") || undefined,
      host: query.get("host") || query.get("authority") || undefined,
      path: query.get("serviceName") || query.get("service_name") || query.get("path") || undefined,
      alpn: query.get("alpn") || undefined,
      flow: query.get("flow") || (query.get("xtls") === "2" ? "xtls-rprx-vision" : undefined),
      fingerprint: query.get("fp") || query.get("fingerprint") || undefined,
      realityPublicKey,
      realityShortId: query.get("sid") || undefined,
      skipCertVerify: ["1", "true"].includes((query.get("allowInsecure") || query.get("insecure") || "").toLowerCase()),
    };
  } catch { return null; }
}

function parseHysteria2(raw: string): ProxyNode | null {
  try {
    const normalized = raw.replace(/^hy2:\/\//i, "hysteria2://");
    const url = new URL(normalized);
    const server = url.hostname.replace(/^\[|\]$/g, "");
    const port = portNumber(url.port);
    const password = safeDecode(url.username);
    if (!server || !port || !password) return null;
    const query = url.searchParams;
    return {
      protocol: "hysteria2",
      name: normalizedName(safeDecode(url.hash.slice(1)), `Hysteria 2 · ${server}`),
      server,
      port,
      password,
      transport: "udp",
      tls: true,
      sni: query.get("sni") || query.get("servername") || query.get("peer") || undefined,
      alpn: query.get("alpn") || undefined,
      skipCertVerify: ["1", "true"].includes((query.get("allowInsecure") || query.get("allow_insecure") || query.get("insecure") || "").toLowerCase()),
      obfs: query.get("obfs") || undefined,
      obfsPassword: query.get("obfs-password") || query.get("obfspassword") || query.get("obfs_password") || undefined,
      portHopping: query.get("mport") || query.get("ports") || query.get("server-ports") || query.get("port-hopping") || undefined,
      certificateFingerprint: query.get("fingerprint") || undefined,
    };
  } catch { return null; }
}

function parseURI(raw: string): ProxyNode | null {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (lower.startsWith("ss://")) return parseSS(value);
  if (lower.startsWith("vmess://")) return parseVMess(value);
  if (lower.startsWith("vless://")) return parseStandard(value, "vless");
  if (lower.startsWith("trojan://")) return parseStandard(value, "trojan");
  if (lower.startsWith("hysteria2://") || lower.startsWith("hy2://")) return parseHysteria2(value);
  return null;
}

function boolean(value: unknown): boolean {
  return value === true || ["true", "1", "tls"].includes(String(value ?? "").toLowerCase());
}

function fromClash(value: unknown): ProxyNode | null {
  if (!value || typeof value !== "object") return null;
  const proxy = value as Record<string, unknown>;
  const protocol = String(proxy.type ?? "").toLowerCase() as ProxyProtocol;
  if (!SUPPORTED_SCHEMES.includes(`${protocol}://`)) return null;
  const server = String(proxy.server ?? "").trim();
  const port = portNumber(proxy.port);
  if (!server || !port) return null;
  const ws = (proxy["ws-opts"] ?? {}) as Record<string, unknown>;
  const headers = (ws.headers ?? {}) as Record<string, unknown>;
  const grpc = (proxy["grpc-opts"] ?? {}) as Record<string, unknown>;
  const reality = (proxy["reality-opts"] ?? {}) as Record<string, unknown>;
  const usesPassword = protocol === "ss" || protocol === "trojan" || protocol === "hysteria2";
  const credential = usesPassword ? String(proxy.password ?? "") : String(proxy.uuid ?? "");
  if (!credential) return null;
  return {
    protocol,
    name: normalizedName(proxy.name, `${protocol.toUpperCase()} · ${server}`),
    server,
    port,
    cipher: proxy.cipher ? String(proxy.cipher) : undefined,
    password: usesPassword ? credential : undefined,
    uuid: protocol === "vmess" || protocol === "vless" ? credential : undefined,
    alterId: Number(proxy.alterId ?? 0) || 0,
    transport: protocol === "hysteria2" ? "udp" : String(proxy.network ?? "tcp").toLowerCase(),
    tls: protocol === "hysteria2" || boolean(proxy.tls) || Boolean(proxy.servername) || Boolean(proxy.sni),
    sni: proxy.servername ? String(proxy.servername) : proxy.sni ? String(proxy.sni) : undefined,
    host: headers.Host ? String(headers.Host) : headers.host ? String(headers.host) : undefined,
    path: ws.path ? String(ws.path) : grpc["grpc-service-name"] ? String(grpc["grpc-service-name"]) : undefined,
    alpn: Array.isArray(proxy.alpn) ? proxy.alpn.join(",") : proxy.alpn ? String(proxy.alpn) : undefined,
    flow: proxy.flow ? String(proxy.flow) : undefined,
    fingerprint: proxy["client-fingerprint"] ? String(proxy["client-fingerprint"]) : undefined,
    realityPublicKey: reality["public-key"] ? String(reality["public-key"]) : undefined,
    realityShortId: reality["short-id"] ? String(reality["short-id"]) : undefined,
    skipCertVerify: boolean(proxy["skip-cert-verify"]),
    obfs: proxy.obfs ? String(proxy.obfs) : undefined,
    obfsPassword: proxy["obfs-password"] ? String(proxy["obfs-password"]) : undefined,
    portHopping: proxy.ports ? String(proxy.ports) : undefined,
    certificateFingerprint: protocol === "hysteria2" && proxy.fingerprint ? String(proxy.fingerprint) : undefined,
    plugin: proxy.plugin === "obfs" ? "obfs" : proxy.plugin === "v2ray-plugin" ? "v2ray-plugin" : undefined,
    pluginMode: proxy["plugin-opts"] && typeof proxy["plugin-opts"] === "object" ? String((proxy["plugin-opts"] as Record<string, unknown>).mode ?? "") : undefined,
  };
}

function deduplicate(nodes: ProxyNode[]): ProxyNode[] {
  const seen = new Set<string>();
  return nodes.filter(node => {
    const credential = node.uuid ?? node.password ?? "";
    const key = [node.protocol, node.server.toLowerCase(), node.port, credential, node.transport ?? "tcp"].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseSubscription(input: string): ParseResult {
  let text = input.replace(/^\uFEFF/, "").trim();
  const warnings: string[] = [];
  if (!text) return { nodes: [], rejected: 0, warnings: ["请输入订阅内容。"] };

  if (!hasNodeScheme(text) && !text.includes("proxies:")) {
    const decoded = decodeBase64(text);
    if (decoded && (hasNodeScheme(decoded) || decoded.includes("proxies:"))) text = decoded;
  }

  let nodes: ProxyNode[] = [];
  let rejected = 0;
  if (/^\s*proxies\s*:/m.test(text)) {
    try {
      const document = yaml.load(text) as { proxies?: unknown[] } | null;
      if (!Array.isArray(document?.proxies)) throw new Error("missing proxies");
      for (const proxy of document.proxies) {
        const node = fromClash(proxy);
        if (node) nodes.push(node); else rejected += 1;
      }
    } catch {
      return { nodes: [], rejected: 1, warnings: ["无法读取这份 Clash YAML，请确认文件没有损坏。"] };
    }
  } else {
    const candidates = text.split(/\r?\n|\s+(?=(?:ss|vmess|vless|trojan|hysteria2|hy2):\/\/)/i).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    for (const candidate of candidates) {
      const node = parseURI(candidate);
      if (node) nodes.push(node); else rejected += 1;
    }
  }
  nodes = deduplicate(nodes);
  if (rejected) warnings.push(`有 ${rejected} 条内容无法安全识别，已跳过。`);
  if (!nodes.length && !warnings.length) warnings.push("没有发现受支持的节点。当前支持 SS、VMess、VLESS、Trojan 和 Hysteria 2。 ");
  return { nodes, rejected, warnings };
}
