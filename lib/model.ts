export type ProxyProtocol = "ss" | "vmess" | "vless" | "trojan" | "hysteria2";

export interface ProxyNode {
  protocol: ProxyProtocol;
  name: string;
  server: string;
  port: number;
  cipher?: string;
  password?: string;
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
  portHopping?: string;
  certificateFingerprint?: string;
  plugin?: "obfs" | "v2ray-plugin";
  pluginMode?: string;
}

export interface ParseResult {
  nodes: ProxyNode[];
  rejected: number;
  warnings: string[];
}

export type ClientTarget = "clash" | "surge" | "shadowrocket" | "loon";
export type RulePreset = "balanced" | "global";

export interface GeneratedConfig {
  content: string;
  extension: "yaml" | "conf";
  supported: number;
  skipped: number;
  aiEligible: number;
}
