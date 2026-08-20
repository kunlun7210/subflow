"use client";
/* Client logos are already optimized local 160px assets; framework image optimization is unnecessary. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { generateConfigAsync } from "../lib/generator";
import { configurationFilename } from "../lib/filename";
import { parseSubscription } from "../lib/parser";
import { groupNodesByRegion } from "../lib/regions";
import { PRESET_META, targetNeedsInlineRules } from "../lib/rules";
import { isHttpSubscriptionURL, loadSubscriptionInput, SubscriptionLoadError } from "../lib/source";
import type { ClientTarget, GeneratedConfig, ProxyNode, RulePreset } from "../lib/model";

const targets: Array<{ id: ClientTarget; name: string; note: string; icon: string }> = [
  { id: "surge", name: "Surge", note: "完整配置", icon: "./clients/surge.png" },
  { id: "shadowrocket", name: "Shadowrocket", note: "完整配置", icon: "./clients/shadowrocket.png" },
  { id: "clash", name: "Clash / Stash", note: "Mihomo YAML", icon: "./clients/clash-stash.png" },
  { id: "loon", name: "Loon", note: "完整配置", icon: "./clients/loon.png" },
  { id: "quanx", name: "Quantumult X", note: "本地规则", icon: "./clients/quantumult-x.png" },
  { id: "hiddify", name: "Hiddify", note: "sing-box JSON", icon: "./clients/hiddify.png" },
  { id: "egern", name: "Egern", note: "YAML 配置", icon: "./clients/egern.png" },
];

const protocolLabels: Record<ProxyNode["protocol"], string> = {
  ss: "Shadowsocks", ssr: "SSR", vmess: "VMess", vless: "VLESS", trojan: "Trojan",
  hysteria: "Hysteria", hysteria2: "Hysteria 2", tuic: "TUIC", wireguard: "WireGuard",
  anytls: "AnyTLS", socks5: "SOCKS5", http: "HTTP(S)",
};
const presetOrder: RulePreset[] = ["full", "balanced", "mini", "heavy"];

export default function Home() {
  const [source, setSource] = useState("");
  const [nodes, setNodes] = useState<ProxyNode[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<ClientTarget>("surge");
  const [preset, setPreset] = useState<RulePreset>("full");
  const [customRules, setCustomRules] = useState("");
  const [generated, setGenerated] = useState<GeneratedConfig | null>(null);
  const [generating, setGenerating] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [copied, setCopied] = useState(false);
  const [rawFallback, setRawFallback] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ruleFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.protocol === "https:" && "serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!nodes.length) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return null;
      setGenerated(null); setGenerating(true); setRuleError("");
      return generateConfigAsync(nodes, target, preset, customRules);
    })
      .then(result => { if (!cancelled) setGenerated(result); })
      .catch(() => {
        if (!cancelled) { setGenerated(null); setRuleError("公开规则同步失败，请检查网络后重试；节点和订阅不会随请求发送。"); }
      })
      .finally(() => { if (!cancelled) setGenerating(false); });
    return () => { cancelled = true; };
  }, [nodes, target, preset, customRules]);

  const statistics = useMemo(() => nodes.reduce<Record<string, number>>((result, node) => {
    result[node.protocol] = (result[node.protocol] ?? 0) + 1;
    return result;
  }, {}), [nodes]);
  const regions = useMemo(() => groupNodesByRegion(nodes), [nodes]);

  function parse(text: string) {
    const result = parseSubscription(text);
    setWarnings(result.warnings); setNodes(result.nodes);
    setError(result.nodes.length ? "" : result.warnings[0] ?? "没有发现可用节点。");
  }

  async function processSource(input: string) {
    const value = input.trim();
    if (!value) { setError("请先粘贴订阅链接或订阅内容。"); return; }
    setBusy(true); setError(""); setWarnings([]); setRawFallback(false);
    try { parse((await loadSubscriptionInput(value)).text); }
    catch (reason) {
      if (reason instanceof SubscriptionLoadError) {
        setRawFallback(isHttpSubscriptionURL(value));
        const detail = reason.ipHost && reason.code === "network"
          ? "已识别为 IP 地址订阅链接，但 Safari 无法读取。常见原因是 HTTPS 证书不匹配或服务器未允许跨域访问（CORS）。"
          : `${reason.message}。`;
        setError(`${detail} 出于隐私考虑，流转不会把链接转发给第三方中转站。可打开原始订阅后复制 Base64/节点原文，或保存成文件再导入。`);
      } else setError("无法读取订阅。请确认内容格式后重试。");
    } finally { setBusy(false); }
  }

  async function pasteContent() {
    try { const text = await navigator.clipboard.readText(); setSource(text); if (text.trim()) await processSource(text); }
    catch { setError("Safari 没有授予剪贴板权限，请长按输入框后粘贴。"); }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > 5_000_000) { setError("文件超过 5 MB，为避免手机内存不足已停止读取。"); return; }
    parse(await file.text()); setSource("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function chooseRuleFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setRuleError("规则文件超过 2 MB，已停止读取。"); return; }
    setCustomRules(await file.text());
    if (ruleFileRef.current) ruleFileRef.current.value = "";
  }

  async function pasteRules() {
    try { setCustomRules(await navigator.clipboard.readText()); }
    catch { setRuleError("Safari 没有授予剪贴板权限，请在规则框内长按粘贴。"); }
  }

  async function copyConfiguration() {
    if (!generated) return;
    try { await navigator.clipboard.writeText(generated.content); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("复制失败，请在配置预览中全选后复制。"); }
  }

  function downloadConfiguration() {
    if (!generated) return;
    const url = URL.createObjectURL(new Blob([generated.content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = configurationFilename(target, generated.extension); anchor.click(); URL.revokeObjectURL(url);
  }

  function reset() { setSource(""); setNodes([]); setWarnings([]); setError(""); setCopied(false); setRawFallback(false); setRuleError(""); }
  const activeStep = generated ? 3 : nodes.length ? 2 : 1;

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="流转首页"><span className="brand-mark" aria-hidden="true">流</span><span>流转</span></a><div className="privacy-pill"><span />仅在此设备处理</div></header>
    <section className="hero" id="top"><p className="eyebrow">PRIVATE SUBSCRIPTION TOOL</p><h1>本地订阅转换。</h1><p className="hero-copy">不上传节点，不经过第三方转换站。</p></section>

    <section className="workspace" aria-label="订阅转换工作区">
      <div className="steps" aria-label="转换步骤">{["导入", "检查", "导出"].map((step, index) => <span key={step} className={`step ${activeStep >= index + 1 ? "active" : ""}`}><b>{index + 1}</b>{step}{index < 2 && <i />}</span>)}</div>
      <section className="import-card">
        <div className="section-heading"><div><p>01 / IMPORT</p><h2>导入订阅</h2></div><span>凭据不会写入仓库</span></div>
        <label htmlFor="subscription">订阅链接、Base64 内容或节点链接</label>
        <div className="input-row"><textarea id="subscription" value={source} onChange={event => setSource(event.target.value)} placeholder="https://example.com/subscribe?token=…" rows={1} autoCapitalize="off" autoCorrect="off" spellCheck={false} /><button type="button" onClick={() => processSource(source)} disabled={busy}>{busy ? "正在读取…" : "读取订阅"}<span>→</span></button></div>
        <div className="import-alternatives"><button type="button" onClick={pasteContent}>粘贴并识别</button><span>或</span><button type="button" onClick={() => fileRef.current?.click()}>选择本地文件</button><input ref={fileRef} className="hidden-file" type="file" accept=".txt,.yaml,.yml,.conf,text/plain,text/yaml" onChange={event => chooseFile(event.target.files?.[0])} /></div>
        {error && <div className="message error" role="alert"><b>读取未完成</b><span>{error}{rawFallback && <button type="button" onClick={() => window.open(source.trim(), "_blank", "noopener,noreferrer")}>打开原始订阅 ↗</button>}</span></div>}
        {warnings.length > 0 && nodes.length > 0 && <div className="message warning"><b>已安全跳过</b><span>{warnings.join(" ")}</span></div>}
      </section>

      {nodes.length > 0 && <>
        <section className="result-card">
          <div className="section-heading compact"><div><p>02 / REVIEW</p><h2>检查节点</h2></div><button className="text-button" type="button" onClick={reset}>重新导入</button></div>
          <div className="summary-row"><div className="node-total"><strong>{nodes.length}</strong><span>个可用节点</span></div><div className="protocol-stats">{Object.entries(statistics).map(([protocol, count]) => <span key={protocol}><i className={`dot dot-${protocol}`} />{protocolLabels[protocol as ProxyNode["protocol"]]} <b>{count}</b></span>)}</div></div>
          {regions.length > 0 && <div className="region-row"><strong>自动地区分组</strong><div>{regions.map(group => <span key={group.region.id}>{group.region.name} · {group.nodes.length}</span>)}</div></div>}
          <div className="node-list">{nodes.slice(0, 6).map((node, index) => <div className="node-row" key={`${node.protocol}-${node.server}-${node.port}-${index}`}><span className={`protocol-badge badge-${node.protocol}`}>{node.protocol === "hysteria2" ? "HY2" : node.protocol.toUpperCase()}</span><span><strong>{node.name}</strong><small>{node.server}:{node.port} · {node.transport?.toUpperCase() || "TCP"}{node.tls ? " / TLS" : ""}</small></span></div>)}{nodes.length > 6 && <p className="more-nodes">还有 {nodes.length - 6} 个节点，将全部写入配置</p>}</div>
        </section>

        <section className="target-card">
          <div className="section-heading compact"><div><p>03 / FORMAT</p><h2>选择目标客户端</h2></div></div>
          <div className="target-grid">{targets.map(item => <button key={item.id} type="button" className={target === item.id ? "target active" : "target"} onClick={() => setTarget(item.id)}><img className="target-icon" src={item.icon} alt="" aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.note}</small></span><i aria-hidden="true" /></button>)}</div>
          <div className="rule-library">
            <div className="rule-library-heading"><div><strong>内置规则集</strong><small>AI 分组沿用 ACL4SSR 全分组的默认候选</small></div><span>与 GitHub 公开规则同步</span></div>
            <div className="rule-cards">{presetOrder.map(id => { const meta = PRESET_META[id]; return <button type="button" key={id} className={preset === id ? "rule-card active" : "rule-card"} onClick={() => setPreset(id)}><i aria-hidden="true" /><span><strong>{meta.title}{id === "full" && <em>常用</em>}</strong><small>{meta.description}</small><b>{meta.sources} 个公开规则集 · 约 {meta.groups} 组</b></span></button>; })}</div>
            {preset === "full" && <p className="rule-note">已移除：微软 Bing、云盘与服务、网易云音乐、游戏平台、巴哈姆特、奈飞视频。</p>}
            <details className="custom-rules"><summary>导入自己的规则</summary><p>支持 DOMAIN、DOMAIN-SUFFIX、DOMAIN-KEYWORD、IP-CIDR、GEOIP 等常见规则行。</p><textarea value={customRules} onChange={event => setCustomRules(event.target.value)} placeholder={'DOMAIN-SUFFIX,example.com,AI\nIP-CIDR,192.0.2.0/24,DIRECT,no-resolve'} spellCheck={false} /><div><button type="button" onClick={pasteRules}>粘贴规则</button><button type="button" onClick={() => ruleFileRef.current?.click()}>选择规则文件</button>{customRules && <button type="button" onClick={() => setCustomRules("")}>清空</button>}</div><input ref={ruleFileRef} className="hidden-file" type="file" accept=".txt,.list,.conf,text/plain" onChange={event => chooseRuleFile(event.target.files?.[0])} /></details>
          </div>
        </section>

        <section className="export-card">
          <div className="export-heading"><div><p>READY TO EXPORT</p><h2>{generating ? "正在生成配置…" : generated ? "配置已在本机生成" : "等待规则同步"}</h2>{generated && <span>{generated.supported} 个写入 · {generated.skipped} 个不兼容节点跳过 · {generated.regionGroups} 个地区组 · {generated.ruleCount} 条/组规则</span>}</div><div className="export-actions"><button className="secondary" type="button" onClick={copyConfiguration} disabled={!generated}>{copied ? "已复制 ✓" : "复制配置"}</button><button className="primary" type="button" onClick={downloadConfiguration} disabled={!generated}>下载文件 <span>↓</span></button></div></div>
          {targetNeedsInlineRules(target) && <div className="sync-note">该客户端需要把公开规则转换后写入文件；仅请求 ACL4SSR 公共规则，不会发送你的订阅或节点。</div>}
          {ruleError && <div className="message error" role="alert"><b>规则未完成</b><span>{ruleError}</span></div>}
          {generated?.skipped ? <div className="compat-note">为避免生成“看似正常但无法连接”的配置，目标客户端不能忠实表达的协议会明确跳过。</div> : null}
          {generated && <details className="preview"><summary>查看配置预览</summary><pre>{generated.content}</pre></details>}
        </section>
      </>}
    </section>

    <section className="privacy-strip"><div className="privacy-points"><span>本地解析</span><span>不设中转</span><span>可离线使用</span></div><p className="privacy-note">订阅只进入当前浏览器内存；遇到跨域限制时，流转会提示改用粘贴或文件。</p></section>
    <footer><div className="footer-brand"><strong>流转</strong></div><p>12 种协议 · 7 个客户端 · ACL4SSR 规则</p></footer>
  </main>;
}
