// Browser-only mock so the UI can be developed/previewed outside Tauri (plain `npm run dev`).
// It is a no-op when running inside the Tauri webview.

type Handler = (args: Record<string, unknown>) => unknown;

export function installMockIfNeeded() {
  if ("__TAURI_INTERNALS__" in window) return;

  const day = 86400;
  const now = Math.floor(Date.now() / 1000);
  const config = {
    claudePath: null as string | null,
    shortcutsEnabled: true,
    language: "system",
    openAtLogin: false,
    showInMenuBar: true,
    view: "grid",
    dockIcons: true,
    instances: [
      { id: "a", name: "Mgtv", dir: "/Users/demo/.claude-instances/mgtv", icon: null, color: "#E5533D", shortcut: null, lastUsed: now - 120 },
      { id: "b", name: "Paramount", dir: "/Users/demo/.claude-instances/paramount", icon: null, color: "#E0A42B", shortcut: null, lastUsed: now - 3600 },
      { id: "c", name: "Personal", dir: "/Users/demo/.claude-instances/personal", icon: null, color: "#3E8BF0", shortcut: null, lastUsed: now - 2 * day },
      { id: "d", name: "Research", dir: "/Users/demo/.claude-instances/research", icon: null, color: "#8B6CEF", shortcut: null, lastUsed: now - 14 * day },
    ],
  };
  const running = new Set<string>(["a", "b", "__default__"]);

  const handlers: Record<string, Handler> = {
    get_environment: () => ({
      os: "macos",
      home: "/Users/demo",
      instancesRoot: "/Users/demo/.claude-instances",
      detectedClaudePath: "/Applications/Claude.app",
      claudeVersion: "1.0.4",
      configFile: "/Users/demo/Library/Application Support/com.efideas.claude-switcher/config.json",
    }),
    load_config: () => config,
    import_instances: () => config,
    save_config: (a) => Object.assign(config, a.config),
    suggest_dir: (a) => `/Users/demo/.claude-instances/${String(a.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    running_instances: () => [...running],
    launch_instance: (a) => {
      const id = String(a.id);
      if (running.has(id)) return "focused";
      running.add(id);
      return "launched";
    },
    set_dock_icon: () => true,
    quit_instance: (a) => { running.delete(String(a.id)); return true; },
    quit_all_instances: () => { const n = running.size; running.clear(); return n; },
    read_icon: () => "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8b5cf6"/></svg>'),
    app_info: () => ({ name: "Claude Switcher", version: "0.0.0-dev", author: "Juan Manuel", repoUrl: "https://github.com/efideas/claude-switcher" }),
    export_config: () => config.instances.length,
    import_config: () => ({ config, added: 0, skipped: config.instances.length }),
    "plugin:event|listen": () => Math.floor(Math.random() * 1e6),
    "plugin:event|unlisten": () => null,
    "plugin:opener|open_url": () => null,
    "plugin:opener|reveal_item_in_dir": () => null,
    "plugin:dialog|save": () => null,
    "plugin:dialog|ask": () => true,
    "plugin:dialog|open": () => null,
    "plugin:autostart|is_enabled": () => false,
    "plugin:autostart|enable": () => null,
    "plugin:autostart|disable": () => null,
  };

  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
      const h = handlers[cmd];
      if (!h) throw new Error(`mock: command not implemented: ${cmd}`);
      return h(args);
    },
    transformCallback: (cb: unknown) => cb,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
}
