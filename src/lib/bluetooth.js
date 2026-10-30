// Bluetooth inside SKBox: runs src/native/bluetooth.ps1 and returns plain objects.
const { spawn } = require('child_process');
const ID_OK = /^[\w\-#&{}\\:.\/ ]{1,300}$/;

const PAIR_TEXT = {
  Paired: 'Paired!', AlreadyPaired: 'Already paired.', PairingCanceled: 'Pairing was cancelled.', Failed: 'Pairing failed. Put the device in pairing mode and try again.',
  ConnectionRejected: 'The device refused to connect.', RejectedByHandler: 'Windows needs a PIN or confirmation for this device. Use Open Windows Bluetooth.',
  AuthenticationFailure: 'Wrong PIN or the device refused.', AuthenticationTimeout: 'Pairing timed out. Try again.', AuthenticationNotAllowed: 'This device cannot be paired from here. Use Open Windows Bluetooth.',
  RequiredHandlerNotRegistered: 'This device needs a PIN. Use Open Windows Bluetooth.', ProtectionLevelCouldNotBeMet: 'This device needs a PIN. Use Open Windows Bluetooth.',
  OperationAlreadyInProgress: 'Windows is already pairing something. Wait a moment.', NotReadyToPair: 'The device is not ready. Put it in pairing mode.', NotPaired: 'That device is not paired.'
};

function run(script, action, id, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    if (process.platform !== 'win32' && !opts.spawn) { resolve({ ok: false, error: 'Bluetooth needs Windows.' }); return; }
    if (id && !ID_OK.test(id)) { resolve({ ok: false, error: 'Bad device id.' }); return; }
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action];
    if (id) args.push('-Id', id);
    let out = '', err = '', done = false, child;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    const timer = setTimeout(() => { try { child && child.kill(); } catch (_) {} finish({ ok: false, error: 'Bluetooth took too long. Is Bluetooth turned on?' }); }, opts.timeout || 90000);
    try { child = (opts.spawn || spawn)('powershell.exe', args, { windowsHide: true }); } catch (e) { finish({ ok: false, error: 'Could not start Bluetooth tools.' }); return; }
    child.stdout.on('data', d => { out += d; });
    child.stderr && child.stderr.on('data', d => { err += d; });
    child.on('error', () => finish({ ok: false, error: 'Could not start Bluetooth tools.' }));
    child.on('close', () => finish(parse(out, err)));
  });
}
function parse(out, err) {
  const lines = String(out).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { try { const j = JSON.parse(lines[i]); if (j && typeof j === 'object') return decorate(j); } catch (_) {} }
  return { ok: false, error: /not recognized|cannot find/i.test(err) ? 'Bluetooth tools are missing on this PC.' : 'Bluetooth did not answer. Is Bluetooth turned on?' };
}
function decorate(j) {
  if (j.status != null) j.message = PAIR_TEXT[j.status] || ('Result: ' + j.status);
  if (j.ok === false && j.error && /took too long/i.test(j.error)) j.error = 'Bluetooth took too long. Is Bluetooth turned on?';
  return j;
}
module.exports = { run, parse, PAIR_TEXT };
