# GeoMirror

> 让浏览器的 HTML5 定位与你的出口 IP 保持一致 —— 全自动、覆盖每个页面。

当你通过代理或 VPN 上网时，网站从 IP 看到你在 A 地，而 `navigator.geolocation`（由
系统定位和 Wi-Fi 扫描驱动）仍然报出你的**真实物理位置** B 地。这种 IP 与定位的不一致，
是网站识别"代理用户"最常见的方式之一。

GeoMirror 解决这个问题。它检测你**出口 IP** 所在的城市，在附近挑一条真实的住宅街道，
把该坐标喂给 `navigator.geolocation` —— 于是浏览器上报的定位始终与网站看到的 IP 一致。
它会在你切换代理节点时自动更新，无需账号，代码完全可审计。

[English](./README.md) · [隐私政策](./PRIVACY.md)

---

## 工作原理

1. **检测出口 IP 的位置。** 后台 service worker 通过 Chrome 的网络栈（即走你的代理）查询
   一组免费 HTTPS 定位接口（带回退），拿到网站所看到的那个 IP 的地理位置。
2. **在附近挑一条住宅街道。** 查询 OpenStreetMap 的 Overpass API，找出出口坐标 ~2.5 公里内的
   `highway=residential` 住宅道路，随机取一条路上的某一点。这样能避免落在公园、地标或市中心上。
3. **覆盖 `navigator.geolocation`。** 一段运行在页面主世界（main world）、于 `document_start`
   页面脚本之前注入的内容脚本，替换掉 `navigator.geolocation`，让任意网站都拿到选定坐标；
   同时把定位权限上报为 `granted`。
4. **保持同步。** 定时（默认 6 小时）、浏览器启动时、以及手动点"Refresh now"时刷新，
   让定位跟随你当前的出口 IP。

## 安装

### 方式 A —— 加载未打包扩展（目前推荐）

1. 下载或克隆本仓库。
2. （可选）生成图标：`python3 tools/gen-icons.py`。仓库已自带预生成图标，不改设计可跳过。
3. 打开 `chrome://extensions`，右上角开启**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择 `geomirror` 文件夹。
5. 固定 GeoMirror，打开弹窗，确认它显示了你的出口 IP 和与之匹配的定位。

### 方式 B —— Chrome 应用商店

商店上架计划在审核通过后进行；在那之前请用方式 A。

## 验证效果

开着 GeoMirror 打开 [`https://browserleaks.com/geo`](https://browserleaks.com/geo)。
**HTML5 定位**与 **IP 定位**两个结果应指向同一城市（你出口 IP 所在的城市），
且 HTML5 定位落在一条住宅街道上而非地标。

## 设置

- **启用/禁用** —— 总开关。关闭后定位请求回退到真实的 `navigator.geolocation`。
- **上报精度（米）** —— 给页面的 `coords.accuracy`，默认 30 米（类 GPS）。
- **自动刷新间隔（分钟）** —— 多久重新检测一次出口 IP。
- **ipinfo.io token（可选）** —— 有免费 token 会提升回退链的可靠性，非必需。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 本地保存设置与计算出的覆盖坐标。 |
| `alarms` | 定时刷新。 |
| `<all_urls>` 内容脚本 | 在每个站点覆盖 `navigator.geolocation`。对定位类扩展不可避免，也是扩展在页面层做的唯一一件事。 |
| `host_permissions`（8 个 API 主机） | 联系 IP/定位/Overpass/反地理编码服务。manifest 中逐一列明。 |

完整数据流向见 [PRIVACY.md](./PRIVACY.md)。

## 局限

- 无法注入 `chrome://`、Chrome 商店等特权页（Chrome 限制）；这些页面通常也不用定位。
- IP 定位是城市级粗略值。覆盖坐标是出口 IP 中心几公里内的一条真实街道，足以在城市粒度上
  与 IP 一致，这正是各类一致性校验所比较的层级。
- 若所有 IP 接口都被限流或被你的代理节点阻断，刷新会报错并保留上一次的有效坐标；稍后重试即可。
- 本扩展提升的是 **IP 与定位之间的一致性**，它本身并非、也无法是完整的反指纹方案。

## 开发

```bash
python3 tools/gen-icons.py          # 重新生成图标
node --check background.js          # 语法检查任意 JS 文件
```

改动任意文件后，在 `chrome://extensions` 点扩展卡片上的刷新图标（圆形箭头）重新加载即可生效。

## 许可证

[MIT](./LICENSE)
