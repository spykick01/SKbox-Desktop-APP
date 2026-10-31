# SKBox Remote Play

Play your SKBox PC from a Mac (or another PC) on the **same Wi-Fi**.

- **Host** = the Windows PC running SKBox. Turn it on in **Settings > Remote play**. It is **off by default and off every time SKBox starts**. While off, nothing listens on the network.
- **Player** = the SKBox Remote app (Mac and Windows), or just a web browser pointed at the address SKBox shows.

## Quick start
1. In SKBox: Settings > Remote play > turn it on. You see an address (like `192.168.1.23:47822`) and a 6-digit PIN.
2. On the Mac: open **SKBox Remote**. Your PC shows up in the list (or type the address), type the PIN, press Connect.
3. Windows may ask to let SKBox use private networks the first time. Choose **Allow**.

No app? Open `http://192.168.1.23:47822` (your address) in Safari or Chrome instead.

## Opening the Mac app the first time
The app is not signed with an Apple developer certificate, so macOS blocks it at first:
- Right-click the app > **Open** > Open, or
- in Terminal: `xattr -cr "/Applications/SKBox Remote.app"` and open it again.
Needs macOS 10.15 (Catalina) or newer. Older macOS: use the browser version.

## While playing
The player is just the picture, sound, keyboard and mouse. It goes fullscreen by itself and has no buttons on top.
All the controls are on the PC, in the **SKBox menu** (press the Xbox / PlayStation button, or Ctrl+Shift+O, then pick **Remote play**):
Disconnect player, Fix black screen, New PIN, Quality, Keyboard & mouse on/off, Auto-fix games, Turn Remote play off.
Emergency exit on the player device: Ctrl+Alt+Shift+D. On a Mac, Command acts as Ctrl.
Raw mouse movement for games turns on by itself at your first click while a game is running (Esc lets go).

## Settings (on the PC)
Quality (720p60 is the default and the fastest, 720p30, 1080p30, 1080p60), keyboard and mouse on/off (off = view only), controller mode, auto-fix, New PIN, Disconnect.

## Security
Only devices on your local network can connect (anything else is refused). A random PIN is required; 5 wrong tries lock that device for a minute. One player at a time. Turning Remote play off closes the port and ends the session.

## Limits you should know
- A **real controller cannot be passed through** without a virtual-controller driver (ViGEmBus). Instead the controller on the other device acts as keyboard and mouse input.
- Games running **as administrator** ignore injected input unless SKBox is also run as administrator.
- **Exclusive fullscreen games:** SKBox streams the monitor SKBox itself is on. If the picture goes black or freezes while a game runs, SKBox fixes it by itself in steps (capture the game window, then leave exclusive fullscreen with Alt+Enter, then capture again). You can run the same fix from the SKBox menu. If it is still black, set the game to Borderless or Windowed in its video settings.
- The PC keeps playing sound on its own speakers too.
- Hardware video encoding depends on the PC's graphics driver; if it falls back to software, use the 720p preset.
