# PyScript Launcher - 规格说明书

## 1. 项目概述

**项目名称**：PyScript Launcher
**项目类型**：Windows 桌面应用（Tauri + Next.js）
**核心功能**：可视化 Python 脚本管理平台，支持自动参数识别、并行执行、LLM 智能助手
**目标用户**：需要频繁运行 Python 脚本的开发者/数据科学家

---

## 2. UI/UX 规格

### 2.1 布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│  标题栏：PyScript Launcher                        [─] [□] [×]   │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    LLM 助手对话区                          │  │
│  │  （可展开/收起，默认收起，高度 200px）                      │  │
│  └───────────────────────────────────────────────────────────┘  │
├────────────────┬────────────────────────────────────────────────┤
│                │                                                 │
│   脚本列表     │                主内容区                          │
│   （宽度:      │                                                 │
│    280px）     │   - 欢迎页（无选中脚本）                        │
│                │   - 参数表单（选中脚本）                         │
│  [+ 添加脚本]  │   - 运行面板（运行中）                          │
│                │                                                 │
│  ┌──────────┐  │                                                 │
│  │ 🟢 s1.py │  │                                                 │
│  │ 🟡 s2.py │  │                                                 │
│  │ 🔴 s3.py │  │                                                 │
│  └──────────┘  │                                                 │
│                │                                                 │
├────────────────┴────────────────────────────────────────────────┤
│  状态栏：Python: 3.11 | 脚本数: 3 | 运行中: 1        [设置]    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 视觉设计

**配色方案（Dark Mode）**
| 元素 | 颜色 |
|------|------|
| 背景（主） | `#0f0f0f` |
| 背景（次） | `#1a1a1a` |
| 背景（卡片） | `#242424` (80% 透明度 + 毛玻璃) |
| 主强调色 | `#7c3aed` (紫色) |
| 主强调色（悬停） | `#8b5cf6` |
| 成功 | `#22c55e` |
| 警告 | `#eab308` |
| 错误 | `#ef4444` |
| 文本（主） | `#fafafa` |
| 文本（次） | `#a1a1aa` |
| 边框 | `#3f3f46` |

**毛玻璃效果**
```css
background: rgba(36, 36, 36, 0.8);
backdrop-filter: blur(12px);
border: 1px solid rgba(63, 63, 70, 0.5);
```

**动画**
- 过渡时长：200ms
- 缓动函数：cubic-bezier(0.4, 0, 0.2, 1)
- 列表项：交错淡入（stagger 50ms）
- 按钮悬停：scale(1.02)
- 状态变化：颜色渐变

**字体**
- 主字体：`Geist`（Next.js 默认）
- 代码/输出：`Geist Mono` 或 `JetBrains Mono`
- 字号：14px（正文）、12px（次要）、16px（标题）

### 2.3 组件规格

**脚本列表项**
```
┌─────────────────────────────────────────┐
│ [状态图标] script_name.py         [⋮]  │
│              venv: myenv        运行中 │
└─────────────────────────────────────────┘
```
- 状态图标：绿色圆点（空闲）、黄色转动（运行中）、红色叉（失败）
- 右侧菜单：运行、编辑、删除

**参数表单**
- 每个参数一行
- 左侧标签（docstring 第一行 / 参数名）
- 右侧输入控件根据类型：
  - `str` → 文本输入
  - `int/float` → 数字输入
  - `bool` → 开关
  - `List[x]` → 逗号分隔输入
- 默认值：预填充，不可编辑时置灰

**运行面板**
```
┌─────────────────────────────────────────┐
│ script.py - 运行中...            [停止] │
├─────────────────────────────────────────┤
│ 输出日志（可滚动，自动滚动到底部）       │
│ ─────────────────────────────────────── │
│ 10:30:01 [INFO] Loading data...        │
│ 10:30:02 [INFO] Processing 1000 rows   │
└─────────────────────────────────────────┘
```

**LLM 助手面板**
```
┌─────────────────────────────────────────┐
│ 🤖 LLM 助手                           [×]│
├─────────────────────────────────────────┤
│ [对话历史滚动区]                        │
│                                          │
├─────────────────────────────────────────┤
│ > [输入框...              ] [发送]      │
└─────────────────────────────────────────┘
```

**设置弹窗**
```
┌─────────────────────────────────────────┐
│ 设置                              [×]   │
├─────────────────────────────────────────┤
│ Python 路径                              │
│ [________________________] [浏览]       │
│                                          │
│ LLM 配置                                 │
│ API Key: [________________________]      │
│ Base URL: [________________________]     │
│ Model: [gpt-4o__________________]       │
│                                          │
│ [取消]                      [保存]       │
└─────────────────────────────────────────┘
```

---

## 3. 功能规格

### 3.1 核心功能

#### 3.1.1 脚本管理

**添加脚本**
1. 点击 "+ 添加脚本"
2. 弹出文件选择器（过滤 .py 文件）
3. 选择脚本后：
   - 解析脚本参数（inspect + ast）
   - 解析 docstring（参数说明）
   - 解析虚拟环境（查找同目录 `venv/` 或 `.venv/` 或 `pyproject.toml`）
4. 保存到 SQLite

**编辑脚本**
- 修改脚本路径
- 手动指定虚拟环境路径
- 编辑/添加/删除参数默认值

**删除脚本**
- 确认对话框
- 从数据库删除

#### 3.1.2 参数自动识别

**识别逻辑**
```python
import inspect
import ast

def parse_script_params(script_path: str) -> list[dict]:
    """
    返回参数列表：
    [
      {
        "name": "data_path",
        "type": "str",
        "default": None,
        "doc": "数据集路径"
      },
      {
        "name": "epochs",
        "type": "int",
        "default": 10,
        "doc": "训练轮数"
      }
    ]
    """
```

**类型映射**
| Python 类型 | UI 控件 |
|-------------|---------|
| `str` | 文本输入 |
| `int` | 数字输入（整数） |
| `float` | 数字输入（浮点） |
| `bool` | 开关 |
| `List[str]` | 逗号分隔文本 |
| `Path` | 文本输入 + 浏览按钮 |

#### 3.1.3 脚本执行

**执行流程**
1. 激活虚拟环境（`uv venv` 存在则激活，否则用系统 Python）
2. 安装依赖（可选：`uv pip install -r requirements.txt`）
3. 启动子进程运行脚本
4. 实时捕获 stdout/stderr
5. 记录日志到 SQLite

**并行执行**
- 每个脚本独立进程
- 使用 Python `multiprocessing` 或 `subprocess`
- 进程池管理

**强制终止**
- 点击停止按钮
- 发送 SIGTERM（然后 SIGKILL）
- 更新状态为"已终止"

#### 3.1.4 LLM 助手

**集成方式**
- 兼容 OpenAI API 格式
- 支持任意 OpenAI 兼容后端

**参数填充流程**
```
用户输入: "用 test.csv 训练，用 20 个 epoch"
    ↓
构建 prompt（含脚本参数 schema + 用户输入）
    ↓
调用 LLM
    ↓
解析返回 JSON，填充表单
    ↓
用户确认/修改 → 运行
```

**Prompt 模板**
```
你是一个 Python 脚本参数填充助手。

脚本信息：
- 名称：{script_name}
- 参数：
{params_schema}

用户需求：{user_input}

请返回 JSON 格式的参数值：
{{
  "data_path": "test.csv",
  "epochs": 20
}}

只返回 JSON，不要其他内容。
```

### 3.2 数据流

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│  Tauri IPC   │────▶│  Python     │
│  (React)    │◀────│  (Commands)  │◀────│  (Backend)  │
└─────────────┘     └──────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
              ┌─────────┐               ┌───────────┐
              │ SQLite  │               │  Subprocess │
              │ (配置/  │               │  (执行脚本) │
              │  脚本)  │               └───────────┘
              └─────────┘
```

### 3.3 数据库 Schema

```sql
-- 脚本配置
CREATE TABLE scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    venv_path TEXT,
    params_json TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 应用设置
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 运行日志
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    script_id INTEGER,
    level TEXT NOT NULL CHECK(level IN ('INFO', 'WARNING', 'ERROR')),
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);
```

### 3.4 Tauri Commands

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get_scripts` | - | `Script[]` | 获取所有脚本 |
| `add_script` | `path: string` | `Script` | 添加脚本 |
| `update_script` | `id, params` | `Script` | 更新脚本 |
| `delete_script` | `id: number` | `void` | 删除脚本 |
| `run_script` | `id: number, args: dict` | `void` | 运行脚本 |
| `stop_script` | `id: number` | `void` | 停止脚本 |
| `get_settings` | - | `Settings` | 获取设置 |
| `save_settings` | `settings: dict` | `void` | 保存设置 |
| `llm_chat` | `messages: ChatMessage[]` | `string` | LLM 对话 |

---

## 4. 验收标准

### 4.1 功能验收

- [ ] 可以添加 Python 脚本（通过文件选择器）
- [ ] 自动识别脚本参数并生成表单
- [ ] 可以手动编辑参数默认值
- [ ] 可以指定/修改虚拟环境路径
- [ ] 可以并行运行多个脚本（勾选后运行）
- [ ] 可以强制终止运行中的脚本
- [ ] 实时显示脚本输出
- [ ] LLM 可以根据自然语言填充参数
- [ ] 设置可以保存到 SQLite
- [ ] 日志正确记录

### 4.2 UI 验收

- [ ] 深色主题 + 紫色强调色
- [ ] 毛玻璃效果
- [ ] 流畅动画
- [ ] 状态图标正确显示
- [ ] 响应式布局

### 4.3 打包验收

- [ ] 成功构建 .exe 文件
- [ ] 双击可以直接运行
- [ ] 窗口可以正常关闭/最小化/最大化

---

## 5. 技术栈

| 组件 | 技术 |
|------|------|
| 前端框架 | Next.js 16 + React 19 |
| 桌面框架 | Tauri 2.9 |
| 样式 | Tailwind CSS v4 + CSS Variables |
| UI 组件 | shadcn/ui |
| 状态管理 | Zustand |
| 后端语言 | Python 3.11+ |
| 环境管理 | uv |
| 数据库 | SQLite (sqlite3) |
| LLM SDK | openai |
