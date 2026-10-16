import { installMockIfNeeded } from "./mock";
installMockIfNeeded();

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

type Instance = {
  id: string;
  name: string;
  dir: string;
  icon: string | null;
  color: string;
};

type Config = {
  claudePath: string | null;
  instances: Instance[];
};

type AppInfo = {
  name: string;
  version: string;
  author: string;
  repoUrl: string;
};

type Environment = {
  os: string;
  home: string;
  instancesRoot: string;
  detectedClaudePath: string | null;
  configFile: string;
};

const PALETTE = ["#e5533d", "#e0a526", "#3fb950", "#2fb3a8", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316"];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// The regular Claude profile (no --user-data-dir). Known to the backend under this id.
const DEFAULT_ID = "__default__";
const DEFAULT_INSTANCE: Instance = {
  id: DEFAULT_ID,
  name: "Claude",
  dir: "",
  icon: null,
  color: "#D97757",
};

let config: Config = { claudePath: null, instances: [] };
let env: Environment | null = null;
let running = new Set<string>();
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

function iconEl(inst: Pick<Instance, "name" | "icon" | "color">, big = false): HTMLElement {
  const el = document.createElement("div");
  el.className = "card-icon" + (big ? " big" : "");
  if (inst.icon) {
    const img = document.createElement("img");
    img.src = inst.icon;
    img.alt = "";
    img.draggable = false;
    el.appendChild(img);
    el.style.background = "transparent";
  } else {
    el.textContent = initials(inst.name);
    el.style.background = inst.color || PALETTE[0];
  }
  return el;
}

let toastTimer: number | undefined;
function toast(msg: string, isError = false) {
  const t = $<HTMLDivElement>("#toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.add("hidden"), isError ? 5000 : 2200);
}

function setStatus(msg: string) {
  $("#status").textContent = msg;
}

async function persist() {
  await invoke("save_config", { config });
}

// ---------- rendering ----------

function buildDefaultCard(): HTMLElement {
  const inst = DEFAULT_INSTANCE;
  const isRunning = running.has(inst.id);
  const card = document.createElement("div");
  card.className = "card default" + (isRunning ? " running" : "");
  card.tabIndex = 0;
  card.dataset.id = inst.id;
  card.title = isRunning
    ? "Claude · regular profile · running"
    : "Claude · regular profile (no --user-data-dir)";

  const dot = document.createElement("span");
  dot.className = "card-dot";
  card.appendChild(dot);

  const icon = document.createElement("div");
  icon.className = "card-icon";
  icon.style.background = inst.color;
  icon.textContent = "✳";
  card.appendChild(icon);

  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = inst.name;
  card.appendChild(name);

  const sub = document.createElement("div");
  sub.className = "card-sub";
  sub.textContent = "default";
  card.appendChild(sub);

  const key = document.createElement("span");
  key.className = "card-key";
  key.textContent = "0";
  card.appendChild(key);

  card.addEventListener("click", () => launch(inst, card));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      launch(inst, card);
    }
  });
  return card;
}

function render() {
  const grid = $<HTMLElement>("#grid");
  const empty = $<HTMLElement>("#empty");
  grid.innerHTML = "";
  empty.classList.toggle("hidden", config.instances.length > 0);

  // Built-in card for the regular profile, always first, launched with key 0.
  grid.appendChild(buildDefaultCard());

  config.instances.forEach((inst, idx) => {
    const card = document.createElement("div");
    card.className = "card" + (running.has(inst.id) ? " running" : "");
    card.tabIndex = 0;
    card.dataset.id = inst.id;
    card.title = running.has(inst.id) ? `${inst.name} · running\n${inst.dir}` : `${inst.name}\n${inst.dir}`;

    const dot = document.createElement("span");
    dot.className = "card-dot";
    card.appendChild(dot);

    card.appendChild(iconEl(inst));

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = inst.name;
    card.appendChild(name);

    if (idx < 9) {
      const key = document.createElement("span");
      key.className = "card-key";
      key.textContent = String(idx + 1);
      card.appendChild(key);
    }

    const edit = document.createElement("button");
    edit.className = "card-edit";
    edit.title = "Edit";
    edit.textContent = "⋯";
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      openInstanceDialog(inst);
    });
    card.appendChild(edit);

    card.addEventListener("click", () => launch(inst, card));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        launch(inst, card);
      }
    });
    grid.appendChild(card);
  });

  const n = [...running].filter((id) => id !== DEFAULT_ID).length;
  setStatus(
    config.instances.length === 0
      ? ""
      : n === 0
        ? `${config.instances.length} instance(s) · none running`
        : `${config.instances.length} instance(s) · ${n} running`,
  );
}

async function launch(inst: Instance, card?: HTMLElement) {
  card?.classList.add("launching");
  try {
    const result = await invoke<string>("launch_instance", { id: inst.id });
    toast(result === "focused" ? `${inst.name} is already open` : `Opening ${inst.name}…`);
    // Poll a few times quickly so the running dot appears without waiting for the slow timer.
    for (const ms of [800, 2000, 4000]) window.setTimeout(refreshRunning, ms);
  } catch (e) {
    toast(String(e), true);
  } finally {
    card?.classList.remove("launching");
  }
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

// ---------- instance dialog ----------

function renderSwatches() {
  const wrap = $<HTMLElement>("#swatches");
  wrap.innerHTML = "";
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (draft?.color === c ? " selected" : "");
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => {
      if (!draft) return;
      draft.color = c;
      renderSwatches();
      renderIconPreview();
    });
    wrap.appendChild(b);
  }
}

function renderIconPreview() {
  if (!draft) return;
  const holder = $<HTMLElement>("#icon-preview");
  const fresh = iconEl({ ...draft, name: $<HTMLInputElement>("#f-name").value || draft.name }, true);
  fresh.id = "icon-preview";
  holder.replaceWith(fresh);
}

function openInstanceDialog(inst: Instance | null) {
  editing = inst;
  draft = inst
    ? { ...inst }
    : { id: "", name: "", dir: "", icon: null, color: PALETTE[config.instances.length % PALETTE.length] };
  dirTouched = !!inst;

  $("#dlg-instance-title").textContent = inst ? "Edit instance" : "New instance";
  $<HTMLInputElement>("#f-name").value = draft.name;
  $<HTMLInputElement>("#f-dir").value = draft.dir;
  $<HTMLButtonElement>("#btn-delete").classList.toggle("hidden", !inst);
  renderSwatches();
  renderIconPreview();

  const dlg = $<HTMLDialogElement>("#dlg-instance");
  dlg.showModal();
  $<HTMLInputElement>("#f-name").focus();
}

async function onNameInput() {
  if (!draft) return;
  const name = $<HTMLInputElement>("#f-name").value;
  renderIconPreview();
  if (!dirTouched) {
    const dir = await invoke<string>("suggest_dir", { name: name || "instance" });
    $<HTMLInputElement>("#f-dir").value = dir;
  }
}

async function pickDir() {
  const current = $<HTMLInputElement>("#f-dir").value;
  const picked = await openDialog({
    directory: true,
    multiple: false,
    defaultPath: current || env?.instancesRoot,
    title: "Instance data folder",
  });
  if (typeof picked === "string") {
    $<HTMLInputElement>("#f-dir").value = picked;
    dirTouched = true;
  }
}

async function pickIcon() {
  const picked = await openDialog({
    multiple: false,
    directory: false,
    title: "Instance image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"] }],
  });
  if (typeof picked !== "string" || !draft) return;
  try {
    draft.icon = await invoke<string>("read_icon", { path: picked });
    renderIconPreview();
  } catch (e) {
    toast(String(e), true);
  }
}

async function saveInstance(e: Event) {
  e.preventDefault();
  if (!draft) return;
  const name = $<HTMLInputElement>("#f-name").value.trim();
  const dir = $<HTMLInputElement>("#f-dir").value.trim();
  if (!name) return toast("Name is required", true);
  if (!dir) return toast("Folder is required", true);

  const clash = config.instances.find((i) => i.dir === dir && i.id !== draft!.id);
  if (clash) return toast(`That folder is already used by "${clash.name}"`, true);

  draft.name = name;
  draft.dir = dir;

  if (editing) {
    const idx = config.instances.findIndex((i) => i.id === editing!.id);
    if (idx >= 0) config.instances[idx] = draft;
  } else {
    draft.id = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
    config.instances.push(draft);
  }

  try {
    await persist();
    $<HTMLDialogElement>("#dlg-instance").close();
    render();
    refreshRunning();
  } catch (err) {
    toast(String(err), true);
  }
}

async function deleteInstance() {
  if (!editing) return;
  const ok = window.confirm(
    `Remove "${editing.name}" from the list?\n\nThe data folder is not deleted:\n${editing.dir}`,
  );
  if (!ok) return;
  config.instances = config.instances.filter((i) => i.id !== editing!.id);
  await persist();
  $<HTMLDialogElement>("#dlg-instance").close();
  render();
}

// ---------- settings dialog ----------

function openSettings() {
  $<HTMLInputElement>("#s-claude").value = config.claudePath ?? "";
  $("#s-detected").textContent = env?.detectedClaudePath
    ? `Detected: ${env.detectedClaudePath}`
    : "Claude Desktop was not detected automatically.";
  $("#s-config").textContent = env ? `Config: ${env.configFile}` : "";
  $<HTMLDialogElement>("#dlg-settings").showModal();
}

async function pickClaude() {
  const isMac = env?.os === "macos";
  const picked = await openDialog({
    multiple: false,
    directory: isMac, // .app bundles are directories; the dialog lets you select them
    defaultPath: isMac ? "/Applications" : undefined,
    title: "Select Claude Desktop",
    filters: isMac ? undefined : [{ name: "Executable", extensions: ["exe"] }],
  });
  if (typeof picked === "string") $<HTMLInputElement>("#s-claude").value = picked;
}

async function saveSettings(e: Event) {
  e.preventDefault();
  const v = $<HTMLInputElement>("#s-claude").value.trim();
  config.claudePath = v || null;
  try {
    await persist();
    $<HTMLDialogElement>("#dlg-settings").close();
    toast("Settings saved");
  } catch (err) {
    toast(String(err), true);
  }
}

async function importInstances() {
  try {
    const before = config.instances.length;
    config = await invoke<Config>("import_instances");
    const added = config.instances.length - before;
    toast(added > 0 ? `${added} instance(s) imported` : "No new folders to import");
    render();
    refreshRunning();
  } catch (err) {
    toast(String(err), true);
  }
}

async function openRoot() {
  if (!env) return;
  try {
    await openPath(env.instancesRoot);
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
  const path = await saveDialog({
    title: "Export configuration",
    defaultPath: backupFileName(),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (typeof path !== "string") return;
  try {
    const n = await invoke<number>("export_config", { path });
    toast(`Exported ${n} instance(s)`);
  } catch (e) {
    toast(String(e), true);
  }
}

async function importConfig() {
  const path = await openDialog({
    multiple: false,
    directory: false,
    title: "Import configuration",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (typeof path !== "string") return;
  const replace = !(await ask(
    "Merge the backup into the current list, or replace the list with the backup?\n\nFolders that already exist are skipped when merging.",
    { title: "Import configuration", kind: "warning", okLabel: "Merge", cancelLabel: "Replace" },
  ));
  if (replace) {
    const sure = await ask("Replace all current instances with the backup? Data folders are not touched.", {
      title: "Replace configuration",
      kind: "warning",
      okLabel: "Replace",
      cancelLabel: "Cancel",
    });
    if (!sure) return;
  }
  try {
    const result = await invoke<{ config: Config; added: number; skipped: number }>("import_config", {
      path,
      replace,
    });
    config = result.config;
    render();
    refreshRunning();
    toast(
      replace
        ? `Imported ${result.added} instance(s)`
        : `Imported ${result.added} instance(s), ${result.skipped} already present`,
    );
  } catch (e) {
    toast(String(e), true);
  }
}

// ---------- about ----------

async function openAbout() {
  try {
    const info = await invoke<AppInfo>("app_info");
    $("#about-name").textContent = info.name;
    $("#about-version").textContent = `Version ${info.version}`;
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
    config = await invoke<Config>("load_config");
  } catch (e) {
    toast(String(e), true);
  }
  render();
  await refreshRunning();
  // The backend watches the process list and pushes changes (it also keeps the tray menu current).
  listen<string[]>("running-changed", (e) => applyRunning(e.payload)).catch(() => {});
  listen<string>("launch-error", (e) => toast(e.payload, true)).catch(() => {});
  listen("open-about", () => openAbout()).catch(() => {});
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshRunning();
  });

  $("#btn-add").addEventListener("click", () => openInstanceDialog(null));
  $("#btn-settings").addEventListener("click", openSettings);
  $("#form-instance").addEventListener("submit", saveInstance);
  $("#btn-cancel").addEventListener("click", () => $<HTMLDialogElement>("#dlg-instance").close());
  $("#btn-delete").addEventListener("click", deleteInstance);
  $("#btn-pick-dir").addEventListener("click", pickDir);
  $("#btn-pick-icon").addEventListener("click", pickIcon);
  $("#btn-clear-icon").addEventListener("click", () => {
    if (draft) {
      draft.icon = null;
      renderIconPreview();
    }
  });
  $("#f-name").addEventListener("input", onNameInput);
  $("#f-dir").addEventListener("input", () => (dirTouched = true));

  $("#form-settings").addEventListener("submit", saveSettings);
  $("#btn-settings-cancel").addEventListener("click", () => $<HTMLDialogElement>("#dlg-settings").close());
  $("#btn-pick-claude").addEventListener("click", pickClaude);
  $("#btn-import").addEventListener("click", importInstances);
  $("#btn-open-root").addEventListener("click", openRoot);
  $("#btn-about").addEventListener("click", openAbout);
  $("#btn-export").addEventListener("click", exportConfig);
  $("#btn-import").addEventListener("click", importConfig);

  // No context menu anywhere: the webview's native menu (reload, inspect, copy) has no use here.
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard: 1-9 launch the Nth instance when no dialog is open.
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (e.key === "0") {
      const card = document.querySelector<HTMLElement>(`.card[data-id="${DEFAULT_ID}"]`) ?? undefined;
      launch(DEFAULT_INSTANCE, card);
      return;
    }
    if (n >= 1 && n <= 9 && config.instances[n - 1]) {
      const inst = config.instances[n - 1];
      const card = document.querySelector<HTMLElement>(`.card[data-id="${inst.id}"]`) ?? undefined;
      launch(inst, card);
    }
  });

}

window.addEventListener("DOMContentLoaded", init);
