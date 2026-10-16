# Roadmap

Planned work, roughly in order. Items move to the changelog in the release notes when they ship.

## In progress

- [ ] **Export and import the configuration.** A JSON backup of `config.json` (instances, icons, colors, Claude path) from Settings, and an import that merges or replaces the current list.
- [ ] **Active instance in the tray.** While a Claude window is frontmost, the menu bar shows the name of the instance it belongs to, so you know which organization you are working in without checking the Dock. Windows shows it in the tray tooltip.
- [ ] **Global shortcuts.** Ctrl+Alt+1 to 9 bring instance N to the front from any app (Ctrl+Alt+0 for the regular profile). Can be turned off in Settings.
- [ ] **Languages.** English and Spanish for the window and the tray menu, following the system language with an override in Settings.

## Later

- [ ] **Per-instance Dock icon (macOS).** Launch each instance from an APFS clone of Claude.app with a tinted or badged icon. Needs ad-hoc re-signing because Claude ships with the hardened runtime, and the Keychain item "Claude Safe Storage" is tied to the signature, so a re-login per instance is possible. Opt-in, one instance at a time.
- [ ] **Universal macOS build.** One dmg with arm64 and x86_64 so the wrong architecture cannot be installed by hand.
- [ ] **Code signing and notarization.** Removes the Gatekeeper and SmartScreen warnings. Needs an Apple Developer account and a Windows code-signing certificate.
- [ ] **In-app updates** with the Tauri updater plugin, once builds are signed.
- [ ] **Scoop or winget manifest** for Windows installs from the command line.

## Not planned

- Changing the window title of a Claude instance. Electron sets it from inside the app; nothing outside can change it.
