# Development

Requirements: Node 20 or newer, a stable Rust toolchain, and the Tauri 2 prerequisites for your OS (Xcode Command Line Tools on macOS; Visual Studio Build Tools and WebView2 on Windows).

```bash
npm install
npm run tauri dev      # run with hot reload
npm run tauri build    # produce .app/.dmg on macOS or .exe/.msi on Windows
npm run dev            # frontend only, in a browser, with a mocked backend
cargo test --manifest-path src-tauri/Cargo.toml
```

Builds are platform specific: a Mac produces the macOS bundles, a Windows machine produces the installers. The GitHub Actions workflow in [`.github/workflows/release.yml`](../.github/workflows/release.yml) builds both when you push a tag that starts with `v` and attaches the artifacts to a draft release.

## Project layout

```
index.html            UI markup
src/main.ts           UI logic (cards, dialogs, polling of running instances)
src/mock.ts           in-browser mock of the Tauri bridge for frontend work
src/styles.css        theme, light and dark
src-tauri/src/lib.rs  commands: config, launch, running-process detection, icons
design/               icon sources
```

See [distribution.md](distribution.md) for how builds reach users.
