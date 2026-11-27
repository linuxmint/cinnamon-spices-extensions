**中文** | [English](README.en.md)

<img src="icon.png" width="64" alt="Nebula Theme Studio 图标" align="right">

# Nebula Theme Studio

Linux Mint / Cinnamon 扩展。把 **Nebula-Dark** 与 **Nebula-Light** 当作模板，用一组参数
生成可自由切换的定制主题。

> 🧩 **一句话**：把主题当模板，把参数烘进 CSS，产出**独立命名**的完整主题目录 ——
> 于是它就像任何普通主题一样，能在「系统设置 → 主题」里选用、来回切换。
> 源主题一个字节都不动，生成物随时可删。

| 项目 | 说明 |
|---|---|
| 📥 源主题 | Nebula-Dark / Nebula-Light（内置，启用时安装） |
| 📤 生成物 | `~/.themes/Nebula-<变体>-Studio`、`Nebula-<变体>-<方案名>` |
| 🎚️ 可调参数 | 22 项 + 4 套终端调色板 |
| 🔄 需要重启 Cinnamon | **不需要** |

---

## 📑 目录

- [✨ 它做什么](#what-it-does)
- [📦 安装](#install)
- [🔄 工作流](#workflow)
  - [🎛️ 各按钮干什么](#buttons)
  - [⚖️ 建议的分工](#division)
- [🎚️ 参数一览](#params)
  - [🖥️ 基础](#params-basic)
  - [🌫️ 透明度](#params-opacity)
  - [🎨 颜色](#params-color)
  - [📐 形状与字号](#params-shape)
- [⌨️ 终端配色](#terminal)
  - [🎛️ 终端输入区不透明度](#terminal-opacity)
- [⚙️ 它动了哪些系统设置](#system-settings)
  - [👆 点一下 = 完整切换](#one-click)
- [📂 数据在哪](#data)
  - [🏷️ 方案名 → 主题目录名](#naming)
- [⚠️ 已知限制](#limitations)

---

<a id="what-it-does"></a>
## ✨ 它做什么

| 阶段 | 做什么 |
|:--:|---|
| 📥 **安装** | 启用时把内置的 Nebula-Dark / Nebula-Light 装进 `~/.themes`（已存在则跳过，不覆盖你自己的改动） |
| 🎚️ **调参** | 透明度、背景色、强调色、圆角、字号等 22 项，实时改字面量生成 CSS |
| 🚀 **应用** | 写四处 gsettings，面板/菜单即时重载；已打开的 GTK 应用强制刷新 |
| 💾 **存档** | 按方案名生成独立主题目录，多套并存，在系统设置里当普通主题选 |
| ⌨️ **终端** | 可选写入 gnome-terminal 的 ANSI 16 色调色板 |

---

<a id="install"></a>
## 📦 安装

```bash
ln -s "$PWD" ~/.local/share/cinnamon/extensions/nebula-theme-studio@yoo
```

或直接把目录复制过去。然后：

**系统设置 → 扩展模块 → Nebula Theme Studio** 打开开关。

设置入口：**系统设置 → 扩展模块 → 该扩展右侧的齿轮**（或菜单 → 首选项）。

要求 Cinnamon 6.0 / 6.2 / 6.4 / 6.6。终端调色板需要 gnome-terminal，没装会自动跳过。

---

<a id="workflow"></a>
## 🔄 工作流

```
扩展里调参数
  ├─ 生成并应用  →  写入「工作主题」 ~/.themes/Nebula-<变体>-Studio
  │                 随手试参数的地方，下次生成就被覆盖
  └─ 保存为方案  →  写入「存档主题」 ~/.themes/Nebula-<变体>-<方案名>
                    冻结出来的成品，互不覆盖

系统设置 → 主题 → 「Nebula」分类 → 挑一个  →  一次点全切好
```

举例：

```
方案名「深海」+ Nebula-Dark  →  ~/.themes/Nebula-Dark-深海
方案名「紫韵」+ Nebula-Dark  →  ~/.themes/Nebula-Dark-紫韵
```

两者都在系统设置的「Nebula / Dark」组里，和原始 `Nebula-Dark` 并排。

<a id="buttons"></a>
### 🎛️ 各按钮干什么

| 按钮 | 行为 |
|---|---|
| **生成并应用** | 生成工作主题并切过去。不保存方案 |
| **保存为方案** | 生成存档主题 + 写方案 JSON。**不切换主题** |
| **载入方案并应用** | 把方案的参数拉回设置面板，生成到**工作主题**并切过去 |
| **删除方案及其主题目录** | 删 JSON + 删主题目录（不留孤儿主题）。正在使用中的会先切回源主题 |
| **重置本主题为默认值** | 参数恢复当前变体默认值，删掉工作主题，切回源主题 |
| **恢复原始主题并删除生成结果** | 删掉两个工作主题，切回当前变体的源主题。存档主题保留 |
| **卸载扩展安装的两个主题** | 只删本扩展装的（凭 `state.json` 记录），用户自己装的不动 |
| **打开方案目录** | 打开 `~/.config/nebula-theme-studio/presets/` |
| **打开 README 文档** | 用默认程序打开扩展目录内的 `README.md`（在说明页底部） |

<a id="division"></a>
### ⚖️ 建议的分工

| 操作 | 走哪里 |
|---|:---:|
| 🎛️ 调参数、冻结方案 | 扩展设置面板 |
| 🔄 在工作主题和存档主题之间切换 | 系统设置 → 主题 |
| 🎨 换图标 / 光标 | 系统设置（扩展不碰这两项） |

**不要用系统设置里的「主题」面板改 GTK 主题**：它会把主题名写进
`~/.config/gtk-3.0/settings.ini` 和 `~/.gtkrc-2.0`，覆盖扩展的应用结果。
选用生成的主题请在系统设置的**主题选择器**里点。

---

<a id="params"></a>
## 🎚️ 参数一览

<a id="params-basic"></a>
### 🖥️ 基础

| 参数 | 范围 | 默认 | 说明 |
|---|---|---|---|
| 主题变体 | Nebula-Dark / Nebula-Light | Nebula-Dark | 决定用哪套源主题 |
| 终端配色 | 跟随系统 / Nebula 深色 / Nebula 浅色 / 中性通用 | 跟随系统 | 见下方[终端配色](#terminal) |
| 终端输入区不透明度 | 20% ~ 100% | **100%**（= 强制不透明） | 见下方[终端输入区不透明度](#terminal-opacity) |
| 主背景色 | 调色板 | 随变体 | 窗口、输入框、菜单内容的底色，只替换背景语义 |
| 面板背景色 | 调色板 | 随变体 | Cinnamon 面板、GTK 标题栏 / 工具栏 / 菜单栏 |
| 菜单背景色 | 调色板 | 随变体 | 开始菜单、右键弹窗、提示气泡等浮层 |
| 参数变化后自动应用 | 开关 | 关 | 开则停顿约 0.35 秒后自动重生成 |

<a id="params-opacity"></a>
### 🌫️ 透明度

按 `(选择器, 属性, 色板)` 三重定位，只动命中的那一层。

| 参数 | 范围 | 默认 | 作用于 |
|---|---|---|---|
| 面板不透明度 | 30–100% | 70% | 顶/底/左/右栏，GTK 标题栏、工具栏、菜单栏 |
| 菜单 / 弹出层不透明度 | 20–100% | 80% | 开始菜单、右键菜单、通知、日历、OSD、提示气泡、GTK `menu` / `popover`、任务栏 hover 预览气泡 |
| 窗口底色不透明度 | 30–100% | 90% | GTK 窗口主背景、对话框底 |
| 悬停 / 按下态不透明度 | 20–100% | 60% | hover / active / checked 的高亮底色 |
| 强调淡底浓度 | 5–60% | 深色 15% / 浅色 20% | 菜单选中行等「淡强调底」。不影响强调描边与焦点环 |

<a id="params-color"></a>
### 🎨 颜色

颜色页七个语义色板角色：强调色、边框色、主文字色、次级文字色、危险色、警告色、成功色；
基础页另有主背景 / 面板 / 菜单三个背景色（见上表）。

切换明暗时**仍处于默认值**的颜色会自动迁到新变体的默认色，手动调过的不动。

<a id="params-shape"></a>
### 📐 形状与字号

| 参数 | 范围 | 默认 |
|---|---|---|
| 窗口 / 菜单圆角 | 0–24px | 12px |
| 控件圆角 | 0–16px | 6px |
| Cinnamon 基准字号 | 8–14pt | 10pt |

圆角是**按档位等比换算**的：12px 档和 8px 档一起联动，所以默认值处输出与源主题
逐字节一致。标题栏的「上圆下方」形状被显式排除，不会被破坏。

---

<a id="terminal"></a>
## ⌨️ 终端配色

![三套终端调色板的 16 色色卡](docs/terminal-palettes.png)

终端不吃 GTK 主题——`cinnamon.css` / `gtk.css` 里没有任何规则能影响 gnome-terminal
的配色。所以这一项只能落到它自己的 profile 上
（`org.gnome.Terminal.Legacy.Profile` 的 `palette`，全部 profile 都写）。

| 图标 | 方案 | 特点 |
|:--:|---|---|
| 🚫 | **跟随系统** | 完全不干预。**默认值** |
| 🌌 | **Nebula 深色** | 4 号位就是主题强调色 `#58a6ff`；0 号位比背景更深 |
| ☀️ | **Nebula 浅色** | 0 号位用主文字色 `#1f2328`，15 号位用背景色 `#ffffff` |
| 🎚️ | **中性通用** | 中等彩度中等明暗，深浅背景上都不刺眼 |

两个保障：

- **只改 ANSI 16 色**，不碰 `background-color` / `foreground-color`。
  终端的前景背景继续跟随 GTK 主题，半透明终端的搭配不受影响。
- **切回「跟随系统」会真还原**。第一次覆盖前把原值记进 `state.json`；
  重复应用不覆盖备份；还原后清空备份。

> 已打开的终端窗口不会变色。VTE 在建窗时读一次 profile，需要新开一个窗口。

<a id="terminal-opacity"></a>
### 🎛️ 终端输入区不透明度

gnome-terminal 有自己的背景透明度，不走 GTK 主题，只能落到它的 profile 上。它要两个键
一起用：

| 键 | 含义 |
|---|---|
| `use-transparent-background` | 总开关，gschema 默认 `false` |
| `background-transparency-percent` | **0 = 全不透明，100 = 全透明**（gschema 原文） |

本扩展的参数用「不透明度」表述（和其它 `*-opacity` 一致，100 最实），写进去时取反：
`transparency = 100 - opacity`。

**滑杆顶到 100% 会真的写成完全不透明**（`transparency-percent = 0`），而不是「恢复原样」。
标着 100% 却什么都不做，才是最容易让人以为功能坏了的做法。

代价是这一项没有「不干预」这个档位：默认 100% 就会覆盖你原本的终端设置。为此，
**第一次接管前会把 `use-transparent-background` 与 `background-transparency-percent` 的
原值逐 profile 记进状态文件**，设置里的**「恢复原始主题」**会把它们还回去。所以随时能
回到自己的原样，只是入口从滑杆挪到了维护页。

扩展只动**输入区背景**，不碰前景色、字体、光标。已打开的终端窗口不会变，需要新开一个。

---

<a id="system-settings"></a>
## ⚙️ 它动了哪些系统设置

| 键 | 管什么 |
|---|---|
| `org.cinnamon.theme name` | Cinnamon 面板 / 菜单 / 概览 |
| `org.cinnamon.desktop.interface gtk-theme` | **GTK3 应用** |
| `org.gnome.desktop.interface gtk-theme` | GTK4 / libadwaita 应用、非 Cinnamon 桌面 |
| `org.gnome.desktop.wm.preferences theme` | 窗口标题栏（metacity） |

四个都要写，缺一不可：GTK3 应用只认 Cinnamon 经 XSettings 下发的主题名，
GTK4 / libadwaita 走 GSettings，metacity 那份系统设置的两个 chooser 都不碰。

应用后：面板与菜单由 Cinnamon 即时重载；同名主题重建时，GTK3 应用借源主题做一次
中转切换强制刷新（个别应用仍会缓存，重开即可）。

<a id="one-click"></a>
### 👆 在系统设置里点一下 = 完整切换

系统设置的主题页把 GTK 主题、Cinnamon 主题、图标、光标做成**四个互不相干**的
chooser，每个只写自己那一个键，所以在那边点一下往往只变一半。

扩展监听主题切换，一旦发现目标是**本扩展生成的**（凭主题目录里的 `.nebula-studio.json`
标记文件判定），就把其余几处主题名一次性补齐——点一下就是完整切换。

换成第三方面板的主题则**完全不动**你的搭配——用户故意让 shell 与 GTK 用不同主题是
合法需求，扩展不越权。

⚠️ **参数只作用于当前选中的变体**：另一个变体的生成目录会停留在旧值上，直到你切到它。

---

<a id="data"></a>
## 📂 数据在哪

| 路径 | 内容 |
|---|---|
| `~/.themes/Nebula-<变体>-Studio/` | 工作主题（草稿台） |
| `~/.themes/Nebula-<变体>-<方案名>/` | 存档主题（成品） |
| `~/.themes/<主题名>/.nebula-studio.json` | 该主题的来源变体、方案名、参数快照 |
| `~/.config/nebula-theme-studio/state.json` | 装了哪些源主题；终端调色板与输入区透明度的原值备份 |
| `~/.config/nebula-theme-studio/presets/<方案名>.json` | 方案 |

<a id="naming"></a>
### 🏷️ 方案名 → 主题目录名

```
Nebula-<变体>-<方案名>
```

清洗规则：空白（含全角）→ `-`，`\ / : * ? " < > |` 与控制字符 → `-`，压缩连续连字符，
去首尾符号。**中文原样保留**——GTK、Cinnamon themeManager、metacity 都能正常加载
中文目录名。

撞名会被拒绝：清洗后为空、或拼出来正好是源主题名 / 工作主题名。

---

<a id="limitations"></a>
## ⚠️ 已知限制

- **已打开的 GTK3 应用在主题名未变时不会自动刷新**，需要重开该应用。扩展已经用中转切换
  强制刷新了大多数情况，但个别应用仍可能缓存。
- **已打开的终端窗口不会变色**，需要新开窗口。
- **GTK4 / libadwaita 应用不跟随中转切换**。它们走 GSettings 且对同值不敏感，
  主题名变化时会跟随，同名重建时需要重开应用。
- **新版 GTK4/libadwaita 应用（如 GNOME Files）根本不读 `~/.themes`**，任何传统主题
  对它们都无效——这是上游设计，不是本扩展的问题。
- **Qt 应用与强制服务端装饰（SSD）窗口的标题栏由 metacity 主题绘制**，颜色固定为
  源主题值，不随参数调整。
- **Cinnamon 基准字号叠加在系统「文字缩放」之上**：HiDPI 主机若已调过缩放，主题字号
  会等比放大，必要时把基准字号调小一档。
- **不要用系统设置的「主题」面板改 GTK 主题**，它会写 `settings.ini` / `gtkrc-2.0`
  与扩展的结果冲突。
- 每套存档主题 160–185K（磁盘块占用约翻倍）。存十几套也就两三 MB 量级，可以接受；再多建议清理。
- 终端调色板只覆盖 ANSI 16 色，不含 256 色与真彩色。
- 终端输入区不透明度只对 **gnome-terminal** 有效。同类的 xterm / konsole / tilix 各有各的
  配置位置，扩展不碰；没装 gnome-terminal 时这一项安静地什么都不做。
