import type { ProxyNode } from "./model";

export interface RegionDefinition {
  id: string;
  name: string;
  pattern: RegExp;
}

export const REGIONS: RegionDefinition[] = [
  { id: "hk", name: "🇭🇰 香港节点", pattern: /(香港|hong\s*kong|hongkong|\bhk\b|🇭🇰)/i },
  { id: "tw", name: "🇹🇼 台湾节点", pattern: /(台湾|台灣|台北|新北|彰化|taiwan|\btw\b|🇹🇼)/i },
  { id: "sg", name: "🇸🇬 狮城节点", pattern: /(新加坡|狮城|獅城|singapore|\bsg\b|🇸🇬)/i },
  { id: "jp", name: "🇯🇵 日本节点", pattern: /(日本|东京|東京|大阪|埼玉|japan|tokyo|osaka|\bjp\b|🇯🇵)/i },
  { id: "us", name: "🇺🇸 美国节点", pattern: /(美国|美國|洛杉矶|洛杉磯|硅谷|矽谷|西雅图|西雅圖|达拉斯|達拉斯|united\s*states|america|\bus\b|🇺🇸)/i },
  { id: "kr", name: "🇰🇷 韩国节点", pattern: /(韩国|韓國|首尔|首爾|korea|\bkr\b|🇰🇷)/i },
  { id: "gb", name: "🇬🇧 英国节点", pattern: /(英国|英國|伦敦|倫敦|united\s*kingdom|britain|\buk\b|\bgb\b|🇬🇧)/i },
  { id: "de", name: "🇩🇪 德国节点", pattern: /(德国|德國|法兰克福|法蘭克福|germany|\bde\b|🇩🇪)/i },
  { id: "fr", name: "🇫🇷 法国节点", pattern: /(法国|法國|巴黎|france|\bfr\b|🇫🇷)/i },
  { id: "ca", name: "🇨🇦 加拿大节点", pattern: /(加拿大|多伦多|多倫多|温哥华|溫哥華|canada|\bca\b|🇨🇦)/i },
  { id: "au", name: "🇦🇺 澳大利亚节点", pattern: /(澳大利亚|澳洲|悉尼|墨尔本|australia|\bau\b|🇦🇺)/i },
  { id: "nl", name: "🇳🇱 荷兰节点", pattern: /(荷兰|荷蘭|阿姆斯特丹|netherlands|holland|\bnl\b|🇳🇱)/i },
];

export function regionFor(node: ProxyNode): RegionDefinition | null {
  const name = node.name.normalize("NFKC");
  return REGIONS.find(region => region.pattern.test(name)) ?? null;
}

export function groupNodesByRegion(nodes: ProxyNode[]): Array<{ region: RegionDefinition; nodes: ProxyNode[] }> {
  return REGIONS.map(region => ({ region, nodes: nodes.filter(node => region.pattern.test(node.name.normalize("NFKC"))) }))
    .filter(group => group.nodes.length > 0);
}
