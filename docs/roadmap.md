# Roadmap

Planned work, roughly in order. Items move to the changelog in the release notes when they ship.

## Shipped in 0.4.0

- Window redesigned after the pen.dev mockup: search, All/Running/Stopped filter, grid and list views, card menu, last-used times, add tile, status bar.
- New-instance sheet with live preview, image drop zone, shortcut slot picker and auto-derived data folder.
- Settings with grouped sections, switches that save on change, open at login, show-in-menu-bar toggle, Claude version.
- Per-instance Dock icon on macOS: each instance launches from an APFS clone of Claude.app carrying its avatar as a Finder custom icon. The signature, Gatekeeper and the Keychain item are untouched. Clones that Claude's updater relaunches without their profile are re-homed within seconds.
- Tray: New instance, Settings, Quit all instances, shortcut hints.

## Shipped in 0.3.0

- Export and import of the configuration as JSON.
- Active instance shown in the tray and outlined in the window.
- Global shortcuts Ctrl+Alt+0..9.
- English and Spanish.

## Later

- [ ] **Custom menu bar popover.** Replace the native tray menu with the designed popover: avatars, running dots, shortcuts, New instance, Open, Settings, Quit all.

- [ ] **Universal macOS build.** One dmg with arm64 and x86_64 so the wrong architecture cannot be installed by hand.
- [ ] **Code signing and notarization.** Removes the Gatekeeper and SmartScreen warnings. Needs an Apple Developer account and a Windows code-signing certificate.
- [ ] **In-app updates** with the Tauri updater plugin, once builds are signed.
- [ ] **Scoop or winget manifest** for Windows installs from the command line.

## Not planned

- Changing the window title of a Claude instance. Electron sets it from inside the app; nothing outside can change it.
