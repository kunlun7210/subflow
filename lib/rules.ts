import type { ClientTarget, RulePreset } from "./model";

export const POLICIES = {
  main: "🚀 节点选择",
  manual: "🚀 手动切换",
  auto: "♻️ 自动选择",
  telegram: "📲 电报消息",
  ai: "🤖 AI 服务",
  aiAuto: "⚡ AI 日新自动",
  youtube: "📹 油管视频",
  bilibili: "📺 哔哩哔哩",
  foreignMedia: "🌍 国外媒体",
  domesticMedia: "🌏 国内媒体",
  googleFCM: "📢 谷歌 FCM",
  apple: "🍎 苹果服务",
  direct: "🎯 全球直连",
  ad: "🛑 广告拦截",
  cleanup: "🍃 应用净化",
  final: "🐟 漏网之鱼",
} as const;

const ACL_BASE = "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash";

export interface RuleSource {
  id: string;
  file: string;
  policy: string;
}

export interface ResolvedRule {
  line: string;
  policy: string;
}

const common: RuleSource[] = [
  { id: "LocalAreaNetwork", file: "LocalAreaNetwork.list", policy: POLICIES.direct },
  { id: "UnBan", file: "UnBan.list", policy: POLICIES.direct },
  { id: "BanAD", file: "BanAD.list", policy: POLICIES.ad },
  { id: "BanProgramAD", file: "BanProgramAD.list", policy: POLICIES.cleanup },
];

// ACL4SSR_Online_Full with the groups requested by the owner removed:
// Microsoft Bing / OneDrive / Microsoft, NetEase Music, game platforms,
// Bahamut and Netflix. AI keeps ACL4SSR Full's original policy choices.
const full: RuleSource[] = [
  ...common,
  { id: "GoogleFCM", file: "Ruleset/GoogleFCM.list", policy: POLICIES.googleFCM },
  { id: "GoogleCN", file: "GoogleCN.list", policy: POLICIES.direct },
  { id: "SteamCN", file: "Ruleset/SteamCN.list", policy: POLICIES.direct },
  { id: "Apple", file: "Apple.list", policy: POLICIES.apple },
  { id: "Telegram", file: "Telegram.list", policy: POLICIES.telegram },
  { id: "AI", file: "Ruleset/AI.list", policy: POLICIES.ai },
  { id: "OpenAI", file: "Ruleset/OpenAi.list", policy: POLICIES.ai },
  { id: "YouTube", file: "Ruleset/YouTube.list", policy: POLICIES.youtube },
  { id: "BilibiliHMT", file: "Ruleset/BilibiliHMT.list", policy: POLICIES.bilibili },
  { id: "Bilibili", file: "Ruleset/Bilibili.list", policy: POLICIES.bilibili },
  { id: "ChinaMedia", file: "ChinaMedia.list", policy: POLICIES.domesticMedia },
  { id: "ProxyMedia", file: "ProxyMedia.list", policy: POLICIES.foreignMedia },
  { id: "ProxyGFW", file: "ProxyGFWlist.list", policy: POLICIES.main },
  { id: "ChinaDomain", file: "ChinaDomain.list", policy: POLICIES.direct },
  { id: "ChinaCompanyIp", file: "ChinaCompanyIp.list", policy: POLICIES.direct },
  { id: "Download", file: "Download.list", policy: POLICIES.direct },
];

const balanced: RuleSource[] = [
  ...common,
  { id: "GoogleFCM", file: "Ruleset/GoogleFCM.list", policy: POLICIES.googleFCM },
  { id: "GoogleCN", file: "GoogleCN.list", policy: POLICIES.direct },
  { id: "SteamCN", file: "Ruleset/SteamCN.list", policy: POLICIES.direct },
  { id: "Apple", file: "Apple.list", policy: POLICIES.apple },
  { id: "Telegram", file: "Telegram.list", policy: POLICIES.telegram },
  { id: "AI", file: "Ruleset/AI.list", policy: POLICIES.ai },
  { id: "ProxyMedia", file: "ProxyMedia.list", policy: POLICIES.foreignMedia },
  { id: "ProxyLite", file: "ProxyLite.list", policy: POLICIES.main },
  { id: "ChinaDomain", file: "ChinaDomain.list", policy: POLICIES.direct },
  { id: "ChinaCompanyIp", file: "ChinaCompanyIp.list", policy: POLICIES.direct },
];

const mini: RuleSource[] = [
  { id: "LocalAreaNetwork", file: "LocalAreaNetwork.list", policy: POLICIES.direct },
  { id: "UnBan", file: "UnBan.list", policy: POLICIES.direct },
  { id: "BanAD", file: "BanAD.list", policy: POLICIES.ad },
  { id: "BanProgramAD", file: "BanProgramAD.list", policy: POLICIES.ad },
  { id: "AI", file: "Ruleset/AI.list", policy: POLICIES.ai },
  { id: "Telegram", file: "Telegram.list", policy: POLICIES.main },
  { id: "ProxyMedia", file: "ProxyMedia.list", policy: POLICIES.main },
  { id: "ProxyLite", file: "ProxyLite.list", policy: POLICIES.main },
  { id: "ChinaDomain", file: "ChinaDomain.list", policy: POLICIES.direct },
  { id: "ChinaCompanyIp", file: "ChinaCompanyIp.list", policy: POLICIES.direct },
];

export const PRESET_META: Record<RulePreset, { title: string; description: string; groups: number; sources: number }> = {
  full: { title: "ACL4SSR 全分组 · 定制", description: "完整分流，已移除你不使用的 7 类服务组", groups: 17, sources: full.length },
  balanced: { title: "ACL4SSR 默认", description: "广告、AI、媒体、苹果与国内外基础分流", groups: 11, sources: balanced.length },
  mini: { title: "ACL4SSR 精简", description: "节点选择、自动选择、直连与拦截", groups: 7, sources: mini.length },
  global: { title: "全局代理 + AI", description: "AI 沿用默认候选，其余流量走主策略", groups: 5, sources: 1 },
};

export function ruleSources(preset: RulePreset): RuleSource[] {
  if (preset === "full") return full;
  if (preset === "balanced") return balanced;
  if (preset === "mini") return mini;
  return [{ id: "AI", file: "Ruleset/AI.list", policy: POLICIES.ai }];
}

export function ruleSourceURL(source: RuleSource): string {
  return `${ACL_BASE}/${source.file}`;
}

function policyAlias(value: string): string {
  const clean = value.trim();
  const aliases: Record<string, string> = {
    DIRECT: "DIRECT", REJECT: "REJECT",
    AI: POLICIES.ai, "AI服务": POLICIES.ai, "AI 服务": POLICIES.ai,
    PROXY: POLICIES.main, "节点选择": POLICIES.main,
  };
  return aliases[clean.toUpperCase()] ?? aliases[clean] ?? POLICIES.main;
}

export function parseCustomRules(text: string): ResolvedRule[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#") && !line.startsWith(";")).flatMap(line => {
    const parts = line.split(",").map(item => item.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) return [];
    const type = parts[0].toUpperCase();
    if (!["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6", "IP6-CIDR", "GEOIP", "PROCESS-NAME", "DEST-PORT", "SRC-PORT", "PROTOCOL"].includes(type)) return [];
    return [{ line: [type, parts[1], ...parts.slice(2).filter(part => part.toLowerCase() === "no-resolve")].join(","), policy: policyAlias(parts[2] ?? POLICIES.main) }];
  });
}

function cleanRemoteLine(line: string): string | null {
  const clean = line.trim().replace(/^\s*-\s*/, "");
  if (!clean || clean.startsWith("#") || clean.startsWith(";") || clean.startsWith("payload:")) return null;
  const parts = clean.split(",").map(item => item.trim());
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase();
  if (!["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6", "IP6-CIDR", "GEOIP", "PROCESS-NAME", "DEST-PORT", "SRC-PORT", "PROTOCOL"].includes(type)) return null;
  return [type, parts[1], ...parts.slice(2).filter(part => part.toLowerCase() === "no-resolve")].join(",");
}

export function targetNeedsInlineRules(target: ClientTarget): boolean {
  return target === "quanx" || target === "hiddify" || target === "egern";
}

export async function resolveRuleLines(
  preset: RulePreset,
  customText: string,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedRule[]> {
  const custom = parseCustomRules(customText);
  if (preset === "global") return custom;
  const responses = await Promise.all(ruleSources(preset).map(async source => {
    const response = await fetcher(ruleSourceURL(source), { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`ruleset ${source.id} HTTP ${response.status}`);
    const text = await response.text();
    return text.split(/\r?\n/).flatMap(line => {
      const cleaned = cleanRemoteLine(line);
      return cleaned ? [{ line: cleaned, policy: source.policy }] : [];
    });
  }));
  return [...responses.flat(), ...custom];
}
