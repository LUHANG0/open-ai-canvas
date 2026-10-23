# 影策共享 UI 组件层

`web/src/components/ui/` 下的自研组件层。规范全文见仓库 `docs/plans/ui-design-system.mdx`（组件编写规范）与 `docs/plans/ui-kit-rollout-plan.mdx`（实施计划）、决策记录 `docs/adr/0008-ui-component-layer-antd-replacement.md`。本文是目录内速查版。

## 分层

| 层          | 目录              | 内容                                                                                         |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------- |
| base        | `ui/base/`        | 原语 + 基础件：`buttons/`、`badges/`、`kbd/`、`segmented-control/` 等                        |
| product     | `ui/product/`     | 跨页面模式件：`empty-state/`、`callout/`、`loading-state/`、`section-card/`、`property-row/` |
| fx          | `ui/fx/`          | 特效件（原 `aceternity/*` 归位至此命名空间，引用随用随迁，不重写）                           |
| application | `ui/application/` | 产品块（P3 起）：agent-chat、notification-center、app-shell 等                               |

当前全站统一合同见 `docs/plans/ui-unification-work-plan.mdx`。实际值以加载中的 `styles/globals.css`、`styles/unified-buttons.css`、`styles/unified-inputs.css`、`styles/workspace-product.css` 和 `lib/app-theme.ts` 为准。历史设计稿或机器上的兄弟目录不能替代当前实现。

## 目录与导出

- 每"族"一目录（`base/badges/`），族内按文件拆变体；族级 `index.ts` 汇总导出（组件 + `XxxVariants` 类型）；**无全局 barrel**。
- 导入一律深路径 `@/components/ui/<layer>/<family>`；组件 `PascalCase`、文件 `kebab-case.tsx`、目录 `kebab-case/`。
- 变体用 cva（`class-variance-authority`）定义并从 `index.ts` 导出类型；`className` 经 `cn` 合并；ref 转发；根元素 `data-slot`。

## 硬性纪律

1. 样式只消费三层 token（`var(--*)` 或经 `@theme` 映射的工具类，如 `bg-surface`、`text-caption`、`text-status-success`）；**禁止裸 `text-[Npx]`/`rounded-[Npx]`/十六进制色值**。字号/行高用注册排版工具类或 token 引用。
2. 明暗自适应由 CSS 变量完成，不读皮肤 ID；持久切换 `aria-pressed` + `data-active`，保留 `:focus-visible`，尊重 `prefers-reduced-motion`。
3. 图标以 lucide 组件引用传入（`icon={Move}`），尺寸/颜色由宿主组件决定，禁止调用方传 icon className 改尺寸。
4. 组件头注释注明：用途、消费 token 组、对标/接管对象（AntD 组件或参考系统组件）、明暗差异要点。

## 进库门槛

新组件必须满足其一：① ≥2 处真实重复（PR 附 grep 证据）；② 隔离明确协议/交互契约。纯透传壳不进库。

## 当前族目录

- `base/kbd/` — Kbd（快捷键提示键帽）
- `base/badges/` — StatusBadge（状态点徽章；NodeTypeBadge 规划中）
- `base/buttons/` — IconButton / ToolButton（IconButton 含 ghost/default/outline/solid/danger 变体；ButtonGroup 规划中）
- `base/segmented-control/` — SegmentedControl（分段单选，原地中性选中，泛型 + block/size）
- `base/checkbox/` — Checkbox + CheckboxGroup（原生 input + 自绘 glyph，checked/indeterminate/bare）
- `base/select/` — Select（AntD 完整选择实现，支持单选 / 多选 / 搜索 / 受控 open / ref）
- `base/tooltip/` — Tooltip（RAC 浮层，AntD 8 向 placement 映射，title 空不渲染）
- `base/switch/` — Switch（button role=switch + data-state，checkedChildren 文本轨、loading、Form.Item 注入）
- `product/empty-state/` — EmptyState（空态占位）
- `product/callout/` — Callout
- `product/app-modal/` — AppModal（产品弹窗壳，`flush` 去掉 AntD 默认内边距）
- `product/app-drawer/` — AppDrawer（产品侧栏壳）

## M0 公共 API

普通文字按钮沿用 `import { Button } from "antd"`，主要命令使用 `type="primary"`，过滤按钮使用 `aria-pressed`；不要为统一视觉再包一层纯透传 Button。Checkbox / Radio / Switch 的状态仍使用自身语义。

```tsx
import { IconButton, ToolButton } from "@/components/ui/base/buttons";
import { Select } from "@/components/ui/base/select";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { AppModal } from "@/components/ui/product/app-modal";
import { AppDrawer } from "@/components/ui/product/app-drawer";
```

| API | 保留的合同与变体 |
| --- | --- |
| IconButton | icon 为 Lucide 组件；xs / sm / default / lg 分别 24 / 28 / 32 / 36px；ghost / default / outline / danger / solid；原生 button props、ref、loading、aria-label。solid 使用主要命令颜色，active 使用普通选中颜色。传 active={false} 明确表达未按下；普通命令不传 active。显式 aria-* 仍优先。 |
| ToolButton | icon 为 ReactNode；children 和 label 均可显示，label 优先；count（包括 0）渲染为辅助计数。原生 props / ref；active 对应 aria-pressed，expands 对应 aria-expanded，false 不被丢弃。尺寸仍为 24 / 28 / 32 / 36px，不放大紧凑工具。 |
| Select | 完整 AntD SelectProps 泛型及 RefSelectProps；size 别名 sm=small、md=middle，也支持 small / middle / large；appearance=pill（默认）/ soft / field；variant 默认 filled；ariaLabel 兼容且优先于 aria-label。multiple / tags、搜索、表单、open / defaultOpen、onOpenChange 和移动锚点收起保持原实现。 |
| SegmentedControl | value / onChange / options / block / disabled / ariaLabel / className；sm 整组高 28px、md 高 32px。radiogroup / radio，方向键循环并跳过禁用项，Home / End，单一 Tab 入口。indicator 仅保留类型兼容，slide / static 均为原地反馈；禁用不清除选中值。 |
| AppModal | 完整 ModalProps + flush；默认 destroyOnHidden=true，可显式覆盖；flush 只统一 container / body 内边距。函数和对象 styles 均保留，自动合并 app-ui-modal 与调用方 rootClassName。 |
| AppDrawer | 完整 DrawerProps + flush；默认 destroyOnHidden=true，可显式覆盖；flush 只清 body 内边距；自动合并 app-ui-drawer 与调用方 rootClassName。 |

以上原生按钮直接使用 :focus-visible；不依赖按钮先收到 keydown 才显示焦点，也不主动 blur。业务 onClick / onKeyDown / onPointerDown / onBlur 与 ref 直接传给原生元素。加载时禁用，保留 aria-busy；系统减少动态效果时 spinner 停止旋转。

SegmentedControl 的 onChange 仅在目标值与受控 value 不同时通知一次。重复点击当前项、Home / End 指向当前项，或只有一个可用项时按方向键，都保留焦点和键盘行为但不通知；禁用项 / 整组禁用不通知。不得依靠同值回调重置表单、验证码、计费或配置，也不应在各页面增加重复防御来替代共享合同。

## Tabs 与过滤的共用视觉层

共享 CSS 已随 globals.css → primary-buttons.css → unified-buttons.css 加载，无需额外 import。使用 `.app-control-group` 作为轨道，直接子项 `data-slot="control-item"`；可选 `data-density="compact"`。不新增状态管理或强制替换页面现有键盘处理。Tabs 和过滤的接入由页面组负责，M0 没有修改其页面。

```tsx
// 标签页：保留现有方向键 / Home / End、roving tabIndex、ID 与 panel 关联。
<div className="app-control-group" role="tablist" aria-label="技能库范围">
  <button data-slot="control-item" role="tab" id="public-tab"
    aria-controls="public-panel" aria-selected={active === "public"}
    tabIndex={active === "public" ? 0 : -1} onClick={() => setActive("public")}>
    <Library aria-hidden /><span data-slot="control-label">技能广场</span>
    <span data-slot="control-count">{count}</span>
  </button>
  {/* 其他 tab 使用同一结构；页面原有 keyboard handler 继续放在 tablist / tab 上。 */}
</div>
<section role="tabpanel" id="public-panel" aria-labelledby="public-tab" hidden={active !== "public"} />

// 过滤：可多项或单项；保持业务原有过滤策略，使用原生按钮键盘激活。
<div className="app-control-group" role="group" aria-label="插件状态">
  <button type="button" data-slot="control-item" aria-pressed={enabledOnly}
    onClick={() => setEnabledOnly(!enabledOnly)}>
    <Check aria-hidden /><span data-slot="control-label">已启用</span>
    <span data-slot="control-count">{enabledCount}</span>
  </button>
</div>
```

两种状态分别消费 aria-selected 和 aria-pressed；SegmentedControl 自身复用同一视觉层，但仍为 radio。无移动指示背景。轨道为中性实底、1px `--border`、`--r-lg` 圆角；单项高 `--control-item-height`=32px（compact 28px），两侧 12px（compact 10px），图文间距 6px，图标 16px，标签 14px（compact 12px），计数 12px。计数使用同一中性表面和等宽数字。轨道 2px 内边距 / 间距、横向溢出局部滚动，焦点环向内绘制，避免被滚动外壳裁掉。Segmented 原有 28 / 32px 整组高度保持。

## token、作用域与迁移

- `--control-motion-duration: 150ms`；`--control-state-transition` 只含 background-color / color / border-color。AntD theme 需要具体时长，使用同值 0.15s。减少动态效果时原生共享控件过渡为 0；工作区 AntD 生命周期动画保留 1ms 完成回调，普通过渡为 0。
- 主要命令：`--button-primary-bg / -hover-bg / -active-bg / -fg`；普通选中：`--control-selected-bg / -hover-bg / -fg`；焦点：`--control-focus-ring`。不拿实色主命令表达过滤选中；不把 Switch 颜色改成普通选中颜色。
- 原生按钮焦点环 2px / offset 2px；输入及 Select 焦点边界 1px / offset 2px。输入前后缀与数字输入只由最外层画一次焦点边界。浏览器可在文本输入的指针聚焦时判定 :focus-visible，遵守原生判断。
- 根 AntD 通用默认 36px / radius 6；普通工作区 38px / radius 12。紧凑工具维持自身档位，后台独立 theme 默认 32px / radius 6，由 D 组继续迁移其内部反馈时长，M0 未改 Admin* 文件。
- 自动 app-ui-modal / app-ui-drawer 仅提供稳定根命名空间，不改变弹窗尺寸、定位、表单和销毁行为。页面私有浮层规则通过 rootClassName 定位；不要依赖页面 DOM 祖先。body portal 不继承页面局部 CSS 变量，需在实际浮层根定义；ConfigProvider 上下文则会跨 portal 传递。
- 字体沿用 `--font-sans` / `--font-mono`；字体级别、边框、材质、圆角均引用现有 token。不要修改只存在于 globals-1/2/3 等未被 import 的副本。

迁移时删除目标页面旧的滑动层、重复皮肤和事件装饰，再接共享槽位；保持业务状态和权限判断不变。不要通过新增页面白名单、button:has(svg) 或全局 AntD 状态补丁解决冲突。页面私有动画、后台独立 theme、完整非空和错误状态仍由后续阶段验收。
