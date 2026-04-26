const defaultHtml = `<!DOCTYPE html>
<html lang="bn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>লাইভ কোড প্রিভিউ</title>
  </head>
  <body>
    <div class="hero">
      <h1>লাইভ কোড এডিটরে স্বাগতম</h1>
      <p>এখন HTML, CSS ও JS লিখে আপনার ফলাফল দেখুন।</p>
    </div>
  </body>
</html>`;

const defaultCss = `body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, system-ui, sans-serif;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  color: #e2e8f0;
}

.hero {
  max-width: 780px;
  margin: 80px auto;
  text-align: center;
  padding: 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 20px 90px rgba(15, 23, 42, 0.35);
}

.hero h1 {
  font-size: clamp(2rem, 4vw, 3.6rem);
  margin-bottom: 16px;
  color: #7dd3fc;
}

.hero p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.7;
}`;

const defaultJs = `const hero = document.querySelector('.hero');
if (hero) {
  console.log('লাইভ কোড প্রিভিউ চালু হয়েছে।');
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM লোড সম্পন্ন।');
});`;

const autosaveKey = 'liveCodeEditor:autosave';
const projectsKey = 'liveCodeEditor:projects';
const previewFrame = document.getElementById('previewFrame');
const previewOverlay = document.getElementById('previewOverlay');
const previewStatus = document.getElementById('previewStatus');
const consoleOutput = document.getElementById('consoleOutput');
const themeToggle = document.getElementById('themeToggle');
const runBtn = document.getElementById('runBtn');
const stopBtn = document.getElementById('stopBtn');
const findBtn = document.getElementById('findBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearConsoleBtn = document.getElementById('clearConsoleBtn');
const fullScreenPreview = document.getElementById('fullScreenPreview');
const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const codepenBtn = document.getElementById('codepenBtn');
const jsfiddleBtn = document.getElementById('jsfiddleBtn');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const loadProjectBtn = document.getElementById('loadProjectBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const projectNameInput = document.getElementById('projectName');
const projectList = document.getElementById('projectList');
const deviceButtons = document.querySelectorAll('.device-btn');
const editorTabs = document.querySelectorAll('.tab');
const previewHolder = document.querySelector('.preview-frame-holder');

let activeEditorKey = 'html';
let isRunning = false;
let previewTimer = null;
let autoSaveTimer = null;
let theme = localStorage.getItem('liveCodeEditorTheme') || 'light';
let previewDevice = 'desktop';

const editors = {};

function createEditor(selector, mode, initialValue) {
  return CodeMirror.fromTextArea(document.getElementById(selector), {
    mode,
    theme: theme === 'dark' ? 'material-darker' : 'default',
    lineNumbers: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    extraKeys: {
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
      'Ctrl-Q': cm => cm.foldCode(cm.getCursor()),
      'Ctrl-S': () => saveCurrentProject(),
      'Cmd-S': () => saveCurrentProject(),
    },
  });
}

function initializeEditors() {
  editors.html = createEditor('htmlEditor', 'htmlmixed', defaultHtml);
  editors.css = createEditor('cssEditor', 'css', defaultCss);
  editors.js = createEditor('jsEditor', 'javascript', defaultJs);

  Object.values(editors).forEach(editor => {
    editor.on('change', () => {
      if (isRunning) {
        schedulePreviewUpdate();
      }
    });
  });
}

function setActiveTab(tabKey) {
  activeEditorKey = tabKey;
  editorTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.editor === tabKey);
  });
  Object.keys(editors).forEach(key => {
    const wrapper = editors[key].getWrapperElement();
    wrapper.style.display = key === tabKey ? 'block' : 'none';
    if (key === tabKey) {
      editors[key].refresh();
    }
  });
}

function showConsoleMessage(level, args) {
  const line = document.createElement('div');
  line.className = `console-message ${level}`;
  const text = args.map(item => {
    if (typeof item === 'object') {
      try {
        return JSON.stringify(item, null, 2);
      } catch {
        return String(item);
      }
    }
    return String(item);
  }).join(' ');
  line.innerHTML = `<div>${escapeHtml(text)}</div><div class="console-meta">${level.toUpperCase()} • ${new Date().toLocaleTimeString()}</div>`;
  consoleOutput.appendChild(line);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[tag]));
}

function updatePreviewStatus(text) {
  previewStatus.textContent = text;
}

function buildPreviewHtml() {
  const html = editors.html.getValue();
  const css = editors.css.getValue();
  let js = editors.js.getValue();
  js = js.replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="bn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${css}</style>
  </head>
  <body>
    ${html}
    <script>
      (function () {
        const send = (type, payload) => {
          window.parent.postMessage({ type: 'live-code-console', payload: { type, payload } }, '*');
        };

        ['log', 'warn', 'error'].forEach(name => {
          const original = console[name];
          console[name] = function (...args) {
            original.apply(console, args);
            send('console', { level: name, args });
          };
        });

        window.onerror = function (message, source, lineno, colno, error) {
          send('runtime-error', {
            message: typeof message === 'object' ? JSON.stringify(message) : String(message),
            source,
            lineno,
            colno,
            stack: error ? error.stack : null,
          });
          return false;
        };

        window.addEventListener('unhandledrejection', event => {
          send('runtime-error', {
            message: event.reason?.message || String(event.reason),
            stack: event.reason?.stack || null,
          });
        });
      })();
    <\/script>
    <script>
      try {
        ${js}
      } catch (error) {
        console.error(error);
      }
    <\/script>
  </body>
</html>`;
}

function runPreview() {
  isRunning = true;
  runBtn.disabled = true;
  stopBtn.disabled = false;
  previewOverlay.classList.add('hidden');
  previewFrame.srcdoc = buildPreviewHtml();
  updatePreviewStatus(`Running • ${new Date().toLocaleTimeString()}`);
}

function stopPreview() {
  isRunning = false;
  runBtn.disabled = false;
  stopBtn.disabled = true;
  previewFrame.srcdoc = '<!DOCTYPE html><html><body><div style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#64748b;background:#f8fafc;">Preview stopped</div></body></html>';
  previewOverlay.classList.add('hidden');
  updatePreviewStatus('Stopped');
}

function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (isRunning) {
      runPreview();
    }
  }, 400);
}

function handleMessage(event) {
  if (!event.data || event.data.type !== 'live-code-console' || !event.data.payload) {
    return;
  }

  const { type, payload } = event.data.payload;
  if (type === 'console') {
    showConsoleMessage(payload.level || 'log', payload.args || []);
  } else if (type === 'runtime-error') {
    showPreviewError(payload);
  }
}

function showPreviewError(payload) {
  previewOverlay.textContent = `JS Error: ${payload.message}${payload.source ? `\n${payload.source}:${payload.lineno}:${payload.colno}` : ''}`;
  previewOverlay.classList.remove('hidden');
  showConsoleMessage('error', [payload.message, payload.stack || '']);
}

function setTheme(newTheme) {
  theme = newTheme;
  document.body.className = theme;
  localStorage.setItem('liveCodeEditorTheme', theme);
  const selected = theme === 'dark' ? 'material-darker' : 'default';
  Object.values(editors).forEach(editor => editor.setOption('theme', selected));
}

function toggleTheme() {
  setTheme(theme === 'dark' ? 'light' : 'dark');
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function downloadHtmlFile() {
  const html = buildPreviewHtml();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, 'live-code-preview.html');
}

function downloadZipArchive() {
  if (typeof JSZip === 'undefined') {
    alert('JSZip লোড হয়নি। দয়া করে আবার লোড করুন।');
    return;
  }
  const zip = new JSZip();
  zip.file('index.html', buildPreviewHtml());
  zip.file('styles.css', editors.css.getValue());
  zip.file('script.js', editors.js.getValue());
  zip.generateAsync({ type: 'blob' }).then(blob => downloadBlob(blob, 'live-code-project.zip'));
}

function exportToCodePen() {
  const data = {
    title: 'Live Code Editor Export',
    html: editors.html.getValue(),
    css: editors.css.getValue(),
    js: editors.js.getValue(),
  };

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://codepen.io/pen/define';
  form.target = '_blank';
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'data';
  input.value = JSON.stringify(data);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function exportToJSFiddle() {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://jsfiddle.net/api/post/library/pure/';
  form.target = '_blank';
  const fields = {
    title: 'Live Code Editor Export',
    html: editors.html.getValue(),
    css: editors.css.getValue(),
    js: editors.js.getValue(),
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function saveAuto() {
  const payload = {
    html: editors.html.getValue(),
    css: editors.css.getValue(),
    js: editors.js.getValue(),
    theme,
    previewDevice,
    timestamp: Date.now(),
  };
  localStorage.setItem(autosaveKey, JSON.stringify(payload));
}

function loadAuto() {
  const saved = localStorage.getItem(autosaveKey);
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.html) editors.html.setValue(data.html);
    if (data.css) editors.css.setValue(data.css);
    if (data.js) editors.js.setValue(data.js);
    if (data.theme) setTheme(data.theme);
    if (data.previewDevice) updatePreviewDevice(data.previewDevice);
    updatePreviewStatus('Auto-saved content লোড করা হয়েছে');
  } catch (error) {
    console.warn('Auto save লোড করতে সমস্যা:', error);
  }
}

function saveCurrentProject() {
  const name = projectNameInput.value.trim();
  if (!name) {
    alert('প্রথমে একটি প্রজেক্ট নাম দিন।');
    return;
  }
  const projects = loadProjects();
  projects[name] = {
    html: editors.html.getValue(),
    css: editors.css.getValue(),
    js: editors.js.getValue(),
    savedAt: Date.now(),
  };
  localStorage.setItem(projectsKey, JSON.stringify(projects));
  updateProjectList();
  updatePreviewStatus(`Project saved: ${name}`);
}

function loadCurrentProject() {
  const name = projectNameInput.value.trim();
  if (!name) {
    alert('লোড করতে একটি প্রজেক্ট নাম দিন।');
    return;
  }
  const project = loadProjects()[name];
  if (!project) {
    alert('প্রজেক্ট পাওয়া যায়নি।');
    return;
  }
  editors.html.setValue(project.html || '');
  editors.css.setValue(project.css || '');
  editors.js.setValue(project.js || '');
  updatePreviewStatus(`Project loaded: ${name}`);
  if (isRunning) runPreview();
}

function deleteCurrentProject() {
  const name = projectNameInput.value.trim();
  if (!name) {
    alert('ডিলেট করতে একটি প্রজেক্ট নাম দিন।');
    return;
  }
  const projects = loadProjects();
  if (!projects[name]) {
    alert('প্রজেক্ট পাওয়া যায়নি।');
    return;
  }
  delete projects[name];
  localStorage.setItem(projectsKey, JSON.stringify(projects));
  projectNameInput.value = '';
  updateProjectList();
  updatePreviewStatus(`Project deleted: ${name}`);
}

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(projectsKey) || '{}');
  } catch {
    return {};
  }
}

function updateProjectList() {
  const projects = loadProjects();
  projectList.innerHTML = '';

  Object.entries(projects).forEach(([name, data]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-item';
    button.textContent = name;
    button.title = `Saved at ${new Date(data.savedAt).toLocaleString()}`;
    button.addEventListener('click', () => {
      projectNameInput.value = name;
      editors.html.setValue(data.html || '');
      editors.css.setValue(data.css || '');
      editors.js.setValue(data.js || '');
      updatePreviewStatus(`Project loaded: ${name}`);
      if (isRunning) runPreview();
    });
    projectList.appendChild(button);
  });
}

function updatePreviewDevice(device) {
  previewDevice = device;
  deviceButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.device === device));
  previewHolder.classList.remove('device-mobile', 'device-tablet', 'device-desktop');
  previewHolder.classList.add(`device-${device}`);
  localStorage.setItem('liveCodeEditorPreviewDevice', device);
}

function openFullscreenPreview() {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    alert('নতুন ট্যাব খুলতে বাধা উদ্যোগ হয়েছে।');
    return;
  }
  previewWindow.document.write(buildPreviewHtml());
  previewWindow.document.close();
}

function initEvents() {
  editorTabs.forEach(tab => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.editor));
  });

  runBtn.addEventListener('click', runPreview);
  stopBtn.addEventListener('click', stopPreview);
  findBtn.addEventListener('click', () => editors[activeEditorKey].execCommand('find'));
  undoBtn.addEventListener('click', () => editors[activeEditorKey].undo());
  redoBtn.addEventListener('click', () => editors[activeEditorKey].redo());
  clearConsoleBtn.addEventListener('click', () => { consoleOutput.innerHTML = ''; });
  themeToggle.addEventListener('click', toggleTheme);
  downloadHtmlBtn.addEventListener('click', downloadHtmlFile);
  downloadZipBtn.addEventListener('click', downloadZipArchive);
  codepenBtn.addEventListener('click', exportToCodePen);
  jsfiddleBtn.addEventListener('click', exportToJSFiddle);
  saveProjectBtn.addEventListener('click', saveCurrentProject);
  loadProjectBtn.addEventListener('click', loadCurrentProject);
  deleteProjectBtn.addEventListener('click', deleteCurrentProject);
  fullScreenPreview.addEventListener('click', openFullscreenPreview);

  deviceButtons.forEach(btn => {
    btn.addEventListener('click', () => updatePreviewDevice(btn.dataset.device));
  });

  window.addEventListener('message', handleMessage);
  window.addEventListener('beforeunload', saveAuto);
}

function initAutoSave() {
  autoSaveTimer = setInterval(saveAuto, 3000);
}

function initializeApp() {
  initializeEditors();
  setActiveTab('html');
  setTheme(theme);
  const storedDevice = localStorage.getItem('liveCodeEditorPreviewDevice');
  updatePreviewDevice(storedDevice || 'desktop');
  initEvents();
  loadAuto();
  updateProjectList();
  stopBtn.disabled = true;
  initAutoSave();
}

initializeApp();
