import 'dotenv/config';
import express from 'express';
import OpenAI, { toFile } from 'openai';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 8080);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const TEXT_MODEL = process.env.DASHSCOPE_TEXT_MODEL || process.env.AI_TEXT_MODEL || 'qwen-plus';
const DASHSCOPE_IMAGE_MODEL = process.env.DASHSCOPE_IMAGE_MODEL || 'qwen-image-2.0-pro';
const IMAGE_PROVIDER = normalizeImageProvider(process.env.AI_IMAGE_PROVIDER || (OPENAI_API_KEY ? 'openai' : 'dashscope'));
const IMAGE_MODEL = IMAGE_PROVIDER === 'openai' ? OPENAI_IMAGE_MODEL : DASHSCOPE_IMAGE_MODEL;
const DASHSCOPE_IMAGE_API_URL = process.env.DASHSCOPE_IMAGE_API_URL || buildDashScopeImageApiUrl(DASHSCOPE_BASE_URL);
const PYTHON_CANDIDATES = [
  process.env.PDF_PYTHON_PATH,
  '/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
  'python3'
].filter(Boolean);

const qwenClient = DASHSCOPE_API_KEY
  ? new OpenAI({
      apiKey: DASHSCOPE_API_KEY,
      baseURL: DASHSCOPE_BASE_URL
    })
  : null;

const openaiImageClient = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL
    })
  : null;

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: 'hybrid',
    textProvider: 'dashscope-qwen',
    imageProvider: IMAGE_PROVIDER,
    hasApiKey: IMAGE_PROVIDER === 'openai' ? Boolean(OPENAI_API_KEY) : Boolean(DASHSCOPE_API_KEY),
    textModel: TEXT_MODEL,
    imageModel: IMAGE_MODEL,
    serverTime: new Date().toISOString()
  });
});

app.post('/api/generate-story', async (req, res) => {
  try {
    if (!qwenClient) {
      return res.status(503).json({
        error: '未检测到 DASHSCOPE_API_KEY。请先在启动前设置环境变量。'
      });
    }

    const brief = normalizeBrief(req.body?.brief || {});
    const prompt = [
      '请为儿童绘本生成完整内容。',
      '要求：',
      `1. 输出语言：简体中文。`,
      `2. 读者年龄：${brief.ageGroup}。`,
      `3. 总页数必须严格等于 ${brief.pageCount} 页。`,
      `4. 每页都要有 title、text、prompt、shot、emotion。`,
      '5. text 适合口语朗读，尽量 28~70 个汉字。',
      '6. prompt 是给 AI 绘图模型的中文提示词，要明确角色、场景、镜头、氛围和配色。',
      '7. outline 固定返回 4 项：开场、目标、挑战、结尾。',
      '8. 返回字段必须包含：summary、theme、lesson、coverPrompt、outline、pages。',
      '9. 只返回 JSON，不要解释，不要 markdown 代码块。',
      '',
      '以下是绘本需求：',
      JSON.stringify(brief, null, 2)
    ].join('\n');

    const response = await qwenClient.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: '你是一名资深儿童绘本策划编辑，同时也是插画分镜编剧。请严格按照用户给定页数输出一个结构完整、温暖、可直接用于绘本制作的 JSON。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const rawText = extractChatText(response).trim();
    const parsed = parseJsonFromModel(rawText);
    const book = normalizeAiBook(parsed, brief);

    res.json({
      ok: true,
      provider: 'dashscope-qwen',
      model: TEXT_MODEL,
      book
    });
  } catch (error) {
    console.error('generate-story error', error);
    res.status(500).json({
      error: 'AI 故事生成失败。',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const {
      prompt,
      size = '1024x1024',
      filename = 'picture-book-image',
      referenceImageDataUrl = ''
    } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '缺少 prompt。' });
    }

    const finalPrompt = buildImagePrompt(prompt, referenceImageDataUrl);
    let result;

    if (IMAGE_PROVIDER === 'openai') {
      try {
        result = await generateImageWithOpenAI({ prompt: finalPrompt, size, filename, referenceImageDataUrl });
      } catch (error) {
        if (shouldFallbackToDashScope(error) && DASHSCOPE_API_KEY) {
          console.warn('OpenAI 图片生成失败，自动回退到 DashScope：', error?.message || error);
          result = await generateImageWithDashScope({ prompt: finalPrompt, size, filename, referenceImageDataUrl });
          result.fallbackFrom = 'openai';
          result.fallbackReason = error?.message || 'OpenAI image generation failed';
        } else {
          throw error;
        }
      }
    } else {
      result = await generateImageWithDashScope({ prompt: finalPrompt, size, filename, referenceImageDataUrl });
    }

    res.json(result);
  } catch (error) {
    console.error('generate-image error', error);
    res.status(500).json({
      error: 'AI 插图生成失败。',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/export-pdf', async (req, res) => {
  try {
    const book = req.body?.book;
    if (!book?.meta?.title || !Array.isArray(book?.pages)) {
      return res.status(400).json({ error: '缺少 book 数据。' });
    }

    const outputDir = path.join(__dirname, 'output', 'pdf');
    const tmpDir = path.join(__dirname, 'tmp', 'pdfs');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const stamp = Date.now();
    const slug = slugify(book.meta.title || 'picture-book');
    const inputPath = path.join(tmpDir, `${slug}-${stamp}.json`);
    const outputPath = path.join(outputDir, `${slug}-${stamp}.pdf`);

    await fs.writeFile(inputPath, JSON.stringify(book, null, 2), 'utf8');
    const python = await resolvePython();

    await runCommand(python, [path.join(__dirname, 'scripts', 'generate_pdf.py'), inputPath, outputPath], {
      cwd: __dirname
    });

    const pdfBytes = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeRFC5987(`${slug}.pdf`)}`);
    res.send(pdfBytes);
  } catch (error) {
    console.error('export-pdf error', error);
    res.status(500).json({
      error: 'PDF 导出失败。',
      details: error?.message || String(error)
    });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`云溪绘本工具已启动：http://localhost:${PORT}`);
  console.log(`文本提供方：DashScope / 千问`);
  console.log(`图片提供方：${IMAGE_PROVIDER === 'openai' ? 'OpenAI' : 'DashScope / 千问'}`);
  console.log(`DASHSCOPE_API_KEY: ${DASHSCOPE_API_KEY ? '已检测到' : '未设置'}`);
  console.log(`OPENAI_API_KEY: ${OPENAI_API_KEY ? '已检测到' : '未设置'}`);
  console.log(`OpenAI 地址：${OPENAI_BASE_URL}`);
  console.log(`兼容模式地址：${DASHSCOPE_BASE_URL}`);
  console.log(`图片接口地址：${DASHSCOPE_IMAGE_API_URL}`);
  console.log(`文本模型：${TEXT_MODEL}`);
  console.log(`图片模型：${IMAGE_MODEL}`);
});

async function generateImageWithDashScope({ prompt, size, filename, referenceImageDataUrl = '' }) {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('当前图片提供方为 DashScope，但未检测到 DASHSCOPE_API_KEY。');
  }

  const content = [];
  const normalizedReferenceImage = normalizeReferenceImage(referenceImageDataUrl);
  if (normalizedReferenceImage) {
    content.push({ image: normalizedReferenceImage });
  }
  content.push({ text: prompt });

  const payload = {
    model: DASHSCOPE_IMAGE_MODEL,
    input: {
      messages: [
        {
          role: 'user',
          content
        }
      ]
    },
    parameters: {
      prompt_extend: true,
      watermark: false,
      n: 1,
      negative_prompt: '低分辨率，低质量，文字水印，脏污背景，畸形手指，额外肢体，画面杂乱',
      size: normalizeDashScopeImageSize(size)
    }
  };

  const dashscopeResponse = await fetch(DASHSCOPE_IMAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const result = await dashscopeResponse.json().catch(() => null);
  if (!dashscopeResponse.ok) {
    const message = result?.message || result?.error?.message || `图片接口请求失败：${dashscopeResponse.status}`;
    throw new Error(message);
  }

  const imagePayload = extractDashScopeImagePayload(result);
  const imageDataUrl = await normalizeGeneratedImage(imagePayload);
  const outPath = await saveImageDataUrl(imageDataUrl, filename);

  return {
    ok: true,
    provider: 'dashscope-qwen',
    model: DASHSCOPE_IMAGE_MODEL,
    revisedPrompt: imagePayload?.revised_prompt || imagePayload?.prompt || prompt,
    imageDataUrl,
    savedPath: outPath,
    size: payload.parameters.size
  };
}

async function generateImageWithOpenAI({ prompt, size, filename, referenceImageDataUrl = '' }) {
  if (!openaiImageClient) {
    throw new Error('当前图片提供方为 OpenAI，但未检测到 OPENAI_API_KEY。');
  }

  const normalizedReferenceImage = normalizeReferenceImage(referenceImageDataUrl);
  let result;

  if (normalizedReferenceImage) {
    const file = await referenceImageToOpenAiFile(normalizedReferenceImage);
    result = await openaiImageClient.images.edit({
      model: OPENAI_IMAGE_MODEL,
      image: file,
      prompt,
      size: normalizeOpenAIImageSize(size),
      quality: 'medium',
      output_format: 'png',
      input_fidelity: 'high'
    });
  } else {
    result = await openaiImageClient.images.generate({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: normalizeOpenAIImageSize(size),
      quality: 'medium',
      output_format: 'png'
    });
  }

  const imagePayload = result?.data?.[0] || null;
  const imageDataUrl = await normalizeGeneratedImage(imagePayload);
  const outPath = await saveImageDataUrl(imageDataUrl, filename);

  return {
    ok: true,
    provider: 'openai',
    model: OPENAI_IMAGE_MODEL,
    revisedPrompt: imagePayload?.revised_prompt || prompt,
    imageDataUrl,
    savedPath: outPath,
    size: normalizeOpenAIImageSize(size)
  };
}

async function normalizeGeneratedImage(imagePayload) {
  let imageDataUrl = null;
  const base64 = imagePayload?.b64_json || imagePayload?.base64 || imagePayload?.image_base64 || imagePayload?.base64_data;
  if (base64) {
    imageDataUrl = `data:image/png;base64,${base64}`;
  } else {
    const imageUrl = imagePayload?.url || imagePayload?.image_url || imagePayload?.image || imagePayload?.imageUrl;
    if (imageUrl) {
      const fetched = await fetch(imageUrl);
      if (!fetched.ok) {
        throw new Error(`生成成功，但下载图片失败：${fetched.status}`);
      }
      const arrayBuffer = await fetched.arrayBuffer();
      const mimeType = fetched.headers.get('content-type') || 'image/png';
      imageDataUrl = `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
    }
  }

  if (!imageDataUrl) {
    throw new Error('图片接口未返回可用图像数据。');
  }
  return imageDataUrl;
}

async function saveImageDataUrl(imageDataUrl, filename) {
  const outDir = path.join(__dirname, 'output', 'generated-images');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slugify(filename)}-${Date.now()}.png`);
  const imageBase64 = imageDataUrl.split(',')[1];
  await fs.writeFile(outPath, Buffer.from(imageBase64, 'base64'));
  return outPath;
}

function shouldFallbackToDashScope(error) {
  const code = String(error?.code || error?.error?.code || '').toLowerCase();
  const type = String(error?.type || error?.error?.type || '').toLowerCase();
  const message = String(error?.message || error?.error?.message || '').toLowerCase();

  return [
    code.includes('billing_hard_limit_reached'),
    code.includes('insufficient_quota'),
    type.includes('billing_limit_user_error'),
    message.includes('billing hard limit'),
    message.includes('insufficient quota')
  ].some(Boolean);
}

function normalizeImageProvider(value) {
  return String(value || 'dashscope').trim().toLowerCase() === 'openai' ? 'openai' : 'dashscope';
}

function normalizeBrief(input) {
  return {
    title: String(input.title || '未命名绘本'),
    hero: String(input.hero || '小主角'),
    goal: String(input.goal || '完成一个温暖的任务'),
    setting: String(input.setting || '发生在一个奇妙的地方'),
    conflict: String(input.conflict || '旅途中遇到一点困难'),
    ageGroup: String(input.ageGroup || '5-7岁'),
    style: String(input.style || '温柔水彩风'),
    pageCount: Math.max(6, Math.min(16, Number(input.pageCount) || 10)),
    palette: String(input.palette || '奶油黄、天蓝、珊瑚粉')
  };
}

function normalizeAiBook(book, brief) {
  const fallbackOutline = [
    { label: '开场', text: `${brief.hero}${brief.setting}，故事从一个轻柔又奇妙的日常开始。` },
    { label: '目标', text: `主角收到任务：“${brief.goal}”，决定鼓起勇气出发。` },
    { label: '挑战', text: `旅途中出现阻碍：${brief.conflict}。主角在困难中慢慢长大。` },
    { label: '结尾', text: `主角最终完成目标，也收获新的品质与友情。` }
  ];

  const pages = Array.from({ length: brief.pageCount }, (_, index) => {
    const source = Array.isArray(book?.pages) ? book.pages[index] || {} : {};
    const pageNumber = index + 1;
    return {
      pageNumber,
      title: String(source.title || `第 ${pageNumber} 页`),
      text: String(source.text || `${brief.hero}继续朝着“${brief.goal}”前进。`),
      prompt: String(source.prompt || `${brief.style}，${brief.palette}，${brief.hero}，${brief.setting}，儿童绘本插画。`),
      shot: String(source.shot || '中景互动镜头'),
      emotion: String(source.emotion || '温暖'),
      imageDataUrl: source.imageDataUrl || ''
    };
  });

  return {
    meta: brief,
    summary: String(book?.summary || `${brief.hero}${brief.setting}，为了“${brief.goal}”踏上旅程，并在克服“${brief.conflict}”后收获成长。`),
    theme: String(book?.theme || '勇敢与善良'),
    lesson: String(book?.lesson || '在帮助别人的路上，也会找到自己的力量。'),
    coverPrompt: String(book?.coverPrompt || `${brief.style}，儿童绘本封面，主角是${brief.hero}，故事主题为${brief.goal}，场景是${brief.setting}，主色${brief.palette}，温暖梦幻，适合儿童绘本。`),
    coverImageDataUrl: book?.coverImageDataUrl || '',
    outline: Array.isArray(book?.outline) && book.outline.length
      ? book.outline.slice(0, 4).map((item, index) => ({
          label: String(item?.label || fallbackOutline[index].label),
          text: String(item?.text || fallbackOutline[index].text)
        }))
      : fallbackOutline,
    pages
  };
}

function parseJsonFromModel(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('模型输出不是有效 JSON。');
  }
}

function extractChatText(response) {
  const firstChoice = response?.choices?.[0]?.message;
  if (!firstChoice) return '';
  if (typeof firstChoice.content === 'string') return firstChoice.content;
  if (!Array.isArray(firstChoice.content)) return '';
  return firstChoice.content
    .map((item) => item?.text || item?.content || '')
    .join('')
    .trim();
}

function buildImagePrompt(prompt, referenceImageDataUrl = '') {
  if (!referenceImageDataUrl) return prompt;
  return [
    '请严格参考输入图片中的人物外观与身份特征，保持同一个角色。',
    '允许根据儿童绘本风格进行插画化改编，但需尽量保留人物的脸型、发型、五官、服饰关键元素和整体辨识度。',
    prompt
  ].join('\n');
}

async function referenceImageToOpenAiFile(referenceImage) {
  const fetched = referenceImage.startsWith('data:image/')
    ? { ok: true, headers: new Headers({ 'content-type': getMimeTypeFromDataUrl(referenceImage) }), arrayBuffer: async () => decodeDataUrlToArrayBuffer(referenceImage) }
    : await fetch(referenceImage);

  if (!fetched.ok) {
    throw new Error('参考图下载失败，无法传给 OpenAI。');
  }

  const mimeType = fetched.headers.get('content-type') || getMimeTypeFromDataUrl(referenceImage) || 'image/png';
  const arrayBuffer = await fetched.arrayBuffer();
  return toFile(Buffer.from(arrayBuffer), `reference.${pickExtensionFromMimeType(mimeType)}`, { type: mimeType });
}

function decodeDataUrlToArrayBuffer(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Buffer.from(base64, 'base64');
}

function getMimeTypeFromDataUrl(dataUrl) {
  const matched = /^data:([^;]+);base64,/.exec(String(dataUrl || ''));
  return matched?.[1] || '';
}

function pickExtensionFromMimeType(mimeType) {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
}

function normalizeReferenceImage(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return '';
}

function extractDashScopeImagePayload(result) {
  const candidates = [];

  pushAll(candidates, result?.output?.results);
  pushAll(candidates, result?.results);
  pushAll(candidates, result?.output?.images);
  pushAll(candidates, result?.images);
  pushAll(candidates, result?.output?.choices);
  pushAll(candidates, result?.choices);

  for (const item of candidates) {
    if (!item) continue;

    if (item.url || item.image_url || item.image || item.imageUrl || item.b64_json || item.base64 || item.image_base64 || item.base64_data) {
      return item;
    }

    const message = item?.message || item?.output?.message;
    if (message?.content) {
      const blocks = Array.isArray(message.content) ? message.content : [message.content];
      for (const block of blocks) {
        if (!block) continue;
        if (typeof block === 'string') continue;
        if (block.url || block.image_url || block.image || block.imageUrl || block.b64_json || block.base64 || block.image_base64 || block.base64_data) {
          return block;
        }
      }
    }
  }

  return null;
}

function pushAll(target, value) {
  if (Array.isArray(value)) {
    target.push(...value);
  } else if (value) {
    target.push(value);
  }
}

function normalizeDashScopeImageSize(size) {
  const normalized = String(size || '1024x1024').toLowerCase().replace(/\s+/g, '');
  const mapping = {
    '1024x1024': '1024*1024',
    '1024*1024': '1024*1024',
    'square': '1024*1024',
    'portrait': '768*1152',
    '768x1152': '768*1152',
    '768*1152': '768*1152',
    'landscape': '1152*768',
    '1152x768': '1152*768',
    '1152*768': '1152*768'
  };
  return mapping[normalized] || normalized.replace('x', '*') || '1024*1024';
}

function normalizeOpenAIImageSize(size) {
  const normalized = String(size || '1024x1024').toLowerCase().replace(/\s+/g, '');
  const mapping = {
    '1024x1024': '1024x1024',
    '1024*1024': '1024x1024',
    'square': '1024x1024',
    'portrait': '1024x1536',
    '768x1152': '1024x1536',
    '768*1152': '1024x1536',
    '1024x1536': '1024x1536',
    '1024*1536': '1024x1536',
    'landscape': '1536x1024',
    '1152x768': '1536x1024',
    '1152*768': '1536x1024',
    '1536x1024': '1536x1024',
    '1536*1024': '1536x1024'
  };
  return mapping[normalized] || '1024x1024';
}

function buildDashScopeImageApiUrl(baseUrl) {
  try {
    const origin = new URL(baseUrl).origin;
    return `${origin}/api/v1/services/aigc/multimodal-generation/generation`;
  } catch {
    return 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  }
}

async function resolvePython() {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      if (candidate.includes(path.sep)) {
        if (existsSync(candidate)) return candidate;
      } else {
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return 'python3';
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `命令执行失败，退出码 ${code}`));
    });
  });
}

function slugify(input) {
  return String(input || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
}

function encodeRFC5987(str) {
  return encodeURIComponent(str)
    .replace(/[\'()]/g, escape)
    .replace(/\*/g, '%2A');
}
