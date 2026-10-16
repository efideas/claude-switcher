use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, WindowEvent,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

const APP_NAME: &str = "Claude Switcher";
const AUTHOR: &str = "Juan Manuel";
const REPO_URL: &str = "https://github.com/efideas/claude-switcher";
const TRAY_ID: &str = "main-tray";
/// Pseudo instance id for the regular Claude profile (launched with no --user-data-dir).
const DEFAULT_ID: &str = "__default__";

/// Languages the tray menu speaks. Everything else falls back to English.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Lang {
    En,
    Es,
}

fn ui_lang(config: &Config) -> Lang {
    let tag = match config.language.as_str() {
        "system" | "" => sys_locale::get_locale().unwrap_or_default(),
        other => other.to_string(),
    };
    if tag.to_ascii_lowercase().starts_with("es") { Lang::Es } else { Lang::En }
}

fn tr(lang: Lang, key: &str) -> String {
    let s = match (lang, key) {
        (Lang::Es, "default") => "Claude (perfil normal)",
        (Lang::Es, "none") => "Aún no hay instancias",
        (Lang::Es, "open") => "Abrir Claude Switcher",
        (Lang::Es, "about") => "Acerca de Claude Switcher",
        (Lang::Es, "quit") => "Salir de Claude Switcher",
        (Lang::Es, "new") => "Nueva instancia…",
        (Lang::Es, "settings") => "Ajustes…",
        (Lang::Es, "quitall") => "Cerrar todas las instancias",
        (_, "new") => "New instance…",
        (_, "settings") => "Settings…",
        (_, "quitall") => "Quit all instances",
        (_, "default") => "Claude (default profile)",
        (_, "none") => "No instances yet",
        (_, "open") => "Open Claude Switcher",
        (_, "about") => "About Claude Switcher",
        (_, "quit") => "Quit Claude Switcher",
        _ => key,
    };
    s.to_string()
}

const PALETTE: [&str; 8] = [
    "#e5533d", "#e0a526", "#3fb950", "#2fb3a8", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
];

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub dir: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: String,
    /// Fixed global-shortcut slot 1-9. None means "next free slot in list order".
    #[serde(default)]
    pub shortcut: Option<u8>,
    /// Unix seconds of the last launch or focus from the switcher.
    #[serde(default)]
    pub last_used: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub claude_path: Option<String>,
    #[serde(default)]
    pub instances: Vec<Instance>,
    /// Ctrl+Alt+0..9 (Control+Option on macOS) bring instance N to the front from any app.
    #[serde(default = "default_true")]
    pub shortcuts_enabled: bool,
    /// "system", "en" or "es". Drives the tray menu; the window reads the same value.
    #[serde(default = "default_language")]
    pub language: String,
    /// Mirrors the autostart plugin state so the UI can show it without asking the OS.
    #[serde(default)]
    pub open_at_login: bool,
    /// Tray icon visible. When off, closing the window quits the app instead of hiding it.
    #[serde(default = "default_true")]
    pub show_in_menu_bar: bool,
    /// "grid" or "list".
    #[serde(default = "default_view")]
    pub view: String,
}

fn default_view() -> String {
    "grid".into()
}

fn default_language() -> String {
    "system".into()
}

fn default_true() -> bool {
    true
}

impl Default for Config {
    fn default() -> Self {
        Config {
            claude_path: None,
            instances: Vec::new(),
            shortcuts_enabled: true,
            language: default_language(),
            open_at_login: false,
            show_in_menu_bar: true,
            view: default_view(),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub os: String,
    pub home: String,
    pub instances_root: String,
    pub detected_claude_path: Option<String>,
    pub claude_version: Option<String>,
    pub config_file: String,
}

/// Version of the Claude Desktop install, when we can read it cheaply.
fn claude_version(path: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let out = Command::new("/usr/bin/plutil")
            .args(["-extract", "CFBundleShortVersionString", "raw", &format!("{path}/Contents/Info.plist")])
            .output()
            .ok()?;
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return (!v.is_empty()).then_some(v);
    }
    #[allow(unreachable_code)]
    {
        // Squirrel keeps the binary in AnthropicClaude\app-<version>\claude.exe.
        let p = path.replace('\\', "/");
        p.split('/').find_map(|seg| seg.strip_prefix("app-").map(|v| v.to_string()))
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn instances_root() -> PathBuf {
    home_dir().join(".claude-instances")
}

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for c in name.chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_alphanumeric() {
            out.push(c);
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "instance".into() } else { out }
}

/// Time-based id with a process-wide counter, so ids created back to back
/// (for example during an import) never collide even when the clock does not tick.
fn new_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{nanos:x}{n:04x}")
}

/// An id that no instance in `config` uses yet.
fn unique_id(config: &Config) -> String {
    loop {
        let id = new_id();
        if !config.instances.iter().any(|i| i.id == id) {
            return id;
        }
    }
}

/// Gives a fresh id to every instance whose id is empty or already taken by an
/// earlier instance. Returns true when something changed. Older builds generated
/// ids from the clock alone and could hand the same id to several instances.
fn repair_ids(config: &mut Config) -> bool {
    let mut seen: HashSet<String> = HashSet::new();
    let mut changed = false;
    for idx in 0..config.instances.len() {
        let id = config.instances[idx].id.clone();
        if !id.is_empty() && seen.insert(id) {
            continue;
        }
        let fresh = loop {
            let candidate = new_id();
            if !seen.contains(&candidate) && !config.instances.iter().any(|i| i.id == candidate) {
                break candidate;
            }
        };
        seen.insert(fresh.clone());
        config.instances[idx].id = fresh;
        changed = true;
    }
    changed
}

fn humanize(slug: &str) -> String {
    slug.split(['-', '_'])
        .filter(|p| !p.is_empty())
        .map(|p| {
            let mut c = p.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Candidate locations of the Claude Desktop app, per platform.
fn claude_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    #[cfg(target_os = "macos")]
    {
        v.push(PathBuf::from("/Applications/Claude.app"));
        v.push(home_dir().join("Applications/Claude.app"));
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            v.push(local.join("AnthropicClaude").join("claude.exe"));
            // Squirrel installs keep versioned folders: AnthropicClaude\app-x.y.z\claude.exe
            if let Ok(rd) = fs::read_dir(local.join("AnthropicClaude")) {
                let mut apps: Vec<PathBuf> = rd
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.starts_with("app-"))
                            .unwrap_or(false)
                    })
                    .map(|p| p.join("claude.exe"))
                    .collect();
                apps.sort();
                apps.reverse();
                v.extend(apps);
            }
            v.push(local.join("Programs").join("Claude").join("Claude.exe"));
        }
        if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
            v.push(pf.join("Claude").join("Claude.exe"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        v.push(PathBuf::from("/usr/bin/claude-desktop"));
        v.push(PathBuf::from("/opt/Claude/claude"));
    }
    v
}

fn detect_claude_path() -> Option<String> {
    claude_candidates()
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
}

fn resolve_claude_path(config: &Config) -> Result<String, String> {
    if let Some(p) = config.claude_path.as_deref().filter(|p| !p.trim().is_empty()) {
        if Path::new(p).exists() {
            return Ok(p.to_string());
        }
        return Err(format!("The configured Claude path does not exist: {p}"));
    }
    detect_claude_path().ok_or_else(|| {
        "Claude Desktop was not found. Set its path in Settings.".to_string()
    })
}

fn read_config(app: &AppHandle) -> Result<Config, String> {
    let path = config_file(app)?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid config.json: {e}"))
}

fn write_config(app: &AppHandle, config: &Config) -> Result<(), String> {
    let path = config_file(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())
}

/// On first run, import the folders that already exist in ~/.claude-instances.
fn import_existing(config: &mut Config) -> bool {
    let root = instances_root();
    let Ok(rd) = fs::read_dir(&root) else { return false };
    let known: Vec<PathBuf> = config.instances.iter().map(|i| PathBuf::from(&i.dir)).collect();
    let mut added = false;
    let mut entries: Vec<PathBuf> = rd
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter(|p| {
            !p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with('.'))
                .unwrap_or(true)
        })
        .collect();
    entries.sort();
    for p in entries {
        if known.iter().any(|k| k == &p) {
            continue;
        }
        let slug = p.file_name().and_then(|n| n.to_str()).unwrap_or("instance");
        let idx = config.instances.len() % PALETTE.len();
        let id = unique_id(config);
        config.instances.push(Instance {
            id,
            name: humanize(slug),
            dir: p.to_string_lossy().to_string(),
            icon: None,
            color: PALETTE[idx].to_string(),
            ..Default::default()
        });
        added = true;
    }
    added
}

#[cfg(target_os = "windows")]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn hide_console(_cmd: &mut Command) {}

/// Returns (pid, command line) for every process that looks like a Claude process.
fn claude_processes() -> Vec<(u32, String)> {
    let mut out = Vec::new();
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name like 'claude%'\" | ForEach-Object { \"$($_.ProcessId)\t$($_.CommandLine)\" }",
        ]);
        hide_console(&mut cmd);
        if let Ok(o) = cmd.output() {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                if let Some((pid, args)) = line.split_once('\t') {
                    if let Ok(pid) = pid.trim().parse::<u32>() {
                        out.push((pid, args.to_string()));
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(o) = Command::new("ps").args(["-axo", "pid=,args="]).output() {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                let line = line.trim_start();
                if let Some((pid, args)) = line.split_once(char::is_whitespace) {
                    if !args.to_ascii_lowercase().contains("claude") {
                        continue;
                    }
                    if let Ok(pid) = pid.trim().parse::<u32>() {
                        out.push((pid, args.trim().to_string()));
                    }
                }
            }
        }
    }
    out
}

fn normalize_dir(d: &str) -> String {
    let s = d.trim().trim_end_matches(['/', '\\']).to_string();
    #[cfg(target_os = "windows")]
    {
        return s.to_ascii_lowercase().replace('/', "\\");
    }
    #[allow(unreachable_code)]
    s
}

/// Map instance id -> lowest pid of a process started with that user-data-dir.
/// The regular profile appears under DEFAULT_ID when Claude runs without the flag.
fn running_map(config: &Config) -> HashMap<String, u32> {
    let procs = claude_processes();
    let mut map = match_running(&config.instances, &procs);
    if let Ok(claude) = resolve_claude_path(config) {
        if let Some(pid) = default_profile_pid(&procs, &claude_main_binary(&claude)) {
            map.insert(DEFAULT_ID.to_string(), pid);
        }
    }
    map
}

/// The executable that shows up in the process list for the given install path.
fn claude_main_binary(claude_path: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        return format!("{}/Contents/MacOS/Claude", claude_path.trim_end_matches('/'));
    }
    #[allow(unreachable_code)]
    claude_path.to_string()
}

/// Lowest pid of the main Claude process running on the regular profile:
/// the command line starts with the main binary and has neither --user-data-dir
/// nor a --type= flag (which marks helper processes).
fn default_profile_pid(procs: &[(u32, String)], main_binary: &str) -> Option<u32> {
    let bin = normalize_dir(main_binary);
    let mut best: Option<u32> = None;
    for (pid, args) in procs {
        let hay = normalize_dir(args);
        let hay = hay.trim_start_matches('"');
        if hay.starts_with(&bin) && !hay.contains("--user-data-dir") && !hay.contains("--type=") {
            best = Some(best.map_or(*pid, |b: u32| b.min(*pid)));
        }
    }
    best
}

fn match_running(instances: &[Instance], procs: &[(u32, String)]) -> HashMap<String, u32> {
    let mut map = HashMap::new();
    for inst in instances {
        let needle = normalize_dir(&inst.dir);
        let mut best: Option<u32> = None;
        for (pid, args) in procs {
            let hay = normalize_dir(args);
            // Exact value match: avoid "…/work" matching "…/work2". Honors quoted values.
            let hit = hay.split("--user-data-dir=").skip(1).any(|rest| {
                let val = if let Some(q) = rest.strip_prefix('"') {
                    q.split('"').next().unwrap_or("")
                } else {
                    rest.split_whitespace().next().unwrap_or("")
                };
                normalize_dir(val) == needle
            });
            if hit {
                best = Some(best.map_or(*pid, |b: u32| b.min(*pid)));
            }
        }
        if let Some(pid) = best {
            map.insert(inst.id.clone(), pid);
        }
    }
    map
}

// ---------- commands ----------

#[tauri::command]
fn get_environment(app: AppHandle) -> Result<Environment, String> {
    Ok(Environment {
        os: std::env::consts::OS.to_string(),
        home: home_dir().to_string_lossy().to_string(),
        instances_root: instances_root().to_string_lossy().to_string(),
        detected_claude_path: detect_claude_path(),
        claude_version: read_config(&app)
            .ok()
            .and_then(|c| resolve_claude_path(&c).ok())
            .and_then(|p| claude_version(&p)),
        config_file: config_file(&app)?.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<Config, String> {
    let mut config = read_config(&app)?;
    let repaired = repair_ids(&mut config);
    let imported = config.instances.is_empty() && import_existing(&mut config);
    if repaired || imported {
        write_config(&app, &config)?;
    }
    Ok(config)
}

#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    write_config(&app, &config)?;
    refresh_tray(&app, &running_map(&config));
    apply_shortcuts(&app, &config);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(config.show_in_menu_bar);
    }
    Ok(())
}

/// Asks one process to quit gracefully (SIGTERM on Unix, taskkill without /F on Windows).
fn terminate_pid(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string()]);
        hide_console(&mut cmd);
        return cmd.status().map(|s| s.success()).unwrap_or(false);
    }
    #[allow(unreachable_code)]
    Command::new("kill").args(["-TERM", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
}

/// Quits the Claude process of one instance (or the regular profile).
#[tauri::command]
fn quit_instance(app: AppHandle, id: String) -> Result<bool, String> {
    let config = read_config(&app)?;
    let map = running_map(&config);
    Ok(map.get(&id).map(|pid| terminate_pid(*pid)).unwrap_or(false))
}

/// Gracefully quits every running Claude process we know about (SIGTERM / taskkill).
#[tauri::command]
fn quit_all_instances(app: AppHandle) -> Result<usize, String> {
    let config = read_config(&app)?;
    let map = running_map(&config);
    let mut n = 0;
    for pid in map.values() {
        if terminate_pid(*pid) {
            n += 1;
        }
    }
    Ok(n)
}

#[tauri::command]
fn import_instances(app: AppHandle) -> Result<Config, String> {
    let mut config = read_config(&app)?;
    let repaired = repair_ids(&mut config);
    if import_existing(&mut config) || repaired {
        write_config(&app, &config)?;
        refresh_tray(&app, &running_map(&config));
    }
    Ok(config)
}

/// Writes the current configuration as pretty JSON to `path` (a backup the user picked).
#[tauri::command]
fn export_config(app: AppHandle, path: String) -> Result<usize, String> {
    let config = read_config(&app)?;
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, &raw).map_err(|e| format!("Could not write {path}: {e}"))?;
    Ok(config.instances.len())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub config: Config,
    pub added: usize,
    pub skipped: usize,
}

/// Loads a backup. With `replace` the file becomes the whole configuration;
/// otherwise its instances are merged in, skipping folders that already exist.
#[tauri::command]
fn import_config(app: AppHandle, path: String, replace: bool) -> Result<ImportResult, String> {
    let raw = fs::read_to_string(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    let mut incoming: Config =
        serde_json::from_str(&raw).map_err(|e| format!("Not a Claude Switcher backup: {e}"))?;
    for inst in &incoming.instances {
        if inst.name.trim().is_empty() || inst.dir.trim().is_empty() {
            return Err("Backup has an instance without a name or folder.".into());
        }
    }
    let (mut config, added, skipped) = if replace {
        let n = incoming.instances.len();
        (incoming, n, 0)
    } else {
        let mut current = read_config(&app)?;
        let mut added = 0;
        let mut skipped = 0;
        for inst in incoming.instances.drain(..) {
            let dup = current
                .instances
                .iter()
                .any(|c| normalize_dir(&c.dir) == normalize_dir(&inst.dir));
            if dup {
                skipped += 1;
            } else {
                current.instances.push(inst);
                added += 1;
            }
        }
        if current.claude_path.is_none() {
            current.claude_path = incoming.claude_path;
        }
        (current, added, skipped)
    };
    repair_ids(&mut config);
    write_config(&app, &config)?;
    refresh_tray(&app, &running_map(&config));
    apply_shortcuts(&app, &config);
    Ok(ImportResult { config, added, skipped })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub author: String,
    pub repo_url: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: APP_NAME.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        author: AUTHOR.into(),
        repo_url: REPO_URL.into(),
    }
}

#[tauri::command]
fn suggest_dir(name: String) -> String {
    instances_root()
        .join(slugify(&name))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn running_instances(app: AppHandle) -> Result<Vec<String>, String> {
    let config = read_config(&app)?;
    Ok(running_map(&config).into_keys().collect())
}

#[tauri::command]
fn launch_instance(app: AppHandle, id: String) -> Result<String, String> {
    let config = read_config(&app)?;
    let claude = resolve_claude_path(&config)?;

    // The regular profile has no data-dir flag; everything else needs its folder.
    let flag: Option<String> = if id == DEFAULT_ID {
        None
    } else {
        let inst = config
            .instances
            .iter()
            .find(|i| i.id == id)
            .ok_or("Instance not found")?;
        let dir = PathBuf::from(&inst.dir);
        fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
        Some(format!("--user-data-dir={}", dir.display()))
    };

    touch_last_used(&app, &id);

    // Already running? Focus instead of spawning a duplicate on the same profile.
    if let Some(pid) = running_map(&config).get(&id) {
        focus_pid(*pid);
        return Ok("focused".into());
    }

    #[cfg(target_os = "macos")]
    {
        // `open -n` forces a new process even when another Claude (an instance) is running;
        // plain `open -a` would only bring that one to the front.
        let mut cmd = Command::new("open");
        cmd.args(["-n", "-a", &claude]);
        if let Some(flag) = &flag {
            cmd.args(["--args", flag]);
        }
        cmd.spawn().map_err(|e| format!("Could not open Claude: {e}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut cmd = Command::new(&claude);
        if let Some(flag) = &flag {
            cmd.arg(flag);
        }
        hide_console(&mut cmd);
        cmd.spawn().map_err(|e| format!("Could not open Claude ({claude}): {e}"))?;
    }
    Ok("launched".into())
}

/// Stamps the instance with the current time and tells the window.
fn touch_last_used(app: &AppHandle, id: &str) {
    let Ok(mut config) = read_config(app) else { return };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Some(inst) = config.instances.iter_mut().find(|i| i.id == id) {
        inst.last_used = Some(now);
        let _ = write_config(app, &config);
        let _ = app.emit("config-changed", &config);
    }
}

fn focus_pid(pid: u32) {
    #[cfg(target_os = "macos")]
    {
        // NSRunningApplication needs no Accessibility permission (unlike System Events).
        use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
        if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid as i32) {
            #[allow(deprecated)]
            app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            "Add-Type -Name W -Namespace N -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int n);'; \
             $p = Get-Process -Id {pid} -ErrorAction SilentlyContinue; \
             $h = if ($p) {{ $p.MainWindowHandle }} else {{ 0 }}; \
             if ($h -eq 0) {{ $h = (Get-Process claude -ErrorAction SilentlyContinue | Where-Object {{ $_.MainWindowHandle -ne 0 }} | Select-Object -First 1).MainWindowHandle }}; \
             if ($h -ne 0) {{ [N.W]::ShowWindow($h, 9) | Out-Null; [N.W]::SetForegroundWindow($h) | Out-Null }}"
        );
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        hide_console(&mut cmd);
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = pid;
    }
}

/// Reads an image file and returns it as a data URL (so icons live inside config.json).
#[tauri::command]
fn read_icon(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err("The image is larger than 2 MB. Pick a smaller one.".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        _ => return Err("Unsupported format. Use png, jpg, gif, webp, svg or ico.".into()),
    };
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

// ---------- tray, window and background watcher ----------

/// Tray menu: one entry per instance (a filled dot marks the running ones), then app actions.
fn build_tray_menu(app: &AppHandle, running: &HashMap<String, u32>) -> tauri::Result<Menu<tauri::Wry>> {
    let config = read_config(app).unwrap_or_default();
    let lang = ui_lang(&config);
    let menu = Menu::new(app)?;
    if config.instances.is_empty() {
        menu.append(&MenuItem::with_id(app, "none", tr(lang, "none"), false, None::<&str>)?)?;
    }
    let accel = |n: Option<u8>| n.filter(|_| config.shortcuts_enabled).map(|n| format!("Ctrl+Alt+{n}"));
    for inst in &config.instances {
        let marker = if running.contains_key(&inst.id) { "●" } else { "○" };
        let item = MenuItem::with_id(
            app,
            format!("inst:{}", inst.id),
            format!("{marker}  {}", inst.name),
            true,
            accel(slot_of(&config, &inst.id)).as_deref(),
        )?;
        menu.append(&item)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let marker = if running.contains_key(DEFAULT_ID) { "●" } else { "○" };
    menu.append(&MenuItem::with_id(
        app,
        format!("inst:{DEFAULT_ID}"),
        format!("{marker}  {}", tr(lang, "default")),
        true,
        accel(Some(0)).as_deref(),
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "new", tr(lang, "new"), true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "show", tr(lang, "open"), true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "settings", tr(lang, "settings"), true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "about", tr(lang, "about"), true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quitall", tr(lang, "quitall"), !running.is_empty(), None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", tr(lang, "quit"), true, None::<&str>)?)?;
    Ok(menu)
}

fn refresh_tray(app: &AppHandle, running: &HashMap<String, u32>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_tray_menu(app, running) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Closing the window keeps the app alive in the tray. On macOS the Dock icon goes away too.
fn hide_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    // macOS wants a monochrome template image (it tints it for light/dark menu bars);
    // Windows and Linux show the color icon.
    let (bytes, template): (&[u8], bool) = if cfg!(target_os = "macos") {
        (include_bytes!("../icons/tray/tray-template@2x.png"), true)
    } else {
        (include_bytes!("../icons/tray/tray-color.png"), false)
    };
    let icon = Image::from_bytes(bytes)?;
    let menu = build_tray_menu(app, &HashMap::new())?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(template)
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "about" => {
                show_main_window(app);
                let _ = app.emit("open-about", ());
            }
            "new" => {
                show_main_window(app);
                let _ = app.emit("new-instance", ());
            }
            "settings" => {
                show_main_window(app);
                let _ = app.emit("open-settings", ());
            }
            "quitall" => {
                let app = app.clone();
                std::thread::spawn(move || {
                    let _ = quit_all_instances(app);
                });
            }
            "quit" => app.exit(0),
            id if id.starts_with("inst:") => {
                let id = id["inst:".len()..].to_string();
                let app = app.clone();
                // Launching shells out (ps/open); keep it off the UI thread.
                std::thread::spawn(move || {
                    if let Err(e) = launch_instance(app.clone(), id) {
                        let _ = app.emit("launch-error", e);
                    }
                });
            }
            _ => {}
        })
        .build(app)?;
    if let Ok(config) = read_config(app) {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_visible(config.show_in_menu_bar);
        }
    }
    Ok(())
}

/// Pid of the application that owns the frontmost window, if the OS tells us.
fn frontmost_pid() -> Option<u32> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        let ws = NSWorkspace::sharedWorkspace();
        let app = ws.frontmostApplication()?;
        return u32::try_from(app.processIdentifier()).ok();
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        return (pid != 0).then_some(pid);
    }
    #[allow(unreachable_code)]
    None
}

/// Shows which instance owns the frontmost Claude window: as text next to the
/// menu bar icon on macOS, in the tooltip elsewhere.
fn set_tray_active(app: &AppHandle, name: Option<&str>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    #[cfg(target_os = "macos")]
    {
        let _ = tray.set_title(name);
    }
    let tooltip = match name {
        Some(n) => format!("{APP_NAME} · {n}"),
        None => APP_NAME.to_string(),
    };
    let _ = tray.set_tooltip(Some(tooltip));
}

/// Background watcher. Every 3 s it rescans the process list and, when the set
/// of running instances changes, refreshes the tray menu and tells the window.
/// Every 500 ms it checks which app is frontmost and shows the matching
/// instance name in the tray.
fn spawn_running_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_ids: Vec<String> = Vec::new();
        let mut map: HashMap<String, u32> = HashMap::new();
        let mut names: HashMap<String, String> = HashMap::new();
        let mut last_active: Option<String> = None;
        let mut tick: u32 = 0;
        loop {
            if tick % 6 == 0 {
                if let Ok(config) = read_config(&app) {
                    map = running_map(&config);
                    names = config
                        .instances
                        .iter()
                        .map(|i| (i.id.clone(), i.name.clone()))
                        .collect();
                    let mut ids: Vec<String> = map.keys().cloned().collect();
                    ids.sort();
                    if ids != last_ids {
                        last_ids = ids.clone();
                        refresh_tray(&app, &map);
                        let _ = app.emit("running-changed", ids);
                    }
                }
            }
            let active: Option<String> = frontmost_pid().and_then(|pid| {
                map.iter().find(|(_, p)| **p == pid).map(|(id, _)| id.clone())
            });
            if active != last_active {
                let label = active.as_deref().map(|id| {
                    if id == DEFAULT_ID {
                        "Claude".to_string()
                    } else {
                        names.get(id).cloned().unwrap_or_default()
                    }
                });
                set_tray_active(&app, label.as_deref());
                let _ = app.emit("active-changed", &active);
                last_active = active;
            }
            tick = tick.wrapping_add(1);
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

/// macOS app menu with an About panel that shows the author and the repository,
/// plus the Edit items the text fields need.
#[cfg(target_os = "macos")]
fn setup_app_menu(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{AboutMetadata, Submenu};
    let about = AboutMetadata {
        name: Some(APP_NAME.into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        authors: Some(vec![AUTHOR.into()]),
        website: Some(REPO_URL.into()),
        website_label: Some("github.com/efideas/claude-switcher".into()),
        copyright: Some(format!("Copyright 2026 {AUTHOR}")),
        license: Some("MIT".into()),
        ..Default::default()
    };
    let app_menu = Submenu::with_items(
        app,
        APP_NAME,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&format!("About {APP_NAME}")), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    let menu = Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])?;
    app.set_menu(menu)?;
    Ok(())
}

// ---------- global shortcuts ----------

/// Shortcut slot (1-9) for every instance: explicit `shortcut` values first,
/// then the remaining instances take the lowest free slots in list order.
/// Instances beyond nine slots get none. The regular profile is always 0.
fn effective_slots(config: &Config) -> Vec<(String, u8)> {
    let mut taken: HashSet<u8> = HashSet::new();
    let mut out: Vec<(String, u8)> = Vec::new();
    for inst in &config.instances {
        if let Some(n) = inst.shortcut {
            if (1..=9).contains(&n) && taken.insert(n) {
                out.push((inst.id.clone(), n));
            }
        }
    }
    for inst in &config.instances {
        if out.iter().any(|(id, _)| id == &inst.id) {
            continue;
        }
        if let Some(free) = (1..=9u8).find(|n| !taken.contains(n)) {
            taken.insert(free);
            out.push((inst.id.clone(), free));
        }
    }
    out
}

fn slot_of(config: &Config, id: &str) -> Option<u8> {
    if id == DEFAULT_ID {
        return Some(0);
    }
    effective_slots(config).into_iter().find(|(i, _)| i == id).map(|(_, n)| n)
}

/// Ctrl+Alt+N (Control+Option+N on macOS): 1-9 for the Nth instance, 0 for the regular profile.
fn shortcut_for(n: u8) -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let code = match n {
        0 => Code::Digit0,
        1 => Code::Digit1,
        2 => Code::Digit2,
        3 => Code::Digit3,
        4 => Code::Digit4,
        5 => Code::Digit5,
        6 => Code::Digit6,
        7 => Code::Digit7,
        8 => Code::Digit8,
        _ => Code::Digit9,
    };
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code)
}

/// Registers shortcuts for the current instances (or unregisters them all when disabled).
fn apply_shortcuts(app: &AppHandle, config: &Config) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if !config.shortcuts_enabled {
        return;
    }
    let mut slots: Vec<u8> = effective_slots(config).into_iter().map(|(_, n)| n).collect();
    slots.push(0);
    for n in slots {
        if let Err(e) = gs.register(shortcut_for(n)) {
            eprintln!("could not register shortcut Ctrl+Alt+{n}: {e}");
        }
    }
}

fn on_shortcut(app: &AppHandle, shortcut: &tauri_plugin_global_shortcut::Shortcut) {
    use tauri_plugin_global_shortcut::Code;
    let n = match shortcut.key {
        Code::Digit0 => 0,
        Code::Digit1 => 1,
        Code::Digit2 => 2,
        Code::Digit3 => 3,
        Code::Digit4 => 4,
        Code::Digit5 => 5,
        Code::Digit6 => 6,
        Code::Digit7 => 7,
        Code::Digit8 => 8,
        Code::Digit9 => 9,
        _ => return,
    };
    let Ok(config) = read_config(app) else { return };
    let id = if n == 0 {
        DEFAULT_ID.to_string()
    } else {
        match effective_slots(&config).into_iter().find(|(_, s)| *s as usize == n) {
            Some((id, _)) => id,
            None => return,
        }
    };
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = launch_instance(app.clone(), id) {
            let _ = app.emit("launch-error", e);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        on_shortcut(app, shortcut);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            #[cfg(target_os = "macos")]
            setup_app_menu(&handle)?;
            setup_tray(&handle)?;
            if let Ok(config) = read_config(&handle) {
                apply_shortcuts(&handle, &config);
            }
            spawn_running_watcher(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let tray_on = read_config(app).map(|c| c.show_in_menu_bar).unwrap_or(true);
                if tray_on {
                    api.prevent_close();
                    hide_main_window(app);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_environment,
            load_config,
            save_config,
            import_instances,
            suggest_dir,
            running_instances,
            launch_instance,
            read_icon,
            app_info,
            export_config,
            import_config,
            quit_all_instances,
            quit_instance
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inst(id: &str, dir: &str) -> Instance {
        Instance { id: id.into(), name: id.into(), dir: dir.into(), ..Default::default() }
    }

    #[test]
    fn slugify_and_humanize() {
        assert_eq!(slugify("Acme Corp!"), "acme-corp");
        assert_eq!(slugify("  "), "instance");
        assert_eq!(humanize("acme-corp"), "Acme Corp");
    }

    #[test]
    fn matches_exact_user_data_dir_only() {
        let instances = vec![
            inst("work", "/Users/me/.claude-instances/work"),
            inst("work2", "/Users/me/.claude-instances/work2"),
            inst("idle", "/Users/me/.claude-instances/idle"),
        ];
        let procs = vec![
            (900, "/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/me/.claude-instances/work2".to_string()),
            (500, "/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/me/.claude-instances/work".to_string()),
            (510, "/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=renderer --user-data-dir=/Users/me/.claude-instances/work".to_string()),
            (1, "/Applications/Claude.app/Contents/MacOS/Claude".to_string()),
        ];
        let m = match_running(&instances, &procs);
        assert_eq!(m.get("work"), Some(&500));
        assert_eq!(m.get("work2"), Some(&900));
        assert_eq!(m.get("idle"), None);
    }

    #[test]
    fn matches_quoted_flag() {
        let instances = vec![inst("a", "/tmp/dir with space")];
        let procs = vec![(7, "Claude --user-data-dir=\"/tmp/dir with space\" --foo".to_string())];
        // Quoted values with spaces are matched via the quoted form.
        let m = match_running(&instances, &procs);
        assert_eq!(m.get("a"), Some(&7));
    }

    #[test]
    fn default_profile_is_the_main_binary_without_flags() {
        let bin = "/Applications/Claude.app/Contents/MacOS/Claude";
        let procs = vec![
            (300, "/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/me/.claude-instances/work".to_string()),
            (310, "/Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer".to_string()),
            (200, "/Applications/Claude.app/Contents/MacOS/Claude".to_string()),
            (210, "/Applications/Claude.app/Contents/MacOS/Claude --type=utility --user-data-dir=/x".to_string()),
        ];
        assert_eq!(default_profile_pid(&procs, bin), Some(200));
        let only_instances = vec![procs[0].clone(), procs[1].clone()];
        assert_eq!(default_profile_pid(&only_instances, bin), None);
        // Windows-style quoted command line.
        let win = vec![(7, "\"C:\\Users\\me\\AppData\\Local\\AnthropicClaude\\claude.exe\"".to_string())];
        let hit = default_profile_pid(&win, "C:\\Users\\me\\AppData\\Local\\AnthropicClaude\\claude.exe");
        assert_eq!(hit, Some(7));
    }

    #[test]
    fn slots_respect_explicit_values_then_fill_gaps() {
        let mut a = inst("a", "/a");
        let b = inst("b", "/b");
        let mut c = inst("c", "/c");
        a.shortcut = Some(3);
        c.shortcut = Some(1);
        let config = Config { instances: vec![a, b, c], ..Default::default() };
        let slots = effective_slots(&config);
        assert_eq!(slots, vec![("a".to_string(), 3), ("c".to_string(), 1), ("b".to_string(), 2)]);
        assert_eq!(slot_of(&config, "b"), Some(2));
        assert_eq!(slot_of(&config, DEFAULT_ID), Some(0));
    }

    #[test]
    fn live_process_scan_does_not_panic() {
        let _ = claude_processes();
    }

    #[test]
    fn ids_generated_back_to_back_are_unique() {
        let ids: HashSet<String> = (0..10_000).map(|_| new_id()).collect();
        assert_eq!(ids.len(), 10_000);
    }

    #[test]
    fn repair_ids_fixes_duplicates_and_empty_ids() {
        let mut config = Config {
            instances: vec![
                inst("18decadf62f01ca8", "/a"),
                inst("18decadf62f02090", "/b"),
                inst("18decadf62f02090", "/c"),
                inst("", "/d"),
            ],
            ..Default::default()
        };
        assert!(repair_ids(&mut config));
        let ids: Vec<&str> = config.instances.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids[0], "18decadf62f01ca8", "untouched ids keep their value");
        assert_eq!(ids[1], "18decadf62f02090", "the first holder of a duplicate keeps it");
        assert_ne!(ids[2], "18decadf62f02090");
        assert!(!ids[3].is_empty());
        let unique: HashSet<&str> = ids.iter().copied().collect();
        assert_eq!(unique.len(), 4);
        // Folders are what identify instances; they must not move.
        assert_eq!(config.instances[2].dir, "/c");
    }

    #[test]
    fn repair_ids_leaves_healthy_config_alone() {
        let mut config = Config {
            instances: vec![inst("a", "/a"), inst("b", "/b")],
            ..Default::default()
        };
        assert!(!repair_ids(&mut config));
        assert_eq!(config.instances[0].id, "a");
        assert_eq!(config.instances[1].id, "b");
    }
}
