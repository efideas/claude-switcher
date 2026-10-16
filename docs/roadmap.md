# Roadmap

Planned work, roughly in order. Items move to the changelog in the release notes when they ship.

## Shipped in 0.3.0

- Export and import of the configuration as JSON.
- Active instance shown in the tray and outlined in the window.
- Global shortcuts Ctrl+Alt+0..9.
- English and Spanish.

## Later

- [ ] **Per-instance Dock icon (macOS).** Launch each instance from an APFS clone of Claude.app (`cp -Rc`, under a second, no extra disk) stored outside Spotlight's reach, with the instance color applied as a Finder custom icon (`NSWorkspace.setIcon`). The Finder icon lives in metadata (`com.apple.FinderInfo` plus an `Icon\r` file), not inside the code seal, so `codesign --verify`, Gatekeeper and the Keychain item "Claude Safe Storage" all keep working without re-signing; verified on macOS 27 with Claude 2.x. Open points: a watchdog to re-home clones that Claude's self-update relaunches without the flag, never re-cloning over a clone that updated itself ahead of /Applications, and a Windows equivalent (none known). Prior art: odahcam/claude-desktop-profiles.
- [ ] **Universal macOS build.** One dmg with arm64 and x86_64 so the wrong architecture cannot be installed by hand.
- [ ] **Code signing and notarization.** Removes the Gatekeeper and SmartScreen warnings. Needs an Apple Developer account and a Windows code-signing certificate.
- [ ] **In-app updates** with the Tauri updater plugin, once builds are signed.
- [ ] **Scoop or winget manifest** for Windows installs from the command line.

## Not planned

- Changing the window title of a Claude instance. Electron sets it from inside the app; nothing outside can change it.
