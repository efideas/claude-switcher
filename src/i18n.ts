// Tiny translation layer: a dictionary per language, `t()` for code, and
// data-i18n attributes for static markup. Unknown keys fall back to English.

export type Lang = "en" | "es";
export type LangSetting = "system" | Lang;

const en = {
  // header / toolbar
  settings: "Settings",
  newInstance: "New instance",
  searchPlaceholder: "Search instances",
  subtitle: "{n} instances · {r} running",
  subtitleOne: "1 instance · {r} running",
  filterAll: "All",
  filterRunning: "Running",
  filterStopped: "Stopped",
  gridView: "Grid view",
  listView: "List view",

  // cards
  running: "Running",
  stopped: "Stopped",
  focus: "Focus",
  launch: "Launch",
  more: "More",
  edit: "Edit…",
  revealFolder: "Reveal data folder",
  quitInstance: "Quit instance",
  remove: "Remove from list…",
  defaultProfile: "Default profile",
  active: "Active",
  activeWindow: "Active · frontmost",
  lastUsed: "Last used {when}",
  neverUsed: "Never launched",
  justNow: "just now",
  minutesAgo: "{n} min ago",
  hoursAgo: "{n} h ago",
  daysAgo: "{n} days ago",
  yesterday: "yesterday",
  addTileTitle: "New instance",
  addTileHint: "Isolated login & data",
  noResults: "No instances match",
  emptyHint: "Each instance opens Claude with its own data folder, so you can sign in with a different account in each one.",

  // status bar
  statusRunning: "{r} of {n} running",
  statusNoneRunning: "none running",
  jumpHint: "jump to any instance",
  alreadyOpen: "{name} is already open",
  opening: "Opening {name}…",
  quitAllDone: "Asked {n} instance(s) to quit",

  // instance sheet
  sheetNewTitle: "New instance",
  sheetEditTitle: "Edit instance",
  sheetSubtitle: "Each instance has its own login, chats and settings.",
  livePreview: "Live preview · initials from name",
  name: "Name",
  customImage: "Custom image",
  dropImage: "Drop an image or",
  browse: "browse…",
  dropHint: "PNG, JPG or SVG · square works best. Optional.",
  removeImage: "Remove image",
  color: "Color",
  shortcut: "Shortcut",
  nextSlot: "Next available slot",
  slotTaken: "used by {name}",
  noShortcut: "No shortcut",
  advanced: "Advanced",
  advancedHint: "Data folder",
  dataFolder: "Data folder",
  auto: "AUTO",
  choose: "Choose…",
  folderHelp: "Created from the name automatically. Pick an existing folder to reuse a previous login.",
  cancel: "Cancel",
  save: "Save",
  createLaunch: "Create & launch",
  delete: "Remove",
  close: "Close",
  pickFolderTitle: "Instance data folder",
  pickImageTitle: "Instance image",
  images: "Images",
  nameRequired: "Name is required",
  folderRequired: "Folder is required",
  folderInUse: 'That folder is already used by "{name}"',
  confirmRemove: 'Remove "{name}" from the list?\n\nThe data folder is not deleted:\n{dir}',

  // settings
  secClaude: "Claude Desktop",
  autoDetected: "Auto-detected",
  manualPath: "Custom path",
  notFound: "Not found",
  change: "Change…",
  useDetected: "Use detected",
  secGeneral: "General",
  language: "Language",
  languageDesc: "Interface language for the switcher",
  langSystem: "System",
  openAtLogin: "Open at login",
  openAtLoginDesc: "Start Claude Switcher when you sign in",
  showInMenuBar: "Show in menu bar",
  showInMenuBarDesc: "Quick switcher with running status from the menu bar. When off, closing the window quits the app.",
  dockIcons: "Instance icon in the Dock",
  dockIconsDesc: "Each instance runs from its own copy of Claude.app carrying its color and initials, so Dock and app switcher tell them apart. macOS only.",
  secShortcuts: "Keyboard shortcuts",
  globalShortcuts: "Global shortcuts",
  globalShortcutsDesc: "Bring any instance to the front from any app",
  switchToN: "Switch to instance N",
  switchToNDesc: "Uses the number shown on each card",
  defaultClaudeProfile: "Default Claude profile",
  secData: "Data & backup",
  instancesFolder: "Instances folder",
  importFolders: "Import",
  reveal: "Reveal",
  configFile: "Config file",
  backup: "Backup",
  backupDesc: "Instances, icons, colors and Claude path. Import can merge or replace.",
  importJson: "Import…",
  exportJson: "Export…",
  settingsFooter: "Claude Switcher {v} · Changes are saved automatically",
  about: "About",
  selectClaude: "Select Claude Desktop",
  executable: "Executable",
  importedFolders: "{n} instance(s) imported",
  noNewFolders: "No new folders to import",

  // backup
  exportTitle: "Export configuration",
  exported: "Exported {n} instance(s)",
  importTitle: "Import configuration",
  mergeOrReplace:
    "Merge the backup into the current list, or replace the list with the backup?\n\nFolders that already exist are skipped when merging.",
  merge: "Merge",
  replace: "Replace",
  replaceTitle: "Replace configuration",
  replaceConfirm: "Replace all current instances with the backup? Data folders are not touched.",
  importedReplace: "Imported {n} instance(s)",
  importedMerge: "Imported {n} instance(s), {s} already present",

  // about
  version: "Version {v}",
  aboutDesc: "Opens several Claude Desktop instances, one per organization or account.",
  author: "Author:",
  unofficial: "Unofficial. Not affiliated with Anthropic.",
};

const es: Record<keyof typeof en, string> = {
  settings: "Ajustes",
  newInstance: "Nueva instancia",
  searchPlaceholder: "Buscar instancias",
  subtitle: "{n} instancias · {r} en ejecución",
  subtitleOne: "1 instancia · {r} en ejecución",
  filterAll: "Todas",
  filterRunning: "En ejecución",
  filterStopped: "Detenidas",
  gridView: "Vista de cuadrícula",
  listView: "Vista de lista",

  running: "En ejecución",
  stopped: "Detenida",
  focus: "Traer al frente",
  launch: "Abrir",
  more: "Más",
  edit: "Editar…",
  revealFolder: "Mostrar carpeta de datos",
  quitInstance: "Cerrar instancia",
  remove: "Quitar de la lista…",
  defaultProfile: "Perfil normal",
  active: "Activa",
  activeWindow: "Activa · al frente",
  lastUsed: "Último uso {when}",
  neverUsed: "Nunca abierta",
  justNow: "ahora mismo",
  minutesAgo: "hace {n} min",
  hoursAgo: "hace {n} h",
  daysAgo: "hace {n} días",
  yesterday: "ayer",
  addTileTitle: "Nueva instancia",
  addTileHint: "Sesión y datos aislados",
  noResults: "Ninguna instancia coincide",
  emptyHint: "Cada instancia abre Claude con su propia carpeta de datos, así puedes iniciar sesión con una cuenta distinta en cada una.",

  statusRunning: "{r} de {n} en ejecución",
  statusNoneRunning: "ninguna en ejecución",
  jumpHint: "ir a cualquier instancia",
  alreadyOpen: "{name} ya está abierta",
  opening: "Abriendo {name}…",
  quitAllDone: "Se pidió cerrar {n} instancia(s)",

  sheetNewTitle: "Nueva instancia",
  sheetEditTitle: "Editar instancia",
  sheetSubtitle: "Cada instancia tiene su propia sesión, chats y ajustes.",
  livePreview: "Vista previa · iniciales del nombre",
  name: "Nombre",
  customImage: "Imagen personalizada",
  dropImage: "Suelta una imagen o",
  browse: "elige un archivo…",
  dropHint: "PNG, JPG o SVG · mejor si es cuadrada. Opcional.",
  removeImage: "Quitar imagen",
  color: "Color",
  shortcut: "Atajo",
  nextSlot: "Siguiente libre",
  slotTaken: "lo usa {name}",
  noShortcut: "Sin atajo",
  advanced: "Avanzado",
  advancedHint: "Carpeta de datos",
  dataFolder: "Carpeta de datos",
  auto: "AUTO",
  choose: "Elegir…",
  folderHelp: "Se crea a partir del nombre. Elige una carpeta existente para reutilizar una sesión anterior.",
  cancel: "Cancelar",
  save: "Guardar",
  createLaunch: "Crear y abrir",
  delete: "Quitar",
  close: "Cerrar",
  pickFolderTitle: "Carpeta de datos de la instancia",
  pickImageTitle: "Imagen de la instancia",
  images: "Imágenes",
  nameRequired: "El nombre es obligatorio",
  folderRequired: "La carpeta es obligatoria",
  folderInUse: 'Esa carpeta ya la usa "{name}"',
  confirmRemove: '¿Quitar "{name}" de la lista?\n\nLa carpeta de datos no se borra:\n{dir}',

  secClaude: "Claude Desktop",
  autoDetected: "Detectada",
  manualPath: "Ruta manual",
  notFound: "No encontrada",
  change: "Cambiar…",
  useDetected: "Usar detectada",
  secGeneral: "General",
  language: "Idioma",
  languageDesc: "Idioma de la interfaz del switcher",
  langSystem: "Sistema",
  openAtLogin: "Abrir al iniciar sesión",
  openAtLoginDesc: "Iniciar Claude Switcher al entrar en tu cuenta",
  showInMenuBar: "Mostrar en la barra de menús",
  showInMenuBarDesc: "Selector rápido con estado desde la barra. Si está apagado, cerrar la ventana cierra la app.",
  dockIcons: "Icono de la instancia en el Dock",
  dockIconsDesc: "Cada instancia corre desde su propia copia de Claude.app con su color e iniciales, para distinguirlas en el Dock y en el selector de apps. Solo macOS.",
  secShortcuts: "Atajos de teclado",
  globalShortcuts: "Atajos globales",
  globalShortcutsDesc: "Trae cualquier instancia al frente desde cualquier app",
  switchToN: "Ir a la instancia N",
  switchToNDesc: "Usa el número que muestra cada tarjeta",
  defaultClaudeProfile: "Perfil normal de Claude",
  secData: "Datos y copia de seguridad",
  instancesFolder: "Carpeta de instancias",
  importFolders: "Importar",
  reveal: "Mostrar",
  configFile: "Archivo de configuración",
  backup: "Copia de seguridad",
  backupDesc: "Instancias, iconos, colores y ruta de Claude. Al importar puedes combinar o reemplazar.",
  importJson: "Importar…",
  exportJson: "Exportar…",
  settingsFooter: "Claude Switcher {v} · Los cambios se guardan automáticamente",
  about: "Acerca de",
  selectClaude: "Selecciona Claude Desktop",
  executable: "Ejecutable",
  importedFolders: "{n} instancia(s) importada(s)",
  noNewFolders: "No hay carpetas nuevas para importar",

  exportTitle: "Exportar configuración",
  exported: "{n} instancia(s) exportada(s)",
  importTitle: "Importar configuración",
  mergeOrReplace:
    "¿Combinar la copia con la lista actual o reemplazar la lista con la copia?\n\nAl combinar se omiten las carpetas que ya existen.",
  merge: "Combinar",
  replace: "Reemplazar",
  replaceTitle: "Reemplazar configuración",
  replaceConfirm: "¿Reemplazar todas las instancias actuales con la copia? Las carpetas de datos no se tocan.",
  importedReplace: "{n} instancia(s) importada(s)",
  importedMerge: "{n} instancia(s) importada(s), {s} ya existían",

  version: "Versión {v}",
  aboutDesc: "Abre varias instancias de Claude Desktop, una por organización o cuenta.",
  author: "Autor:",
  unofficial: "No oficial. Sin relación con Anthropic.",
};

export type Key = keyof typeof en;
const dict: Record<Lang, Record<Key, string>> = { en, es };

let current: Lang = "en";

export function currentLang(): Lang {
  return current;
}

/** Turns the saved setting into a concrete language, following the OS when asked to. */
export function resolveLang(setting: LangSetting | undefined): Lang {
  if (setting === "en" || setting === "es") return setting;
  const sys = (navigator.language || "en").toLowerCase();
  return sys.startsWith("es") ? "es" : "en";
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  let s = dict[current][key] ?? dict.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Human "ago" string for a unix-seconds timestamp. */
export function relativeTime(secs: number | null | undefined): string {
  if (!secs) return t("neverUsed");
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - secs);
  if (diff < 60) return t("lastUsed", { when: t("justNow") });
  if (diff < 3600) return t("lastUsed", { when: t("minutesAgo", { n: Math.floor(diff / 60) }) });
  if (diff < 86400) return t("lastUsed", { when: t("hoursAgo", { n: Math.floor(diff / 3600) }) });
  const days = Math.floor(diff / 86400);
  if (days === 1) return t("lastUsed", { when: t("yesterday") });
  if (days < 30) return t("lastUsed", { when: t("daysAgo", { n: days }) });
  const d = new Date(secs * 1000);
  return t("lastUsed", { when: d.toLocaleDateString(current === "es" ? "es" : "en", { month: "short", day: "numeric" }) });
}

/** Sets the language and re-applies every data-i18n attribute in the document. */
export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  applyStatic();
}

export function applyStatic(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as Key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const s = t(el.dataset.i18nTitle as Key);
    el.title = s;
    el.setAttribute("aria-label", s);
  });
  root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as Key);
  });
}
