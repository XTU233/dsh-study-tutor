# 学习教练 · dsh-study-tutor

把「对初学者不友好」的学习资料变成一条能走通的学习路径：先确认你到底会什么，再补齐缺失的前置，最后按你的理解方式讲清楚。

## 它做什么

1. **读资料**：视频、音频、PDF、Office、电子书、图片、字幕、压缩包、代码、纯文本；聊天附件或本地路径都行。
2. **切片与转写**：视频按场景切分抽关键帧、抽音轨切成 16k 单声道、交给本机语音服务转写（带时间戳）；PDF 逐页抽文本并渲染页面；幻灯片逐页取文字与页面图。
3. **公式人类可读化**：所有公式归一成 LaTeX 后三轨输出——浏览器 MathML（可缩放、可朗读）、PNG（聊天与导出）、纯文本读法（`\frac{a}{b}` → `(a)/(b)`、`\int_0^1` → `∫[0,1]`、`x^2` → `x²`）。
4. **确认知识边界（多轮）**：逐概念记录 0–3 级掌握度与证据。每一轮结束都复盘「哪些概念只问了一遍」「还有谁没问」「回答里暴露了什么新未知」，至少三轮后才允许锁定；无法再问出结果的概念显式标为「要教」的缺口。
5. **建前置知识图谱**：材料内的概念与被跳过的前置分别标注，缺口/半懂/已掌握一眼可见。点任一节点会点亮它**整条前置链**（节点与连线一起），一眼看清「学这个之前要先会什么」。
6. **建本地向量知识库**：边界锁定后切片、嵌入、建混合索引（BM25 + 稠密向量），供后续讲解与追问引用原文。
7. **授课**：按拓扑序一概念一课，含类比、最小例子、检查题；跨步骤的概念配等宽字符示意图；讲法借鉴自资料与权威来源。
8. **导出**：`study-notes.md`、单文件自包含 `study.html`（离线公式、内联图谱、离线检索）、`study.json`。

## 界面

会话内新增「学习」页签，七个分区：概览、资料与媒体、边界、图谱（依赖图 / 思维导图）、知识库（检索）、课程、来源与导出。样式只用主题令牌，跟随明暗主题与中英文切换。

## 工具

| 工具 | 作用 |
| --- | --- |
| `study_ingest` | 读一份资料（路径或附件），视频/音频自动切片抽帧与转写 |
| `study_research` | 检索/登记权威来源 |
| `study_material` | 记录资料卡与教学法 |
| `study_boundary` | 写入知识边界证据；`lock: true` 需通过多轮问询闸门才会生效 |
| `study_graph` | 写入节点、前置边、补齐顺序 |
| `study_lesson` | 写入课程（结构化块 + 等宽示意图） |
| `study_formula` | 批量渲染公式（MathML / PNG / 读法） |
| `study_index` | 构建/更新/查看向量知识库 |
| `study_search` | 混合检索，带页码/时间戳引用 |
| `study_state` | 读回完整状态（长对话必用） |
| `study_export` | 导出笔记 |

## 依赖与降级

仓库只含**代码与文档**。体积大、带独立许可证的第三方组件请在本地安装（`.gitignore` 已排除它们）：

| 组件 | 放置位置 | 获取方式 |
| --- | --- | --- |
| Python 依赖（PyMuPDF、onnxruntime、tokenizers、pypandoc_binary、numpy） | `tools/pylib/` | `python -m pip install --target tools/pylib -r requirements.txt` |
| ffmpeg + ffprobe | `tools/ffmpeg/` | 自行下载 GPL 构建；来源示例见该目录 `SOURCE.txt`（**本仓库不分发**） |
| BGE-small-zh-v1.5 量化 ONNX（512 维中文句向量） | `tools/model/bge-small-zh/` | 随仓库提供（23 MB） |
| Temml 0.14（MIT） | `vendor/` | 随仓库提供 |

Office/DOCX 页面渲染复用 DSH 桌面版自带的 LibreOffice Kit；语音识别复用本机 `sensevoice-local`（首次使用会下载模型，插件会先准备并回报进度）。

> ## ⚠️ 关于 ffmpeg 的许可证
> 仓库**不包含** ffmpeg 二进制。ffmpeg 的 GPL 构建若随包分发，会把 GPL 义务带进整个包，
> 所以本项目要求使用者自行获取，并在 `tools/ffmpeg/SOURCE.txt` 中记录来源与版本。
> 不带 ffmpeg 时插件仍可工作，只是无法抽帧与转写。

每一项都独立降级，缺失时只损失对应能力，并在「概览 → 环境能力」里标出：

| 缺失 | 影响 |
| --- | --- |
| ffmpeg | 视频不出分镜、音频不转写；文档与图片仍可处理 |
| pandoc | Office/电子书改走 LibreOffice 或 Python 库 |
| PyMuPDF | PDF 只能退化为文本抽取 |
| onnxruntime | 向量库自动回退到纯 numpy 的 LSA 嵌入 |
| LibreOffice | 公式退化为「读法 + MathML」，不出图片 |
| 语音服务 | 视频/音频只能靠内嵌字幕、旁车字幕或纯文本 |

## 配置

`cordis.patch.yml` 里可覆盖，全部可选：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `dataDir` | `%DSH_HOME%/study` | 缓存、公式图、导出、知识库的根目录 |
| `ffmpegDir` / `pandocPath` / `pythonPath` / `modelDir` / `libreofficeCli` | 自动探测 | 显式指定引擎 |
| `asrProvider` / `asrLanguage` | `sensevoice-local` / `zh` | 语音识别 |
| `asrPrepareTimeoutMs` | 1200000 | 模型下载与就绪的等待上限 |
| `audioChunkSeconds` | 60 | 音频切片长度（单片刻度约 1.9 MB） |
| `sceneThreshold` | 0.35 | 场景切分阈值，低阈值更敏感 |
| `maxShots` / `maxFramesPerCall` | 40 / 6 | 分镜上限；单次工具调用回传的图片数 |
| `maxVideoSeconds` / `maxFileBytes` | 7200 / 512MB | 上限保护 |
| `researchMaxSources` | 5 | 单次检索保留的来源数 |
| `allowedRoots` | `[]` | 额外允许读取的目录 |
| `promptSectionFallback` | `true` | 没有 skills 服务时用提示词段落兜底 |

## 安装

插件通过 `dsh.bundle` 声明自己是一个 profile 层，所以安装 = 加依赖 + 把包装进 `dsh.profile.bundles`。
仓库里的 `install.ps1` 把这两步做成带备份的幂等操作：

```powershell
# 先完全退出 DSH 桌面端
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Action install
# 重启 DSH，新开会话 → 会话视图出现「学习」页签
```

| 动作 | 作用 |
| --- | --- |
| `-Action status` | 只读检查：插件目录、依赖、bundle、node_modules 链接、可用备份数 |
| `-Action install` | 备份 → 加 `link:` 依赖 → 加入 `dsh.profile.bundles` |
| `-Action disable` | 只加 `disabled: true`，保留依赖，便于随时恢复 |
| `-Action rollback` | 还原最近一次备份的 `package.json` 与 `cordis.patch.yml` |

每一步改动前都会把原文件备份到 `<profile>\.study-tutor-backup\<时间戳>-<动作>\`，
回滚直接还原备份，不猜测、不合并。脚本只改这两个文件，不碰会话数据和其它插件。

> 装完如果客户端没出现页签，多半是 `node_modules` 里没有链接：在 profile 目录执行
> `dsh plugin --profile desktop install` 让它补一次。

## 隐私与成本

- 资料解析、抽帧、转写、嵌入、检索**全在本机完成**，不上传文件。
- 只有当你要求「联网查证」时才发起检索，检索用的是 Harness 自己的 web 服务配置。
- 知识库与导出都在 `dataDir` 下，可随时删除重建；它们都是**派生物**，真源始终是会话日志。

## 排障

| 现象 | 处理 |
| --- | --- |
| 没有「学习」页签 | 确认已重启 DSH；`-Action status` 里「已链接到 node_modules」应为 True |
| 视频没有关键帧 | 看「概览 → 环境能力」里 ffmpeg 是否就绪；只有单个转场时会提示 "one cut found"，属正常 |
| 转写为空 | 首次需下载语音模型，工具会返回准备进度；再次调用即可。也可放同名 `.srt` 旁车字幕 |
| PDF 只出图不出字 | 扫描版或字体无文字映射，工具会明确提示；本插件不带 OCR |
| 知识库建不起来 | 边界未锁定，先 `study_boundary` `lock: true`；并且要先 `study_ingest` 过资料 |
| 公式没有图片 | 需要 pandoc + 自带 LibreOffice Kit；读法与 MathML 仍可用 |
| 导出的 HTML 打不开 | 文件在 `dataDir/exports/<sessionId>/study.html`，路径会在导出结果里给出 |

## 已知限制

- **语音识别**依赖本机 `sensevoice-local` 服务；没有该服务时视频转写只走字幕轨/旁车字幕。
- **公式 PNG** 依赖 DSH 桌面版自带的 LibreOffice Kit；缺失时退化为 MathML + 读法。
- **OCR 未内置**：扫描版 PDF 只能得到页面图与明确提示。
- **无浏览器渲染验证**：本机没有浏览器控制能力，客户端以真实 cordis 语义的测试替身
  验证了注册与标签，未做像素级视觉验证。

## 卸载

在 Plugins 页停用，或跑 `.\install.ps1 -Action rollback`；`dataDir` 下的缓存可手动删除。

