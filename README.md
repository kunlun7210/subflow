# 流转

一个本地优先的代理订阅转换 PWA。面向个人使用，在 iPhone 与 Mac 浏览器里完成：

```text
订阅链接 / Base64 / Clash YAML
             ↓
       浏览器本地解析
             ↓
Clash / Stash / Surge / Shadowrocket / Loon / Quantumult X / Hiddify / Egern
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
- 12 种常见协议：SS、SSR、VMess、VLESS、Trojan、Hysteria、Hysteria 2、TUIC、WireGuard、AnyTLS、SOCKS5、HTTP(S)
- Clash / Mihomo YAML
- 本地文本或 YAML 文件

输出：

- 7 种客户端配置：Clash / Stash、Surge、Shadowrocket、Loon、Quantumult X、Hiddify（sing-box）与 Egern
- 优先按节点名称和主机名识别国家；纯 IP 节点按需使用内置的 187 个国家/地区离线 IP 库，并生成地区策略组
- 内置 ACL4SSR 全分组定制版、默认、精简和未删减 `ACL4SSR_Online_Full` 四套规则，也可粘贴或导入自己的规则
- 常用的“ACL4SSR 全分组 · 定制”固定在 ACL4SSR 提交 `c498ae4`，并移除微软 Bing、OneDrive/云盘、微软服务、网易云音乐、游戏平台、巴哈姆特和 Netflix 分组
- 独立 AI 分组：覆盖 ChatGPT/OpenAI、Gemini、Claude、xAI/Grok、Copilot、Perplexity 等服务
- AI 分组沿用 ACL4SSR 全分组的默认候选：主选择、自动选择、现有地区组、手动选择和直连，不强制限定国家
- 复制与下载；下载文件名自动加入本机日期，例如 `subflow-clash 2026.08.19.yaml`

生成器会同时检查协议、传输方式和必需凭据，明确统计被跳过的节点。例如 Surge 不支持 VLESS，也无法表达 gRPC VMess；流转不会生成一条“看起来能导入但实际不能连接”的假配置。需要内联规则的客户端直接使用 PWA 内置快照；支持远程规则的客户端只引用固定提交 URL，订阅地址与节点凭据不会随规则请求发送。

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
- `lib/generator.ts`：七类目标配置生成与兼容性过滤
- `lib/compatibility.ts`：协议、客户端、传输方式和凭据完整性矩阵
- `lib/rules.ts`：ACL4SSR 规则预设、自定义规则与按客户端转换
- `lib/regions.ts`、`lib/ip-country.ts`：名称、主机和离线 IP 国家识别
- `app/page.tsx`：移动端优先的转换工作区
- `public/sw.js`：离线应用外壳；不会缓存跨域订阅响应
- `tests/engine.test.ts`：解析、生成、兼容跳过与配置注入防护

## 参考与许可证

架构参考 [pengchujin/tower](https://github.com/pengchujin/tower) 的本地优先设计、统一节点模型和“无法忠实表达就跳过”的兼容策略。流转是独立的 TypeScript/PWA 实现，没有复制 Tower 的 SwiftUI 界面。仓库包含固定版本的 [ACL4SSR/ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 规则快照，以及来自 [sapics/ip-location-db](https://github.com/sapics/ip-location-db) 的离线国家库；来源、版本和许可证见 `THIRD-PARTY-NOTICES.md`。

本项目使用 MIT License。第三方依赖与参考项目的许可证见 `THIRD-PARTY-NOTICES.md`。

## 已知边界

- 当前没有地图、订阅管理或多订阅合并。
- 非标准机场字段可能需要按真实样本增加兼容适配。
- 尚未在安装了所有目标客户端的真机上完成最终导入验收；格式生成和兼容跳过已有自动测试。
- 使用前应查看配置预览，并保留原客户端配置备份。
