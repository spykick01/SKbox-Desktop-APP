// Two small Windows watchers that run only while a game is running. Both are PowerShell loops, so they work even if the native helper
// is old or missing, and neither needs the game window to be in front.
//  - emuFit:  keeps an emulator window borderless and 1 pixel short of the monitor (Windows treats it as a normal window, so Remote play can see it)
//  - padWatch: opens the SK menu from the controller (Xbox / PS button, or hold Back + Start) even when the game has the keyboard focus
const { spawn } = require('child_process');

const EMU_FIT = `Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;using System.Runtime.InteropServices;
public class SKW{
[StructLayout(LayoutKind.Sequential)] public struct RECT{public int Left;public int Top;public int Right;public int Bottom;}
[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")]public static extern int GetWindowLong(IntPtr h,int i);[DllImport("user32.dll")]public static extern int SetWindowLong(IntPtr h,int i,int v);
[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int c,uint f);[DllImport("user32.dll")]public static extern bool SetMenu(IntPtr h,IntPtr m);
[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);
[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);}
"@
[SKW]::SetProcessDPIAware() | Out-Null
$n = [int]$env:SK_PID
while ($true) {
  $p = Get-Process -Id $n -ErrorAction SilentlyContinue
  if (-not $p) { break }
  try {
    $h = $p.MainWindowHandle
    if ($h -ne [IntPtr]::Zero -and [SKW]::IsWindowVisible($h) -and -not [SKW]::IsIconic($h)) {
      $b = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
      $r = New-Object SKW+RECT; [SKW]::GetWindowRect($h, [ref]$r) | Out-Null
      $st = [SKW]::GetWindowLong($h, -16)
      $ok = (($st -band 0xC40000) -eq 0) -and ([Math]::Abs($r.Left - $b.X) -le 2) -and ([Math]::Abs($r.Top - $b.Y) -le 2) -and ([Math]::Abs(($r.Right - $r.Left) - $b.Width) -le 2) -and ([Math]::Abs(($r.Bottom - $r.Top) - ($b.Height - 1)) -le 2)
      if (-not $ok) {
        $st = $st -band (-bnot 0xC40000)
        [SKW]::SetWindowLong($h, -16, $st) | Out-Null; [SKW]::SetMenu($h, [IntPtr]::Zero) | Out-Null; [SKW]::ShowWindow($h, 9) | Out-Null
        [SKW]::SetWindowPos($h, [IntPtr]::new(-1), $b.X, $b.Y, $b.Width, $b.Height - 1, 0x0060) | Out-Null
        [Console]::Out.WriteLine('FIT'); [Console]::Out.Flush()
      }
    }
  } catch {}
  Start-Sleep -Milliseconds 2000
}`;

const PAD_WATCH = `Add-Type @"
using System;using System.Runtime.InteropServices;
public class SKX{
[StructLayout(LayoutKind.Sequential)] public struct ST{public uint pk;public ushort b;public byte lt;public byte rt;public short lx;public short ly;public short rx;public short ry;}
[DllImport("xinput1_4.dll", EntryPoint="#100")] public static extern int Ex(int i, out ST s);
[DllImport("xinput1_4.dll", EntryPoint="XInputGetState")] public static extern int Get(int i, out ST s);}
"@
$guide = @($false,$false,$false,$false); $chord = @(0,0,0,0); $fired = @($false,$false,$false,$false)
while ($true) {
  for ($i = 0; $i -lt 4; $i++) {
    $s = New-Object SKX+ST; $r = 1
    try { $r = [SKX]::Ex($i, [ref]$s) } catch { $r = 1 }
    if ($r -ne 0) { try { $r = [SKX]::Get($i, [ref]$s) } catch { $r = 1 } }
    if ($r -ne 0) { $guide[$i] = $false; $chord[$i] = 0; $fired[$i] = $false; continue }
    $g = (($s.b -band 0x0400) -ne 0)
    if ($g -and -not $guide[$i]) { [Console]::Out.WriteLine('TOGGLE'); [Console]::Out.Flush() }
    $guide[$i] = $g
    if (($s.b -band 0x0030) -eq 0x0030) { $chord[$i]++ } else { $chord[$i] = 0; $fired[$i] = $false }
    if ($chord[$i] -ge 6 -and -not $fired[$i]) { $fired[$i] = $true; [Console]::Out.WriteLine('TOGGLE'); [Console]::Out.Flush() }
  }
  Start-Sleep -Milliseconds 100
}`;

function run(script, env, onLine) {
  let child = null;
  try {
    child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: Object.assign({}, process.env, env || {}) });
    let buf = ''; child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l && onLine) { try { onLine(l); } catch {} } } });
    child.on('error', () => {});
  } catch { child = null; }
  return { stop() { try { if (child) child.kill(); } catch {} child = null; }, alive: () => !!child };
}
const emuFit = (pid, onFit) => run(EMU_FIT, { SK_PID: String(pid | 0) }, l => { if (l === 'FIT' && onFit) onFit(); });
const padWatch = onToggle => run(PAD_WATCH, {}, l => { if (l === 'TOGGLE' && onToggle) onToggle(); });
module.exports = { emuFit, padWatch, EMU_FIT, PAD_WATCH };
