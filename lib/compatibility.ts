import type { ClientTarget, ProxyNode } from "./model";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha1(message: Uint8Array): Uint8Array {
  const length = message.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(message);
  bytes[length] = 0x80;
  const bitLength = length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);
  const rotate = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 80; index += 1) words[index] = rotate(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1) >>> 0;
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f: number; let k: number;
      if (index < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (index < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (index < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const next = (rotate(a, 5) + f + e + k + words[index]) >>> 0;
      e = d; d = c; c = rotate(b, 30) >>> 0; b = a; a = next;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const output = new Uint8Array(20);
  const outputView = new DataView(output.buffer);
  [h0, h1, h2, h3, h4].forEach((value, index) => outputView.setUint32(index * 4, value, false));
  return output;
}

export function normalizedProxyID(value?: string): string | null {
  const clean = value?.trim() ?? "";
  if (!clean) return null;
  if (UUID_PATTERN.test(clean)) return clean.toLowerCase();
  const encoded = new TextEncoder().encode(clean);
  if (encoded.length >= 32) return null;
  const input = new Uint8Array(16 + encoded.length);
  input.set(encoded, 16);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nonEmpty(value?: string): boolean {
  return Boolean(value?.trim());
}

function normalizedTransport(node: ProxyNode): string {
  const value = (node.transport || "tcp").toLowerCase();
  if (value === "websocket") return "ws";
  if (value === "http2") return "h2";
  if (value === "splithttp") return "xhttp";
  return value;
}

const protocolMatrix: Record<ClientTarget, Set<ProxyNode["protocol"]>> = {
  clash: new Set(["ss", "ssr", "vmess", "vless", "trojan", "hysteria", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"]),
  surge: new Set(["ss", "vmess", "trojan", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"]),
  shadowrocket: new Set(["ss", "ssr", "vmess", "vless", "trojan", "hysteria", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"]),
  loon: new Set(["ss", "ssr", "vmess", "vless", "trojan", "hysteria2", "wireguard", "anytls", "socks5", "http"]),
  quanx: new Set(["ss", "ssr", "vmess", "vless", "trojan", "anytls", "socks5", "http"]),
  hiddify: new Set(["ss", "vmess", "vless", "trojan", "hysteria", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"]),
  egern: new Set(["ss", "vmess", "vless", "trojan", "hysteria2", "tuic", "wireguard", "anytls", "socks5", "http"]),
};

function transportSupported(target: ClientTarget, node: ProxyNode): boolean {
  if (!["vmess", "vless", "trojan"].includes(node.protocol)) return true;
  const transport = normalizedTransport(node);
  if (!transport || transport === "tcp") return true;
  if (target === "clash") return ["ws", "http", "h2", "grpc", "httpupgrade", "xhttp"].includes(transport) && (transport !== "xhttp" || node.protocol === "vless");
  if (target === "surge") return transport === "ws" && ["vmess", "trojan"].includes(node.protocol);
  if (target === "shadowrocket") return ["ws", "http", "h2", "grpc", "httpupgrade", "xhttp"].includes(transport) && (transport !== "xhttp" || node.protocol === "vless");
  if (target === "loon") return node.protocol === "trojan" ? transport === "ws" : ["ws", "http"].includes(transport);
  if (target === "quanx") return transport === "ws";
  if (target === "hiddify") return ["ws", "http", "h2", "grpc", "httpupgrade"].includes(transport);
  return node.protocol === "trojan" ? ["ws", "http"].includes(transport) : ["ws", "http", "h2", "grpc"].includes(transport);
}

export interface CompatibilityResult {
  supported: boolean;
  reason?: string;
  node: ProxyNode;
}

export function compatibility(target: ClientTarget, input: ProxyNode): CompatibilityResult {
  const transport = normalizedTransport(input);
  const node: ProxyNode = {
    ...input,
    transport,
    path: input.path && !input.path.startsWith("/") && ["ws", "http", "h2", "httpupgrade", "xhttp"].includes(transport) ? `/${input.path}` : input.path,
  };
  if (!node.server.trim() || node.port < 1 || node.port > 65535) return { supported: false, reason: "地址或端口无效", node };
  if (!protocolMatrix[target].has(node.protocol)) return { supported: false, reason: `${target} 不支持 ${node.protocol.toUpperCase()}`, node };
  if (node.protocol === "ss" && (!nonEmpty(node.cipher) || !nonEmpty(node.password))) return { supported: false, reason: "Shadowsocks 缺少加密方式或密码", node };
  if (node.protocol === "ssr" && (!nonEmpty(node.cipher) || !nonEmpty(node.password))) return { supported: false, reason: "SSR 缺少加密方式或密码", node };
  if (["vmess", "vless"].includes(node.protocol)) {
    const uuid = normalizedProxyID(node.uuid);
    if (!uuid) return { supported: false, reason: `${node.protocol.toUpperCase()} 用户 ID 无效`, node };
    node.uuid = uuid;
  }
  if (["trojan", "hysteria", "hysteria2", "anytls"].includes(node.protocol) && !nonEmpty(node.password)) return { supported: false, reason: `${node.protocol.toUpperCase()} 缺少密码`, node };
  if (node.protocol === "tuic" && (!UUID_PATTERN.test(node.uuid?.trim() ?? "") || !nonEmpty(node.password))) return { supported: false, reason: "TUIC v5 缺少有效 UUID 或密码", node };
  if (node.protocol === "wireguard") {
    if ((node.wireGuardPeerCount ?? 1) > 1) return { supported: false, reason: "WireGuard 含多个 Peer，无法无损转换", node };
    if (!nonEmpty(node.wireGuardPrivateKey) || !nonEmpty(node.wireGuardPublicKey) || !nonEmpty(node.wireGuardAllowedIPs) || (!nonEmpty(node.wireGuardIPv4) && !nonEmpty(node.wireGuardIPv6))) return { supported: false, reason: "WireGuard 参数不完整", node };
  }
  if (node.realityPublicKey && target === "surge") return { supported: false, reason: "Surge 无法表达 REALITY", node };
  if (node.protocol === "hysteria2" && (nonEmpty(node.obfs) !== nonEmpty(node.obfsPassword))) return { supported: false, reason: "Hysteria 2 混淆方式与密码必须同时存在", node };
  if (node.protocol === "hysteria2" && ["surge", "shadowrocket"].includes(target) && node.obfs?.toLowerCase() !== "salamander" && nonEmpty(node.obfs)) return { supported: false, reason: `${target} 无法表达该 Hysteria 2 混淆方式`, node };
  if (target === "loon" && node.protocol === "hysteria2" && (nonEmpty(node.obfs) || nonEmpty(node.obfsPassword))) return { supported: false, reason: "Loon 无法表达 Hysteria 2 混淆参数", node };
  if (node.plugin === "v2ray-plugin" && (transport !== "ws" || !["clash", "shadowrocket", "quanx", "hiddify"].includes(target))) return { supported: false, reason: `${target} 无法无损表达 v2ray-plugin`, node };
  if (target === "surge" && node.protocol === "ss" && node.plugin) return { supported: false, reason: "Surge 无法无损表达该 Shadowsocks 插件", node };
  if (!transportSupported(target, node)) return { supported: false, reason: `${target} 不支持 ${node.protocol.toUpperCase()} 的 ${transport.toUpperCase()} 传输`, node };
  return { supported: true, node };
}
