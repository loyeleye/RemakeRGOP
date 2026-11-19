// Browser smoke test: two players (desktop + phone) in one room, each pulls a wisp.
// Needs `npm start` running. Usage: node tools/smoke.cjs [baseUrl] [outDir]
const { chromium, devices } = require("playwright");
const base = process.argv[2] ?? "http://localhost:8787";
const out = process.argv[3] ?? ".";

async function pullNearestOwn(page) {
  const pos = await page.evaluate(() => {
    const lf = window.lanternfall;
    const s = lf.snap();
    const me = s.players.find((p) => p.id === lf.me());
    const own = s.wisps.filter((w) => w.guild === me.guild).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    return lf.toScreen(own.x + 0.5, own.y + 0.5);
  });
  await page.mouse.click(pos.x, pos.y);
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const host = await b.newPage({ viewport: { width: 1280, height: 860 } });
  host.on("pageerror", (e) => errors.push("desktop: " + e.message));
  await host.goto(base);
  await host.fill("#name", "Ladi");
  await host.click("#create");
  await host.waitForSelector("#lobby:not([hidden])");
  const code = (await host.textContent("#room-code")).trim();
  const phone = await (await b.newContext({ ...devices["iPhone 13"] })).newPage();
  phone.on("pageerror", (e) => errors.push("phone: " + e.message));
  await phone.goto(`${base}/?room=${code}`);
  await phone.fill("#name", "Pip");
  await phone.click("#join-form button");
  await phone.waitForSelector("#lobby:not([hidden])");
  await host.click("#bot-1");
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${out}/lobby-desktop.png` });
  await phone.screenshot({ path: `${out}/lobby-phone.png` });
  await host.click("#start");
  await host.waitForFunction(() => window.lanternfall.room()?.phase === "playing", null, { timeout: 10000 });
  for (let i = 0; i < 20; i++) {
    await pullNearestOwn(host);
    const tp = await phone.evaluate(() => {
      const lf = window.lanternfall;
      const s = lf.snap();
      const me = s.players.find((p) => p.id === lf.me());
      const own = s.wisps.filter((w) => w.guild === me.guild)[0];
      return lf.toScreen(own.x + 0.5, own.y + 0.5);
    });
    await phone.touchscreen.tap(tp.x, tp.y);
    await host.waitForTimeout(1200);
  }
  await host.screenshot({ path: `${out}/play-desktop.png` });
  await phone.screenshot({ path: `${out}/play-phone.png` });
  const scores = await host.evaluate(() => window.lanternfall.snap().scores);
  console.log(JSON.stringify({ code, scores, errors }));
  await b.close();
})();
