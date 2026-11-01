<div align="center">

# 🌲 LinTrans · 林交通

**局域网里的文件摆渡船 —— 一条命令启动，手机扫码即用。**

在同一个 Wi-Fi 下，手机与电脑之间传文件、发文字，不用数据线、不用云盘、不经过公网。

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-4B5563?style=flat-square)](.)
[![License](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-FF69B4?style=flat-square)](./CONTRIBUTING.md)

</div>

---

## 📖 项目简介

**LinTrans（林交通）** 是一个轻量、私有、即开即用的局域网文件共享工具。

它把「传文件」这件事压缩成三步：**启动服务 → 手机扫码 → 网页里上传/下载**。所有数据只在你自己的电脑和局域网内流动，不上传云端、不需要注册账号、不依赖任何第三方服务。

> 💡 名字取自“林间小路”：不追求大而全，只把局域网里那点文件往来，做得安静、可靠、顺手。

适用场景：

- 📷 手机照片、视频快速传到电脑，不用再找数据线
- 🏢 会议室里给同事分发资料，扫码即取
- 🖥️ 多台设备之间临时共享文件，替代 U 盘
- 📋 电脑和手机之间复制粘贴一段文字
- 🗂️ 轻量级家庭 NAS：浏览、预览、下载局域网内共享目录

---

## ✨ 功能特性

| | 特性 | 说明 |
| :---: | --- | --- |
| 📁 | **文件互传** | 支持多文件上传、下载、重命名、删除，自动处理重名文件 |
| 🖱️ | **拖拽上传** | 把文件拖进浏览器窗口即可上传，实时显示百分比与速率 |
| 🗂️ | **目录管理** | 新建文件夹、面包屑导航、逐级浏览，结构一目了然 |
| 🔍 | **实时搜索** | 按文件名递归搜索共享目录，快速定位文件 |
| 👁️ | **在线预览** | 图片、视频、音频、PDF 直接打开；文本与代码文件在线查看 |
| 📋 | **局域网剪贴板** | 共享文本支持置顶、编辑、复制、删除，各设备自动同步 |
| 📱 | **扫码即用** | 电脑端展示访问地址与二维码，手机扫一扫直接进入 |
| 🌗 | **深浅主题** | 纯白 / 深色一键切换，偏好保存在本地 |
| 🔐 | **访问密码** | 可选 PIN 保护，适合不完全可信的局域网环境 |
| 📊 | **空间监控** | 顶栏实时显示磁盘剩余空间 |
| 🔄 | **自动刷新** | 文件列表与共享文本定时轮询，多设备协作不迷路 |
| 🪶 | **零构建前端** | 原生 HTML / CSS / JavaScript，改完刷新即生效 |

---

## 🖼️ 界面预览

> 将截图放到仓库的 `docs/screenshots/` 目录后，替换下面的路径即可。

| 文件管理 | 局域网剪贴板 |
| :---: | :---: |
| ![文件列表](docs/screenshots/files-light.png) | ![共享文本](docs/screenshots/clipboard.png) |

| 二维码访问 | 深色模式 |
| :---: | :---: |
| ![二维码](docs/screenshots/qrcode.png) | ![深色模式](docs/screenshots/files-dark.png) |

---

## 🧱 技术栈

| 层次 | 技术 | 用途 |
| --- | --- | --- |
| 🐍 语言 | **Python 3.10+** | 后端运行时 |
| ⚡ Web 框架 | **FastAPI** | 路由、参数校验、自动接口文档能力 |
| 🚀 ASGI 服务器 | **uvicorn** | 监听 `0.0.0.0:8777`，局域网可访问 |
| 📦 表单解析 | **python-multipart** | 多文件上传解析 |
| 🗃️ 数据存储 | **SQLite** | 保存局域网剪贴板文本 |
| 🔳 二维码 | **qrcode + Pillow** | 生成手机扫码入口 |
| 🎨 前端 | **原生 HTML5 / CSS3 / JavaScript (ES6+)** | 单页界面，无构建工具、无 CDN |
| 🌐 通信 | **RESTful API + XMLHttpRequest / Fetch** | 文件与文本交互 |

---

## 📂 目录结构

```text
LinTrans/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 入口、路由、鉴权、日志
│   ├── store.py             # 路径安全、目录枚举、搜索、文本库
│   └── static/
│       ├── index.html       # 页面结构
│       ├── style.css        # 深/浅主题与响应式布局
│       ├── app.js           # 前端交互逻辑
│       └── favicon.svg
├── config.json              # 端口、密码、共享目录等配置
├── requirements.txt
├── run.bat                  # Windows 双击启动
└── README.md
```

运行后自动生成（已在 `.gitignore` 中忽略）：

```text
storage/      # 共享文件根目录，上传的文件都保存在这里
data/clips.db # 剪贴板 SQLite 数据库
logs/app.log  # 运行日志（自动轮转）
```

---

## 🚀 快速开始

### 环境要求

- **Python 3.10 或更高版本**（推荐 3.11+）
- Windows / macOS / Linux 均可
- 手机与电脑连接**同一个局域网 / Wi-Fi**

### 1️⃣ 获取代码

```bash
git clone https://github.com/<your-username>/LinTrans.git
cd LinTrans
```

### 2️⃣ 安装依赖

```bash
python -m pip install -r requirements.txt
```

### 3️⃣ 启动服务

**Windows：** 双击 `run.bat` 即可（会自动检查并补装依赖）。

**命令行通用方式：**

```bash
python -m app.main
```

启动成功后，控制台会打印：

```text
====================================================
  LinTrans  v1.0.0
====================================================
  本机访问   http://127.0.0.1:8777
  局域网访问 http://192.168.1.100:8777
  共享目录   .../LinTrans/storage
  按 Ctrl+C 停止服务
====================================================
```

### 4️⃣ 打开页面

| 设备 | 地址 |
| --- | --- |
| 💻 本机 | <http://127.0.0.1:8777> |
| 📱 手机 / 其他电脑 | `http://<电脑局域网IP>:8777` |

手机也可以直接点击页面右上角的 **二维码按钮**，扫码进入。

---

## ⚙️ 配置说明

所有配置集中在项目根目录的 `config.json`：

```json
{
  "name": "LinTrans",
  "port": 8777,
  "pin": "",
  "storage": "storage",
  "max_text_items": 300
}
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | string | `LinTrans` | 页面标题与软件名称 |
| `port` | int | `8777` | 监听端口，被占用时改成其他值 |
| `pin` | string | `""` | 访问密码；留空表示免密访问 |
| `storage` | string | `"storage"` | 共享根目录，支持相对路径或绝对路径 |
| `max_text_items` | int | `300` | 非置顶共享文本最多保留条数 |

> ⚠️ 修改配置后需要**重启服务**生效。`storage` 使用绝对路径时，Windows 下反斜杠需写成 `\\`。

---

## 📱 手机访问指南

1. 确认手机和电脑连着**同一个 Wi-Fi**（不要一个连 5G、一个连访客网络）。
2. 在电脑页面右上角点击二维码图标，手机扫码。
3. 或在手机浏览器手动输入 `http://192.168.x.x:8777`。
4. 首次启动时 Windows 若弹出防火墙提示，请勾选 **专用网络** 并允许访问。

---

## 🔌 接口一览

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| `GET` | `/api/info` | 服务信息、局域网 IP、磁盘空间 |
| `GET` | `/api/files?path=` | 列出目录内容 |
| `POST` | `/api/files/upload?path=` | 多文件上传 |
| `GET` | `/api/files/download?path=` | 下载文件 |
| `GET` | `/api/files/raw?path=` | 浏览器内联预览 |
| `GET` | `/api/files/text?path=` | 读取文本内容 |
| `POST` | `/api/files/mkdir` | 新建文件夹 |
| `POST` | `/api/files/rename` | 重命名 |
| `POST` | `/api/files/delete` | 删除文件或目录 |
| `GET` | `/api/search?q=` | 文件名搜索 |
| `GET` | `/api/clips` | 共享文本列表 |
| `POST` | `/api/clips` | 新增共享文本 |
| `PUT` | `/api/clips/{id}` | 编辑 / 置顶 |
| `DELETE` | `/api/clips/{id}` | 删除共享文本 |
| `GET` | `/api/qr?text=` | 生成二维码 PNG |

---

## ❓ 常见问题

<details>
<summary><b>手机打不开页面怎么办？</b></summary>

1. 确认手机与电脑在同一网段（可对比 IP 前三段是否一致）。
2. 确认服务监听的是 `0.0.0.0` 而不是 `127.0.0.1`。
3. 检查 Windows 防火墙是否放行了 Python，或临时关闭防火墙测试。
4. 部分路由器开启了「AP 隔离」，会导致设备之间无法互访。
</details>

<details>
<summary><b>端口 8777 被占用？</b></summary>

修改 `config.json` 中的 `port`，例如改为 `8899`，然后重启服务。
</details>

<details>
<summary><b>上传一直提示失败？</b></summary>

1. 确认后端窗口仍在运行，地址栏是 `http://127.0.0.1:8777`。
2. 查看 `logs/app.log` 中的状态码与异常堆栈。
3. 若浏览器装有代理 / VPN 插件，请对本地地址关闭代理后重试。
</details>

<details>
<summary><b>上传的文件保存在哪里？</b></summary>

默认在项目根目录的 `storage/`，可在 `config.json` 的 `storage` 字段改为任意目录。同名文件会自动重命名为 `文件名 (1).扩展名`，不会覆盖。
</details>

<details>
<summary><b>如何关闭服务？</b></summary>

在运行服务的命令行窗口按 `Ctrl + C`，或直接关闭该窗口。
</details>

---

## 🔒 安全说明

- LinTrans 面向**可信局域网**设计，默认无鉴权；在公共网络或宿舍 / 办公室多人环境，请在 `config.json` 设置 `pin`。
- 所有文件操作都做了路径穿越校验，只能访问 `storage` 目录内部。
- 数据传输走 HTTP 明文，**不要将端口直接暴露到公网**；如需外网访问，请自行叠加反向代理与 HTTPS。
- 删除操作不可撤销，页面会二次确认。

---

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！

```bash
# 1. Fork 本仓库
# 2. 新建分支
git checkout -b feature/your-idea
# 3. 提交修改
git commit -m "feat: add your idea"
# 4. 推送并发起 PR
git push origin feature/your-idea
```

如果这个项目帮到了你，欢迎点一个 ⭐ **Star**，这是对作者最好的鼓励。

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源，可自由使用、修改与分发。

<div align="center">

**Made with 🐍 Python + ⚡ FastAPI + ❤️**

<sub>LinTrans · 让局域网里的每一次传输都简单一点</sub>

</div>
