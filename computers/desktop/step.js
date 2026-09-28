#!/usr/bin/env node
// Run Playwright code against the visible Chromium (the one the owner watches), then print what happened.
// Usage: step "await page.goto('https://example.com'); console.log(await page.title())"
// `page` is the active web tab, `context` and `browser` are also in scope. The browser stays open between steps.
const { chromium } = require("/usr/local/lib/node_modules/playwright-core");
const { execSync, spawn } = require("child_process");
const http = require("http");

const ready = () => new Promise((res) => http.get("http://127.0.0.1:9222/json/version", (r) => res(r.statusCode === 200)).on("error", () => res(false)));

(async () => {
  let fresh = false;
  if (!(await ready())) {
    fresh = true;
    spawn("browser", ["--remote-debugging-port=9222", "--remote-allow-origins=*", "about:blank"], { detached: true, stdio: "ignore", env: { ...process.env, DISPLAY: ":1" } }).unref();
    for (let i = 0; i < 60 && !(await ready()); i++) await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  // MetaMask opens its welcome tab when the browser first starts; close only that one. Later MetaMask tabs (setup,
  // connect and signature requests) are the work itself and must stay open.
  if (fresh) {
    await new Promise((r) => setTimeout(r, 1500));
    for (const p of context.pages()) if (p.url().startsWith("chrome-extension://") && p.url().includes("home.html")) await p.close().catch(() => {});
  }
  let page = context.pages().filter((p) => !p.url().startsWith("chrome-extension://")).pop() ?? (await context.newPage());
  await page.bringToFront().catch(() => {});
  const code = process.argv.slice(2).join(" ");
  try {
    await new Function("page", "context", "browser", `return (async () => { ${code} })()`)(page, context, browser);
    const pages = context.pages();
    page = pages.filter((p) => !p.url().startsWith("chrome-extension://")).pop() ?? page;
    console.log(`PAGE ${page.url()}`);
  } catch (e) {
    console.log(`ERROR ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
  await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  process.exit(process.exitCode ?? 0);
})();
