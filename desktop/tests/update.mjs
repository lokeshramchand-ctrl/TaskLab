// Auto-update end to end on the INSTALLED app: starts the installed (older) version, lets it find the newest GitHub
// release, download it, accept "Restart now", and checks that the installed program became the new version.
// Run it after a new release was published while an older version is installed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EXE, OUT, expect, launch, results, sleep, step, summary } from './harness.mjs';

const version = () => execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Item '${EXE}').VersionInfo.ProductVersion`]).toString().trim().replace(/\.0$/, '');
const before = version();
console.log('installed version before:', before);
const c = await launch('profile-update', { fresh: true });
const { app, ud } = c;

await step('installed app finds the newer release and downloads it', async () => {
  // From here a "restart now" answer is given to the update dialog (the app itself then calls quitAndInstall).
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (...a) => { globalThis.__dialogs.push(a.map((x) => x && x.message).filter(Boolean).join(' | ')); return { response: 0 }; };
  });
  const deadline = Date.now() + 150_000;
  let dialogs = [];
  while (Date.now() < deadline) {
    try {
      dialogs = await app.evaluate(() => globalThis.__dialogs);
    } catch {
      // The app closed itself: that is what "Restart now" does (quitAndInstall), so the prompt had been answered.
      return dialogs.find((d) => /is ready/.test(d)) || 'app quit to install the update';
    }
    if (dialogs.some((d) => /is ready/.test(d))) { await sleep(2000); continue; }
    await sleep(3000);
  }
  throw new Error('no "update ready" prompt and no restart; dialogs: ' + JSON.stringify(dialogs));
});

await step('after "Restart now" the installed program is the new version', async () => {
  const deadline = Date.now() + 180_000;
  let now = before;
  while (Date.now() < deadline) {
    now = version();
    if (now !== before) break;
    await sleep(3000);
  }
  expect(now !== before, `still ${now} after 3 minutes`);
  return `${before} -> ${now}`;
});

// The installer starts the new version again (with the normal data folder): stop it, this was only a test.
await sleep(6000);
execFileSync('powershell', ['-NoProfile', '-Command', "Get-Process LoMu -ErrorAction SilentlyContinue | Stop-Process -Force"]);
await sleep(2000);

const log = path.join(ud, 'logs', 'updater.log');
console.log(fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter((l) => /found|downloaded|Download/.test(l)).slice(-3).join('\n') : 'no updater log');
fs.writeFileSync(path.join(OUT, 'update-results.json'), JSON.stringify(results, null, 2));
process.exit(summary() ? 1 : 0);
