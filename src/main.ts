import { installMockIfNeeded } from "./mock";
installMockIfNeeded();

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { disable as autostartDisable, enable as autostartEnable, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { relativeTime, resolveLang, setLang, t, type LangSetting } from "./i18n";

type Instance = {
  id: string;
  name: string;
  dir: string;
  icon: string | null;
  color: string;
  shortcut: number | null;
  lastUsed: number | null;
};

type Config = {
  claudePath: string | null;
  instances: Instance[];
  shortcutsEnabled: boolean;
  language: LangSetting;
  openAtLogin: boolean;
  showInMenuBar: boolean;
  view: "grid" | "list";
};

type AppInfo = { name: string; version: string; author: string; repoUrl: string };

type Environment = {
  os: string;
  home: string;
  instancesRoot: string;
  detectedClaudePath: string | null;
  claudeVersion: string | null;
  configFile: string;
};

type Filter = "all" | "running" | "stopped";

const PALETTE = ["#E5533D", "#E0A42B", "#3FB950", "#22B8A6", "#3E8BF0", "#8B6CEF", "#D45BA8", "#F97316"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const icon = (name: string) => `<svg><use href="#i-${name}"/></svg>`;

// The regular Claude profile (no --user-data-dir). Known to the backend under this id.
const DEFAULT_ID = "__default__";
const DEFAULT_INSTANCE: Instance = { id: DEFAULT_ID, name: "Claude", dir: "", icon: null, color: "#D97757", shortcut: 0, lastUsed: null };

let config: Config = {
  claudePath: null,
  instances: [],
  shortcutsEnabled: true,
  language: "system",
  openAtLogin: false,
  showInMenuBar: true,
  view: "grid",
};
let env: Environment | null = null;
let appInfo: AppInfo | null = null;
let running = new Set<string>();
let activeId: string | null = null; // instance that owns the frontmost Claude window
let filter: Filter = "all";
let query = "";

// sheet state
let editing: Instance | null = null; // null => creating
let draft: Instance | null = null;
let dirTouched = false;

// ---------- helpers ----------

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function avatarEl(inst: Pick<Instance, "id" | "name" | "icon" | "color">, cls = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = `avatar ${cls}`.trim();
  if (inst.icon) {
    const img = document.createElement("img");
    img.src = inst.icon;
    img.alt = "";
    img.draggable = false;
    el.appendChild(img);
  } else if (inst.id === DEFAULT_ID) {
    el.style.background = inst.color;
    el.innerHTML = icon("asterisk");
  } else {
    el.style.background = inst.color || PALETTE[0];
    el.textContent = initials(inst.name);
  }
  return el;
}

/** Shortcut slots: explicit values first, then free slots in list order (mirrors the backend). */
function slots(): Map<string, number> {
  const taken = new Set<number>();
  const out = new Map<string, number>();
  for (const i of config.instances) {
    if (i.shortcut && i.shortcut >= 1 && i.shortcut <= 9 && !taken.has(i.shortcut)) {
      taken.add(i.shortcut);
      out.set(i.id, i.shortcut);
    }
  }
  for (const i of config.instances) {
    if (out.has(i.id)) continue;
    for (let n = 1; n <= 9; n++) {
      if (!taken.has(n)) {
        taken.add(n);
        out.set(i.id, n);
        break;
      }
    }
  }
  out.set(DEFAULT_ID, 0);
  return out;
}

const kbdFor = (slot: number | undefined) => (slot === undefined ? "" : `⌃⌥${slot}`);

let toastTimer: number | undefined;
function toast(msg: string, isError = false) {
  const el = $<HTMLDivElement>("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add("hidden"), isError ? 5000 : 2200);
}

async function persist() {
  await invoke("save_config", { config });
}

function applyConfig(next: Config) {
  config = { ...config, ...next };
  if (config.view !== "grid" && config.view !== "list") config.view = "grid";
}

// ---------- rendering ----------

function visibleInstances(): Instance[] {
  const q = query.trim().toLowerCase();
  const all = [DEFAULT_INSTANCE, ...config.instances];
  return all.filter((i) => {
    const isRunning = running.has(i.id);
    if (filter === "running" && !isRunning) return false;
    if (filter === "stopped" && isRunning) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const total = config.instances.length + 1;
  const runningCount = [DEFAULT_INSTANCE, ...config.instances].filter((i) => running.has(i.id)).length;

  $("#subtitle").textContent =
    total === 1 ? t("subtitleOne", { r: runningCount }) : t("subtitle", { n: total, r: runningCount });
  $("#count-all").textContent = String(total);
  $("#count-running").textContent = String(runningCount);
  $("#count-stopped").textContent = String(total - runningCount);
  document.querySelectorAll<HTMLButtonElement>("#filter .seg").forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));
  document.querySelectorAll<HTMLButtonElement>("#view-toggle .seg").forEach((b) => b.classList.toggle("active", b.dataset.view === config.view));

  const grid = $<HTMLElement>("#grid");
  grid.classList.toggle("list", config.view === "list");
  grid.innerHTML = "";
  const slotMap = slots();
  const list = visibleInstances();
  for (const inst of list) grid.appendChild(cardEl(inst, slotMap.get(inst.id)));
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grid-empty";
    empty.textContent = query || filter !== "all" ? t("noResults") : t("emptyHint");
    grid.appendChild(empty);
  }
  if (filter === "all" && !query.trim()) grid.appendChild(addTileEl());

  $("#status").textContent = runningCount === 0 ? t("statusNoneRunning") : t("statusRunning", { r: runningCount, n: total });
  $("#status-dot").classList.toggle("on", runningCount > 0);
}

function metaFor(inst: Instance, isRunning: boolean): string {
  if (inst.id === DEFAULT_ID) return isRunning && activeId === inst.id ? t("activeWindow") : t("defaultProfile");
  if (isRunning) return activeId === inst.id ? t("activeWindow") : t("active");
  return relativeTime(inst.lastUsed);
}

function cardEl(inst: Instance, slot: number | undefined): HTMLElement {
  const isRunning = running.has(inst.id);
  const card = document.createElement("article");
  card.className = "card" + (isRunning ? " running" : " stopped") + (activeId === inst.id ? " active" : "");
  card.dataset.id = inst.id;

  const top = document.createElement("div");
  top.className = "card-top";
  const pill = document.createElement("span");
  pill.className = "pill" + (isRunning ? " running" : "");
  pill.innerHTML = `<span class="dot"></span>${isRunning ? t("running") : t("stopped")}`;
  top.appendChild(pill);
  if (slot !== undefined && config.shortcutsEnabled) {
    const kbd = document.createElement("kbd");
    kbd.textContent = kbdFor(slot);
    top.appendChild(kbd);
  }
  card.appendChild(top);

  const identity = document.createElement("div");
  identity.className = "identity";
  identity.title = inst.dir || t("defaultProfile");
  identity.appendChild(avatarEl(inst));
  const text = document.createElement("div");
  text.className = "identity-text";
  text.innerHTML = `<div class="name"></div><div class="meta"></div>`;
  text.querySelector(".name")!.textContent = inst.name;
  text.querySelector(".meta")!.textContent = metaFor(inst, isRunning);
  identity.appendChild(text);
  identity.addEventListener("dblclick", () => launch(inst, card));
  card.appendChild(identity);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "btn" + (isRunning ? "" : " soft");
  primary.innerHTML = `${icon(isRunning ? "window" : "play")}<span>${isRunning ? t("focus") : t("launch")}</span>`;
  primary.addEventListener("click", () => launch(inst, card));
  actions.appendChild(primary);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "btn more";
  more.title = t("more");
  more.innerHTML = icon("more");
  more.addEventListener("click", (e) => {
    e.stopPropagation();
    openCardMenu(inst, more);
  });
  actions.appendChild(more);
  card.appendChild(actions);
  return card;
}

function addTileEl(): HTMLElement {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "card add";
  tile.innerHTML = `<div class="add-icon">${icon("plus")}</div><div class="add-title">${t("addTileTitle")}</div><div class="add-hint">${t("addTileHint")}</div>`;
  tile.addEventListener("click", () => openSheet(null));
  return tile;
}

// ---------- card menu ----------

function closeCardMenu() {
  $("#card-menu").classList.add("hidden");
}

function openCardMenu(inst: Instance, anchor: HTMLElement) {
  const menu = $<HTMLDivElement>("#card-menu");
  const isRunning = running.has(inst.id);
  const items: { label: string; ic: string; cls?: string; run: () => void }[] = [
    { label: isRunning ? t("focus") : t("launch"), ic: isRunning ? "window" : "play", run: () => launch(inst) },
  ];
  if (inst.id !== DEFAULT_ID) {
    items.push({ label: t("edit"), ic: "pencil", run: () => openSheet(inst) });
    items.push({ label: t("revealFolder"), ic: "folder", run: () => revealItemInDir(inst.dir).catch((e) => toast(String(e), true)) });
  }
  if (isRunning) items.push({ label: t("quitInstance"), ic: "power", run: () => quitInstance(inst) });
  if (inst.id !== DEFAULT_ID) items.push({ label: t("remove"), ic: "trash", cls: "danger", run: () => removeInstance(inst) });

  menu.innerHTML = "";
  items.forEach((it, idx) => {
    if (it.cls === "danger" && idx > 0) menu.appendChild(document.createElement("hr"));
    const b = document.createElement("button");
    b.type = "button";
    b.className = it.cls ?? "";
    b.innerHTML = `${icon(it.ic)}<span></span>`;
    b.querySelector("span")!.textContent = it.label;
    b.addEventListener("click", () => {
      closeCardMenu();
      it.run();
    });
    menu.appendChild(b);
  });
  menu.classList.remove("hidden");
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let x = r.right - mw;
  let y = r.bottom + 6;
  if (x < 8) x = 8;
  if (y + mh > window.innerHeight - 8) y = r.top - mh - 6;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

// ---------- actions ----------

async function launch(inst: Instance, card?: HTMLElement) {
  card?.classList.add("launching");
  try {
    const result = await invoke<string>("launch_instance", { id: inst.id });
    toast(result === "focused" ? t("alreadyOpen", { name: inst.name }) : t("opening", { name: inst.name }));
    for (const ms of [800, 2000, 4000]) window.setTimeout(refreshRunning, ms);
  } catch (e) {
    toast(String(e), true);
  } finally {
    card?.classList.remove("launching");
  }
}

async function quitInstance(inst: Instance) {
  try {
    await invoke("quit_instance", { id: inst.id });
    for (const ms of [800, 2000, 4000]) window.setTimeout(refreshRunning, ms);
  } catch (e) {
    toast(String(e), true);
  }
}

async function removeInstance(inst: Instance) {
  const ok = await ask(t("confirmRemove", { name: inst.name, dir: inst.dir }), {
    title: t("remove"),
    kind: "warning",
    okLabel: t("delete"),
    cancelLabel: t("cancel"),
  });
  if (!ok) return;
  config.instances = config.instances.filter((i) => i.id !== inst.id);
  await persist();
  render();
}

function applyRunning(ids: string[]) {
  const next = new Set(ids);
  const changed = next.size !== running.size || [...next].some((id) => !running.has(id));
  running = next;
  if (changed) render();
}

async function refreshRunning() {
  try {
    applyRunning(await invoke<string[]>("running_instances"));
  } catch {
    /* ignore polling errors */
  }
}

// ---------- instance sheet ----------

function sheetSlot(): number | undefined {
  if (!draft) return undefined;
  if (draft.shortcut && draft.shortcut >= 1) return draft.shortcut;
  // Preview of the automatic slot: compute as if the draft were in the list.
  const others = editing ? config.instances.filter((i) => i.id !== editing!.id) : config.instances;
  const fake: Config = { ...config, instances: [...others, { ...draft, id: draft.id || "__draft__" }] };
  const saved = config;
  config = fake;
  const s = slots().get(draft.id || "__draft__");
  config = saved;
  return s;
}

function renderPreview() {
  if (!draft) return;
  const name = $<HTMLInputElement>("#f-name").value.trim() || draft.name || "Acme";
  const preview = $<HTMLElement>("#preview");
  preview.style.setProperty("--tint", draft.icon ? "var(--surface-2)" : `${draft.color}26`);
  $<HTMLElement>("#preview-avatar").replaceWith(Object.assign(avatarEl({ ...draft, name }, "xl"), { id: "preview-avatar" }));
  $("#preview-name").textContent = name;
  $("#preview-kbd").textContent = kbdFor(sheetSlot());
  const dropIcon = $<HTMLElement>("#drop-icon");
  dropIcon.innerHTML = draft.icon ? `<img src="${draft.icon}" alt="">` : icon("image-plus");
  $("#btn-clear-icon").classList.toggle("hidden", !draft.icon);
}

function renderSwatches() {
  const wrap = $<HTMLElement>("#swatches");
  wrap.innerHTML = "";
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (draft?.color.toUpperCase() === c ? " selected" : "");
    b.title = c;
    b.innerHTML = `<i style="background:${c}">${icon("check")}</i>`;
    b.addEventListener("click", () => {
      if (!draft) return;
      draft.color = c;
      renderSwatches();
      renderPreview();
    });
    wrap.appendChild(b);
  }
}

function renderSlotOptions() {
  if (!draft) return;
  const sel = $<HTMLSelectElement>("#f-slot");
  sel.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = t("nextSlot");
  sel.appendChild(auto);
  const current = slots();
  for (let n = 1; n <= 9; n++) {
    const owner = config.instances.find((i) => i.shortcut === n && (!editing || i.id !== editing.id));
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = `⌃⌥${n}` + (owner ? ` · ${t("slotTaken", { name: owner.name })}` : "");
    o.disabled = !!owner;
    sel.appendChild(o);
  }
  void current;
  sel.value = draft.shortcut && draft.shortcut >= 1 ? String(draft.shortcut) : "";
  $("#slot-kbd").textContent = kbdFor(sheetSlot());
}

function openSheet(inst: Instance | null) {
  closeCardMenu();
  editing = inst;
  draft = inst
    ? { ...inst }
    : { id: "", name: "", dir: "", icon: null, color: PALETTE[config.instances.length % PALETTE.length], shortcut: null, lastUsed: null };
  dirTouched = !!inst;

  $("#sheet-title").textContent = inst ? t("sheetEditTitle") : t("sheetNewTitle");
  $<HTMLInputElement>("#f-name").value = draft.name;
  $<HTMLInputElement>("#f-dir").value = draft.dir;
  $("#dir-auto").classList.toggle("hidden", dirTouched);
  $("#btn-delete").classList.toggle("hidden", !inst);
  $("#btn-save-label").textContent = inst ? t("save") : t("createLaunch");
  $("#btn-save-icon").classList.toggle("hidden", !!inst);
  ($("#advanced") as HTMLDetailsElement).open = !!inst;
  renderSwatches();
  renderSlotOptions();
  renderPreview();
  if (!inst) void suggestDir();

  $<HTMLDialogElement>("#dlg-instance").showModal();
  $<HTMLInputElement>("#f-name").focus();
}

function closeSheet() {
  $<HTMLDialogElement>("#dlg-instance").close();
  editing = null;
  draft = null;
}

async function suggestDir() {
  if (dirTouched) return;
  const name = $<HTMLInputElement>("#f-name").value.trim() || "instance";
  const dir = await invoke<string>("suggest_dir", { name });
  if (!dirTouched) $<HTMLInputElement>("#f-dir").value = dir;
}

async function pickDir() {
  const current = $<HTMLInputElement>("#f-dir").value;
  const picked = await openDialog({ directory: true, multiple: false, defaultPath: current || env?.instancesRoot, title: t("pickFolderTitle") });
  if (typeof picked === "string") {
    $<HTMLInputElement>("#f-dir").value = picked;
    dirTouched = true;
    $("#dir-auto").classList.add("hidden");
  }
}

async function setIconFromPath(path: string) {
  if (!draft) return;
  try {
    draft.icon = await invoke<string>("read_icon", { path });
    renderPreview();
  } catch (e) {
    toast(String(e), true);
  }
}

async function pickIcon() {
  const picked = await openDialog({ multiple: false, directory: false, title: t("pickImageTitle"), filters: [{ name: t("images"), extensions: IMAGE_EXT }] });
  if (typeof picked === "string") await setIconFromPath(picked);
}

async function saveSheet(e: Event) {
  e.preventDefault();
  if (!draft) return;
  const name = $<HTMLInputElement>("#f-name").value.trim();
  const dir = $<HTMLInputElement>("#f-dir").value.trim();
  if (!name) return toast(t("nameRequired"), true);
  if (!dir) return toast(t("folderRequired"), true);
  const clash = config.instances.find((i) => i.dir === dir && i.id !== draft!.id);
  if (clash) return toast(t("folderInUse", { name: clash.name }), true);

  draft.name = name;
  draft.dir = dir;
  const slotVal = $<HTMLSelectElement>("#f-slot").value;
  draft.shortcut = slotVal ? Number(slotVal) : null;

  const creating = !editing;
  if (editing) {
    const idx = config.instances.findIndex((i) => i.id === editing!.id);
    if (idx >= 0) config.instances[idx] = draft;
  } else {
    draft.id = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
    config.instances.push(draft);
  }
  const created = draft;
  try {
    await persist();
    closeSheet();
    render();
    if (creating) await launch(created);
  } catch (err) {
    toast(String(err), true);
  }
}

// ---------- settings ----------

async function renderSettings() {
  const custom = !!config.claudePath;
  const path = config.claudePath ?? env?.detectedClaudePath ?? null;
  const badge = $<HTMLElement>("#claude-badge");
  badge.className = "badge " + (path ? (custom ? "warn" : "success") : "warn");
  $("#claude-badge-text").textContent = path ? (custom ? t("manualPath") : t("autoDetected")) : t("notFound");
  $("#claude-path").textContent = path ? `${path}${env?.claudeVersion ? ` · v${env.claudeVersion}` : ""}` : "—";
  $("#btn-use-detected").classList.toggle("hidden", !custom || !env?.detectedClaudePath);

  $<HTMLSelectElement>("#s-lang").value = config.language ?? "system";
  $<HTMLInputElement>("#s-tray").checked = config.showInMenuBar !== false;
  $<HTMLInputElement>("#s-shortcuts").checked = config.shortcutsEnabled !== false;
  $("#s-root").textContent = env?.instancesRoot ?? "";
  $("#s-config").textContent = env?.configFile ?? "";
  $("#settings-footer").textContent = t("settingsFooter", { v: appInfo?.version ?? "" });
  try {
    $<HTMLInputElement>("#s-login").checked = await autostartEnabled();
  } catch {
    $<HTMLInputElement>("#s-login").checked = config.openAtLogin;
  }
}

function openSettings() {
  void renderSettings();
  $<HTMLDialogElement>("#dlg-settings").showModal();
}

async function saveSettings(patch: Partial<Config>) {
  Object.assign(config, patch);
  try {
    await persist();
  } catch (e) {
    toast(String(e), true);
  }
}

async function pickClaude() {
  const isMac = env?.os === "macos";
  const picked = await openDialog({
    multiple: false,
    directory: isMac,
    defaultPath: isMac ? "/Applications" : undefined,
    title: t("selectClaude"),
    filters: isMac ? undefined : [{ name: t("executable"), extensions: ["exe"] }],
  });
  if (typeof picked === "string") {
    await saveSettings({ claudePath: picked });
    await refreshEnv();
    void renderSettings();
  }
}

async function refreshEnv() {
  try {
    env = await invoke<Environment>("get_environment");
  } catch {
    /* keep the old one */
  }
}

async function importInstances() {
  try {
    const before = config.instances.length;
    applyConfig(await invoke<Config>("import_instances"));
    const added = config.instances.length - before;
    toast(added > 0 ? t("importedFolders", { n: added }) : t("noNewFolders"));
    render();
    refreshRunning();
  } catch (err) {
    toast(String(err), true);
  }
}

// ---------- backup ----------

function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `claude-switcher-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

async function exportConfig() {
  const path = await saveDialog({ title: t("exportTitle"), defaultPath: backupFileName(), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (typeof path !== "string") return;
  try {
    const n = await invoke<number>("export_config", { path });
    toast(t("exported", { n }));
  } catch (e) {
    toast(String(e), true);
  }
}

async function importConfig() {
  const path = await openDialog({ multiple: false, directory: false, title: t("importTitle"), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (typeof path !== "string") return;
  const replace = !(await ask(t("mergeOrReplace"), { title: t("importTitle"), kind: "warning", okLabel: t("merge"), cancelLabel: t("replace") }));
  if (replace) {
    const sure = await ask(t("replaceConfirm"), { title: t("replaceTitle"), kind: "warning", okLabel: t("replace"), cancelLabel: t("cancel") });
    if (!sure) return;
  }
  try {
    const result = await invoke<{ config: Config; added: number; skipped: number }>("import_config", { path, replace });
    applyConfig(result.config);
    render();
    refreshRunning();
    toast(replace ? t("importedReplace", { n: result.added }) : t("importedMerge", { n: result.added, s: result.skipped }));
  } catch (e) {
    toast(String(e), true);
  }
}

// ---------- about ----------

async function openAbout() {
  try {
    const info = appInfo ?? (await invoke<AppInfo>("app_info"));
    appInfo = info;
    $("#about-name").textContent = info.name;
    $("#about-version").textContent = t("version", { v: info.version });
    $("#about-author").textContent = info.author;
    const link = $<HTMLAnchorElement>("#about-link");
    link.textContent = info.repoUrl.replace(/^https?:\/\//, "");
    link.onclick = (e) => {
      e.preventDefault();
      openUrl(info.repoUrl).catch((err) => toast(String(err), true));
    };
  } catch (e) {
    toast(String(e), true);
  }
  for (const d of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) d.close();
  $<HTMLDialogElement>("#dlg-about").showModal();
}

// ---------- init ----------

async function init() {
  try {
    env = await invoke<Environment>("get_environment");
    applyConfig(await invoke<Config>("load_config"));
    appInfo = await invoke<AppInfo>("app_info");
  } catch (e) {
    toast(String(e), true);
  }
  setLang(resolveLang(config.language));
  render();
  await refreshRunning();

  // Backend push events.
  listen<string[]>("running-changed", (e) => applyRunning(e.payload)).catch(() => {});
  listen<string | null>("active-changed", (e) => {
    if (e.payload !== activeId) {
      activeId = e.payload;
      render();
    }
  }).catch(() => {});
  listen<Config>("config-changed", (e) => {
    applyConfig(e.payload);
    render();
  }).catch(() => {});
  listen<string>("launch-error", (e) => toast(e.payload, true)).catch(() => {});
  listen("open-about", () => openAbout()).catch(() => {});
  listen("open-settings", () => openSettings()).catch(() => {});
  listen("new-instance", () => openSheet(null)).catch(() => {});
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshRunning();
  });

  // Header / toolbar.
  $("#btn-add").addEventListener("click", () => openSheet(null));
  $("#btn-settings").addEventListener("click", openSettings);
  $<HTMLInputElement>("#search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    render();
  });
  $("#search-kbd").textContent = env?.os === "macos" ? "⌘K" : "Ctrl K";
  document.querySelectorAll<HTMLButtonElement>("#filter .seg").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter as Filter;
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("#view-toggle .seg").forEach((b) =>
    b.addEventListener("click", () => {
      void saveSettings({ view: b.dataset.view as Config["view"] });
      render();
    }),
  );

  // Card menu dismissal.
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("#card-menu")) closeCardMenu();
  });
  window.addEventListener("resize", closeCardMenu);
  $("#grid").addEventListener("scroll", closeCardMenu);

  // Sheet.
  $("#form-instance").addEventListener("submit", saveSheet);
  $("#btn-cancel").addEventListener("click", closeSheet);
  $("#btn-cancel-2").addEventListener("click", closeSheet);
  $("#btn-delete").addEventListener("click", () => {
    if (editing) {
      const inst = editing;
      closeSheet();
      void removeInstance(inst);
    }
  });
  $("#btn-pick-dir").addEventListener("click", pickDir);
  $("#btn-pick-icon").addEventListener("click", (e) => {
    e.preventDefault();
    void pickIcon();
  });
  $("#dropzone").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    void pickIcon();
  });
  $("#btn-clear-icon").addEventListener("click", () => {
    if (draft) {
      draft.icon = null;
      renderPreview();
    }
  });
  $("#f-name").addEventListener("input", () => {
    renderPreview();
    void suggestDir();
  });
  $("#f-dir").addEventListener("input", () => {
    dirTouched = true;
    $("#dir-auto").classList.add("hidden");
  });
  $("#f-slot").addEventListener("change", (e) => {
    if (!draft) return;
    const v = (e.target as HTMLSelectElement).value;
    draft.shortcut = v ? Number(v) : null;
    $("#slot-kbd").textContent = kbdFor(sheetSlot());
    renderPreview();
  });
  // Native file drops (Tauri routes them as webview drag-drop events, not DOM drops).
  try {
    await getCurrentWebview().onDragDropEvent((event) => {
      const zone = $("#dropzone");
      const open = $<HTMLDialogElement>("#dlg-instance").open;
      if (event.payload.type === "over" || event.payload.type === "enter") {
        zone.classList.toggle("over", open);
      } else if (event.payload.type === "drop") {
        zone.classList.remove("over");
        const path = event.payload.paths[0];
        const ext = path?.split(".").pop()?.toLowerCase() ?? "";
        if (open && path && IMAGE_EXT.includes(ext)) void setIconFromPath(path);
      } else {
        zone.classList.remove("over");
      }
    });
  } catch {
    /* not in Tauri */
  }

  // Settings (auto-save).
  $("#btn-settings-close").addEventListener("click", () => $<HTMLDialogElement>("#dlg-settings").close());
  $("#btn-pick-claude").addEventListener("click", pickClaude);
  $("#btn-use-detected").addEventListener("click", async () => {
    await saveSettings({ claudePath: null });
    await refreshEnv();
    void renderSettings();
  });
  $("#s-lang").addEventListener("change", async (e) => {
    await saveSettings({ language: (e.target as HTMLSelectElement).value as LangSetting });
    setLang(resolveLang(config.language));
    render();
    void renderSettings();
  });
  $("#s-login").addEventListener("change", async (e) => {
    const on = (e.target as HTMLInputElement).checked;
    try {
      if (on) await autostartEnable();
      else await autostartDisable();
      await saveSettings({ openAtLogin: on });
    } catch (err) {
      toast(String(err), true);
      (e.target as HTMLInputElement).checked = !on;
    }
  });
  $("#s-tray").addEventListener("change", (e) => void saveSettings({ showInMenuBar: (e.target as HTMLInputElement).checked }));
  $("#s-shortcuts").addEventListener("change", async (e) => {
    await saveSettings({ shortcutsEnabled: (e.target as HTMLInputElement).checked });
    render();
  });
  $("#btn-import").addEventListener("click", importInstances);
  $("#btn-open-root").addEventListener("click", () => env && revealItemInDir(env.instancesRoot).catch((e) => toast(String(e), true)));
  $("#btn-open-config").addEventListener("click", () => env && revealItemInDir(env.configFile).catch((e) => toast(String(e), true)));
  $("#btn-import-json").addEventListener("click", importConfig);
  $("#btn-export").addEventListener("click", exportConfig);
  $("#btn-about").addEventListener("click", (e) => {
    e.preventDefault();
    void openAbout();
  });

  // No context menu anywhere: the webview's native menu (reload, inspect, copy) has no use here.
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard: ⌘K / Ctrl+K focuses search, Esc clears it, 0-9 launch by slot.
  document.addEventListener("keydown", (e) => {
    const search = $<HTMLInputElement>("#search");
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      openSheet(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      openSettings();
      return;
    }
    if (document.activeElement === search) {
      if (e.key === "Escape") {
        search.value = "";
        query = "";
        render();
        search.blur();
      }
      return;
    }
    if (document.querySelector("dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") return closeCardMenu();
    if (!/^[0-9]$/.test(e.key)) return;
    const n = Number(e.key);
    const target = n === 0 ? DEFAULT_INSTANCE : config.instances.find((i) => slots().get(i.id) === n);
    if (!target) return;
    const card = document.querySelector<HTMLElement>(`.card[data-id="${target.id}"]`) ?? undefined;
    void launch(target, card);
  });
}

window.addEventListener("DOMContentLoaded", init);
