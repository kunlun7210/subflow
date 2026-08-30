import countriesJSON from "./country-table.json";
import { IPCountryDatabase, loadIPCountryDatabase } from "./ip-country";
import type { ProxyNode } from "./model";

interface CountryEntry { zh: string; en: string; names: string[]; codes: string[]; }
export interface RegionDefinition { id: string; code: string; name: string; }

const countries = countriesJSON as Record<string, CountryEntry>;
const preferredOrder = ["SG", "HK", "TW", "JP", "US", "KR"];
const displayOverrides: Record<string, string> = { HK: "香港节点", TW: "台湾节点", SG: "狮城节点", JP: "日本节点", US: "美国节点", KR: "韩国节点" };
const reservedCodes = new Set(["SS", "SSR", "WS", "TLS", "TCP", "UDP", "QUIC", "KCP", "GRPC", "IPLC", "IEPL", "BGP", "CDN", "NAT", "VPN", "API", "DNS", "MUX", "KB", "MB", "GB", "TB"]);
const cities: Record<string, string> = {
  "hong kong": "HK", hongkong: "HK", 香港: "HK", 九龙: "HK", 九龍: "HK",
  taipei: "TW", 台北: "TW", 新北: "TW", 彰化: "TW",
  singapore: "SG", 新加坡: "SG", 狮城: "SG", 獅城: "SG",
  tokyo: "JP", 東京: "JP", 东京: "JP", osaka: "JP", 大阪: "JP", saitama: "JP", 埼玉: "JP",
  "los angeles": "US", 洛杉矶: "US", 洛杉磯: "US", seattle: "US", 西雅图: "US", 西雅圖: "US", dallas: "US", 达拉斯: "US", 達拉斯: "US", "silicon valley": "US", 硅谷: "US", 矽谷: "US",
  korea: "KR", seoul: "KR", 首尔: "KR", 首爾: "KR", london: "GB", 伦敦: "GB", 倫敦: "GB",
  frankfurt: "DE", 法兰克福: "DE", 法蘭克福: "DE", paris: "FR", 巴黎: "FR",
  toronto: "CA", 多伦多: "CA", 多倫多: "CA", vancouver: "CA", 温哥华: "CA", 溫哥華: "CA",
  sydney: "AU", 悉尼: "AU", melbourne: "AU", 墨尔本: "AU", amsterdam: "NL", 阿姆斯特丹: "NL",
  johannesburg: "ZA", 约翰内斯堡: "ZA", "cape town": "ZA", 开普敦: "ZA",
  istanbul: "TR", 伊斯坦布尔: "TR", 伊斯坦堡: "TR", warsaw: "PL", 华沙: "PL",
  prague: "CZ", 布拉格: "CZ", vienna: "AT", 维也纳: "AT", zurich: "CH", 苏黎世: "CH",
  madrid: "ES", 马德里: "ES", milan: "IT", 米兰: "IT", rome: "IT", 罗马: "IT",
  moscow: "RU", 莫斯科: "RU", dubai: "AE", 迪拜: "AE", bangkok: "TH", 曼谷: "TH",
  jakarta: "ID", 雅加达: "ID", auckland: "NZ", 奥克兰: "NZ", 奧克蘭: "NZ",
};

const phraseEntries = Object.entries(countries).flatMap(([code, entry]) =>
  [...entry.names, entry.en, entry.zh].map(name => ({ code, name: name.toLocaleLowerCase() })),
).concat(Object.entries(cities).map(([name, code]) => ({ name: name.toLocaleLowerCase(), code })))
  .sort((left, right) => right.name.length - left.name.length);
const threeLetterCodes = new Map(Object.entries(countries).flatMap(([code, entry]) => entry.codes.map(alias => [alias, code] as const)));

function flag(code: string): string { return [...code].map(character => String.fromCodePoint(127397 + character.charCodeAt(0))).join(""); }

export function regionForCountryCode(value: string): RegionDefinition | null {
  const code = value.trim().toUpperCase() === "UK" ? "GB" : value.trim().toUpperCase();
  const entry = countries[code];
  return entry ? { id: code.toLowerCase(), code, name: `${flag(code)} ${displayOverrides[code] ?? `${entry.zh}节点`}` } : null;
}

function flaggedCode(text: string): string | null {
  const scalars = [...text].map(character => character.codePointAt(0) ?? 0).filter(value => value >= 0x1f1e6 && value <= 0x1f1ff);
  return scalars.length >= 2 ? String.fromCharCode(scalars[0] - 0x1f1e6 + 65, scalars[1] - 0x1f1e6 + 65) : null;
}

function phraseMatches(text: string, phrase: string): boolean {
  if (/[\u2e80-\u9fff]/u.test(phrase)) return text.includes(phrase);
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s._-]+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export function countryCodeForText(value: string, allowCodes = true): string | null {
  const text = value.normalize("NFKC");
  const flagged = flaggedCode(text);
  if (flagged && countries[flagged]) return flagged;
  const lower = text.toLocaleLowerCase();
  const phrase = phraseEntries.find(candidate => phraseMatches(lower, candidate.name));
  if (phrase) return phrase.code;
  if (!allowCodes) return null;
  for (const token of text.split(/[^A-Za-z0-9]+/).filter(Boolean)) {
    if (token !== token.toUpperCase() || reservedCodes.has(token)) continue;
    if (token === "UK") return "GB";
    if (token.length === 2 && countries[token]) return token;
    if (token.length === 3 && threeLetterCodes.has(token)) return threeLetterCodes.get(token) ?? null;
  }
  return null;
}

function countryCodeForServer(server: string): string | null {
  const clean = server.trim().toLocaleLowerCase().replace(/^\[|\]$/g, "");
  const tld = clean.split(".").at(-1)?.toUpperCase();
  if (tld && tld.length === 2 && countries[tld]) return tld;
  return countryCodeForText(clean, false);
}

export function regionFor(node: ProxyNode): RegionDefinition | null {
  const code = node.countryCode || countryCodeForText(node.name) || countryCodeForServer(node.server);
  return code ? regionForCountryCode(code) : null;
}

export async function enrichNodeCountries(nodes: ProxyNode[], loader: () => Promise<IPCountryDatabase> = loadIPCountryDatabase): Promise<ProxyNode[]> {
  const provisional = nodes.map(node => {
    const code = countryCodeForText(node.name) || countryCodeForServer(node.server);
    return code ? { ...node, countryCode: code } : node;
  });
  if (!provisional.some(node => !node.countryCode && IPCountryDatabase.isIPAddress(node.server))) return provisional;
  try {
    const database = await loader();
    return provisional.map(node => node.countryCode ? node : { ...node, countryCode: database.countryCode(node.server) ?? undefined });
  } catch { return provisional; }
}

export function groupNodesByRegion(nodes: ProxyNode[]): Array<{ region: RegionDefinition; nodes: ProxyNode[] }> {
  const groups = new Map<string, { region: RegionDefinition; nodes: ProxyNode[] }>();
  for (const node of nodes) {
    const region = regionFor(node);
    if (!region) continue;
    const group = groups.get(region.code) ?? { region, nodes: [] };
    group.nodes.push(node); groups.set(region.code, group);
  }
  return [...groups.values()].sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.region.code); const rightIndex = preferredOrder.indexOf(right.region.code);
    if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    return left.region.code.localeCompare(right.region.code);
  });
}
