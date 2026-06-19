# 云溪绘本工具

一个轻量的本地绘本生成工具原型，适合快速产出儿童绘本草稿。当前默认配置为：

- 文本生成：**阿里云百炼 / 千问（Qwen）** `qwen-plus`
- 插图生成：默认 **阿里云百炼 / 千问** `qwen-image-2.0-pro`
- 插图生成也可切换到 **OpenAI Images API**（例如 `gpt-image-1`）

## 功能

- 输入绘本标题、主角、目标、场景、阻碍、页数、风格、配色
- 一键生成故事简介、四段式大纲、逐页文案
- 自动生成每页 AI 配图提示词
- 支持逐页编辑
- 支持 AI 生成封面与批量生成逐页插图
- 支持上传人物参考图，在封面和逐页插图生成时尽量保持角色形象一致
- 支持本地草稿保存
- 支持导出 Markdown / JSON / PDF

## 启动方式

### 默认：千问生图

```bash
cd /Users/bytedance/Documents/yunxicartoon
export DASHSCOPE_API_KEY=你的百炼_API_Key
npm install
npm start
```

### 切换为 OpenAI 生图

```bash
cd /Users/bytedance/Documents/yunxicartoon
export DASHSCOPE_API_KEY=你的百炼_API_Key
export AI_IMAGE_PROVIDER=openai
export OPENAI_API_KEY=你的_OpenAI_API_Key
export OPENAI_IMAGE_MODEL=gpt-image-1
npm install
npm start
```

启动后访问：

- [http://localhost:8080](http://localhost:8080)

## 服务重启

```bash
cd /Users/bytedance/Documents/yunxicartoon
npm run restart
```

可选：临时指定端口后重启

```bash
cd /Users/bytedance/Documents/yunxicartoon
PORT=8081 npm run restart
```

## 可选环境变量

- `PORT`：服务端口，默认 `8080`
- `AI_IMAGE_PROVIDER`：图片提供方，`dashscope` 或 `openai`，默认会优先用 `openai`（若检测到 `OPENAI_API_KEY`），否则用 `dashscope`
- `DASHSCOPE_API_KEY`：百炼 API Key
- `DASHSCOPE_BASE_URL`：OpenAI 兼容模式地址，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `DASHSCOPE_TEXT_MODEL`：文本模型，默认 `qwen-plus`
- `DASHSCOPE_IMAGE_MODEL`：图片模型，默认 `qwen-image-2.0-pro`
- `DASHSCOPE_IMAGE_API_URL`：图片生成接口地址；不填时会根据 `DASHSCOPE_BASE_URL` 自动推导
- `OPENAI_API_KEY`：OpenAI API Key
- `OPENAI_BASE_URL`：OpenAI API 地址，默认 `https://api.openai.com/v1`
- `OPENAI_IMAGE_MODEL`：OpenAI 图片模型，默认 `gpt-image-1`
- `PDF_PYTHON_PATH`：导出 PDF 使用的 Python 路径

## 说明

- 项目当前内置的是 **故事生成 + 插图生成**，并支持在插图生成时传入人物参考图；还没有单独的 GIF / 动图接口。
- 如果你后面要把“动图 / 视频生成”也接入百炼，我可以继续帮你新增对应接口和前端按钮。

## Qwen-Image 本地部署（预备脚本）

已提供本地部署脚本：

```bash
cd /Users/bytedance/Documents/yunxicartoon
bash scripts/qwen-image/setup_qwen_image_env.sh
source .venv-qwen-image/bin/activate
python scripts/qwen-image/run_qwen_image.py "一只会飞的小狐狸，儿童绘本插画，温柔水彩风"
```

说明：首次运行会下载 Qwen-Image 模型权重，需预留较大磁盘空间。
