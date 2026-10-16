// Tiny translation layer: a dictionary per language, `t()` for code, and
// data-i18n attributes for static markup. Unknown keys fall back to English.

export type Lang = "en" | "es";
export type LangSetting = "system" | Lang;

const en = {
  // top bar / grid
  settings: "Settings",
  addInstance: "Add instance",
  noInstances: "No instances yet",
  emptyHint:
    "Add one with <strong>+</strong>. Each instance opens Claude with its own data folder, so you can sign in with a different account in each one.",
  edit: "Edit",
  running: "running",
  defaultSub: "default",
  defaultTitle: "Claude · regular profile (no --user-data-dir)",
  defaultTitleRunning: "Claude · regular profile · running",
  statusNone: "{n} instance(s) · none running",
  statusSome: "{n} instance(s) · {r} running",
  alreadyOpen: "{name} is already open",
  opening: "Opening {name}…",

  // instance dialog
  newInstance: "New instance",
  editInstance: "Edit instance",
  chooseImage: "Choose image…",
  remove: "Remove",
  name: "Name",
  dataFolder: "Data folder (<code>--user-data-dir</code>)",
  color: "Color",
  delete: "Delete",
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  pickFolderTitle: "Instance data folder",
  pickImageTitle: "Instance image",
  images: "Images",
  nameRequired: "Name is required",
  folderRequired: "Folder is required",
  folderInUse: 'That folder is already used by "{name}"',
  confirmRemove: 'Remove "{name}" from the list?\n\nThe data folder is not deleted:\n{dir}',

  // settings
  claudePath: "Claude Desktop path",
  autoDetect: "Auto-detect",
  detected: "Detected: {path}",
  notDetected: "Claude Desktop was not detected automatically.",
  folders: "Folders",
  importFolders: "Import from ~/.claude-instances",
  openFolder: "Open folder",
  configPath: "Config: {path}",
  shortcutsLabel:
    "Global shortcuts: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> bring instance N to the front from any app, <kbd>0</kbd> the regular profile (Control+Option on macOS)",
  language: "Language",
  langSystem: "System",
  backup: "Backup",
  exportJson: "Export JSON…",
  importJson: "Import JSON…",
  backupHint: "Instances, icons, colors and the Claude path. Importing can merge or replace the current list.",
  about: "About",
  aboutApp: "About Claude Switcher",
  selectClaude: "Select Claude Desktop",
  executable: "Executable",
  settingsSaved: "Settings saved",
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
  addInstance: "Agregar instancia",
  noInstances: "Aún no hay instancias",
  emptyHint:
    "Agrega una con <strong>+</strong>. Cada instancia abre Claude con su propia carpeta de datos, así puedes iniciar sesión con una cuenta distinta en cada una.",
  edit: "Editar",
  running: "en ejecución",
  defaultSub: "predeterminado",
  defaultTitle: "Claude · perfil normal (sin --user-data-dir)",
  defaultTitleRunning: "Claude · perfil normal · en ejecución",
  statusNone: "{n} instancia(s) · ninguna en ejecución",
  statusSome: "{n} instancia(s) · {r} en ejecución",
  alreadyOpen: "{name} ya está abierta",
  opening: "Abriendo {name}…",

  newInstance: "Nueva instancia",
  editInstance: "Editar instancia",
  chooseImage: "Elegir imagen…",
  remove: "Quitar",
  name: "Nombre",
  dataFolder: "Carpeta de datos (<code>--user-data-dir</code>)",
  color: "Color",
  delete: "Eliminar",
  cancel: "Cancelar",
  save: "Guardar",
  close: "Cerrar",
  pickFolderTitle: "Carpeta de datos de la instancia",
  pickImageTitle: "Imagen de la instancia",
  images: "Imágenes",
  nameRequired: "El nombre es obligatorio",
  folderRequired: "La carpeta es obligatoria",
  folderInUse: 'Esa carpeta ya la usa "{name}"',
  confirmRemove: '¿Quitar "{name}" de la lista?\n\nLa carpeta de datos no se borra:\n{dir}',

  claudePath: "Ruta de Claude Desktop",
  autoDetect: "Detectar automáticamente",
  detected: "Detectada: {path}",
  notDetected: "No se detectó Claude Desktop automáticamente.",
  folders: "Carpetas",
  importFolders: "Importar de ~/.claude-instances",
  openFolder: "Abrir carpeta",
  configPath: "Configuración: {path}",
  shortcutsLabel:
    "Atajos globales: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> traen al frente la instancia N desde cualquier app, <kbd>0</kbd> el perfil normal (Control+Opción en macOS)",
  language: "Idioma",
  langSystem: "Sistema",
  backup: "Copia de seguridad",
  exportJson: "Exportar JSON…",
  importJson: "Importar JSON…",
  backupHint: "Instancias, iconos, colores y la ruta de Claude. Al importar puedes combinar o reemplazar la lista actual.",
  about: "Acerca de",
  aboutApp: "Acerca de Claude Switcher",
  selectClaude: "Selecciona Claude Desktop",
  executable: "Ejecutable",
  settingsSaved: "Ajustes guardados",
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
