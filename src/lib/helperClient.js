// Talks to the native helper (helper.ps1 / helper.cs) over stdin/stdout lines.
const { spawn } = require('child_process');
const EventEmitter = require('events');

class HelperClient extends EventEmitter {
  constructor(opts) { super(); this.opts = opts || {}; this.child = null; this.buf = ''; this.ready = false; this.stopped = false; this.restarts = 0; }
  start() {
    if (this.child) return;
    const sp = this.opts.spawn || spawn;
    try {
      this.child = sp('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', this.opts.script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { this.emit('error-line', 'spawn failed: ' + e.message); return; }
    this.child.stdout.on('data', d => this._data(d));
    this.child.stderr && this.child.stderr.on('data', d => this.emit('error-line', String(d).slice(0, 400)));
    this.child.on('exit', () => {
      this.ready = false; this.child = null;
      if (!this.stopped && this.restarts < 3) { this.restarts++; setTimeout(() => this.start(), 1500); }
    });
    this.child.on('error', e => this.emit('error-line', e.message));
  }
  _data(chunk) {
    this.buf += chunk.toString('utf8'); let i;
    while ((i = this.buf.indexOf('\n')) >= 0) { const line = this.buf.slice(0, i).replace(/\r$/, ''); this.buf = this.buf.slice(i + 1); if (line) this._line(line); }
  }
  _line(l) {
    const parts = l.split(' '), cmd = parts[0], r = parts.slice(1);
    switch (cmd) {
      case 'READY': this.ready = true; this.restarts = 0; this.emit('ready'); break;
      case 'GUIDE': this.emit('guide', r[0] || ''); break;
      case 'PADS': this.emit('pads', parseInt(r[0], 10) || 0); break;
      case 'WIN': this.emit('win', { hwnd: r[0], pid: parseInt(r[1], 10) || 0, w: parseInt(r[2], 10) || 0, h: parseInt(r[3], 10) || 0 }); break;
      case 'FS': this.emit('fs', r.join(' ')); break;
      case 'GONE': this.emit('gone'); break;
      case 'NOWIN': this.emit('nowin'); break;
      case 'ERR': this.emit('error-line', r.join(' ')); break;
      case 'DIAG': this.emit('diag', r.join(' ')); break;
      case 'PONG': this.emit('pong'); break;
    }
  }
  send(line) { try { if (this.child && this.child.stdin && this.child.stdin.writable) this.child.stdin.write(line + '\n'); } catch {} }
  watch(pid, mode, skPid) { this.send('WATCH ' + (pid | 0) + ' ' + (/^(auto|stretch|aspect|altenter|f11|off)$/.test(mode) ? mode : 'auto') + ' ' + (skPid | 0)); }
  unwatch() { this.send('UNWATCH'); }
  closeWindow(hwnd) { if (/^-?\d+$/.test(String(hwnd))) this.send('CLOSE ' + hwnd); }
  focus(hwnd) { if (/^-?\d+$/.test(String(hwnd))) this.send('FOCUS ' + hwnd); }
  stop() { this.stopped = true; this.send('QUIT'); try { this.child && this.child.kill(); } catch {} }
}
module.exports = { HelperClient };
