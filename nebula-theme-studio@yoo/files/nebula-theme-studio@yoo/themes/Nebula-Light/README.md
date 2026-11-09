# Nebula-Light（星云 · 浅色）

Linux Mint / Cinnamon 6.x 的**浅色半透明主题**，与本机深色版 `Nebula` 同源同构：
同样的选择器覆盖范围、同样的加固经验，只是把色板整体翻到 Primer Light，
并把交互方向改为**浅色专属的"悬停变暗"**。

配色基底：GitHub Primer Light（冷白 + 深蓝灰文字 + 蓝色强调）。

---

## ⚠️ 使用前必读：壁纸是硬约束

**本主题建议搭配浅色或中等明度壁纸使用。**

这不是审美偏好，是透明度叠加的物理结果：浅色面板（`rgba(246,248,250,0.70)`）
叠在深色壁纸上会混成灰雾，深蓝灰文字（`#1f2328`）直接失去可读性。

如果必须在深色壁纸上用，两条退路（改 `cinnamon/cinnamon.css` 与
`gtk-3.0/gtk.css` 的透明度与描边）：

1. **整体提高不透明度**：背景 90% → 面板 88% → 悬浮 80%，牺牲通透感换可读性；
2. **保留半透明，改用描边划分层次**：面板描边提到
   `rgba(208, 215, 222, 0.90)` 并加投影（本主题已默认这么做）。

另外：浅色毛玻璃的"磨砂感"比深色更强，同样模糊半径下壁纸图案会被明显柔化，
选壁纸时请留意。

---

## 关于"毛玻璃"的实现边界

| 层次 | 由谁提供 |
|---|---|
| 透明度 | 主题 CSS（`rgba()`），稳定可靠 |
| 背景模糊 | **合成器 / 窗口特效**，主题无法强制开启 |

GTK3 / GTK4 本身没有实时背景模糊。本主题不含任何 `backdrop-filter`、
`filter`、`var()`（GTK 不支持）。

**启用模糊：** 系统设置 → 通用 → 窗口特效，确认特效已开启。
面板透明度可在 系统设置 → 面板 → 面板透明度 单独微调
（Cinnamon 自己的滑块会覆盖主题的部分设定）。

RTX 5060（Blackwell，需 570+ 驱动）在此无性能压力 —— GTK 本身不渲染模糊。

---

## 安装

```bash
# 1. 部署（主题目录名必须是 Nebula-Light，与 index.theme 的 Name 一致）
mkdir -p ~/.themes/Nebula-Light
cp -r index.theme cinnamon gtk-3.0 gtk-4.0 metacity-1 ~/.themes/Nebula-Light/
```

## 启用

```bash
# 2. GTK3 / GTK4 应用
gsettings set org.cinnamon.desktop.interface gtk-theme 'Nebula-Light'

# 3. Cinnamon 面板 / 菜单 / 通知
gsettings set org.cinnamon.theme name 'Nebula-Light'

# 4. 窗口边框
gsettings set org.cinnamon.desktop.wm.preferences theme 'Nebula-Light'

# 5. 图标主题（关键：这是独立的 gsettings 键，切换 metatheme 不会自动改）
gsettings set org.cinnamon.desktop.interface icon-theme 'Papirus'

# 6. 面板高度 40px
gsettings set org.cinnamon panels-height "['1:40']"
```

也可以在 系统设置 → 主题 里选 `Nebula-Light`，一次套用 GTK / Metacity / 图标 / 光标。

> **⚠️ 第 7 步不能省：新建的主题目录必须重启 Cinnamon 才会被识别。**
>
> Cinnamon 在**启动时**扫描 `~/.themes` 与 `/usr/share/themes` 建立主题表，
> 之后新增的目录不在表内。把 `org.cinnamon.theme name` 设成新主题名不会生效，
> 面板会保持原样（不报错、不提示，很容易误判成主题坏了）。
> 本机实测确认了这一行为。

```bash
# 7. 重载 Cinnamon（不丢会话）
cinnamon --replace &
# 或 Ctrl+Alt+Esc
```

## 回滚

```bash
gsettings set org.cinnamon.theme name 'Nebula-Dark'
gsettings set org.cinnamon.desktop.interface gtk-theme 'Nebula-Dark'
gsettings set org.cinnamon.desktop.interface icon-theme 'Papirus-Dark'
rm -rf ~/.themes/Nebula-Light
```

## 单应用试跑（不影响全局）

```bash
GTK_THEME=Nebula-Light nemo
GTK_THEME=Nebula-Light gnome-text-editor
GTK_DEBUG=interactive nemo      # GTK3 交互式 CSS 检查器
```

---

## 文件结构

```text
Nebula-Light/
├── index.theme                    # 元数据: IconTheme=Papirus, CursorTheme=Adwaita
├── README.md
├── cinnamon/
│   ├── cinnamon.css               # 面板/开始菜单/弹出菜单/通知/概览/对话框 (St)
│   ├── assets/                    # 开关、复选、日历箭头、垃圾桶等 SVG
│   └── thumbnail.png              # 480x270 预览(桌面)
├── gtk-3.0/
│   ├── gtk.css                    # GTK3 全量组件
│   ├── gtk-dark.css               # 拦住应用级 prefer-dark 的深色回落
│   ├── assets/                    # 复选/单选 PNG，16px + 32px 双档
│   └── thumbnail.png              # 240x70 预览(应用程序)
├── gtk-4.0/                       # 同上，GTK4 节点结构
└── metacity-1/
    └── metacity-theme-3.xml       # 窗口边框 / 标题栏 / 按钮
```

---

## 与规格文档的偏差（均为本机实测后的决定）

规格文档是基线，以下 7 处基于实测做了调整，均已在校验中确认：

| # | 规格 | 实际做法 | 原因 |
|---|---|---|---|
| 1 | §1.6 所有 CSS 用 `@define-color` + `@name` 引用 | **`cinnamon.css` 一律写字面色值**；`gtk-3.0` / `gtk-4.0` 正常使用 `@name` | 实测 St 能解析 `@define-color` 语法但**不注册为可引用名**：把 `#panel` 的背景写成 `@probe_var` 后背景整个失效（完全透明）；换同色字面量即正常。声明但不引用无害，故保留调色板块以符合 §1.6 |
| 2 | §3.2 / §5.4 主按钮 `rgba(9,105,218,0.80)` 配白字"约 4.6:1 ✅" | 主按钮默认 `rgba(9,105,218,0.95)`，**悬停转实色** `#0969da` | §3.2 的 4.6:1 是按**实色**算的。80% 半透明叠在白色窗口上合成后为 `rgb(58,135,225)`，白字仅 **3.66:1**；改用深字也只有 4.32:1 —— 两种文字色都不达标。95% 为 4.77:1、实色为 5.19:1 |
| 3 | §5.4 危险操作 `rgba(207,34,46,0.80)` 配白字 | 默认 `rgba(207,34,46,0.90)`，**悬停转实色** `#cf222e` | 80% 时白字仅 4.06:1；90% 为 4.73:1、实色为 5.36:1。**不用实色当默认**，是因为默认与悬停同色时悬停看不出变化（见下条修复） |
| 4 | — | 禁用的强调按钮回退中性灰 | 淡蓝底（`rgba(9,105,218,0.30)`）上 `#656d76` 仅 3.37:1；且禁用按钮本就该丢掉强调色身份 |
| 5 | §5.6 滚动条 8px / 圆角 4px | **采用文档值**，不沿用深色版 Nebula 的"透明描边压到发丝"手法 | 发丝滑块（≈2px）在白色内容区几乎不可见，会违反验收项"滚动条滑块在浅色内容区可辨识"。实测：常态 `rgb(200,203,206)`，悬停 `rgb(169,174,179)`，8px 宽清晰可辨 |
| 6 | §5.1 面板底边框 `rgba(208,215,222,0.60)` | 面板描边提到 **0.90** + 投影 `rgba(31,35,40,0.10)` | 1px 描边被面板高度的小数像素摊到两行，实测衰减到约 5 级差，层次几乎消失。这里直接采用 §11.2 的"描边优先"方案 |
| 7 | §5.3 标题栏 38px | **30px** | 与本机深色版 Nebula 的 GTK `headerbar`（30px）及 Metacity 几何保持一致，避免同一套主题里标题栏在 CSD / 非 CSD 应用间跳变 |

### 悬停高亮的两个修复（实测发现）

初版有两处"鼠标悬停没反应"，根因都不是配色，而是 CSS 级联：

1. **`:focus` 抢掉了 `:hover` 的背景**
   `.dialog-button:focus` 与 `.dialog-button:hover` **特异度相同**（均为 `0,2,0`），
   而 `:focus` 写在后面 → 同时命中时 `:focus` 胜出，把悬停底色整个覆盖。
   对话框按钮默认自带键盘焦点，所以"鼠标悬停确定/取消没高亮"必然复现。
   `:focus` 原本只是把背景重述成默认值（视觉上是个空操作），却恰好压掉了悬停。

   **修法**：`:focus` 不再声明 `background-color`，改用内描边焦点环
   （`box-shadow: inset 0 0 0 2px rgba(9,105,218,0.45)`）。级联是**按属性**判定的，
   `:focus` 不参与背景竞争，悬停底色自然生效；焦点环用 inset 画在内侧，不受按钮盒裁剪。

2. **彩色按钮的默认态与悬停态同色**
   `destructive-action` / `suggested-action` 的默认与 `:hover` 都是同一个实色，
   悬停时背景**根本没变**，只剩一条 1px 内高光，肉眼不可见。

   **修法**：默认降到刚好达标的半透明（红 90% / 蓝 95%），悬停转实色 ——
   既让悬停有可见变化，又满足 §4.6"悬停变暗"的方向，且白字对比度全程达标。

修复后按属性独立求解级联，`focus+hover` 状态下四个按钮的胜出规则均为各自的
`:hover`（不再是 `:focus` 或默认态）。

### 设置面板里的预览图：尺寸必须跟 Nebula-Dark 对齐

「系统设置 → 主题 → 设置」四行中，**应用程序**和**桌面**两行的预览图，
由 `ChooserButtonWidgets.PictureChooserButton` 加载，加载方式是：

```python
GdkPixbuf.Pixbuf.new_from_file_at_size(path, button_picture_width, -1)   # 宽度固定 125
```

`h = -1` 意味着**高度按原图宽高比自动缩放**。所以预览图在设置里显示多高，
完全由 `thumbnail.png` 自己的长宽比决定 —— 尺寸画成 1:1 正方形就会比别的主题高 3~5 倍。

本主题三张预览图已与 `Nebula-Dark` 逐一对齐（几何也逐点对应，只换配色）：

| 文件 | 尺寸 | 宽高比 | 设置里 w=125 渲染高 | Nebula-Dark |
|---|---|---|---|---|
| `gtk-3.0/thumbnail.png` | 240x70 | 3.43:1 | 36px | 240x70 ✓ |
| `gtk-4.0/thumbnail.png` | 240x70 | 3.43:1 | 36px | 240x70 ✓ |
| `cinnamon/thumbnail.png` | 480x270 | 1.78:1 | 70px | 480x270 ✓ |

对应关系（实测取值）：`cinnamon` 预览图里面板条 y 0..26、窗口三点 x 14/44/74、
主卡片 x 24..330 y 44..216、两个输入框 y 101..125、强调条 y 136..162、
凹陷框 y 176..198、侧栏 5 行 + 末行选中 y 184..204 —— 浅色版沿用同一套坐标。

> 规格 §6 写的是 `thumbnail.png # 预览图（256x256）`。256x256 在设置里会被
> 拉成 125x125 的方块，与所有其他主题都不一致，故按实际约定改为宽条。

### GtkFrame 的"选框"不能被 border:none 抹掉

预览图所在的按钮结构是 `GtkButton > Box > GtkFrame > GtkImage`
（`frame=True` 时才套 GtkFrame）。GtkFrame 的可见边框由 **`frame > border`
子节点**绘制 —— 写 `border: none` 会让"按钮 + 选框"退化成只有按钮，
与图标/指针行（`frame=False`，本就没有框）看起来就不成套了。

参照 Mint-Y 的写法，边框落在 border 子节点上，`frame` 本体不重复描边：

```css
frame, .frame { border-radius: 8px; }
frame > border, .frame > border { border: 1px solid @nebula_border; border-radius: 8px; }
```

实测对普通 GtkFrame（内容区、侧栏、嵌套 frame）几乎无影响：修复前后
113760 个像素仅差 2 个，无布局位移。

### 跟随 Nebula-Dark 的调整（2026-10-04 同步）

Nebula-Dark 近期把整套控件改**更紧凑**、并把焦点环改到**内侧**，
Nebula-Light 已同步。两套主题现在**结构完全一致**（规则覆盖率 100%：
gtk-3.0 384/384、gtk-4.0 256/256、cinnamon 292/292），
浅色版只保留下面「有意偏离」清单里的差异。

尺寸（单位 px，Nebula-Dark 新值 ← 浅色版原值）：

| 选择器 | 原 | 现 |
|---|---|---|
| `button` | 6px 14px | **5px 12px** |
| `entry` | 6px 10px | **5px 8px** |
| `list > row` / `listbox > row` | 6px 12px | **5px 10px** |
| `treeview header button` | 6px 10px | **5px 8px** |
| `notebook tab` | 6px 14px | **5px 12px** |
| `menu menuitem` / `.menu menuitem` | 5px 8px | **4px 8px** |
| `tooltip` / `tooltip.background` | 6px 10px | **5px 8px** |
| `popover > contents` | 6px | **5px** |
| `popover > contents list > row` | 6px 12px | **5px 10px** |
| `combobox > box > button.combo` | 6px 10px | **5px 8px** |
| `.nemo-window-pane widget.entry` | 6px 10px | **5px 8px** |
| gtk-4.0 的 `tabbar tab` / `tabview tab` / `dropdown > button` / `popover.menu modelbutton` | 6px … | **5px …** |

### 第二轮同步：浮层专用描边 `@nebula_float_border`

Nebula-Dark 后续新增了一个专门给浮层用的描边色，理由写在它的注释里：

> 浮层描边：底色半透明时全靠它勾边，深色下需比 `@nebula_border` 更亮

Nebula-Dark 取 `rgba(139, 148, 158, 0.38)`（= 它的 `@nebula_fg_dim` @ 0.38）。
原则是**浮层描边要比常规描边对比更强**，否则半透明底色上根本看不出边界。
浅色下这个原则反过来 —— 要比 `@nebula_border` **更深**，故取：

```c
@define-color nebula_float_border rgba(101, 109, 118, 0.38); /* = @nebula_fg_dim @ 0.38 */
```

用在同样 5 处浮层：`menu/.menu/context-menu`（GTK3）、`popover`、
`popover > contents`（GTK3+GTK4）。

实测对比度（描边合成后 vs 相邻底色）：

| | vs 弹层底色 | vs 窗口底色 |
|---|---|---|
| 旧 `@nebula_border` | 1.20:1 | 1.16:1 |
| 新 `@nebula_float_border` | **1.66:1** | **1.64:1** |

另外把 **GTK4 的 `popover` 也改成直接绘制**（此前只有 `popover > contents`
有背景，`popover` 本身是 `transparent` + `border:none`，导致浮层没有描边）。
现与 GTK3 及 Nebula-Dark 一致：底色 + 浮层描边 + 12px 圆角 + 阴影 + 5px 内边距。

> 顺带修了 GTK4 `popover > contents` 里 `padding: 5px;` 缩进跑到行首的问题。

新增/改写的规则：

- `headerbar > button/label/entry/spinbutton/box/menu` 及 `.titlebar` 同款
  → `margin: 0 8px`。标题栏自身的横向 padding 在 CSD 下会把分配收窄，
  两侧露出未绘制的透明条，内缩必须放在子节点上。
- `entry:focus` 由 **3px 外扩环** 改为 **2px 内描边环**
  （`inset 0 0 0 2px rgba(9,105,218,0.45)`）。外扩环会压住相邻控件 ——
  实测截图工具「延迟秒数」的输入框会盖住减号按钮并溢出圆角端。
  另加 `.linked > entry:focus` / `:focus-within`（0.55 alpha），
  避免组合输入框聚焦时盖住 spinbutton 的加减按钮。
  内描边环实测画在控件自身框内，不侵占相邻按钮。
- `popover` / `popover.background` 由「透明 + 只画 contents」改为
  **直接绘制**（底色 + 1px 描边 + 12px 圆角 + 柔和阴影 + 5px 内边距）。
- `button.destructive-action` / `suggested-action` 的 `label` 规则
  补齐 `:hover` / `:active` / `:checked` 逐状态（与 Nebula-Dark 同款防御性写法）。
- `check` / `radio` 的未选中字形改回 `check:not(:checked)` 写法
  （此前浅色版用的是"基础选择器 + `:checked` 覆盖"，两者都可用，现与 Nebula-Dark 对齐）。

> 有意保留的差异（未跟随 Nebula-Dark）：滚动条几何（规格 §5.6 的 8px/4px
> 实宽，浅底上才看得见）、`frame > border` 的选框描边（你要求修的那处）、
> 彩色按钮的实色填充与白色焦点环（对比度）、headerbar 底边框、
> 对话框按钮的聚焦环配色。详见下面「与规格文档的偏差」。

### 焦点环配色：按按钮填充色取色，不固定用蓝

`rgba(9, 105, 218, 0.45)` 这个蓝环压在红色实心按钮上会混成 `rgb(121,78,135)`
的暗紫，既不协调也几乎看不见。实测各组合：

| 按钮填充 | 蓝环 0.45 | 白环 0.85 |
|---|---|---|
| 危险按钮（红） | `rgb(121,78,135)` **1.37:1** | `rgb(249,225,227)` **3.81:1** |
| 主按钮（蓝） | `rgb(16,109,219)` **1.04:1** | `rgb(220,234,250)` **3.89:1** |
| 中性浅灰按钮 | `rgb(139,183,235)` 1.94:1 | `rgb(253,254,254)` **1.07:1** |

即：**环必须与填充色对比**。实心彩色按钮改用白环（与按钮文字同色，属该色的浅色阶），
中性浅灰按钮保留蓝环（符合桌面惯例）。GTK 侧同理，把全局蓝 `outline-color`
在彩色按钮上改为白色。

### 转圈动画(spinner)：必须由 CSS 驱动，不能靠图标主题

GTK3 原生转圈依赖图标主题提供"动画版"的 `process-working` 图标。
但常见图标主题（Papirus / Papirus-Dark / Papirus-Light / Yaru）给的
`process-working-symbolic` 都是**静态 SVG**，于是转圈**冻住不动**。

本机实测（连续抓 5 帧、间隔 280ms，逐帧比对像素）：

| 主题 | 相邻帧差异像素 | 判定 |
|---|---|---|
| Nebula-Dark | ~1170 / 帧 | 在转 |
| Nebula-Light（修复前） | **0 / 帧** | 冻住 |
| Nebula-Light（修复后） | ~1185 / 帧 | 在转 |

**修法**（与 Nebula-Dark 规则逐行一致）：用 CSS 自己驱动旋转，
`-gtk-icon-transform` 绕 Z 轴转整圈，配 `animation: 1s linear infinite`：

```css
@keyframes nebula_spin {
  from { -gtk-icon-transform: rotate(0turn); }
  to { -gtk-icon-transform: rotate(1turn); }
}
spinner            { -gtk-icon-source: -gtk-icontheme("process-working-symbolic"); color: @nebula_accent; }
spinner:checked    { animation: nebula_spin 1s linear infinite; }
spinner:disabled   { color: @nebula_fg_dim; }
```

`:checked` 精确跟随运行态 —— `GtkSpinner.start()` 会置上
`GTK_STATE_FLAG_CHECKED`，`stop()` 立刻撤销（探针实测 `start`/`stop`
即开即关），所以停止的 spinner 不会残留动画。

只在 `gtk-3.0` 做（与 Nebula-Dark 一致；GTK4 的 spinner 由 libadwaita 自行绘制）。

图标解析健壮性已验证：`process-working-symbolic` 在
Papirus / Papirus-Dark / Papirus-Light / Yaru / Adwaita 下**均能解析**
（Papirus-Light 是 `scalable/` 目录，容易被漏查），所以不会出现
"图标找不到 → spinner 直接消失"这种更糟的情况。

### 一个静态分析查不出的 bug：CSS 不跨节点参与级联

`label { color: @nebula_fg }` 这条空白标签规则会**直接命中按钮内部的 GtkLabel 节点**，
于是标签不再从父按钮继承 `color`，`button.suggested-action` / `button.destructive-action`
里声明的 `color: #ffffff` **完全失效**。

真实渲染取样证实：文字像素为 `rgb(30,39,50)`（≈ `#1f2328`），不是白色。

| 彩色按钮 | 底色 | 修复前（深字） | 修复后（白字） |
|---|---|---|---|
| 主按钮 默认 | `rgb(21,113,220)` | 3.31:1 ❌ | 4.77:1 ✅ |
| 主按钮 悬停 | `rgb(9,105,218)` | 3.04:1 ❌ | 5.19:1 ✅ |
| 危险按钮 默认 | `rgb(212,56,67)` | 3.34:1 ❌ | 4.73:1 ✅ |
| 危险按钮 悬停 | `rgb(207,34,46)` | 2.95:1 ❌ | 5.36:1 ✅ |

**修法**：显式给彩色按钮内的标签补白色
（`button.suggested-action label, button.destructive-action label { color: #ffffff }`，
含 `:backdrop` / `:disabled` 变体）。

> 教训：本主题早先的对比度表是按 **CSS 声明值**算的（写着白字就算白字），
> 而非**实际渲染像素**。两者可以不一致 —— 静态校验全绿但真实观感是错的。
> 涉及文字可读性的结论，必须以渲染取样为准。

> 顺带说明：`.grouped-window-list-item-box:focus`（任务栏）仍是"focus 写在 hover 之后"，
> 这是深色版 Nebula **有意为之**（注释已写明"前台蓝底，靠后者胜"），保证前台窗口
> 始终保持强调色，故未改动。若你也希望任务栏前台窗口悬停时有反馈，可以再调。

另：**GTK4 未能做解析器级校验** —— 本机无 `libgtk-4-dev`、无 GTK4 的
Python/introspection 绑定，无法编译校验器。`gtk-4.0/gtk.css` 只做了
结构化静态校验（括号配平、`@define-color` 引用完整性、色值语法、
`url()` 资源存在性、禁用属性、占位注释）。首次启用 GTK4 应用时请留意。

---

## 校验结果

| 项 | 结果 |
|---|---|
| `index.theme` 被 Cinnamon 识别，名称显示 `Nebula-Light` | ✅ |
| `IconTheme=Papirus`（非 `Papirus-Dark`） | ✅ |
| 结构：目录完整，无缺失资源 | ✅ |
| `xmllint` XML 格式 | ✅ 通过 |
| Metacity 内部引用一致性（62 draw_ops / 4 geometry / 7 frame_style / 3 style_set / 8 window，常量与 include 全部可解析） | ✅ 通过 |
| 禁用属性扫描（`backdrop-filter` / `filter` / `var()`） | ✅ 0 处 |
| 占位注释（`/* ... */` 省略） | ✅ 0 处 |
| `@define-color` 引用完整性（GTK3/GTK4） | ✅ 51 项全部有定义 |
| GTK3 解析器实跑（`Gtk.CssProvider.load_from_data`） | ✅ 0 error |
| 文本对比度 ≥ 4.5:1（22 组组合**按渲染像素**复核，含彩色按钮白字） | ✅ 全部达标 |
| 合成背景不亮于 `#ffffff`、不暗于 `#e8ecf0` | ✅ 面板/菜单/窗口底均达标 |
| 面板底边框可见 | ✅ 描边行 `rgb(215,211,230)` vs 面板底 `rgb(239,240,245)` |
| 开始菜单 12px 圆角 + 半透明 + 柔和阴影 | ✅（St `box-shadow` 生效） |
| 按钮三态视觉区分，悬停方向为变暗 | ✅ |
| 输入框边框在白色窗口内可见，聚焦出现蓝色描边 | ✅ |
| 滚动条滑块在浅色内容区可辨识 | ✅ |
| 主按钮白字对比度 | ✅ 5.19:1 |
| 复选/单选四态字形 | ✅ |
| 浮层描边独立色板 `@nebula_float_border` | ✅ 5 处，可见度 1.20:1 → 1.66:1 |
| 与 Nebula-Dark 规则覆盖率 | ✅ gtk-3.0 384/384、gtk-4.0 256/256、cinnamon 292/292 |
| 控件密度与 Nebula-Dark 一致(15+ 处 padding) | ✅ 逐项核对 |
| 焦点环画在内侧、不侵占相邻控件 | ✅ 渲染实测(linked entry + spinbutton) |
| spinner 转圈动画(逐帧像素比对, 0 → ~1185/帧) | ✅ |
| `process-working-symbolic` 在 5 种图标主题下均可解析 | ✅ |
| 预览图尺寸与 Nebula-Dark 对齐（三张逐点核对） | ✅ 240x70 / 240x70 / 480x270 |
| 设置面板 GtkFrame 选框可见(应用程序/桌面两行) | ✅ 截图确认 |
| 对话框按钮 悬停高亮（focus+hover 下 `:hover` 胜出，按属性独立求解级联验证） | ✅ 4/4 |
| 任务栏 applet「从面板删除」确认框 取消/确认 悬停高亮 | ✅ 级联验证（规则同源） |
| 关机对话框「确定」危险按钮 悬停高亮 | ✅ 级联验证（规则同源） |
| 焦点环与按钮填充色协调（红/蓝底用白环，浅灰底用蓝环） | ✅ 渲染取样 3.81:1 / 3.89:1 |
| 彩色按钮文字为白字（修复前实为深字 2.95–3.34:1） | ✅ 渲染取样确认，最亮像素 (254,253,254) |

### 对比度实测明细（合成后）

| 组合 | 合成背景 | 对比度 |
|---|---|---|
| 主文字 / 窗口底 | `rgb(255,255,255)` | 15.80:1 |
| 主文字 / 菜单底 | `rgb(248,249,251)` | 15.03:1 |
| 次级文字 / 窗口底 | `rgb(255,255,255)` | 5.25:1 |
| 次级文字 / 菜单底 | `rgb(248,249,251)` | 4.99:1 |
| 强调色 / 窗口底 | `rgb(255,255,255)` | 5.19:1 |
| 主文字 / 按钮默认 | `rgb(244,246,248)` | 14.65:1 |
| 主文字 / 按钮悬停 | `rgb(227,231,235)` | 12.71:1 |
| 主文字 / 菜单项悬停 | `rgb(240,243,246)` | 14.13:1 |
| 主文字 / 选中行 | `rgb(206,225,248)` | 11.84:1 |
| 主文字 / 选中行悬停 | `rgb(176,207,243)` | 9.84:1 |
| 白字 / 主按钮默认（95%） | `rgb(21,113,220)` | 4.77:1 |
| 白字 / 主按钮悬停（实色） | `rgb(9,105,218)` | 5.19:1 |
| 白字 / 危险按钮默认（90%） | `rgb(212,56,67)` | 4.73:1 |
| 白字 / 危险按钮悬停（实色） | `rgb(207,34,46)` | 5.36:1 |
| 主文字 / 取消·确认 悬停 | `rgb(227,231,235)` | 12.71:1 |
| 主文字 / 取消·确认 按下 | `rgb(247,249,250)` | 14.93:1 |
| 主文字 / infobar 错误 | `rgb(245,211,213)` | 11.40:1 |
| 主文字 / infobar 警告 | `rgb(235,225,204)` | 12.13:1 |
| 次级文字 / 按钮禁用 | `rgb(249,250,251)` | 5.02:1 |

---

## 设计要点

1. **通透优先**：面板 70%、窗口 90%、菜单 80%，避免纯色大色块。
2. **层次靠描边与阴影**：浅色下明度差空间被压缩，层级主要依赖边框 + 低 alpha 投影
   （`0.10`–`0.14`；黑色阴影在浅底上视觉重量大，用 `0.3` 会发脏）。
3. **悬停态变暗**：与深色版方向相反 —— 浅色下悬停必须比默认更深才有"被选中"的实感。
4. **白底手柄加描边**：滑杆与开关的白色手柄在浅灰轨道上会消失，故补 1px 描边。
5. **桌面图标投影反色**：深色文字配浅色投影（`rgba(255,255,255,0.85)`），
   否则深壁纸上完全看不清。

## 已知限制

- 浅色半透明在**深色壁纸**上会失效（见开头）。
- 未开窗口特效时，菜单/通知背后内容会透出（0.80 不透明度下文字仍可读，
  但观感偏"噪"）。开模糊即解决。
- Metacity 不支持 `rgba`，窗口边框用的是色板的**实色**等价值，
  半透明由 GTK CSD 侧呈现；非 CSD 应用（自己画边框的）不会出现透明边框。
- GTK4 部分未做解析器级校验（见上）。
