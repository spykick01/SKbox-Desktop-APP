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
Move the mouse to the top of the screen for the toolbar: Fullscreen, **Game mouse**, **Fix black screen**, (hides the cursor and sends raw movement, use it in games), Stats, Disconnect. Ctrl+Alt+Shift+D disconnects. On a Mac, Command acts as Ctrl.

## Settings (on the PC)
Quality (720p30, 1080p30, 1080p60), let the other device use keyboard and mouse (off = view only), controller mode (menus / keyboard-and-mouse preset / off), New PIN, Disconnect.

## Security
Only devices on your local network can connect (anything else is refused). A random PIN is required; 5 wrong tries lock that device for a minute. One player at a time. Turning Remote play off closes the port and ends the session.

## Limits you should know
- A **real controller cannot be passed through** without a virtual-controller driver (ViGEmBus). Instead the controller on the other device acts as keyboard and mouse input.
- Games running **as administrator** ignore injected input unless SKBox is also run as administrator.
- Games in **exclusive fullscreen** may stream black (the screen capture cannot see them). Use **Fix black screen** in the player's top bar, or set the game to Borderless / Windowed.
- The PC keeps playing sound on its own speakers too.
- Hardware video encoding depends on the PC's graphics driver; if it falls back to software, use the 720p preset.
