import * as yaml from "js-yaml";
import type { ParseResult, ProxyNode, ProxyProtocol } from "./model";

const SUPPORTED_SCHEMES = [
  "ss://", "ssr://", "vmess://", "vless://", "trojan://", "hysteria://", "hy://",
  "hysteria2://", "hy2://", "tuic://", "wireguard://", "wg://", "anytls://",
  "socks5://", "socks://", "http://", "https://",
];

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

function positiveNumber(value: unknown): number | undefined {
  const number = Number(String(value ?? "").replace(/[^0-9.].*$/, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function csv(value: unknown): string[] {
  return String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
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

function parseSSR(raw: string): ProxyNode | null {
  const decoded = decodeBase64(raw.slice("ssr://".length).split("#", 1)[0]);
  if (!decoded) return null;
  const [main, queryText = ""] = decoded.split("/?", 2);
  const parts = main.split(":");
  if (parts.length !== 6) return null;
  const port = portNumber(parts[1]);
  const password = decodeBase64(parts[5]);
  if (!parts[0] || !port || password === null) return null;
  const query = new URLSearchParams(queryText);
  const decodeQuery = (key: string) => {
    const value = query.get(key);
    return value ? decodeBase64(value) ?? safeDecode(value) : undefined;
  };
  return {
    protocol: "ssr",
    name: normalizedName(decodeQuery("remarks"), `ShadowsocksR · ${parts[0]}`),
    server: parts[0],
    port,
    protocolName: parts[2] || "origin",
    cipher: parts[3] || "aes-256-cfb",
    obfs: parts[4] || "plain",
    password,
    protocolParam: decodeQuery("protoparam"),
    obfsParam: decodeQuery("obfsparam"),
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
    const skipCertValue = query.get("skip-cert-verify") ?? query.get("allowInsecure") ?? query.get("allow_insecure") ?? query.get("insecure");
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
      skipCertVerify: skipCertValue === null ? undefined : ["1", "true"].includes(skipCertValue.toLowerCase()),
    };
  } catch { return null; }
}

function normalizedStandardURL(raw: string): string {
  return raw
    .replace(/^hy2:\/\//i, "hysteria2://")
    .replace(/^hy:\/\//i, "hysteria://")
    .replace(/^socks:\/\//i, "socks5://")
    .replace(/^wg:\/\//i, "wireguard://");
}

function parseExtendedStandard(raw: string, protocol: "hysteria" | "tuic" | "anytls" | "socks5" | "http"): ProxyNode | null {
  try {
    const normalized = normalizedStandardURL(raw);
    const url = new URL(normalized);
    const server = url.hostname.replace(/^\[|\]$/g, "");
    const defaultPort = protocol === "http" ? (url.protocol === "https:" ? 443 : 80) : null;
    const port = portNumber(url.port || defaultPort);
    if (!server || !port) return null;
    const query = url.searchParams;
    const credential = safeDecode(url.username);
    const secret = safeDecode(url.password);
    const name = normalizedName(safeDecode(url.hash.slice(1)) || query.get("remarks"), `${protocol.toUpperCase()} · ${server}`);
    if (protocol === "tuic") {
      const uuid = credential || query.get("uuid") || "";
      const password = secret || query.get("password") || "";
      if (!uuid || !password) return null;
      return {
        protocol, name, server, port, uuid, password, transport: "udp", tls: true,
        sni: query.get("sni") || query.get("servername") || query.get("peer") || undefined,
        alpn: query.get("alpn") || undefined,
        congestionControl: query.get("congestion_control") || query.get("congestion-controller") || undefined,
        udpRelayMode: query.get("udp_relay_mode") || query.get("udp-relay-mode") || undefined,
        portHopping: query.get("mport") || query.get("ports") || undefined,
        fingerprint: query.get("fp") || query.get("client-fingerprint") || undefined,
        skipCertVerify: ["1", "true"].includes((query.get("insecure") || query.get("allow_insecure") || "").toLowerCase()),
      };
    }
    if (protocol === "hysteria") {
      const password = credential || query.get("auth") || query.get("auth_str") || query.get("authstr") || "";
      if (!password) return null;
      return {
        protocol, name, server, port, password, transport: "udp", tls: true,
        sni: query.get("sni") || query.get("peer") || undefined,
        alpn: query.get("alpn") || undefined,
        protocolName: query.get("protocol") || undefined,
        obfs: query.get("obfsparam") || query.get("obfs") || undefined,
        upMbps: positiveNumber(query.get("upmbps") || query.get("up")),
        downMbps: positiveNumber(query.get("downmbps") || query.get("down")),
        skipCertVerify: ["1", "true"].includes((query.get("insecure") || query.get("allow_insecure") || "").toLowerCase()),
      };
    }
    if (protocol === "anytls") {
      if (!credential) return null;
      return {
        protocol, name, server, port, password: credential, transport: "tcp", tls: true,
        sni: query.get("sni") || query.get("peer") || undefined,
        alpn: query.get("alpn") || undefined,
        fingerprint: query.get("fp") || query.get("client-fingerprint") || undefined,
        skipCertVerify: ["1", "true"].includes((query.get("insecure") || query.get("allow_insecure") || "").toLowerCase()),
        idleSessionCheckInterval: positiveNumber(query.get("idle-session-check-interval") || query.get("idlesessioncheckinterval")),
        idleSessionTimeout: positiveNumber(query.get("idle-session-timeout") || query.get("idlesessiontimeout")),
        minIdleSession: positiveNumber(query.get("min-idle-session") || query.get("minidlesession")),
      };
    }
    return {
      protocol, name, server, port,
      username: credential || undefined,
      password: secret || undefined,
      tls: protocol === "http" ? url.protocol === "https:" : url.protocol === "socks5s:",
      transport: "tcp",
      sni: query.get("sni") || query.get("peer") || undefined,
      skipCertVerify: ["1", "true"].includes((query.get("insecure") || "").toLowerCase()),
    };
  } catch { return null; }
}

function parseWireGuard(raw: string): ProxyNode | null {
  try {
    const url = new URL(normalizedStandardURL(raw));
    const server = url.hostname.replace(/^\[|\]$/g, "");
    const port = portNumber(url.port || "51820");
    const query = url.searchParams;
    const addresses = csv(query.get("address") || query.get("addresses"));
    const privateKey = safeDecode(url.username);
    const publicKey = query.get("publickey") || query.get("public-key") || "";
    if (!server || !port || !privateKey || !publicKey || !addresses.length) return null;
    return {
      protocol: "wireguard",
      name: normalizedName(safeDecode(url.hash.slice(1)), `WireGuard · ${server}`),
      server,
      port,
      transport: "udp",
      wireGuardPrivateKey: privateKey,
      wireGuardPublicKey: publicKey,
      wireGuardPreSharedKey: query.get("presharedkey") || query.get("pre-shared-key") || undefined,
      wireGuardIPv4: addresses.find(value => !value.includes(":")),
      wireGuardIPv6: addresses.find(value => value.includes(":")),
      wireGuardAllowedIPs: csv(query.get("allowedips") || query.get("allowed-ips") || "0.0.0.0/0,::/0").join(","),
      wireGuardReserved: csv(query.get("reserved")).join(",") || undefined,
      wireGuardMTU: positiveNumber(query.get("mtu")),
      wireGuardPersistentKeepalive: positiveNumber(query.get("keepalive") || query.get("persistent-keepalive")),
      wireGuardDNS: csv(query.get("dns") || query.get("dns-server")).join(",") || undefined,
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
    const skipCertValue = query.get("skip-cert-verify") ?? query.get("allowInsecure") ?? query.get("allow_insecure") ?? query.get("insecure");
    const obfs = query.get("obfs") || undefined;
    const obfsPassword = query.get("obfs-password") || query.get("obfspassword") || query.get("obfs_password") || undefined;
    if (Boolean(obfs) !== Boolean(obfsPassword)) return null;
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
      skipCertVerify: skipCertValue === null ? undefined : ["1", "true"].includes(skipCertValue.toLowerCase()),
      obfs,
      obfsPassword,
      portHopping: query.get("mport") || query.get("ports") || query.get("server-ports") || query.get("port-hopping") || undefined,
      certificateFingerprint: query.get("fingerprint") || undefined,
      upMbps: positiveNumber(query.get("upmbps") || query.get("up") || query.get("upload-bandwidth") || query.get("upload_bandwidth")),
      downMbps: positiveNumber(query.get("downmbps") || query.get("down") || query.get("download-bandwidth") || query.get("download_bandwidth")),
    };
  } catch { return null; }
}

function parseURI(raw: string): ProxyNode | null {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (lower.startsWith("ss://")) return parseSS(value);
  if (lower.startsWith("ssr://")) return parseSSR(value);
  if (lower.startsWith("vmess://")) return parseVMess(value);
  if (lower.startsWith("vless://")) return parseStandard(value, "vless");
  if (lower.startsWith("trojan://")) return parseStandard(value, "trojan");
  if (lower.startsWith("hysteria2://") || lower.startsWith("hy2://")) return parseHysteria2(value);
  if (lower.startsWith("hysteria://") || lower.startsWith("hy://")) return parseExtendedStandard(value, "hysteria");
  if (lower.startsWith("tuic://")) return parseExtendedStandard(value, "tuic");
  if (lower.startsWith("wireguard://") || lower.startsWith("wg://")) return parseWireGuard(value);
  if (lower.startsWith("anytls://")) return parseExtendedStandard(value, "anytls");
  if (lower.startsWith("socks5://") || lower.startsWith("socks://")) return parseExtendedStandard(value, "socks5");
  if (lower.startsWith("http://") || lower.startsWith("https://")) return parseExtendedStandard(value, "http");
  return null;
}

function boolean(value: unknown): boolean {
  return value === true || ["true", "1", "tls"].includes(String(value ?? "").toLowerCase());
}

function fromClash(value: unknown): ProxyNode | null {
  if (!value || typeof value !== "object") return null;
  const proxy = value as Record<string, unknown>;
  const rawProtocol = String(proxy.type ?? "").toLowerCase();
  const protocol = ({ shadowsocks: "ss", shadowsocksr: "ssr", socks: "socks5" }[rawProtocol] ?? rawProtocol) as ProxyProtocol;
  if (!["ss", "ssr", "vmess", "vless", "trojan", "hysteria", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"].includes(protocol)) return null;
  const server = String(proxy.server ?? "").trim();
  const port = portNumber(proxy.port);
  if (!server || !port) return null;
  const ws = (proxy["ws-opts"] ?? {}) as Record<string, unknown>;
  const headers = (ws.headers ?? {}) as Record<string, unknown>;
  const grpc = (proxy["grpc-opts"] ?? {}) as Record<string, unknown>;
  const reality = (proxy["reality-opts"] ?? {}) as Record<string, unknown>;
  const usesPassword = ["ss", "ssr", "trojan", "hysteria2", "anytls"].includes(protocol);
  const credential = usesPassword ? String(proxy.password ?? "") : String(proxy.uuid ?? "");
  const peers = Array.isArray(proxy.peers) ? proxy.peers as Array<Record<string, unknown>> : [];
  if (protocol === "wireguard" && peers.length > 1) return null;
  const wireGuardPeer = peers[0] ?? {};
  if (["ss", "ssr", "vmess", "vless", "trojan", "hysteria2", "anytls"].includes(protocol) && !credential) return null;
  if (protocol === "tuic" && (!proxy.uuid || !proxy.password)) return null;
  if (protocol === "wireguard" && (!proxy["private-key"] || !(proxy["public-key"] || wireGuardPeer["public-key"]))) return null;
  const pluginOptions = proxy["plugin-opts"] && typeof proxy["plugin-opts"] === "object"
    ? proxy["plugin-opts"] as Record<string, unknown>
    : {};
  const plugin = proxy.plugin === "obfs" ? "obfs" : proxy.plugin === "v2ray-plugin" ? "v2ray-plugin" : undefined;
  if (proxy.plugin && !plugin) return null;
  const pluginMode = pluginOptions.mode ? String(pluginOptions.mode) : undefined;
  if (plugin === "v2ray-plugin" && !["", "ws", "websocket"].includes((pluginMode ?? "websocket").toLowerCase())) return null;
  const obfs = proxy.obfs ? String(proxy.obfs) : undefined;
  const obfsPassword = proxy["obfs-password"] ? String(proxy["obfs-password"]) : undefined;
  if (protocol === "hysteria2" && Boolean(obfs) !== Boolean(obfsPassword)) return null;
  return {
    protocol,
    name: normalizedName(proxy.name, `${protocol.toUpperCase()} · ${server}`),
    server,
    port,
    cipher: proxy.cipher ? String(proxy.cipher) : undefined,
    password: usesPassword ? credential : protocol === "tuic" || protocol === "hysteria" ? String(proxy.password ?? proxy["auth-str"] ?? "") || undefined : proxy.password ? String(proxy.password) : undefined,
    username: proxy.username ? String(proxy.username) : undefined,
    uuid: protocol === "vmess" || protocol === "vless" ? credential : undefined,
    alterId: Number(proxy.alterId ?? 0) || 0,
    transport: plugin === "v2ray-plugin" ? "ws" : ["hysteria", "hysteria2", "tuic", "wireguard"].includes(protocol) ? "udp" : String(proxy.network ?? "tcp").toLowerCase(),
    tls: ["trojan", "hysteria", "hysteria2", "tuic", "anytls"].includes(protocol) || boolean(proxy.tls) || boolean(pluginOptions.tls) || Boolean(proxy.servername) || Boolean(proxy.sni),
    sni: proxy.servername ? String(proxy.servername) : proxy.sni ? String(proxy.sni) : undefined,
    host: pluginOptions.host ? String(pluginOptions.host) : headers.Host ? String(headers.Host) : headers.host ? String(headers.host) : undefined,
    path: pluginOptions.path ? String(pluginOptions.path) : ws.path ? String(ws.path) : grpc["grpc-service-name"] ? String(grpc["grpc-service-name"]) : undefined,
    alpn: Array.isArray(proxy.alpn) ? proxy.alpn.join(",") : proxy.alpn ? String(proxy.alpn) : undefined,
    flow: proxy.flow ? String(proxy.flow) : undefined,
    fingerprint: proxy["client-fingerprint"] ? String(proxy["client-fingerprint"]) : undefined,
    realityPublicKey: reality["public-key"] ? String(reality["public-key"]) : undefined,
    realityShortId: reality["short-id"] ? String(reality["short-id"]) : undefined,
    skipCertVerify: boolean(proxy["skip-cert-verify"]),
    obfs,
    obfsPassword,
    protocolName: proxy.protocol ? String(proxy.protocol) : undefined,
    protocolParam: proxy["protocol-param"] ? String(proxy["protocol-param"]) : undefined,
    obfsParam: proxy["obfs-param"] ? String(proxy["obfs-param"]) : undefined,
    portHopping: proxy.ports ? String(proxy.ports) : undefined,
    certificateFingerprint: protocol === "hysteria2" && proxy.fingerprint ? String(proxy.fingerprint) : undefined,
    plugin,
    pluginMode,
    congestionControl: proxy["congestion-controller"] ? String(proxy["congestion-controller"]) : proxy["congestion-control"] ? String(proxy["congestion-control"]) : undefined,
    udpRelayMode: proxy["udp-relay-mode"] ? String(proxy["udp-relay-mode"]) : undefined,
    upMbps: positiveNumber(proxy.up),
    downMbps: positiveNumber(proxy.down),
    idleSessionCheckInterval: positiveNumber(proxy["idle-session-check-interval"]),
    idleSessionTimeout: positiveNumber(proxy["idle-session-timeout"]),
    minIdleSession: positiveNumber(proxy["min-idle-session"]),
    wireGuardPrivateKey: proxy["private-key"] ? String(proxy["private-key"]) : undefined,
    wireGuardPublicKey: proxy["public-key"] ? String(proxy["public-key"]) : wireGuardPeer["public-key"] ? String(wireGuardPeer["public-key"]) : undefined,
    wireGuardPreSharedKey: proxy["pre-shared-key"] ? String(proxy["pre-shared-key"]) : wireGuardPeer["pre-shared-key"] ? String(wireGuardPeer["pre-shared-key"]) : undefined,
    wireGuardIPv4: Array.isArray(proxy.ip) ? String(proxy.ip[0] ?? "") || undefined : proxy.ip ? String(proxy.ip) : undefined,
    wireGuardIPv6: proxy.ipv6 ? String(proxy.ipv6) : undefined,
    wireGuardAllowedIPs: Array.isArray(proxy["allowed-ips"]) ? proxy["allowed-ips"].join(",") : wireGuardPeer["allowed-ips"] ? String(wireGuardPeer["allowed-ips"]) : "0.0.0.0/0,::/0",
    wireGuardReserved: Array.isArray(proxy.reserved) ? proxy.reserved.join(",") : proxy.reserved ? String(proxy.reserved) : undefined,
    wireGuardMTU: positiveNumber(proxy.mtu),
    wireGuardPersistentKeepalive: positiveNumber(proxy["persistent-keepalive"]),
    wireGuardDNS: Array.isArray(proxy.dns) ? proxy.dns.join(",") : proxy.dns ? String(proxy.dns) : undefined,
    wireGuardPeerCount: peers.length || (protocol === "wireguard" ? 1 : undefined),
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
    const candidates = text.split(/\r?\n|\s+(?=(?:ss|ssr|vmess|vless|trojan|hysteria|hy|hysteria2|hy2|tuic|wireguard|wg|anytls|socks5|socks|https?):\/\/)/i).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    for (const candidate of candidates) {
      const node = parseURI(candidate);
      if (node) nodes.push(node); else rejected += 1;
    }
  }
  nodes = deduplicate(nodes);
  if (rejected) warnings.push(`有 ${rejected} 条内容无法安全识别，已跳过。`);
  if (!nodes.length && !warnings.length) warnings.push("没有发现受支持的节点。当前支持 12 种常见协议。 ");
  return { nodes, rejected, warnings };
}
