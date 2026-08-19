# 流转

一个本地优先的代理订阅转换 PWA。面向个人使用，在 iPhone 与 Mac 浏览器里完成：

```text
订阅链接 / Base64 / Clash YAML
             ↓
       浏览器本地解析
             ↓
Clash / Stash / Surge / Shadowrocket / Loon
```

订阅 URL、Token、密码和节点不会发送给第三方转换服务，也不会写入仓库或浏览器持久存储。

## 为什么选择 PWA

- iPhone 17、iPhone 17 Pro：Safari 打开后可“添加到主屏幕”。
- iMac M1、MacBook Air M5：Safari、Chrome、Edge 直接使用。
- 同一份代码维护四台设备，不需要 App Store、证书或重复开发两套原生 UI。
- 首次加载后，解析与生成引擎可以离线运行。

网页的限制是 CORS 与 HTTPS 证书：有些订阅服务器（尤其是直接使用 IP 地址的链接）不允许浏览器跨域读取，或证书只对域名有效。流转能够识别 IP 地址链接，但不会用第三方中转站绕过浏览器安全限制。遇到这种情况，可用页面提供的“打开原始订阅”复制 Base64/节点原文，或保存后导入本地 `.txt` / `.yaml` 文件。

## 首版能力

输入：

- 普通或 URL-safe Base64 节点列表
- SS、VMess、VLESS、Trojan、Hysteria 2（含 `hy2://`）分享链接
- Clash / Mihomo YAML
- 本地文本或 YAML 文件

输出：

- Clash / Stash YAML
- Surge 完整配置
- Shadowrocket 可导入的 Clash YAML
- Loon 完整配置
- ACL4SSR 在线规则或全局代理
- 独立 AI 分组：覆盖 ChatGPT/OpenAI、Gemini、Claude、xAI/Grok、Copilot、Perplexity 等服务
- AI 自动选择只纳入名称明确标注为新加坡或日本的节点；没有合格节点时使用 `REJECT`，不会回落到直连、香港或澳门
- 复制与下载

生成器会明确统计目标客户端不兼容而跳过的节点。例如 Surge 不支持 VLESS，流转不会生成一条“看起来能导入但实际不能连接”的假配置。生成的客户端配置会下载 ACL4SSR 的公开规则列表；订阅地址与节点凭据不会随规则请求发送。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

打开终端显示的本地地址即可。

验证：

```bash
npm test
```

## 发布到 GitHub Pages

1. 新建一个 GitHub 仓库，把本目录内容推送到 `main` 分支。
2. 在仓库 `Settings → Pages → Build and deployment` 中选择 `GitHub Actions`。
3. `.github/workflows/pages.yml` 会自动测试并发布 `pages-dist`。
4. iPhone 用 Safari 打开 Pages 地址，选择“分享 → 添加到主屏幕”。

静态构建也可手动生成：

```bash
npm run build:pages
```

## 目录

- `lib/parser.ts`：订阅、URI、Base64 与 Clash YAML 解析
- `lib/model.ts`：统一节点模型
- `lib/generator.ts`：四类目标配置生成与兼容性过滤
- `app/page.tsx`：移动端优先的转换工作区
- `public/sw.js`：离线应用外壳；不会缓存跨域订阅响应
- `tests/engine.test.ts`：解析、生成、兼容跳过与配置注入防护

## 参考与许可证

架构参考 [pengchujin/tower](https://github.com/pengchujin/tower) 的本地优先设计、统一节点模型和“无法忠实表达就跳过”的兼容策略。流转是独立的 TypeScript/PWA 实现，没有复制 Tower 的 SwiftUI 界面。分流使用 [ACL4SSR/ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 的公开在线规则，不在本仓库复制规则正文。

本项目使用 MIT License。第三方依赖与参考项目的许可证见 `THIRD-PARTY-NOTICES.md`。

## 已知边界

- 当前没有地图、订阅管理或多订阅合并。
- 非标准机场字段可能需要按真实样本增加兼容适配。
- 尚未在安装了所有目标客户端的真机上完成最终导入验收；格式生成和兼容跳过已有自动测试。
- 使用前应查看配置预览，并保留原客户端配置备份。
