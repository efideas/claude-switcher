# Claude Switcher

A small desktop launcher that opens several Claude Desktop instances, one per organization or account, with a click. Works on macOS and Windows.

> Unofficial. Not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic, PBC.

## Why

Claude Desktop signs in to one account at a time. If you belong to several organizations, you log out and back in every time you switch. The app is built on Electron, which accepts the standard Chromium flag `--user-data-dir`. Point it at a different folder and you get an independent copy of Claude with its own login, chat history and connectors.

Claude Switcher keeps a list of those folders, shows each one as a card with a name and an icon, and runs the right command when you click:

- macOS: `open -n -a /Applications/Claude.app --args --user-data-dir=<folder>`
- Windows: `%LOCALAPPDATA%\AnthropicClaude\claude.exe --user-data-dir=<folder>`

That is all it does. It never touches the Claude app itself, your `~/.claude` folder, or the network.

## Features

- Cards with a custom image or colored initials. Click to launch.
- A green dot marks instances that are already running. Clicking one brings its window to the front instead of opening a duplicate.
- Keys `1` to `9` launch the Nth card.
- Imports any folders already present in `~/.claude-instances` on first run.
- Detects the Claude install path on both platforms; you can override it in Settings.
- Configuration lives in a single `config.json` under the OS app-config directory. The path is shown in Settings.

## Install

Download the latest build from the [Releases](../../releases) page.

### macOS

1. Open the `.dmg` and drag Claude Switcher to Applications.
2. The app is not notarized yet, so the first launch is blocked by Gatekeeper. Right-click the app, choose Open, then Open again. You only need to do this once. The equivalent command is:

   ```bash
   xattr -d com.apple.quarantine "/Applications/Claude Switcher.app"
   ```

### Windows

Run the `.exe` installer (NSIS) or the `.msi`. Windows SmartScreen may warn that the publisher is unknown because the binary is not code signed. Choose "More info" and then "Run anyway".

### Sign-in tips

- When you sign in to a new instance for the first time, close the other Claude windows first. The login deep link always lands in whichever Claude process is already running.
- When Claude updates itself it may relaunch without the flag and land in the default profile. Quit it and open it again from Claude Switcher.

## Development

Requirements: Node 20 or newer, a stable Rust toolchain, and the Tauri 2 prerequisites for your OS (Xcode Command Line Tools on macOS; Visual Studio Build Tools and WebView2 on Windows).

```bash
npm install
npm run tauri dev      # run with hot reload
npm run tauri build    # produce .app/.dmg on macOS or .exe/.msi on Windows
npm run dev            # frontend only, in a browser, with a mocked backend
cargo test --manifest-path src-tauri/Cargo.toml
```

Builds are platform specific: a Mac produces the macOS bundles, a Windows machine produces the installers. The GitHub Actions workflow in `.github/workflows/release.yml` builds both when you push a tag that starts with `v` and attaches the artifacts to a draft release.

### Project layout

```
index.html            UI markup
src/main.ts           UI logic (cards, dialogs, polling of running instances)
src/mock.ts           in-browser mock of the Tauri bridge for frontend work
src/styles.css        theme, light and dark
src-tauri/src/lib.rs  commands: config, launch, running-process detection, icons
design/               icon sources
```

## Distribution

The repository starts private, so only collaborators can see its Releases. The options below are in order of effort.

1. **GitHub Releases.** Already wired up by the workflow. Tag `v0.2.0`, wait for the three jobs, publish the draft. Works as long as the people installing have access to the repository, or the repository is public.
2. **Homebrew tap (macOS).** Create a public `efideas/homebrew-tap` repository with a cask that points at the `.dmg` in the release. Users then run `brew install --cask efideas/tap/claude-switcher`. The cask needs the download URL and the SHA-256 of each release, which the workflow can update.
3. **winget or Scoop (Windows).** Scoop needs a public bucket repository with a manifest pointing at the `.exe`. winget needs a pull request to `microsoft/winget-pkgs` per version and a code-signed installer is strongly recommended.
4. **Code signing.** Without it, macOS shows the Gatekeeper warning and Windows shows SmartScreen. Signing on macOS needs an Apple Developer account (99 USD per year) plus notarization, which Tauri's bundler can do in CI with the `APPLE_*` secrets. Windows needs an OV or EV certificate from a CA (roughly 200 to 400 USD per year). Signing is what turns a "friends and colleagues" tool into something you can hand to anyone.
5. **In-app updates.** Tauri ships an updater plugin. Once signing is in place it can check the GitHub release feed and install new versions from inside the app.

## Limitations

- `--user-data-dir` is a Chromium flag, not an Anthropic feature. A future Claude release could change how it behaves.
- Only the desktop app is isolated. Claude Code (the CLI) uses `~/.claude`; set `CLAUDE_CONFIG_DIR` in your shell if you need separate CLI profiles too.
- Google and SSO logins open the system browser, which hands the token back to whichever Claude process is running. See the sign-in tips above.

## License

MIT. See [LICENSE](LICENSE).
