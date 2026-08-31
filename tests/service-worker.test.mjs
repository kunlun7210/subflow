import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const builtServiceWorker = await readFile(new URL("../pages-dist/sw.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("navigation uses one atomically precached shell version", () => {
  assert.match(serviceWorker, /const CACHE_NAME = "subflow-v9"/);
  assert.match(serviceWorker, /caches\.match\("\.\/"\)\.then\(cached => cached \|\| fetch\(request\)\)/);
  assert.doesNotMatch(serviceWorker, /cache\.put\("\.\/"/);
  assert.doesNotMatch(serviceWorker, /event\.respondWith\(fetch\(request\)/);
  assert.match(builtServiceWorker, /const CACHE_NAME = "subflow-[0-9a-f]{12}"/);
  assert.match(builtServiceWorker, /\.\/assets\//);
  assert.doesNotMatch(builtServiceWorker, /ip-country\/IPCountryIPv[46]\.bin/);
});

test("the document paints the app background before JavaScript starts", () => {
  assert.match(indexHtml, /html,body,#root\{min-height:100%;margin:0;background:#f6f5ee\}/);
});
