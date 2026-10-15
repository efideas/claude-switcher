// Browser-only mock so the UI can be developed/previewed outside Tauri (plain `npm run dev`).
// It is a no-op when running inside the Tauri webview.

type Handler = (args: Record<string, unknown>) => unknown;

export function installMockIfNeeded() {
  if ("__TAURI_INTERNALS__" in window) return;

  const config = {
    claudePath: null as string | null,
    instances: [
      { id: "a", name: "Personal", dir: "/Users/demo/.claude-instances/personal", icon: null, color: "#3b82f6" },
      { id: "b", name: "Acme", dir: "/Users/demo/.claude-instances/acme", icon: null, color: "#e5533d" },
      { id: "c", name: "Globex", dir: "/Users/demo/.claude-instances/globex", icon: null, color: "#8b5cf6" },
      { id: "d", name: "Initech", dir: "/Users/demo/.claude-instances/initech", icon: null, color: "#e0a526" },
    ],
  };
  const running = new Set<string>(["b"]);

  const handlers: Record<string, Handler> = {
    get_environment: () => ({
      os: "macos",
      home: "/Users/demo",
      instancesRoot: "/Users/demo/.claude-instances",
      detectedClaudePath: "/Applications/Claude.app",
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
    read_icon: () => "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8b5cf6"/></svg>'),
    "plugin:dialog|open": () => null,
    "plugin:opener|open_path": () => null,
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
