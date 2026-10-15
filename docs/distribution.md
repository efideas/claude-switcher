# Distribution

How builds reach users today, and what is still open. The items are in order of effort.

1. **GitHub Releases.** Done. The workflow in [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on every tag that starts with `v`: tag `v0.2.0`, wait for the three jobs, then publish the draft release. Note that GitHub replaces the space in `Claude Switcher_<version>_<arch>.dmg` with a dot in the download URLs.
2. **Homebrew tap (macOS).** Done: [efideas/homebrew-tap](https://github.com/efideas/homebrew-tap) holds the cask, and users run `brew install --cask efideas/tap/claude-switcher`. After each release, bump `version` and both `sha256` values in `Casks/claude-switcher.rb`; the tap README has the steps.
3. **winget or Scoop (Windows).** Scoop needs a public bucket repository with a manifest pointing at the `.exe`. winget needs a pull request to `microsoft/winget-pkgs` per version and a code-signed installer is strongly recommended.
4. **Code signing.** Without it, macOS shows the Gatekeeper warning and Windows shows SmartScreen. Signing on macOS needs an Apple Developer account (99 USD per year) plus notarization, which Tauri's bundler can do in CI with the `APPLE_*` secrets. Windows needs an OV or EV certificate from a CA (roughly 200 to 400 USD per year). Signing is what turns a "friends and colleagues" tool into something you can hand to anyone.
5. **In-app updates.** Tauri ships an updater plugin. Once signing is in place it can check the GitHub release feed and install new versions from inside the app.

See [development.md](development.md) for building locally.
