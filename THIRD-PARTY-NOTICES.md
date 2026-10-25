# 第三方组件声明 · Third-party notices

本仓库以 MIT 许可发布（见 [`LICENSE`](LICENSE)），该许可只覆盖本插件的原创代码。
下列组件各自保留其原有许可证，随仓库分发或由使用者在本地安装。

## 随仓库分发 · Redistributed here

| 组件 | 版本 | 许可证 | 位置 | 用途 |
| --- | --- | --- | --- | --- |
| [Temml](https://github.com/ronkok/Temml) | 0.14 | MIT | `vendor/` | LaTeX → MathML 渲染 |
| [bge-small-zh-v1.5](https://huggingface.co/BAAI/bge-small-zh-v1.5) | 量化 ONNX | MIT | `tools/model/bge-small-zh/` | 中文句向量嵌入 |
| [ffmpeg](https://ffmpeg.org/) / ffprobe 许可证与归属说明 | 6.1.1 | GPL-3.0 | `tools/ffmpeg/LICENSE`、`README.txt`、`SOURCE.txt` | 仅文本，二进制不分发 |

## 仅本地安装，不随仓库分发 · Installed locally, NOT redistributed

以下组件体积较大或带有传染性许可证，因此被 [`.gitignore`](.gitignore) 排除。
请按 [`requirements.txt`](requirements.txt) 自行安装：

| 组件 | 许可证 | 用途 | 安装方式 |
| --- | --- | --- | --- |
| ffmpeg / ffprobe 可执行文件 | GPL-2.0-or-later | 抽帧、音频转码 | 见 `tools/ffmpeg/SOURCE.txt` |
| pandoc | GPL-2.0-or-later | 文档格式转换 | `pypandoc_binary` |
| PyMuPDF / pymupdf4llm | AGPL-3.0 | PDF 文本与页面渲染 | `pip install -r requirements.txt` |
| onnxruntime | MIT | 本地向量推理 | 同上 |
| tokenizers | Apache-2.0 | 分词 | 同上 |

## 为什么不直接分发这些二进制

重新分发 `ffmpeg`、`pandoc`、`PyMuPDF` 会把它们的许可证义务（GPL 的源码提供要求、
AGPL 的网络使用条款）附加到整个发行包上。本仓库只跟踪许可证与来源说明文本
（`tools/ffmpeg/LICENSE`、`tools/ffmpeg/README.txt`、`tools/ffmpeg/SOURCE.txt`、
`tools/pandoc/COPYRIGHT.txt`），可执行文件本身一律不进版本库。

## 无 ffmpeg / pandoc 时的行为

插件会优雅降级而非崩溃：`resolveEngines()` 探测不到某个引擎时，相关能力
（视频抽帧、格式转换）会报告不可用，其余功能照常工作。
