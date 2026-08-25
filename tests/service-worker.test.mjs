import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("navigation uses cached shell immediately and refreshes it in the background", () => {
  assert.match(serviceWorker, /const CACHE_NAME = "subflow-v7"/);
  assert.match(serviceWorker, /const networkUpdate = fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(serviceWorker, /event\.waitUntil\(networkUpdate/);
  assert.match(serviceWorker, /caches\.match\("\.\/"\)\.then\(cached => cached \|\| networkUpdate\)/);
  assert.doesNotMatch(serviceWorker, /event\.respondWith\(fetch\(request\)/);
});

test("the document paints the app background before JavaScript starts", () => {
  assert.match(indexHtml, /html,body,#root\{min-height:100%;margin:0;background:#f6f5ee\}/);
});
