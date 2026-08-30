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
  bing: "Ⓜ️ 微软 Bing",
  oneDrive: "Ⓜ️ 微软云盘",
  microsoft: "Ⓜ️ 微软服务",
  netease: "🎶 网易音乐",
  games: "🎮 游戏平台",
  netflix: "🎥 奈飞视频",
  netflixNodes: "🎥 奈飞节点",
  bahamut: "📺 巴哈姆特",
  direct: "🎯 全球直连",
  ad: "🛑 广告拦截",
  cleanup: "🍃 应用净化",
  final: "🐟 漏网之鱼",
} as const;

export const ACL_REVISION = "c498ae4911f15b19c5ceaef6f8737ca8705b4430";
const ACL_BASE = `https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/${ACL_REVISION}/Clash`;

interface RuleSnapshot { revision: string; rules: Record<string, string[]>; }
let snapshotPromise: Promise<RuleSnapshot> | null = null;

function loadSnapshot(fetcher: typeof fetch): Promise<RuleSnapshot> {
  if (snapshotPromise && fetcher === fetch) return snapshotPromise;
  const base = typeof document === "undefined" ? "http://localhost/" : document.baseURI;
  const request = fetcher(new URL("./data/acl4ssr-snapshot.json", base), { cache: "force-cache", credentials: "omit", referrerPolicy: "no-referrer" })
    .then(async response => {
      if (!response.ok) throw new Error(`bundled rules HTTP ${response.status}`);
      const result = await response.json() as RuleSnapshot;
      if (result.revision !== ACL_REVISION) throw new Error("bundled ACL4SSR revision mismatch");
      return result;
    });
  if (fetcher === fetch) snapshotPromise = request;
  return request;
}

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

// The unmodified ACL4SSR_Online_Full ruleset offered as the heavy preset.
// Keep this separate from the owner's trimmed Full preset above.
const fullOriginal: RuleSource[] = [
  ...common,
  { id: "GoogleFCM", file: "Ruleset/GoogleFCM.list", policy: POLICIES.googleFCM },
  { id: "GoogleCN", file: "GoogleCN.list", policy: POLICIES.direct },
  { id: "SteamCN", file: "Ruleset/SteamCN.list", policy: POLICIES.direct },
  { id: "Bing", file: "Bing.list", policy: POLICIES.bing },
  { id: "OneDrive", file: "OneDrive.list", policy: POLICIES.oneDrive },
  { id: "Microsoft", file: "Microsoft.list", policy: POLICIES.microsoft },
  { id: "Apple", file: "Apple.list", policy: POLICIES.apple },
  { id: "Telegram", file: "Telegram.list", policy: POLICIES.telegram },
  { id: "AI", file: "Ruleset/AI.list", policy: POLICIES.ai },
  { id: "OpenAI", file: "Ruleset/OpenAi.list", policy: POLICIES.ai },
  { id: "NetEaseMusic", file: "Ruleset/NetEaseMusic.list", policy: POLICIES.netease },
  { id: "Epic", file: "Ruleset/Epic.list", policy: POLICIES.games },
  { id: "Origin", file: "Ruleset/Origin.list", policy: POLICIES.games },
  { id: "Sony", file: "Ruleset/Sony.list", policy: POLICIES.games },
  { id: "Steam", file: "Ruleset/Steam.list", policy: POLICIES.games },
  { id: "Nintendo", file: "Ruleset/Nintendo.list", policy: POLICIES.games },
  { id: "YouTube", file: "Ruleset/YouTube.list", policy: POLICIES.youtube },
  { id: "Netflix", file: "Ruleset/Netflix.list", policy: POLICIES.netflix },
  { id: "Bahamut", file: "Ruleset/Bahamut.list", policy: POLICIES.bahamut },
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
  full: { title: "ACL4SSR 全分组 · 定制", description: "完整分流，定制版", groups: 17, sources: full.length },
  balanced: { title: "ACL4SSR 默认", description: "广告、AI、媒体、苹果与国内外基础分流", groups: 11, sources: balanced.length },
  mini: { title: "ACL4SSR 精简", description: "节点选择、自动选择、直连与拦截", groups: 7, sources: mini.length },
  heavy: { title: "ACL4SSR_Online_Full 全分组", description: "完整 29 组，适合重度用户使用", groups: 29, sources: fullOriginal.length },
};

export function ruleSources(preset: RulePreset): RuleSource[] {
  if (preset === "full") return full;
  if (preset === "balanced") return balanced;
  if (preset === "mini") return mini;
  return fullOriginal;
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

export function targetNeedsInlineRules(target: ClientTarget): boolean {
  return target === "quanx" || target === "hiddify" || target === "egern";
}

export async function resolveRuleLines(
  preset: RulePreset,
  customText: string,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedRule[]> {
  const custom = parseCustomRules(customText);
  const snapshot = await loadSnapshot(fetcher);
  const resolved = ruleSources(preset).flatMap(source => {
    const lines = snapshot.rules[source.file];
    if (!lines) throw new Error(`bundled ruleset missing: ${source.file}`);
    return lines.map(line => ({ line, policy: source.policy }));
  });
  return [...resolved, ...custom];
}
