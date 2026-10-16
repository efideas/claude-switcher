# Roadmap

Planned work, roughly in order. Items move to the changelog in the release notes when they ship.

## Shipped in 0.3.0

- Export and import of the configuration as JSON.
- Active instance shown in the tray and outlined in the window.
- Global shortcuts Ctrl+Alt+0..9.
- English and Spanish.

## Later

- [ ] **Per-instance Dock icon (macOS).** Launch each instance from an APFS clone of Claude.app with a tinted or badged icon. Needs ad-hoc re-signing because Claude ships with the hardened runtime, and the Keychain item "Claude Safe Storage" is tied to the signature, so a re-login per instance is possible. Opt-in, one instance at a time.
- [ ] **Universal macOS build.** One dmg with arm64 and x86_64 so the wrong architecture cannot be installed by hand.
- [ ] **Code signing and notarization.** Removes the Gatekeeper and SmartScreen warnings. Needs an Apple Developer account and a Windows code-signing certificate.
- [ ] **In-app updates** with the Tauri updater plugin, once builds are signed.
- [ ] **Scoop or winget manifest** for Windows installs from the command line.

## Not planned

- Changing the window title of a Claude instance. Electron sets it from inside the app; nothing outside can change it.
