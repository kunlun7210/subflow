"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateConfig } from "../lib/generator";
import { parseSubscription } from "../lib/parser";
import type { ClientTarget, ProxyNode, RulePreset } from "../lib/model";

const targets: Array<{ id: ClientTarget; name: string; note: string; letter: string }> = [
  { id: "clash", name: "Clash / Stash", note: "Mihomo YAML", letter: "C" },
  { id: "surge", name: "Surge", note: "完整配置", letter: "S" },
  { id: "shadowrocket", name: "Shadowrocket", note: "Clash YAML", letter: "R" },
  { id: "loon", name: "Loon", note: "完整配置", letter: "L" },
];

const protocolLabels: Record<ProxyNode["protocol"], string> = {
  ss: "Shadowsocks", vmess: "VMess", vless: "VLESS", trojan: "Trojan", hysteria2: "Hysteria 2",
};

function looksLikeURL(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export default function Home() {
  const [source, setSource] = useState("");
  const [nodes, setNodes] = useState<ProxyNode[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<ClientTarget>("clash");
  const [preset, setPreset] = useState<RulePreset>("balanced");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.protocol === "https:" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }
  }, []);

  const generated = useMemo(
    () => nodes.length ? generateConfig(nodes, target, preset) : null,
    [nodes, target, preset],
  );
  const statistics = useMemo(() => nodes.reduce<Record<string, number>>((result, node) => {
    result[node.protocol] = (result[node.protocol] ?? 0) + 1;
    return result;
  }, {}), [nodes]);

  function parse(text: string) {
    const result = parseSubscription(text);
    setWarnings(result.warnings);
    setNodes(result.nodes);
    if (!result.nodes.length) setError(result.warnings[0] ?? "没有发现可用节点。");
    else setError("");
  }

  async function importSource() {
    const value = source.trim();
    if (!value) { setError("请先粘贴订阅链接或订阅内容。"); return; }
    setBusy(true); setError(""); setWarnings([]);
    try {
      if (looksLikeURL(value)) {
        const response = await fetch(value, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error(`订阅服务器返回 ${response.status}`);
        const text = await response.text();
        if (text.length > 5_000_000) throw new Error("订阅内容超过 5 MB，为避免手机内存不足已停止读取");
        parse(text);
      } else {
        parse(value);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "无法读取订阅";
      setError(`${message}。如果这是浏览器的跨域限制，请改用“粘贴内容”或“选择文件”；流转不会把链接转发给代理服务器。`);
    } finally { setBusy(false); }
  }

  async function pasteContent() {
    try {
      const text = await navigator.clipboard.readText();
      setSource(text);
      if (text.trim()) parse(text);
    } catch { setError("Safari 没有授予剪贴板权限，请长按输入框后粘贴。"); }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > 5_000_000) { setError("文件超过 5 MB，为避免手机内存不足已停止读取。"); return; }
    const text = await file.text();
    setSource("");
    parse(text);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function copyConfiguration() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setError("复制失败，请在配置预览中全选后复制。"); }
  }

  function downloadConfiguration() {
    if (!generated) return;
    const blob = new Blob([generated.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `subflow-${target}.${generated.extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setSource(""); setNodes([]); setWarnings([]); setError(""); setCopied(false);
  }

  const activeStep = generated ? 3 : nodes.length ? 2 : 1;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="流转首页"><span className="brand-mark" aria-hidden="true">流</span><span>流转</span></a>
        <div className="privacy-pill"><span />仅在此设备处理</div>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">PRIVATE SUBSCRIPTION TOOL</p>
        <h1>流转：本地订阅转换</h1>
        <p className="hero-copy">不上传节点，不经过第三方转换站。iPhone 与 Mac 打开同一个页面，就能完成解析和导出。</p>
      </section>

      <section className="workspace" aria-label="订阅转换工作区">
        <div className="steps" aria-label="转换步骤">
          {["导入", "检查", "导出"].map((step, index) => <span key={step} className={`step ${activeStep >= index + 1 ? "active" : ""}`}><b>{index + 1}</b>{step}{index < 2 && <i />}</span>)}
        </div>

        <section className="import-card">
          <div className="section-heading">
            <div><p>01 / IMPORT</p><h2>导入订阅</h2></div><span>凭据不会写入仓库</span>
          </div>
          <label htmlFor="subscription">订阅链接、Base64 内容或节点链接</label>
          <div className="input-row">
            <textarea id="subscription" value={source} onChange={event => setSource(event.target.value)} placeholder="https://example.com/subscribe?token=…" rows={1} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <button type="button" onClick={importSource} disabled={busy}>{busy ? "正在读取…" : "读取订阅"}<span>→</span></button>
          </div>
          <div className="import-alternatives">
            <button type="button" onClick={pasteContent}>粘贴订阅内容</button><span>或</span>
            <button type="button" onClick={() => fileRef.current?.click()}>选择本地文件</button>
            <input ref={fileRef} className="hidden-file" type="file" accept=".txt,.yaml,.yml,.conf,text/plain,text/yaml" onChange={event => chooseFile(event.target.files?.[0])} />
          </div>
          {error && <div className="message error" role="alert"><b>读取未完成</b><span>{error}</span></div>}
          {warnings.length > 0 && nodes.length > 0 && <div className="message warning"><b>已安全跳过</b><span>{warnings.join(" ")}</span></div>}
        </section>

        {nodes.length > 0 && <>
          <section className="result-card">
            <div className="section-heading compact"><div><p>02 / REVIEW</p><h2>检查节点</h2></div><button className="text-button" type="button" onClick={reset}>重新导入</button></div>
            <div className="summary-row">
              <div className="node-total"><strong>{nodes.length}</strong><span>个可用节点</span></div>
              <div className="protocol-stats">{Object.entries(statistics).map(([protocol, count]) => <span key={protocol}><i className={`dot dot-${protocol}`} />{protocolLabels[protocol as ProxyNode["protocol"]]} <b>{count}</b></span>)}</div>
            </div>
            <div className="node-list">
              {nodes.slice(0, 6).map((node, index) => <div className="node-row" key={`${node.protocol}-${node.server}-${node.port}-${index}`}>
                <span className={`protocol-badge badge-${node.protocol}`}>{node.protocol === "ss" ? "SS" : node.protocol === "hysteria2" ? "HY2" : node.protocol.toUpperCase()}</span>
                <span><strong>{node.name}</strong><small>{node.server}:{node.port} · {node.transport?.toUpperCase() || "TCP"}{node.tls ? " / TLS" : ""}</small></span>
              </div>)}
              {nodes.length > 6 && <p className="more-nodes">还有 {nodes.length - 6} 个节点，将全部写入配置</p>}
            </div>
          </section>

          <section className="target-card">
            <div className="section-heading compact"><div><p>03 / FORMAT</p><h2>选择目标客户端</h2></div></div>
            <div className="target-grid">{targets.map((item, index) => <button key={item.id} type="button" className={target === item.id ? "target active" : "target"} onClick={() => setTarget(item.id)}>
              <span className={`target-icon icon-${index}`}>{item.letter}</span><span><strong>{item.name}</strong><small>{item.note}</small></span><i aria-hidden="true" />
            </button>)}</div>
            <div className="rule-selector">
              <div><strong>分流规则</strong><small>首版内置轻量规则，不依赖远程规则服务</small></div>
              <div role="group" aria-label="分流规则"><button className={preset === "balanced" ? "active" : ""} onClick={() => setPreset("balanced")}>基础分流</button><button className={preset === "global" ? "active" : ""} onClick={() => setPreset("global")}>全局代理</button></div>
            </div>
          </section>

          {generated && <section className="export-card">
            <div className="export-heading"><div><p>READY TO EXPORT</p><h2>配置已在本机生成</h2><span>{generated.supported} 个写入 · {generated.skipped} 个因客户端不兼容而跳过</span></div><div className="export-actions"><button className="secondary" type="button" onClick={copyConfiguration}>{copied ? "已复制 ✓" : "复制配置"}</button><button className="primary" type="button" onClick={downloadConfiguration}>下载文件 <span>↓</span></button></div></div>
            {generated.skipped > 0 && <div className="compat-note">为避免生成“看似正常但无法连接”的配置，不受目标客户端支持的协议或传输已明确跳过。</div>}
            <details className="preview"><summary>查看配置预览</summary><pre>{generated.content}</pre></details>
          </section>}
        </>}
      </section>

      <section className="privacy-strip">
        <div><p>LOCAL-FIRST BY DESIGN</p><h2>你的 Token，只属于你的设备。</h2></div>
        <div className="privacy-points"><span>本地解析</span><span>不设中转</span><span>可离线使用</span></div>
        <p className="privacy-note">订阅只进入当前浏览器内存；遇到跨域限制时，流转会提示改用粘贴或文件。</p>
      </section>
      <footer><div className="footer-brand"><span className="brand-mark">流</span><strong>流转</strong></div><p>参考 Tower 的本地优先架构 · 当前支持</p><div><span>VMess</span><span>VLESS</span><span>Trojan</span><span>Shadowsocks</span><span>Hysteria 2</span></div></footer>
    </main>
  );
}
