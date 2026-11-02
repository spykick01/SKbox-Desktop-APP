// Optional: sign the app for Widevine "Verified Media Path" with castLabs EVS. Some services (Netflix, Disney+, ...) may refuse playback without it.
// Add repo secrets EVS_ACCOUNT_NAME and EVS_PASSWD (free account at https://github.com/castlabs/electron-releases/wiki/EVS). Without them this step is skipped.
const { execSync } = require('child_process');
exports.default = async function (ctx) {
  if (!process.env.EVS_ACCOUNT_NAME || !process.env.EVS_PASSWD) { console.log('[vmp] EVS secrets not set, skipping VMP signing'); return; }
  const py = process.env.PYTHON || 'python';
  execSync(py + ' -m castlabs_evs.vmp sign-pkg "' + ctx.appOutDir + '"', { stdio: 'inherit' });
  console.log('[vmp] signed', ctx.appOutDir);
};
