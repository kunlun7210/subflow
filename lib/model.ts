export type ProxyProtocol =
  | "ss"
  | "ssr"
  | "vmess"
  | "vless"
  | "trojan"
  | "hysteria"
  | "hysteria2"
  | "tuic"
  | "wireguard"
  | "anytls"
  | "socks5"
  | "http";

export interface ProxyNode {
  protocol: ProxyProtocol;
  name: string;
  server: string;
  port: number;
  cipher?: string;
  password?: string;
  username?: string;
  uuid?: string;
  alterId?: number;
  transport?: string;
  tls?: boolean;
  sni?: string;
  host?: string;
  path?: string;
  alpn?: string;
  flow?: string;
  fingerprint?: string;
  realityPublicKey?: string;
  realityShortId?: string;
  skipCertVerify?: boolean;
  obfs?: string;
  obfsPassword?: string;
  protocolName?: string;
  protocolParam?: string;
  obfsParam?: string;
  portHopping?: string;
  certificateFingerprint?: string;
  congestionControl?: string;
  udpRelayMode?: string;
  upMbps?: number;
  downMbps?: number;
  idleSessionCheckInterval?: number;
  idleSessionTimeout?: number;
  minIdleSession?: number;
  wireGuardPrivateKey?: string;
  wireGuardPublicKey?: string;
  wireGuardPreSharedKey?: string;
  wireGuardIPv4?: string;
  wireGuardIPv6?: string;
  wireGuardAllowedIPs?: string;
  wireGuardReserved?: string;
  wireGuardMTU?: number;
  wireGuardPersistentKeepalive?: number;
  wireGuardDNS?: string;
  plugin?: "obfs" | "v2ray-plugin";
  pluginMode?: string;
}

export interface ParseResult {
  nodes: ProxyNode[];
  rejected: number;
  warnings: string[];
}

export type ClientTarget = "clash" | "surge" | "shadowrocket" | "loon" | "quanx" | "hiddify" | "egern";
export type RulePreset = "full" | "balanced" | "mini" | "global";

export interface GeneratedConfig {
  content: string;
  extension: "yaml" | "conf" | "json";
  supported: number;
  skipped: number;
  aiEligible: number;
  regionGroups: number;
  ruleCount: number;
}
