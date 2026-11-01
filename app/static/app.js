/* 局域网共享 —— 前端逻辑 */
"use strict";

const $ = (sel) => document.querySelector(sel);

const state = {
  info: null,
  view: "files",
  path: "",
  entries: [],
  entryMap: new Map(),
  breadcrumb: [],
  search: "",
  clips: [],
  uploading: false,
  loginRequired: false,
  editingClip: null,
};

const TYPE_MAP = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "tif", "tiff"],
  video: ["mp4", "mkv", "webm", "mov", "avi", "m4v", "flv", "wmv", "mpg", "mpeg"],
  audio: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma", "opus"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "cab"],
  code: [
    "js", "mjs", "ts", "jsx", "tsx", "vue", "svelte", "py", "java", "c", "h", "cpp", "hpp",
    "cs", "go", "rs", "rb", "php", "sh", "bat", "ps1", "sql", "html", "htm", "css", "scss",
    "less", "json", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "lua", "kt", "swift",
  ],
  doc: ["md", "markdown", "txt", "log", "doc", "docx", "rtf", "odt", "epub"],
  pdf: ["pdf"],
  sheet: ["xls", "xlsx", "csv", "tsv", "ods"],
};

const EXT_TYPE = new Map();
for (const [type, exts] of Object.entries(TYPE_MAP)) {
  for (const ext of exts) EXT_TYPE.set(ext, type);
}

const TEXT_EXTS = new Set([
  ...TYPE_MAP.code, ...TYPE_MAP.doc.filter((e) => !["doc", "docx", "rtf", "odt", "epub"].includes(e)),
  "csv", "tsv", "gitignore",
]);

const FOLDER_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"></path></svg>';

const ICONS = {
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5"></path><path d="M4 20h16"></path></svg>',
  preview:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"></path><circle cx="12" cy="12" r="2.4"></circle></svg>',
  rename:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6z"></path><path d="M13.5 7.5l3 3"></path></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>',
  open:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>',
};

/* ---------------- 工具函数 ---------------- */

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function typeOf(entry) {
  if (!entry || entry.type === "dir") return "dir";
  return EXT_TYPE.get(entry.ext) || "other";
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}

function formatTime(ts) {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  const pad = (n) => String(n).padStart(2, "0");
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

let toastTimer = null;
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    /* 回退到 execCommand */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch (err) {
    return false;
  }
}

/* ---------------- API ---------------- */

function showLogin() {
  state.loginRequired = true;
  $("#loginMask").hidden = false;
  setTimeout(() => $("#pinInput").focus(), 60);
}

function hideLogin() {
  state.loginRequired = false;
  $("#loginMask").hidden = true;
  $("#loginError").textContent = "";
  $("#pinInput").value = "";
}

async function api(path, options = {}, opts = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  if (response.status === 401 && !opts.allow401) {
    showLogin();
    throw new Error("需要访问密码");
  }
  const type = response.headers.get("content-type") || "";
  let payload = null;
  if (type.includes("application/json")) {
    payload = await response.json();
  } else if (type.startsWith("text/")) {
    payload = await response.text();
  }
  if (!response.ok) {
    throw new Error((payload && payload.detail) || `请求失败（${response.status}）`);
  }
  return payload;
}

function jsonRequest(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/* ---------------- 文件列表 ---------------- */

function renderCrumbs(items) {
  const box = $("#crumbs");
  box.innerHTML = "";
  items.forEach((item, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.textContent = "/";
      box.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.className = "crumb" + (index === items.length - 1 ? " current" : "");
    btn.textContent = item.name;
    btn.title = item.name;
    btn.addEventListener("click", () => navigate(item.path));
    box.appendChild(btn);
  });
}

function rowHTML(entry, opts = {}) {
  const type = typeOf(entry);
  const isDir = entry.type === "dir";
  const badge = isDir ? FOLDER_SVG : esc((entry.ext || "FILE").slice(0, 4));
  const sub = opts.sub ?? (isDir
    ? entry.path || "共享根目录"
    : `${formatSize(entry.size)} · ${formatTime(entry.mtime)}`);
  const actions = isDir
    ? `
      <button class="row-action" data-act="open" title="打开">${ICONS.open}</button>
      <button class="row-action" data-act="rename" title="重命名">${ICONS.rename}</button>
      <button class="row-action danger" data-act="delete" title="删除">${ICONS.trash}</button>`
    : `
      <button class="row-action" data-act="preview" title="预览">${ICONS.preview}</button>
      <button class="row-action" data-act="download" title="下载">${ICONS.download}</button>
      <button class="row-action" data-act="rename" title="重命名">${ICONS.rename}</button>
      <button class="row-action danger" data-act="delete" title="删除">${ICONS.trash}</button>`;

  return `
    <div class="row" data-path="${esc(entry.path)}" data-type="${entry.type}">
      <div class="row-icon ${type}">${badge}</div>
      <div class="row-meta">
        <div class="row-name" title="${esc(entry.name)}">${esc(entry.name)}</div>
        <div class="row-sub" title="${esc(sub)}">${esc(sub)}</div>
      </div>
      <div class="row-actions">${actions}</div>
    </div>`;
}

function renderFiles(payload) {
  state.entries = payload.entries || [];
  state.breadcrumb = payload.breadcrumb || [];
  state.entryMap = new Map(state.entries.map((item) => [item.path, item]));

  renderCrumbs(state.breadcrumb);
  $("#backBtn").disabled = payload.parent === null || payload.parent === undefined;

  const list = $("#fileList");
  const empty = $("#fileEmpty");
  if (!state.entries.length) {
    list.innerHTML = "";
    empty.hidden = false;
    $("#emptyText").textContent = "这个文件夹还是空的";
  } else {
    empty.hidden = true;
    list.innerHTML = state.entries.map(rowHTML).join("");
  }
}

function renderSearchResults(entries, keyword) {
  state.entries = entries;
  state.entryMap = new Map(entries.map((item) => [item.path, item]));
  renderCrumbs([{ name: `搜索：${keyword}`, path: state.path }]);
  $("#backBtn").disabled = true;

  const list = $("#fileList");
  const empty = $("#fileEmpty");
  if (!entries.length) {
    list.innerHTML = "";
    empty.hidden = false;
    $("#emptyText").textContent = "没有找到匹配的文件";
    return;
  }
  empty.hidden = true;
  list.innerHTML = entries
    .map((entry) => {
      const dir = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
      const sub = entry.type === "dir"
        ? `文件夹 · ${entry.path}`
        : `位于 ${dir || "根目录"} · ${formatSize(entry.size)}`;
      return rowHTML(entry, { sub });
    })
    .join("");
}

let filesSnapshot = "";

async function loadFiles(silent = false) {
  if (state.search) return;
  const target = state.path;
  try {
    const payload = await api(`/api/files?path=${encodeURIComponent(target)}`);
    if (target !== state.path || state.search) return;
    const snapshot = JSON.stringify(payload.entries);
    if (silent && snapshot === filesSnapshot) return;
    filesSnapshot = snapshot;
    renderFiles(payload);
  } catch (err) {
    if (state.loginRequired) return;
    if (!silent) toast(err.message, true);
  }
}

async function navigate(path) {
  state.path = path;
  state.search = "";
  $("#searchInput").value = "";
  $("#searchClear").hidden = true;
  await loadFiles();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- 文件操作 ---------------- */

function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length || state.uploading) return;
  if (state.search) {
    state.search = "";
    $("#searchInput").value = "";
    $("#searchClear").hidden = true;
  }

  state.uploading = true;
  const progress = $("#progress");
  const bar = $("#progressBar");
  const text = $("#progressText");
  progress.hidden = false;
  bar.style.width = "0%";
  text.textContent = `准备上传 ${files.length} 个文件…`;

  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/api/files/upload?path=${encodeURIComponent(state.path)}`);
  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    bar.style.width = `${percent}%`;
    text.textContent = `${percent}% · ${formatSize(event.loaded)} / ${formatSize(event.total)}`;
  };
  const failUpload = (message) => {
    state.uploading = false;
    progress.hidden = false;
    bar.style.width = "0%";
    text.textContent = message;
    text.style.color = "var(--danger)";
    toast(message, true);
    setTimeout(() => {
      progress.hidden = true;
      text.style.color = "";
    }, 6000);
  };

  xhr.onload = () => {
    let payload = {};
    try {
      payload = JSON.parse(xhr.responseText || "{}");
    } catch (err) {
      payload = {};
    }
    if (xhr.status === 401) {
      state.uploading = false;
      showLogin();
      return;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      state.uploading = false;
      bar.style.width = "100%";
      text.style.color = "";
      const count = payload.saved ? payload.saved.length : files.length;
      text.textContent = `已上传 ${count} 个文件`;
      toast("上传完成");
      setTimeout(() => { progress.hidden = true; }, 1200);
      loadFiles();
    } else {
      const detail = payload.detail || xhr.statusText || "";
      failUpload(detail ? `上传失败：${detail}` : `上传失败（HTTP ${xhr.status}）`);
    }
  };
  xhr.onerror = () => failUpload("上传失败：无法连接服务器，请确认服务仍在运行");
  xhr.ontimeout = () => failUpload("上传失败：请求超时");
  xhr.send(form);
}

async function createFolder() {
  const name = window.prompt("新建文件夹名称");
  if (!name || !name.trim()) return;
  try {
    await api("/api/files/mkdir", jsonRequest("POST", { path: state.path, name: name.trim() }));
    toast("文件夹已创建");
    loadFiles();
  } catch (err) {
    toast(err.message, true);
  }
}

async function renameEntry(entry) {
  const name = window.prompt("重命名", entry.name);
  if (!name || !name.trim() || name.trim() === entry.name) return;
  try {
    await api("/api/files/rename", jsonRequest("POST", { path: entry.path, name: name.trim() }));
    toast("已重命名");
    loadFiles();
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteEntry(entry) {
  const label = entry.type === "dir" ? `文件夹「${entry.name}」及其中全部内容` : `「${entry.name}」`;
  if (!window.confirm(`确定删除${label}？此操作不可撤销。`)) return;
  try {
    await api("/api/files/delete", jsonRequest("POST", { path: entry.path }));
    toast("已删除");
    loadFiles();
  } catch (err) {
    toast(err.message, true);
  }
}

function downloadEntry(entry) {
  const link = document.createElement("a");
  link.href = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
  link.download = entry.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* ---------------- 预览 ---------------- */

async function openPreview(entry) {
  const body = $("#previewBody");
  const rawUrl = `/api/files/raw?path=${encodeURIComponent(entry.path)}`;
  $("#previewTitle").textContent = entry.name;
  const dl = $("#previewDownload");
  dl.href = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
  dl.setAttribute("download", entry.name);

  const type = typeOf(entry);
  if (type === "image") {
    body.innerHTML = `<img src="${esc(rawUrl)}" alt="${esc(entry.name)}">`;
  } else if (type === "video") {
    body.innerHTML = `<video src="${esc(rawUrl)}" controls autoplay playsinline></video>`;
  } else if (type === "audio") {
    body.innerHTML = `<audio src="${esc(rawUrl)}" controls autoplay></audio>`;
  } else if (type === "pdf") {
    body.innerHTML = `<iframe src="${esc(rawUrl)}" title="PDF 预览"></iframe>`;
  } else if (TEXT_EXTS.has(entry.ext) || entry.size <= 512 * 1024) {
    body.innerHTML = '<div class="preview-note">正在读取…</div>';
    $("#previewModal").hidden = false;
    try {
      const data = await api(`/api/files/text?path=${encodeURIComponent(entry.path)}`);
      body.innerHTML = `<pre>${esc(data.content)}</pre>`;
      if (data.truncated) {
        body.insertAdjacentHTML(
          "beforeend",
          '<p class="preview-note">文件较大，仅显示前 256 KB，完整内容请下载查看</p>',
        );
      }
    } catch (err) {
      body.innerHTML = `<div class="preview-note">${esc(err.message || "无法预览此文件")}<br>请下载后查看</div>`;
    }
    return;
  } else {
    body.innerHTML =
      '<div class="preview-note">该类型暂不支持在线预览<br>可点击右上角「下载」保存到本机</div>';
  }
  $("#previewModal").hidden = false;
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  if (id === "previewModal") {
    const body = $("#previewBody");
    body.querySelectorAll("video, audio").forEach((el) => el.pause());
    body.innerHTML = "";
  }
}

/* ---------------- 搜索 ---------------- */

let searchTimer = null;

function bindSearch() {
  const input = $("#searchInput");
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const keyword = input.value.trim();
    $("#searchClear").hidden = !keyword;
    searchTimer = setTimeout(async () => {
      if (!keyword) {
        state.search = "";
        await loadFiles();
        return;
      }
      try {
        const data = await api(`/api/search?q=${encodeURIComponent(keyword)}`);
        state.search = keyword;
        renderSearchResults(data.entries || [], keyword);
      } catch (err) {
        toast(err.message, true);
      }
    }, 280);
  });

  $("#searchClear").addEventListener("click", async () => {
    input.value = "";
    $("#searchClear").hidden = true;
    state.search = "";
    await loadFiles();
  });
}

/* ---------------- 共享文本 ---------------- */

async function loadClips(silent = false) {
  try {
    const data = await api("/api/clips");
    const snapshot = JSON.stringify(data.clips);
    if (silent && snapshot === JSON.stringify(state.clips)) return;
    state.clips = data.clips || [];
    renderClips();
  } catch (err) {
    if (!silent && !state.loginRequired) toast(err.message, true);
  }
}

function renderClips() {
  const list = $("#clipList");
  const empty = $("#clipEmpty");
  if (!state.clips.length) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = state.clips
    .map(
      (clip) => `
      <article class="clip ${clip.pinned ? "pinned" : ""}" data-id="${clip.id}">
        <p class="clip-text">${esc(clip.content)}</p>
        <div class="clip-foot">
          <span class="clip-time">${clip.pinned ? "📌 已置顶 · " : ""}${formatTime(clip.updated_at)}</span>
          <button class="clip-action" data-act="copy">复制</button>
          <button class="clip-action ${clip.pinned ? "pin-on" : ""}" data-act="pin">${clip.pinned ? "取消置顶" : "置顶"}</button>
          <button class="clip-action" data-act="edit">编辑</button>
          <button class="clip-action danger" data-act="delete">删除</button>
        </div>
      </article>`,
    )
    .join("");
}

function bindClips() {
  const input = $("#clipInput");
  const count = $("#clipCount");
  input.addEventListener("input", () => {
    count.textContent = `${input.value.length} / 20000`;
  });

  const send = async () => {
    const content = input.value.trim();
    if (!content) {
      toast("请输入要共享的文字", true);
      return;
    }
    try {
      await api("/api/clips", jsonRequest("POST", { content }));
      input.value = "";
      count.textContent = "0 / 20000";
      toast("已发送，其他设备刷新即可看到");
      await loadClips();
    } catch (err) {
      toast(err.message, true);
    }
  };

  $("#clipSend").addEventListener("click", send);
  input.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      send();
    }
  });

  $("#clipList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const card = button.closest(".clip");
    const clip = state.clips.find((item) => item.id === card.dataset.id);
    if (!clip) return;
    const act = button.dataset.act;
    try {
      if (act === "copy") {
        const ok = await copyText(clip.content);
        toast(ok ? "已复制到剪贴板" : "复制失败，请长按文字手动复制", !ok);
      } else if (act === "pin") {
        await api(`/api/clips/${clip.id}`, jsonRequest("PUT", { pinned: !clip.pinned }));
        await loadClips();
      } else if (act === "edit") {
        state.editingClip = clip;
        $("#editInput").value = clip.content;
        $("#editModal").hidden = false;
        setTimeout(() => $("#editInput").focus(), 50);
      } else if (act === "delete") {
        if (!window.confirm("确定删除这条共享文本？")) return;
        await api(`/api/clips/${clip.id}`, { method: "DELETE" });
        toast("已删除");
        await loadClips();
      }
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#editSave").addEventListener("click", async () => {
    if (!state.editingClip) return;
    const content = $("#editInput").value.trim();
    if (!content) {
      toast("内容不能为空", true);
      return;
    }
    try {
      await api(`/api/clips/${state.editingClip.id}`, jsonRequest("PUT", { content }));
      closeModal("editModal");
      state.editingClip = null;
      toast("已保存");
      await loadClips();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ---------------- 地址与二维码 ---------------- */

function openAddrModal() {
  const info = state.info || {};
  const protocol = location.protocol === "file:" ? "http:" : location.protocol;
  const port = info.port || location.port || 8777;
  const urls = [];

  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!isLocalHost) {
    urls.push({ url: location.origin, tag: "当前访问" });
  }
  for (const ip of info.ips || []) {
    urls.push({ url: `${protocol}//${ip}:${port}`, tag: "局域网" });
  }
  if (!urls.length) {
    urls.push({ url: `${protocol}//${location.hostname}:${port}`, tag: "本机" });
  }

  const list = $("#addrList");
  list.innerHTML = "";
  urls.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "addr-item";
    row.innerHTML = `<span class="tag">${esc(item.tag)}</span><code>${esc(item.url)}</code><button>复制</button>`;
    row.querySelector("button").addEventListener("click", async () => {
      const ok = await copyText(item.url);
      toast(ok ? "地址已复制" : "复制失败，请手动选择地址", !ok);
    });
    list.appendChild(row);
    if (index === 0) {
      $("#qrImg").src = `/api/qr?text=${encodeURIComponent(item.url)}`;
    }
  });

  $("#addrHint").textContent = info.storage_path
    ? `共享目录：${info.storage_path}`
    : "手机需与电脑连接同一个局域网 / Wi-Fi";
  $("#addrModal").hidden = false;
}

/* ---------------- 视图切换 ---------------- */

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  $("#view-files").hidden = view !== "files";
  $("#view-texts").hidden = view !== "texts";
  if (view === "texts") loadClips();
  if (view === "files") loadFiles(true);
}

/* ---------------- 主题 ---------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("lanhub-theme-v2", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#ffffff" : "#0a0d16";
}

/* ---------------- 初始化 ---------------- */

function bindEvents() {
  $("#uploadBtn").addEventListener("click", () => $("#filePicker").click());
  $("#filePicker").addEventListener("change", (event) => {
    uploadFiles(event.target.files);
    event.target.value = "";
  });
  $("#mkdirBtn").addEventListener("click", createFolder);
  $("#refreshBtn").addEventListener("click", () => loadFiles());
  $("#backBtn").addEventListener("click", () => {
    if (state.search) {
      state.search = "";
      $("#searchInput").value = "";
      $("#searchClear").hidden = true;
      loadFiles();
      return;
    }
    const target = state.breadcrumb.length > 1 ? state.breadcrumb[state.breadcrumb.length - 2].path : "";
    navigate(target);
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  $("#fileList").addEventListener("click", (event) => {
    const row = event.target.closest(".row");
    if (!row) return;
    const entry = state.entryMap.get(row.dataset.path);
    if (!entry) return;
    const action = event.target.closest("[data-act]");
    if (action) {
      const act = action.dataset.act;
      if (act === "open") navigate(entry.path);
      else if (act === "download") downloadEntry(entry);
      else if (act === "preview") openPreview(entry);
      else if (act === "rename") renameEntry(entry);
      else if (act === "delete") deleteEntry(entry);
      return;
    }
    if (event.target.closest(".row-name")) {
      if (entry.type === "dir") navigate(entry.path);
      else openPreview(entry);
    }
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  $("#previewClose").addEventListener("click", () => closeModal("previewModal"));
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("mousedown", (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  $("#addrBtn").addEventListener("click", openAddrModal);
  $("#themeBtn").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ["previewModal", "addrModal", "editModal"].forEach(closeModal);
    }
  });

  // 拖拽上传
  const overlay = $("#dropOverlay");
  let dragDepth = 0;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  document.addEventListener("dragover", (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  document.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    overlay.classList.add("show");
  });
  document.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.classList.remove("show");
  });
  document.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    overlay.classList.remove("show");
    if (state.view !== "files") switchView("files");
    uploadFiles(event.dataTransfer.files);
  });

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = $("#pinInput").value.trim();
    if (!pin) return;
    $("#loginBtn").disabled = true;
    $("#loginError").textContent = "";
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "密码错误");
      hideLogin();
      await boot();
      startPolling();
    } catch (err) {
      $("#loginError").textContent = err.message;
    } finally {
      $("#loginBtn").disabled = false;
    }
  });
}

async function boot() {
  state.info = await api("/api/info", {}, { allow401: true });
  $("#appName").textContent = state.info.name || "局域网共享";
  document.title = state.info.name || "局域网共享";
  $("#hostLine").textContent = `${location.host} · ${state.info.hostname || "本机"}`;
  if (state.info.disk) {
    $("#diskInfo").textContent = `剩余 ${formatSize(state.info.disk.free)} / 共 ${formatSize(state.info.disk.total)}`;
  }
  await loadFiles();
  await loadClips(true);
}

let pollTick = 0;
let pollStarted = false;

function startPolling() {
  if (pollStarted) return;
  pollStarted = true;
  setInterval(() => {
    if (document.hidden || state.loginRequired) return;
    pollTick += 1;
    if (state.view === "texts") {
      loadClips(true);
    } else if (pollTick % 3 === 0 && !state.uploading) {
      loadFiles(true);
    }
  }, 5000);
}

async function init() {
  applyTheme(localStorage.getItem("lanhub-theme-v2") || "light");
  bindEvents();
  bindSearch();
  bindClips();
  try {
    const info = await api("/api/info", {}, { allow401: true });
    state.info = info;
    if (info.need_pin && !info.authenticated) {
      showLogin();
      return;
    }
    await boot();
    startPolling();
  } catch (err) {
    $("#hostLine").textContent = "无法连接服务器";
    toast(err.message || "无法连接服务器", true);
  }
}

init();
