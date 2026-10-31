// SKBox helper (Windows). Runs next to SKBox and does the things a web app cannot:
//  * sees the Xbox / PlayStation button even while a game has focus  -> GUIDE events
//  * counts connected controllers                                    -> PADS events
//  * finds the game's window and makes it fullscreen, the right way  -> WIN / FS / GONE events
// Protocol: one command per line on stdin, one event per line on stdout.
// Written for C# 5 (Windows PowerShell's Add-Type).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class SkHelper
{
    // ---------------- native ----------------
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
    // 3 = a Direct3D game owns the screen in true exclusive fullscreen (this is what streams black); 2 = borderless / normal fullscreen.
    static bool IsExclusive() { try { int st; return SHQueryUserNotificationState(out st) == 0 && st == 3; } catch (Exception) { return false; } }
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool alt);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    struct PROCESSENTRY32 { public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID; public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile; }
    [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern bool Process32First(IntPtr h, ref PROCESSENTRY32 e);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern bool Process32Next(IntPtr h, ref PROCESSENTRY32 e);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    // controllers
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_GAMEPAD { public ushort wButtons; public byte bLeftTrigger; public byte bRightTrigger; public short sThumbLX; public short sThumbLY; public short sThumbRX; public short sThumbRY; }
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_STATE { public uint dwPacketNumber; public XINPUT_GAMEPAD Gamepad; }
    [DllImport("xinput1_4.dll", EntryPoint = "#100")] static extern uint XInputGetStateEx14(uint i, ref XINPUT_STATE s);
    [DllImport("xinput1_3.dll", EntryPoint = "#100")] static extern uint XInputGetStateEx13(uint i, ref XINPUT_STATE s);
    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")] static extern uint XInputGetState14(uint i, ref XINPUT_STATE s);
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_BATTERY { public byte BatteryType; public byte BatteryLevel; }
    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetBatteryInformation")] static extern uint XInputGetBattery14(uint i, byte devType, ref XINPUT_BATTERY b);
    [StructLayout(LayoutKind.Sequential)] struct JOYINFOEX { public uint dwSize, dwFlags, dwXpos, dwYpos, dwZpos, dwRpos, dwUpos, dwVpos, dwButtons, dwButtonNumber, dwPOV, dwReserved1, dwReserved2; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct JOYCAPS { public ushort wMid; public ushort wPid; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname; public uint wXmin, wXmax, wYmin, wYmax, wZmin, wZmax, wNumButtons, wPeriodMin, wPeriodMax, wRmin, wRmax, wUmin, wUmax, wVmin, wVmax, wCaps, wMaxAxes, wNumAxes, wMaxButtons; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szRegKey; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szOEMVxD; }
    [DllImport("winmm.dll")] static extern uint joyGetNumDevs();
    [DllImport("winmm.dll")] static extern uint joyGetPosEx(uint id, ref JOYINFOEX info);
    [DllImport("winmm.dll", CharSet = CharSet.Unicode)] static extern uint joyGetDevCapsW(UIntPtr id, out JOYCAPS caps, uint size);

    // ---------------- pure helpers (unit tested) ----------------
    // Where should a game window go on a monitor?  mode: stretch | aspect | auto (aspect when shapes differ by more than 8%)
    public static void Fit(int mx, int my, int mw, int mh, int cw, int ch, string mode, out int x, out int y, out int w, out int h)
    {
        double ma = (double)mw / mh, ca = (ch > 0 && cw > 0) ? (double)cw / ch : ma;
        bool aspect = mode == "aspect" || (mode == "auto" && Math.Abs(ca - ma) / ma > 0.08);
        if (!aspect || cw <= 0 || ch <= 0) { x = mx; y = my; w = mw; h = mh; return; }
        double s = Math.Min((double)mw / cw, (double)mh / ch);
        w = (int)Math.Round(cw * s); h = (int)Math.Round(ch * s); x = mx + (mw - w) / 2; y = my + (mh - h) / 2;
    }
    public static bool LooksLikeLauncher(string title, int w, int h)
    {
        if (w < 640 || h < 480) return true;
        string t = (title ?? "").ToLowerInvariant();
        return t.Contains("launcher") || t.Contains("setup") || t.Contains("configur") || t.Contains("installer") || t.Contains("updater");
    }
    public static bool IsPadButtonChord(uint a, uint b, uint mask) { return (a & mask) == mask || (b & mask) == mask; }

    // ---------------- output / input plumbing ----------------
    static readonly object outLock = new object();
    static void Emit(string s) { lock (outLock) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
    static readonly Queue<string> cmds = new Queue<string>();
    static volatile bool quit = false;
    static void ReaderLoop()
    {
        try
        {
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                line = line.Trim();
                // remote-play input is injected right here (not in the 25 ms main loop) to keep latency low
                if (line.Length > 1 && line[0] == 'I' && TryInput(line)) continue;
                lock (cmds) { cmds.Enqueue(line); }
            }
        }
        catch (Exception) { }
        quit = true;
    }

    // ---------------- injected input (Remote play) ----------------
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    static readonly object inLock = new object();
    static readonly HashSet<int> heldKeys = new HashSet<int>();
    static readonly bool[] heldBtn = new bool[5];
    static void SendMouse(int dx, int dy, uint data, uint flags)
    {
        INPUT[] a = new INPUT[1]; a[0].type = 0; a[0].u.mi.dx = dx; a[0].u.mi.dy = dy; a[0].u.mi.mouseData = data; a[0].u.mi.dwFlags = flags;
        SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
    }
    static void SendKey(int sc, int ext, bool down)
    {
        INPUT[] a = new INPUT[1]; a[0].type = 1; a[0].u.ki.wScan = (ushort)sc; a[0].u.ki.dwFlags = 0x0008 | (ext != 0 ? 0x0001u : 0u) | (down ? 0u : 0x0002u);
        SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
        int id = sc | (ext != 0 ? 0x100 : 0); if (down) heldKeys.Add(id); else heldKeys.Remove(id);
    }
    static bool TryInput(string line)
    {
        string[] p = line.Split(' '); int a, b, c;
        try
        {
            lock (inLock)
            {
                switch (p[0])
                {
                    case "IM": // relative mouse move
                        if (p.Length > 2 && int.TryParse(p[1], out a) && int.TryParse(p[2], out b)) { SendMouse(Math.Max(-3000, Math.Min(3000, a)), Math.Max(-3000, Math.Min(3000, b)), 0, 0x0001); return true; }
                        return false;
                    case "IA": // absolute mouse move, 0..65535 over the primary screen
                        if (p.Length > 2 && int.TryParse(p[1], out a) && int.TryParse(p[2], out b)) { SendMouse(Math.Max(0, Math.Min(65535, a)), Math.Max(0, Math.Min(65535, b)), 0, 0x8001); return true; }
                        return false;
                    case "IB": // button: 0 left 1 middle 2 right 3 back 4 forward, then 1 = down 0 = up
                        if (p.Length > 2 && int.TryParse(p[1], out a) && int.TryParse(p[2], out b) && a >= 0 && a <= 4)
                        {
                            bool dn = b != 0; heldBtn[a] = dn; uint f = 0, d = 0;
                            if (a == 0) f = dn ? 0x0002u : 0x0004u; else if (a == 2) f = dn ? 0x0008u : 0x0010u; else if (a == 1) f = dn ? 0x0020u : 0x0040u;
                            else { f = dn ? 0x0080u : 0x0100u; d = a == 3 ? 1u : 2u; }
                            SendMouse(0, 0, d, f); return true;
                        }
                        return false;
                    case "IW": // vertical wheel (positive = away from you / scroll up)
                        if (p.Length > 1 && int.TryParse(p[1], out a)) { SendMouse(0, 0, unchecked((uint)Math.Max(-2400, Math.Min(2400, a))), 0x0800); return true; }
                        return false;
                    case "IH": // horizontal wheel
                        if (p.Length > 1 && int.TryParse(p[1], out a)) { SendMouse(0, 0, unchecked((uint)Math.Max(-2400, Math.Min(2400, a))), 0x1000); return true; }
                        return false;
                    case "IK": // key by scancode: sc ext down
                        if (p.Length > 3 && int.TryParse(p[1], out a) && int.TryParse(p[2], out b) && int.TryParse(p[3], out c) && a > 0 && a < 0x80) { SendKey(a, b, c != 0); return true; }
                        return false;
                    case "IR": // release everything that is held
                        foreach (int id in new List<int>(heldKeys)) SendKey(id & 0xFF, (id & 0x100) != 0 ? 1 : 0, false);
                        for (int i = 0; i < 5; i++) if (heldBtn[i]) { heldBtn[i] = false; uint f2 = i == 0 ? 0x0004u : i == 2 ? 0x0010u : i == 1 ? 0x0040u : 0x0100u; SendMouse(0, 0, i == 3 ? 1u : i == 4 ? 2u : 0u, f2); }
                        return true;
                }
            }
        }
        catch (Exception) { }
        return false;
    }

    // ---------------- window watching ----------------
    class Watch
    {
        public int Pid; public string Mode; public int SkPid; public DateTime Start; public IntPtr Hwnd; public uint WinPid; public DateTime HwndSince;
        public bool Applied; public int Reapply; public DateTime AppliedAt; public bool FallbackUsed; public bool Found; public DateTime LastAlive; public RECT Target; public bool KeyDone; public bool ExclTried;
    }
    static Watch watch;

    static Dictionary<uint, List<uint>> ProcessChildren()
    {
        var map = new Dictionary<uint, List<uint>>();
        IntPtr snap = CreateToolhelp32Snapshot(2, 0);
        if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return map;
        try
        {
            PROCESSENTRY32 e = new PROCESSENTRY32(); e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
            if (Process32First(snap, ref e))
            {
                do { List<uint> l; if (!map.TryGetValue(e.th32ParentProcessID, out l)) { l = new List<uint>(); map[e.th32ParentProcessID] = l; } l.Add(e.th32ProcessID); }
                while (Process32Next(snap, ref e));
            }
        }
        finally { CloseHandle(snap); }
        return map;
    }
    static bool ProcessAlive(int pid) { try { Process p = Process.GetProcessById(pid); return !p.HasExited; } catch (Exception) { return false; } }
    static HashSet<uint> Tree(int root)
    {
        var set = new HashSet<uint>(); var kids = ProcessChildren(); var stack = new Stack<uint>();
        if (root > 0 && ProcessAlive(root)) { set.Add((uint)root); stack.Push((uint)root); }
        while (stack.Count > 0) { uint p = stack.Pop(); List<uint> l; if (kids.TryGetValue(p, out l)) foreach (uint c in l) if (set.Add(c)) stack.Push(c); }
        return set;
    }
    static string TextOf(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
    static string ClassOf(IntPtr h) { var sb = new StringBuilder(128); GetClassName(h, sb, 128); return sb.ToString(); }
    static long Area(IntPtr h) { RECT r; if (!GetWindowRect(h, out r)) return 0; return (long)Math.Max(0, r.Right - r.Left) * Math.Max(0, r.Bottom - r.Top); }

    static IntPtr FindWindow(HashSet<uint> pids, int skPid, bool allowForeground)
    {
        IntPtr best = IntPtr.Zero; long bestArea = 0;
        EnumProc cb = delegate (IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h) || IsIconic(h)) return true;
            if (GetWindow(h, 4) != IntPtr.Zero) return true;                  // owned window (dialog)
            if ((GetWindowLong(h, -20) & 0x80) != 0) return true;              // tool window
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (pid == (uint)skPid || !pids.Contains(pid)) return true;
            long a = Area(h); if (a < 160 * 120) return true;
            if (a > bestArea) { bestArea = a; best = h; }
            return true;
        };
        EnumWindows(cb, IntPtr.Zero); GC.KeepAlive(cb);
        if (best == IntPtr.Zero && allowForeground)
        {   // launcher hand-off: the game may belong to a process we do not know yet
            IntPtr fg = GetForegroundWindow(); uint pid;
            if (fg != IntPtr.Zero) { GetWindowThreadProcessId(fg, out pid); string cls = ClassOf(fg);
                if (pid != (uint)skPid && pid != 0 && cls != "Shell_TrayWnd" && cls != "Progman" && cls != "WorkerW" && cls != "ApplicationFrameWindow" && IsWindowVisible(fg) && Area(fg) >= 160 * 120) best = fg; }
        }
        return best;
    }

    static void ForceForeground(IntPtr h)
    {
        if (IsIconic(h)) ShowWindow(h, 9);
        keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);   // tap ALT so Windows allows the focus change
        IntPtr fg = GetForegroundWindow(); uint fpid; uint ft = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out fpid), me = GetCurrentThreadId();
        bool att = false; if (ft != 0 && ft != me) att = AttachThreadInput(me, ft, true);
        BringWindowToTop(h); SetForegroundWindow(h);
        if (att) AttachThreadInput(me, ft, false);
        if (GetForegroundWindow() != h) SwitchToThisWindow(h, true);
    }
    // What is in front right now (sent with every Xbox / PS button press so the menu knows which game to step in front of).
    static string FgInfo()
    {
        try
        {
            IntPtr fg = GetForegroundWindow(); if (fg == IntPtr.Zero) return " 0 0 0";
            uint pid; GetWindowThreadProcessId(fg, out pid); string cls = ClassOf(fg); RECT m;
            bool fs = !(cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") && Covers(fg, out m);
            return " " + fg.ToInt64().ToString(CultureInfo.InvariantCulture) + " " + pid + " " + (fs ? 1 : 0);
        }
        catch (Exception) { return " 0 0 0"; }
    }
    // Minimizing the game makes an exclusive-fullscreen game give the screen back, so the menu can be seen.
    static void MinimizeWin(IntPtr h) { if (!IsWindow(h)) return; ShowWindow(h, 11); if (!IsIconic(h)) PostMessage(h, 0x0112, new IntPtr(0xF020), IntPtr.Zero); }
    static void RestoreWin(IntPtr h) { if (!IsWindow(h)) return; ShowWindow(h, 9); ForceForeground(h); Thread.Sleep(150); if (GetForegroundWindow() != h) ForceForeground(h); }
    // Black screen while streaming? Leave exclusive fullscreen (Alt+Enter), then make the window borderless.
    static void FixFs(IntPtr h)
    {
        if (h == IntPtr.Zero) h = GetForegroundWindow();   // 0 = whatever is in front
        if (!IsWindow(h)) { Emit("FS fix fail"); return; }
        ForceForeground(h); Thread.Sleep(350);
        RECT mon; bool covers = Covers(h, out mon); int style = GetWindowLong(h, -16); bool caption = (style & 0x00C00000) == 0x00C00000;
        if (covers && !caption) { Tap(0x0D, true); Emit("FS fix altenter"); Thread.Sleep(1500); }
        RECT t; if (Borderless(h, "auto", out t)) Emit("FS fix borderless"); else Emit("FS fix fail");
    }
    static void Tap(byte vk, bool alt)
    {
        if (alt) keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 0, UIntPtr.Zero); Thread.Sleep(40); keybd_event(vk, 0, 2, UIntPtr.Zero);
        if (alt) keybd_event(0x12, 0, 2, UIntPtr.Zero);
    }
    static bool Covers(IntPtr h, out RECT mon)
    {
        mon = new RECT(); RECT r; if (!GetWindowRect(h, out r)) return false;
        MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        IntPtr m = MonitorFromWindow(h, 2); if (m == IntPtr.Zero || !GetMonitorInfo(m, ref mi)) return false;
        mon = mi.rcMonitor;
        return Math.Abs(r.Left - mon.Left) <= 2 && Math.Abs(r.Top - mon.Top) <= 2 && Math.Abs(r.Right - mon.Right) <= 2 && Math.Abs(r.Bottom - mon.Bottom) <= 2;
    }
    static bool Borderless(IntPtr h, string mode, out RECT target)
    {
        target = new RECT(); RECT mon; Covers(h, out mon); if (mon.Right == 0 && mon.Bottom == 0) return false;
        RECT cr; GetClientRect(h, out cr); int cw = cr.Right - cr.Left, ch = cr.Bottom - cr.Top;
        if (IsZoomed(h)) { RECT wr; GetWindowRect(h, out wr); ShowWindow(h, 9); cw = cw > 0 ? cw : wr.Right - wr.Left; }
        int style = GetWindowLong(h, -16), ex = GetWindowLong(h, -20);
        style &= ~(0x00C00000 | 0x00040000 | 0x00020000 | 0x00010000 | 0x00080000);   // caption, sizing frame, minimize, maximize, system menu
        ex &= ~(0x00000001 | 0x00000200 | 0x00020000 | 0x00000100);                   // dialog frame, client edge, static edge, window edge
        SetWindowLong(h, -16, style); SetWindowLong(h, -20, ex);
        int x, y, w, hh; Fit(mon.Left, mon.Top, mon.Right - mon.Left, mon.Bottom - mon.Top, cw, ch, mode, out x, out y, out w, out hh);
        SetWindowPos(h, IntPtr.Zero, x, y, w, hh, 0x0020 | 0x0040 | 0x0200);   // frame changed, show window, do not reorder owned windows
        target.Left = x; target.Top = y; target.Right = x + w; target.Bottom = y + hh;
        ForceForeground(h);
        return true;
    }

    static void StartWatch(string[] p)
    {
        int pid, sk; int.TryParse(p.Length > 1 ? p[1] : "0", out pid); int.TryParse(p.Length > 3 ? p[3] : "0", out sk);
        watch = new Watch(); watch.Pid = pid; watch.Mode = p.Length > 2 ? p[2] : "auto"; watch.SkPid = sk; watch.Start = DateTime.UtcNow; watch.LastAlive = DateTime.UtcNow;
    }
    static void TickWatch()
    {
        Watch w = watch; if (w == null) return;
        double age = (DateTime.UtcNow - w.Start).TotalSeconds;
        HashSet<uint> pids = Tree(w.Pid);
        if (pids.Count > 0) w.LastAlive = DateTime.UtcNow;
        bool valid = w.Hwnd != IntPtr.Zero && IsWindow(w.Hwnd);
        // pick / switch to the biggest window of the game
        IntPtr cand = FindWindow(pids, w.SkPid, age > 3.0 && (w.Pid <= 0 || pids.Count == 0 || age > 12.0));
        if (cand != IntPtr.Zero && (!valid || (cand != w.Hwnd && Area(cand) > Area(w.Hwnd) * 1.1)))
        {
            w.Hwnd = cand; w.HwndSince = DateTime.UtcNow; w.Applied = false; w.Reapply = 0; w.KeyDone = false; w.ExclTried = false; valid = true;
            uint wp; GetWindowThreadProcessId(cand, out wp); w.WinPid = wp; w.Found = true;
            RECT r; GetWindowRect(cand, out r);
            Emit("WIN " + cand.ToInt64().ToString(CultureInfo.InvariantCulture) + " " + wp + " " + (r.Right - r.Left) + " " + (r.Bottom - r.Top));
        }
        if (valid && w.Mode != "off")
        {
            double stable = (DateTime.UtcNow - w.HwndSince).TotalSeconds;
            RECT mon; bool covers = Covers(w.Hwnd, out mon);
            int style = GetWindowLong(w.Hwnd, -16); bool caption = (style & 0x00C00000) == 0x00C00000;
            if (!w.Applied)
            {
                bool autoish = w.Mode == "auto" || w.Mode == "stretch" || w.Mode == "aspect";
                bool excl = autoish && covers && !caption && IsExclusive();
                if (covers && !caption && !excl) { w.Applied = true; w.AppliedAt = DateTime.UtcNow; Emit("FS already"); }
                else if (excl)
                {   // true exclusive fullscreen: leave it (Alt+Enter), then make the window borderless so it looks right AND can be streamed
                    if (!w.ExclTried) { if (stable >= 2.0) { w.ExclTried = true; w.AppliedAt = DateTime.UtcNow; ForceForeground(w.Hwnd); Thread.Sleep(300); Tap(0x0D, true); Emit("FS exclusive leaving"); } }
                    else if ((DateTime.UtcNow - w.AppliedAt).TotalSeconds > 2.5)
                    {
                        RECT t; if (Borderless(w.Hwnd, w.Mode, out t)) { w.Applied = true; w.AppliedAt = DateTime.UtcNow; w.Target = t; Emit("FS borderless exclusive"); } else Emit("FS fail");
                    }
                }
                else if (stable >= 3.0)
                {
                    RECT r; GetClientRect(w.Hwnd, out r); string title = TextOf(w.Hwnd);
                    if (LooksLikeLauncher(title, r.Right - r.Left, r.Bottom - r.Top) && Area(w.Hwnd) < 1200L * 700L) { /* launcher or splash: wait for the real window */ }
                    else if (w.Mode == "altenter" || w.Mode == "f11")
                    {
                        if (!w.KeyDone) { ForceForeground(w.Hwnd); Thread.Sleep(300); if (w.Mode == "altenter") Tap(0x0D, true); else Tap(0x7A, false); w.KeyDone = true; w.AppliedAt = DateTime.UtcNow; Emit("FS " + w.Mode + " sent"); }
                        else if ((DateTime.UtcNow - w.AppliedAt).TotalSeconds > 6.0)
                        {   // the key did not work: fall back to making the window borderless
                            if (!w.FallbackUsed) { w.FallbackUsed = true; w.Mode = "auto"; w.KeyDone = false; Emit("FS fallback"); }
                        }
                    }
                    else
                    {
                        RECT t; if (Borderless(w.Hwnd, w.Mode, out t)) { w.Applied = true; w.AppliedAt = DateTime.UtcNow; w.Target = t; Emit("FS borderless " + w.Mode); } else Emit("FS fail");
                    }
                }
            }
            else if (w.Applied && w.Reapply < 8 && (DateTime.UtcNow - w.AppliedAt).TotalSeconds < 90 && (w.Mode == "auto" || w.Mode == "stretch" || w.Mode == "aspect"))
            {   // some games put their borders back: keep it borderless for the first minute and a half
                RECT r; if (GetWindowRect(w.Hwnd, out r) && !IsIconic(w.Hwnd) && (caption || Math.Abs(r.Left - w.Target.Left) > 3 || Math.Abs(r.Right - w.Target.Right) > 3 || Math.Abs(r.Top - w.Target.Top) > 3 || Math.Abs(r.Bottom - w.Target.Bottom) > 3))
                { w.Reapply++; RECT t; if (Borderless(w.Hwnd, w.Mode, out t)) w.Target = t; }
            }
        }
        // finished?
        if (!valid && w.Found && (DateTime.UtcNow - w.LastAlive).TotalSeconds > 6.0) { Emit("GONE"); watch = null; return; }
        if (!valid && w.Found && pids.Count == 0 && age > 20) { Emit("GONE"); watch = null; return; }
        if (!w.Found && pids.Count == 0 && age > 25) { Emit("NOWIN"); watch = null; return; }
        if (!w.Found && age > 120) { Emit("NOWIN"); watch = null; return; }
    }

    // ---------------- controllers ----------------
    class PadMem { public DateTime Chord; public bool Fired; public bool GuideDown; }
    static readonly Dictionary<string, PadMem> pads = new Dictionary<string, PadMem>();
    static readonly Dictionary<uint, ushort> joyMid = new Dictionary<uint, ushort>();
    static int lastCount = -1; static DateTime countSince = DateTime.UtcNow; static int pendingCount = -1;
    static PadMem Mem(string k) { PadMem m; if (!pads.TryGetValue(k, out m)) { m = new PadMem(); pads[k] = m; } return m; }
    static void Press(string key, bool guide, bool chord)
    {
        PadMem m = Mem(key);
        if (guide && !m.GuideDown) Emit("GUIDE " + key + FgInfo());
        if (guide != m.GuideDown) Emit("DIAG guide " + key + " " + (guide ? "down" : "up"));
        m.GuideDown = guide;
        if (chord) { if (m.Chord == DateTime.MinValue) m.Chord = DateTime.UtcNow; else if (!m.Fired && (DateTime.UtcNow - m.Chord).TotalMilliseconds > 1200) { m.Fired = true; Emit("GUIDE " + key + "chord" + FgInfo()); } }
        else { m.Chord = DateTime.MinValue; m.Fired = false; }
    }
    static int xmode = 0;   // 0 = Ex via 1_4, 1 = Ex via 1_3, 2 = plain
    static uint XGet(uint i, ref XINPUT_STATE s)
    {
        for (int tries = 0; tries < 3; tries++)
        {
            try { if (xmode == 0) return XInputGetStateEx14(i, ref s); if (xmode == 1) return XInputGetStateEx13(i, ref s); return XInputGetState14(i, ref s); }
            catch (DllNotFoundException) { xmode++; }
            catch (EntryPointNotFoundException) { xmode++; }
        }
        return 1167;
    }
    // ---- controller input stream: the SK menu cannot rely on the browser seeing the controller (it needs window focus) ----
    static volatile bool padIn = false;
    static readonly string[] ActNames = new string[] { "up", "down", "left", "right", "ok", "back", "alt", "opts", "prev", "next", "start", "select" };
    class PadStream { public bool[] Prev = new bool[12]; public DateTime[] Next = new DateTime[12]; }
    static readonly Dictionary<string, PadStream> streams = new Dictionary<string, PadStream>();
    static void Feed(string key, int slot, bool[] cur)
    {
        PadStream ps; if (!streams.TryGetValue(key, out ps)) { ps = new PadStream(); streams[key] = ps; }
        DateTime now = DateTime.UtcNow;
        for (int i = 0; i < 12; i++)
        {
            if (padIn && cur[i])
            {
                if (!ps.Prev[i]) { Emit("PAD " + slot + " " + ActNames[i]); ps.Next[i] = now.AddMilliseconds(380); }
                else if (i < 4 && now > ps.Next[i]) { Emit("PAD " + slot + " " + ActNames[i]); ps.Next[i] = now.AddMilliseconds(110); }
            }
            ps.Prev[i] = cur[i];
        }
    }
    static readonly Dictionary<uint, int> lastBat = new Dictionary<uint, int>(); static DateTime nextBat = DateTime.MinValue;
    static void PollBattery(uint i, int slot)
    {
        if (DateTime.UtcNow < nextBat) return;
        try
        {
            XINPUT_BATTERY bi = new XINPUT_BATTERY();
            if (XInputGetBattery14(i, 0, ref bi) != 0) return;
            int v = bi.BatteryType * 16 + bi.BatteryLevel; int old;
            if (!lastBat.TryGetValue(i, out old) || old != v) { lastBat[i] = v; Emit("BAT " + slot + " " + bi.BatteryType + " " + bi.BatteryLevel); }
        }
        catch (Exception) { }
    }
    static bool Hat(uint pov, int dir)   // dir 0 up, 1 right, 2 down, 3 left; pov is hundredths of a degree, 65535 = centred
    {
        if (pov > 35999) return false;
        if (dir == 0) return pov == 0 || pov == 4500 || pov == 31500;
        if (dir == 1) return pov == 4500 || pov == 9000 || pov == 13500;
        if (dir == 2) return pov == 13500 || pov == 18000 || pov == 22500;
        return pov == 22500 || pov == 27000 || pov == 31500;
    }
    static void PollPads()
    {
        int count = 0, slot = 0;
        bool doBat = DateTime.UtcNow >= nextBat;
        for (uint i = 0; i < 4; i++)
        {
            XINPUT_STATE st = new XINPUT_STATE(); uint rc = XGet(i, ref st);
            if (rc == 0)
            {
                count++; ushort b = st.Gamepad.wButtons; Press("x" + i, (b & 0x0400) != 0, (b & 0x0030) == 0x0030 || (b & 0x0320) == 0x0320);
                XINPUT_GAMEPAD g = st.Gamepad; bool[] c = new bool[12]; int sl = Math.Min(slot, 1);
                c[0] = (b & 1) != 0 || g.sThumbLY > 16000; c[1] = (b & 2) != 0 || g.sThumbLY < -16000; c[2] = (b & 4) != 0 || g.sThumbLX < -16000; c[3] = (b & 8) != 0 || g.sThumbLX > 16000;
                c[4] = (b & 0x1000) != 0; c[5] = (b & 0x2000) != 0; c[6] = (b & 0x4000) != 0; c[7] = (b & 0x8000) != 0; c[8] = (b & 0x0100) != 0; c[9] = (b & 0x0200) != 0; c[10] = (b & 0x0010) != 0; c[11] = (b & 0x0020) != 0;
                Feed("x" + i, sl, c); if (doBat) PollBattery(i, sl); slot++;
            }
            else { Press("x" + i, false, false); }
        }
        uint n = 0; try { n = Math.Min(16u, joyGetNumDevs()); } catch (Exception) { }
        for (uint id = 0; id < n; id++)
        {
            JOYINFOEX ji = new JOYINFOEX(); ji.dwSize = (uint)Marshal.SizeOf(typeof(JOYINFOEX)); ji.dwFlags = 0xFF;
            uint rc; try { rc = joyGetPosEx(id, ref ji); } catch (Exception) { break; }
            if (rc != 0) { joyMid.Remove(id); continue; }
            ushort mid; if (!joyMid.TryGetValue(id, out mid)) { JOYCAPS caps; mid = 0; try { if (joyGetDevCapsW(new UIntPtr(id), out caps, (uint)Marshal.SizeOf(typeof(JOYCAPS))) == 0) mid = caps.wMid; } catch (Exception) { } joyMid[id] = mid; }
            if (mid == 0x045E) continue;                               // Xbox pads are already read through XInput
            count++;
            if (mid == 0x054C) Press("j" + id, (ji.dwButtons & 0x1000) != 0, (ji.dwButtons & 0x0300) == 0x0300);   // PS button; Share + Options chord
            {
                uint jb = ji.dwButtons; bool[] c = new bool[12]; int sl = Math.Min(slot, 1);
                c[0] = Hat(ji.dwPOV, 0) || ji.dwYpos < 16000; c[1] = Hat(ji.dwPOV, 2) || ji.dwYpos > 49000; c[2] = Hat(ji.dwPOV, 3) || ji.dwXpos < 16000; c[3] = Hat(ji.dwPOV, 1) || ji.dwXpos > 49000;
                c[4] = (jb & 0x2) != 0; c[5] = (jb & 0x4) != 0; c[6] = (jb & 0x1) != 0; c[7] = (jb & 0x8) != 0; c[8] = (jb & 0x10) != 0; c[9] = (jb & 0x20) != 0; c[10] = (jb & 0x200) != 0; c[11] = (jb & 0x100) != 0;
                Feed("j" + id, sl, c); slot++;
            }
        }
        if (doBat) nextBat = DateTime.UtcNow.AddSeconds(20);
        if (count != pendingCount) { pendingCount = count; countSince = DateTime.UtcNow; }
        if (pendingCount != lastCount && (DateTime.UtcNow - countSince).TotalMilliseconds > 900) { lastCount = pendingCount; Emit("PADS " + lastCount); Emit("DIAG xinputmode " + xmode + " pads " + lastCount); }
    }

    // ---------------- main loop ----------------
    public static void Run()
    {
        try { SetProcessDPIAware(); } catch (Exception) { }
        var so = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)); so.AutoFlush = true; Console.SetOut(so);
        Thread rd = new Thread(ReaderLoop); rd.IsBackground = true; rd.Start();
        Emit("READY");
        int n = 0;
        while (!quit)
        {
            string c = null; lock (cmds) { if (cmds.Count > 0) c = cmds.Dequeue(); }
            while (c != null)
            {
                string[] p = c.Split(' ');
                try
                {
                    if (p[0] == "WATCH") StartWatch(p);
                    else if (p[0] == "UNWATCH") watch = null;
                    else if (p[0] == "FOCUS" && p.Length > 1) { long hv; if (long.TryParse(p[1], out hv) && IsWindow(new IntPtr(hv))) ForceForeground(new IntPtr(hv)); }
                    else if (p[0] == "CLOSE" && p.Length > 1) { long hv2; if (long.TryParse(p[1], out hv2) && IsWindow(new IntPtr(hv2))) PostMessage(new IntPtr(hv2), 0x0010, IntPtr.Zero, IntPtr.Zero); }
                    else if (p[0] == "PING") Emit("PONG");
                    else if (p[0] == "MIN" && p.Length > 1) { long hv3; if (long.TryParse(p[1], out hv3)) MinimizeWin(new IntPtr(hv3)); }
                    else if (p[0] == "RESTORE" && p.Length > 1) { long hv4; if (long.TryParse(p[1], out hv4)) { IntPtr hh4 = new IntPtr(hv4); Thread t4 = new Thread(delegate() { RestoreWin(hh4); }); t4.IsBackground = true; t4.Start(); } }
                    else if (p[0] == "FIXFS" && p.Length > 1) { long hv5; if (long.TryParse(p[1], out hv5)) { IntPtr hh5 = new IntPtr(hv5); Thread t5 = new Thread(delegate() { FixFs(hh5); }); t5.IsBackground = true; t5.Start(); } }
                    else if (p[0] == "PADIN") padIn = p.Length > 1 && p[1] == "1";
                    else if (p[0] == "QUIT") quit = true;
                }
                catch (Exception e) { Emit("ERR " + e.Message.Replace('\n', ' ')); }
                c = null; lock (cmds) { if (cmds.Count > 0) c = cmds.Dequeue(); }
            }
            try { PollPads(); } catch (Exception e) { Emit("ERR pads " + e.Message.Replace('\n', ' ')); }
            if (++n % 20 == 0) { try { TickWatch(); } catch (Exception e) { Emit("ERR watch " + e.Message.Replace('\n', ' ')); } }
            Thread.Sleep(25);
        }
    }
}
