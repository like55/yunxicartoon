const STORAGE_KEY = 'yunxi-picture-book-projects-v2';

const form = document.getElementById('bookForm');
const projectListEl = document.getElementById('projectList');
const projectCountEl = document.getElementById('projectCount');
const previewTitle = document.getElementById('previewTitle');
const previewSummary = document.getElementById('previewSummary');
const themeTag = document.getElementById('themeTag');
const lessonTag = document.getElementById('lessonTag');
const statPages = document.getElementById('statPages');
const statStyle = document.getElementById('statStyle');
const statAge = document.getElementById('statAge');
const outlineEl = document.getElementById('outline');
const pagesEl = document.getElementById('pages');
const pageTemplate = document.getElementById('pageCardTemplate');
const projectTemplate = document.getElementById('projectItemTemplate');
const loadingMask = document.getElementById('loadingMask');
const loadingText = document.getElementById('loadingText');
const coverPreviewEl = document.getElementById('coverPreview');
const coverPromptEl = document.getElementById('coverPrompt');
const apiBadge = document.getElementById('apiBadge');
const apiHint = document.getElementById('apiHint');
const characterReferenceInput = document.getElementById('characterReferenceInput');
const characterReferencePreviewEl = document.getElementById('characterReferencePreview');
const characterReferenceNameEl = document.getElementById('characterReferenceName');

const buttons = {
  newProject: document.getElementById('newProjectBtn'),
  duplicateProject: document.getElementById('duplicateProjectBtn'),
  deleteProject: document.getElementById('deleteProjectBtn'),
  random: document.getElementById('randomBtn'),
  localGenerate: document.getElementById('localGenerateBtn'),
  aiGenerate: document.getElementById('aiGenerateBtn'),
  generateCover: document.getElementById('generateCoverBtn'),
  batchImage: document.getElementById('batchImageBtn'),
  save: document.getElementById('saveBtn'),
  clearCharacterReference: document.getElementById('clearCharacterReferenceBtn'),
  exportMd: document.getElementById('exportMdBtn'),
  exportJson: document.getElementById('exportJsonBtn'),
  exportPdf: document.getElementById('exportPdfBtn')
};

const demoSeeds = [
  {
    title: '月亮邮差小米',
    hero: '会飞的小狐狸米米',
    goal: '把迷路的小星星送回天空',
    setting: '住在会发光的云朵小镇',
    conflict: '半路遇到怕黑的大风和沉沉夜色',
    ageGroup: '5-7岁',
    style: '温柔水彩风',
    pageCount: 10,
    palette: '奶油黄、天蓝、珊瑚粉'
  },
  {
    title: '森林里的倒影邮局',
    hero: '总把信装反的小熊邮差阿团',
    goal: '把一封写给月亮的信准时送到湖心岛',
    setting: '住在会映出秘密倒影的镜湖森林',
    conflict: '桥断了，天色变暗，湖里的倒影还在捣乱',
    ageGroup: '5-7岁',
    style: '治愈扁平插画',
    pageCount: 8,
    palette: '湖蓝、薄荷绿、暖橙色'
  },
  {
    title: '星星修理店',
    hero: '爱拆东西的小猫工程师柚子',
    goal: '在天亮前修好一颗不会闪的星星',
    setting: '住在漂浮于夜空边缘的云梯工坊',
    conflict: '零件不见了，时间越来越少，星星也快哭了',
    ageGroup: '7-9岁',
    style: '梦幻童话拼贴',
    pageCount: 12,
    palette: '深蓝、银白、蜜桃粉'
  }
];

const state = {
  projects: [],
  activeProjectId: null,
  apiStatus: {
    ok: false,
    hasApiKey: false,
    textModel: '',
    imageModel: ''
  }
};

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // ignore
  }
  return null;
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clampPageCount(value) {
  return Math.max(6, Math.min(16, Number(value) || 10));
}

function pickSceneTitle(index, total) {
  const progress = index / total;
  if (index === 1) return '故事开场';
  if (progress <= 0.25) return '收到任务';
  if (progress <= 0.5) return '踏上旅程';
  if (progress <= 0.72) return '遇到困难';
  if (progress <= 0.9) return '鼓起勇气';
  return '温暖结尾';
}

function pickShot(index) {
  const shots = ['远景环境镜头', '中景互动镜头', '近景表情镜头', '俯视全景镜头', '低机位英雄镜头'];
  return shots[index % shots.length];
}

function pickEmotion(index, total) {
  const progress = index / total;
  if (progress <= 0.2) return '好奇';
  if (progress <= 0.45) return '期待';
  if (progress <= 0.7) return '紧张';
  if (progress <= 0.9) return '勇敢';
  return '温暖';
}

function getFormData() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.pageCount = clampPageCount(data.pageCount);
  return data;
}

function setFormData(data) {
  for (const [key, value] of Object.entries(data || {})) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  }
}

function buildPageText(data, index, total) {
  const { hero, goal, setting, conflict } = data;
  if (index === 1) {
    return `${hero}${setting}，每天都认真观察天空和风的消息。`;
  }
  if (index === 2) {
    return `忽然，一个新的愿望落在面前：${goal}。${hero}觉得这一定是今天最重要的事。`;
  }
  if (index < total / 2) {
    return `${hero}沿着路上的线索前进，一边想办法，一边帮助遇见的小伙伴。每走一步，都离“${goal}”更近一点。`;
  }
  if (index < total - 2) {
    return `可就在这时，${conflict}。${hero}有一点害怕，但还是决定再试一次。`;
  }
  if (index === total - 1) {
    return `${hero}终于找到了最关键的办法：相信自己，也相信一路上收集到的勇气。`;
  }
  return `最后，${hero}完成了“${goal}”。大家抬头看着眼前的变化，心里都暖洋洋的。`;
}

function buildPrompt(data, page, index, total) {
  const { hero, setting, style, palette, goal, conflict } = data;
  const sceneHint = index <= 2
    ? '童书封面级构图，角色清晰可爱'
    : index >= total - 1
      ? '温暖收束画面，氛围柔和发光'
      : '儿童绘本跨页插画，层次丰富';

  return [
    `主角：${hero}`,
    `场景：${setting}`,
    `故事目标：${goal}`,
    `当前情节：${page.text}`,
    `潜在阻碍：${conflict}`,
    `绘画风格：${style}`,
    `色彩：${palette}`,
    `镜头：${page.shot}`,
    `情绪：${page.emotion}`,
    sceneHint,
    '高细节，适合儿童绘本，画面干净，避免杂乱文字'
  ].join('；');
}

function buildOutline(data) {
  return [
    { label: '开场', text: `${data.hero}${data.setting}，故事从一个温柔又奇妙的日常开始。` },
    { label: '目标', text: `主角收到任务：“${data.goal}”，于是决定主动出发。` },
    { label: '挑战', text: `旅途中出现阻碍：${data.conflict}，主角必须鼓起勇气。` },
    { label: '结尾', text: `经过努力与帮助，主角完成目标，也学会了新的品质。` }
  ];
}

function buildCoverPrompt(meta, summary = '') {
  return [
    `${meta.style}儿童绘本封面`,
    `主角：${meta.hero}`,
    `故事目标：${meta.goal}`,
    `场景：${meta.setting}`,
    `配色：${meta.palette}`,
    summary ? `故事氛围：${summary}` : '氛围：温暖梦幻，适合 3-9 岁儿童',
    '画面需要留出标题区域，角色完整清晰，构图精致，适合绘本封面'
  ].join('；');
}

function generateLocalBook(meta) {
  const normalizedMeta = { ...meta, pageCount: clampPageCount(meta.pageCount) };
  const pages = Array.from({ length: normalizedMeta.pageCount }, (_, idx) => {
    const pageNumber = idx + 1;
    const page = {
      pageNumber,
      title: pickSceneTitle(pageNumber, normalizedMeta.pageCount),
      text: buildPageText(normalizedMeta, pageNumber, normalizedMeta.pageCount),
      shot: pickShot(pageNumber),
      emotion: pickEmotion(pageNumber, normalizedMeta.pageCount),
      imageDataUrl: ''
    };
    page.prompt = buildPrompt(normalizedMeta, page, pageNumber, normalizedMeta.pageCount);
    return page;
  });

  const summary = `${normalizedMeta.hero}${normalizedMeta.setting}，为了“${normalizedMeta.goal}”踏上旅程。一路上，TA 面对“${normalizedMeta.conflict}”带来的困难，最终学会勇敢、善良与坚持。`;

  return {
    meta: normalizedMeta,
    summary,
    theme: '勇敢与善良',
    lesson: '在帮助别人的路上，也会找到自己的力量。',
    outline: buildOutline(normalizedMeta),
    coverPrompt: buildCoverPrompt(normalizedMeta, summary),
    coverImageDataUrl: '',
    characterReferenceImageDataUrl: '',
    characterReferenceFileName: '',
    pages
  };
}

function createProject(seed = demoSeeds[0]) {
  const meta = { ...seed, pageCount: clampPageCount(seed.pageCount) };
  const book = generateLocalBook(meta);
  const stamp = nowIso();
  return {
    id: uid('project'),
    name: meta.title,
    createdAt: stamp,
    updatedAt: stamp,
    book
  };
}

function saveState() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify({
    projects: state.projects,
    activeProjectId: state.activeProjectId
  }));
}

function loadState() {
  try {
    const storage = getStorage();
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (saved?.projects?.length) {
      state.projects = saved.projects.map((project) => ({
        ...project,
        book: ensureBookShape(project.book || generateLocalBook(project.book?.meta || demoSeeds[0]))
      }));
      state.activeProjectId = saved.activeProjectId || saved.projects[0].id;
      return;
    }
  } catch (error) {
    console.warn('恢复本地项目失败', error);
  }
  const project = createProject(demoSeeds[0]);
  state.projects = [project];
  state.activeProjectId = project.id;
  saveState();
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function updateActiveProject(mutator, options = {}) {
  const project = getActiveProject();
  if (!project) return;
  mutator(project);
  project.name = project.book?.meta?.title || project.name;
  project.updatedAt = nowIso();
  saveState();
  if (options.render !== false) renderAll();
}

function renderProjects() {
  projectListEl.innerHTML = '';
  projectCountEl.textContent = `${state.projects.length} 个项目`;
  state.projects.forEach((project) => {
    const node = projectTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle('active', project.id === state.activeProjectId);
    node.querySelector('.project-name').textContent = project.book?.meta?.title || project.name || '未命名项目';
    node.querySelector('.project-meta').textContent = `${project.book?.meta?.pageCount || 0} 页 · ${project.book?.meta?.style || '未设风格'}`;
    node.addEventListener('click', () => {
      state.activeProjectId = project.id;
      saveState();
      renderAll();
    });
    projectListEl.appendChild(node);
  });
}

function renderOutline(outline = []) {
  outlineEl.innerHTML = '';
  outline.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'outline-card';
    div.innerHTML = `<span>${escapeHtml(item.label || '')}</span><p>${escapeHtml(item.text || '')}</p>`;
    outlineEl.appendChild(div);
  });
}

function renderImageBox(container, imageDataUrl, emptyText) {
  container.innerHTML = '';
  if (imageDataUrl) {
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.alt = '插图预览';
    container.classList.remove('empty');
    container.appendChild(img);
  } else {
    container.classList.add('empty');
    container.textContent = emptyText;
  }
}

function renderCharacterReference(book) {
  const imageDataUrl = book?.characterReferenceImageDataUrl || '';
  renderImageBox(characterReferencePreviewEl, imageDataUrl, '暂无人物参考图');
  characterReferenceNameEl.textContent = book?.characterReferenceFileName || (imageDataUrl ? '已上传参考图' : '未上传');
  if (characterReferenceInput) characterReferenceInput.value = '';
}

function ensureBookShape(book) {
  if (!book || typeof book !== 'object') return book;
  if (typeof book.characterReferenceImageDataUrl !== 'string') book.characterReferenceImageDataUrl = '';
  if (typeof book.characterReferenceFileName !== 'string') book.characterReferenceFileName = '';
  if (!Array.isArray(book.pages)) book.pages = [];
  return book;
}

function renderPages(book) {
  pagesEl.innerHTML = '';
  (book.pages || []).forEach((page) => {
    const node = pageTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.page = page.pageNumber;
    node.querySelector('.page-badge').textContent = `第 ${page.pageNumber} 页`;
    node.querySelector('.page-title').value = page.title || '';
    node.querySelector('.page-text').value = page.text || '';
    node.querySelector('.page-prompt').value = page.prompt || '';
    node.querySelector('.page-shot').value = page.shot || '';
    node.querySelector('.page-emotion').value = page.emotion || '';
    renderImageBox(node.querySelector('.page-image'), page.imageDataUrl, '暂无插图');
    pagesEl.appendChild(node);
  });
}

function renderBook(book) {
  if (!book) return;
  ensureBookShape(book);
  setFormData(book.meta);
  previewTitle.textContent = book.meta?.title || '未命名绘本';
  previewSummary.textContent = book.summary || '';
  statPages.textContent = book.meta?.pageCount || 0;
  statStyle.textContent = book.meta?.style || '-';
  statAge.textContent = book.meta?.ageGroup || '-';
  themeTag.textContent = `主题：${book.theme || '温暖成长'}`;
  lessonTag.textContent = `成长点：${book.lesson || '相信自己'}`;
  coverPromptEl.value = book.coverPrompt || buildCoverPrompt(book.meta || {}, book.summary || '');
  renderImageBox(coverPreviewEl, book.coverImageDataUrl, '暂无封面图');
  renderCharacterReference(book);
  renderOutline(book.outline || []);
  renderPages(book);
}

function renderAll() {
  renderProjects();
  const project = getActiveProject();
  if (project) renderBook(project.book);
}

function syncFormIntoProject() {
  const formData = getFormData();
  updateActiveProject((project) => {
    const current = project.book || generateLocalBook(formData);
    current.meta = { ...current.meta, ...formData };
    current.meta.pageCount = clampPageCount(formData.pageCount);
    if (!current.coverPrompt) current.coverPrompt = buildCoverPrompt(current.meta, current.summary || '');
    if (typeof current.characterReferenceImageDataUrl !== 'string') current.characterReferenceImageDataUrl = '';
    if (typeof current.characterReferenceFileName !== 'string') current.characterReferenceFileName = '';
    project.book = current;
  }, { render: false });
  const project = getActiveProject();
  if (project) {
    previewTitle.textContent = project.book.meta.title || '未命名绘本';
    statPages.textContent = project.book.meta.pageCount || 0;
    statStyle.textContent = project.book.meta.style || '-';
    statAge.textContent = project.book.meta.ageGroup || '-';
    renderProjects();
  }
}

function collectRenderedBook() {
  const formData = getFormData();
  const outline = [...outlineEl.querySelectorAll('.outline-card')].map((card) => ({
    label: card.querySelector('span')?.textContent || '',
    text: card.querySelector('p')?.textContent || ''
  }));
  const pages = [...pagesEl.querySelectorAll('.page-card')].map((card, idx) => ({
    pageNumber: idx + 1,
    title: card.querySelector('.page-title').value.trim(),
    text: card.querySelector('.page-text').value.trim(),
    prompt: card.querySelector('.page-prompt').value.trim(),
    shot: card.querySelector('.page-shot').value.trim(),
    emotion: card.querySelector('.page-emotion').value.trim(),
    imageDataUrl: card.querySelector('.page-image img')?.src || ''
  }));
  return {
    meta: formData,
    summary: previewSummary.textContent.trim(),
    theme: (themeTag.textContent || '').replace(/^主题：/, '').trim(),
    lesson: (lessonTag.textContent || '').replace(/^成长点：/, '').trim(),
    coverPrompt: coverPromptEl.value.trim(),
    coverImageDataUrl: coverPreviewEl.querySelector('img')?.src || '',
    characterReferenceImageDataUrl: characterReferencePreviewEl.querySelector('img')?.src || '',
    characterReferenceFileName: characterReferenceNameEl.textContent === '未上传' ? '' : characterReferenceNameEl.textContent.trim(),
    outline,
    pages
  };
}

function persistCurrentBook() {
  updateActiveProject((project) => {
    project.book = collectRenderedBook();
  }, { render: false });
}

async function fileToOptimizedDataUrl(file, options = {}) {
  const maxWidth = options.maxWidth || 1024;
  const maxHeight = options.maxHeight || 1024;
  const quality = options.quality || 0.86;

  if (!(file instanceof File)) {
    throw new Error('请选择有效的图片文件');
  }

  const originalDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('解析图片失败'));
    img.src = originalDataUrl;
  });

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const optimized = canvas.toDataURL('image/jpeg', quality);
  return optimized.length < originalDataUrl.length ? optimized : originalDataUrl;
}

async function handleCharacterReferenceChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('请上传图片文件');
    event.target.value = '';
    return;
  }

  showLoading('正在处理人物参考图...');
  try {
    const imageDataUrl = await fileToOptimizedDataUrl(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.86 });
    updateActiveProject((project) => {
      ensureBookShape(project.book);
      project.book.characterReferenceImageDataUrl = imageDataUrl;
      project.book.characterReferenceFileName = file.name || '人物参考图';
    });
    toast('人物参考图已上传');
  } catch (error) {
    toast(error.message || '人物参考图上传失败');
  } finally {
    hideLoading();
  }
}

function handleClearCharacterReference() {
  updateActiveProject((project) => {
    ensureBookShape(project.book);
    project.book.characterReferenceImageDataUrl = '';
    project.book.characterReferenceFileName = '';
  });
  if (characterReferenceInput) characterReferenceInput.value = '';
  toast('已清空人物参考图');
}

function showLoading(text) {
  loadingText.textContent = text || '处理中...';
  loadingMask.classList.remove('hidden');
}

function hideLoading() {
  loadingMask.classList.add('hidden');
}

function toast(message) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.position = 'fixed';
  el.style.bottom = '20px';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.padding = '10px 16px';
  el.style.background = 'rgba(29, 36, 51, 0.92)';
  el.style.color = 'white';
  el.style.borderRadius = '999px';
  el.style.zIndex = '10000';
  el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.18)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const data = await response.json();
      message = data.error || data.details || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (options.raw) return response;
  return response.json();
}

async function refreshApiStatus() {
  try {
    const data = await api('/api/health');
    state.apiStatus = data;
    if (data.hasApiKey) {
      apiBadge.textContent = 'AI 已就绪';
      apiBadge.className = 'status-badge status-online';
      apiHint.textContent = `图片提供方：${data.imageProvider || '-'} · 图片模型：${data.imageModel} · 文本模型：${data.textModel}`;
    } else {
      apiBadge.textContent = '缺少 API Key';
      apiBadge.className = 'status-badge status-warn';
      apiHint.textContent = data.imageProvider === 'openai'
        ? '当前图片提供方为 OpenAI，请在启动前设置 OPENAI_API_KEY，然后刷新页面。'
        : '请在启动前设置 DASHSCOPE_API_KEY，然后刷新页面。';
    }
  } catch (error) {
    apiBadge.textContent = '服务异常';
    apiBadge.className = 'status-badge status-offline';
    apiHint.textContent = '本地服务似乎没有正常启动。';
  }
}

async function handleLocalGenerate() {
  const formData = getFormData();
  updateActiveProject((project) => {
    const nextBook = generateLocalBook(formData);
    nextBook.characterReferenceImageDataUrl = project.book?.characterReferenceImageDataUrl || '';
    nextBook.characterReferenceFileName = project.book?.characterReferenceFileName || '';
    project.book = nextBook;
  });
  toast('已生成本地绘本结构');
}

async function handleAiStoryGenerate() {
  showLoading('AI 正在生成完整故事...');
  try {
    const result = await api('/api/generate-story', {
      method: 'POST',
      body: { brief: getFormData() }
    });
    updateActiveProject((project) => {
      result.book.characterReferenceImageDataUrl = project.book?.characterReferenceImageDataUrl || '';
      result.book.characterReferenceFileName = project.book?.characterReferenceFileName || '';
      project.book = result.book;
    });
    toast('AI 故事生成完成');
  } catch (error) {
    toast(error.message || 'AI 故事生成失败');
  } finally {
    hideLoading();
  }
}

async function generateImageFromPrompt(prompt, filename, options = {}) {
  const result = await api('/api/generate-image', {
    method: 'POST',
    body: {
      prompt,
      size: options.size || '1024x1024',
      filename,
      referenceImageDataUrl: options.referenceImageDataUrl || ''
    }
  });
  return result;
}

async function handleCoverGenerate() {
  persistCurrentBook();
  const project = getActiveProject();
  const prompt = coverPromptEl.value.trim() || buildCoverPrompt(project.book.meta, project.book.summary);
  coverPromptEl.value = prompt;
  showLoading('AI 正在生成封面图...');
  try {
    const result = await generateImageFromPrompt(prompt, `${project.book.meta.title}-cover`, {
      referenceImageDataUrl: project.book.characterReferenceImageDataUrl || ''
    });
    updateActiveProject((currentProject) => {
      currentProject.book.coverPrompt = result.revisedPrompt || prompt;
      currentProject.book.coverImageDataUrl = result.imageDataUrl;
    });
    toast('封面图生成完成');
  } catch (error) {
    toast(error.message || '封面图生成失败');
  } finally {
    hideLoading();
  }
}

async function handleGeneratePageImage(pageIndex) {
  persistCurrentBook();
  const project = getActiveProject();
  const page = project.book.pages[pageIndex];
  if (!page) return;
  showLoading(`正在生成第 ${page.pageNumber} 页插图...`);
  try {
    const result = await generateImageFromPrompt(page.prompt, `${project.book.meta.title}-page-${page.pageNumber}`, {
      referenceImageDataUrl: project.book.characterReferenceImageDataUrl || ''
    });
    updateActiveProject((currentProject) => {
      currentProject.book.pages[pageIndex].imageDataUrl = result.imageDataUrl;
      currentProject.book.pages[pageIndex].prompt = result.revisedPrompt || currentProject.book.pages[pageIndex].prompt;
    });
    toast(`第 ${page.pageNumber} 页插图已生成`);
  } catch (error) {
    toast(error.message || '页面插图生成失败');
  } finally {
    hideLoading();
  }
}

async function handleBatchImageGenerate() {
  persistCurrentBook();
  const project = getActiveProject();
  const pages = project?.book?.pages || [];
  if (!pages.length) {
    toast('请先生成绘本页面');
    return;
  }
  try {
    for (let i = 0; i < pages.length; i += 1) {
      const currentProject = getActiveProject();
      const currentPage = currentProject.book.pages[i];
      showLoading(`正在批量生成第 ${i + 1}/${pages.length} 页插图...`);
      const result = await generateImageFromPrompt(currentPage.prompt, `${currentProject.book.meta.title}-page-${currentPage.pageNumber}`, {
        referenceImageDataUrl: currentProject.book.characterReferenceImageDataUrl || ''
      });
      updateActiveProject((proj) => {
        proj.book.pages[i].imageDataUrl = result.imageDataUrl;
        proj.book.pages[i].prompt = result.revisedPrompt || proj.book.pages[i].prompt;
      });
    }
    toast('全部页面插图生成完成');
  } catch (error) {
    toast(error.message || '批量插图生成失败');
  } finally {
    hideLoading();
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleExportMarkdown() {
  persistCurrentBook();
  const book = getActiveProject().book;
  const md = [
    `# ${book.meta.title}`,
    '',
    `- 主角：${book.meta.hero}`,
    `- 目标：${book.meta.goal}`,
    `- 场景：${book.meta.setting}`,
    `- 阻碍：${book.meta.conflict}`,
    `- 适龄：${book.meta.ageGroup}`,
    `- 风格：${book.meta.style}`,
    `- 主色：${book.meta.palette}`,
    '',
    '## 故事简介',
    '',
    book.summary,
    '',
    `## 主题`,
    '',
    `- 主题：${book.theme}`,
    `- 成长点：${book.lesson}`,
    '',
    '## 故事大纲',
    '',
    ...book.outline.flatMap((item) => [`### ${item.label}`, item.text, '']),
    '## 页面内容',
    '',
    ...book.pages.flatMap((page) => [
      `### 第 ${page.pageNumber} 页 · ${page.title}`,
      '',
      `**文案**：${page.text}`,
      '',
      `**画面提示词**：${page.prompt}`,
      '',
      `**镜头**：${page.shot}`,
      '',
      `**情绪**：${page.emotion}`,
      ''
    ])
  ].join('\n');
  downloadFile(`${book.meta.title || '绘本'}.md`, md, 'text/markdown;charset=utf-8');
}

function handleExportJson() {
  persistCurrentBook();
  const book = getActiveProject().book;
  downloadFile(`${book.meta.title || '绘本'}.json`, JSON.stringify(book, null, 2), 'application/json;charset=utf-8');
}

async function handleExportPdf() {
  persistCurrentBook();
  showLoading('正在导出 PDF...');
  try {
    const response = await fetch('/api/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: getActiveProject().book })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || data?.details || 'PDF 导出失败');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getActiveProject().book.meta.title || '绘本'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast('PDF 导出完成');
  } catch (error) {
    toast(error.message || 'PDF 导出失败');
  } finally {
    hideLoading();
  }
}

function handleNewProject() {
  const project = createProject(demoSeeds[Math.floor(Math.random() * demoSeeds.length)]);
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  saveState();
  renderAll();
  toast('已新建项目');
}

function handleDuplicateProject() {
  const project = getActiveProject();
  if (!project) return;
  persistCurrentBook();
  const cloned = JSON.parse(JSON.stringify(getActiveProject()));
  cloned.id = uid('project');
  cloned.createdAt = nowIso();
  cloned.updatedAt = nowIso();
  cloned.book.meta.title = `${cloned.book.meta.title}（副本）`;
  cloned.name = cloned.book.meta.title;
  state.projects.unshift(cloned);
  state.activeProjectId = cloned.id;
  saveState();
  renderAll();
  toast('已复制项目');
}

function handleDeleteProject() {
  if (state.projects.length <= 1) {
    toast('至少保留一个项目');
    return;
  }
  const project = getActiveProject();
  state.projects = state.projects.filter((item) => item.id !== project.id);
  state.activeProjectId = state.projects[0].id;
  saveState();
  renderAll();
  toast('项目已删除');
}

function handleRandomSeed() {
  const seed = demoSeeds[Math.floor(Math.random() * demoSeeds.length)];
  updateActiveProject((project) => {
    const nextBook = generateLocalBook(seed);
    nextBook.characterReferenceImageDataUrl = project.book?.characterReferenceImageDataUrl || '';
    nextBook.characterReferenceFileName = project.book?.characterReferenceFileName || '';
    project.book = nextBook;
  });
  toast('已切换到随机示例');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bindEvents() {
  buttons.newProject.addEventListener('click', handleNewProject);
  buttons.duplicateProject.addEventListener('click', handleDuplicateProject);
  buttons.deleteProject.addEventListener('click', handleDeleteProject);
  buttons.random.addEventListener('click', handleRandomSeed);
  buttons.localGenerate.addEventListener('click', handleLocalGenerate);
  buttons.aiGenerate.addEventListener('click', handleAiStoryGenerate);
  buttons.generateCover.addEventListener('click', handleCoverGenerate);
  buttons.batchImage.addEventListener('click', handleBatchImageGenerate);
  buttons.clearCharacterReference.addEventListener('click', handleClearCharacterReference);
  buttons.save.addEventListener('click', () => {
    persistCurrentBook();
    toast('已保存当前项目');
  });
  buttons.exportMd.addEventListener('click', handleExportMarkdown);
  buttons.exportJson.addEventListener('click', handleExportJson);
  buttons.exportPdf.addEventListener('click', handleExportPdf);

  form.addEventListener('input', syncFormIntoProject);
  characterReferenceInput.addEventListener('change', handleCharacterReferenceChange);

  coverPromptEl.addEventListener('input', () => {
    updateActiveProject((project) => {
      project.book.coverPrompt = coverPromptEl.value;
    }, { render: false });
  });

  pagesEl.addEventListener('input', () => {
    persistCurrentBook();
  });

  pagesEl.addEventListener('click', async (event) => {
    const pageCard = event.target.closest('.page-card');
    if (!pageCard) return;
    const pageIndex = Number(pageCard.dataset.page) - 1;
    if (event.target.closest('.page-generate-image')) {
      await handleGeneratePageImage(pageIndex);
    }
    if (event.target.closest('.page-clear-image')) {
      updateActiveProject((project) => {
        project.book.pages[pageIndex].imageDataUrl = '';
      });
      toast(`已清空第 ${pageIndex + 1} 页插图`);
    }
  });
}

async function bootstrap() {
  loadState();
  renderAll();
  bindEvents();
  await refreshApiStatus();
}

bootstrap();
