import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Home Screen icons use opaque square PNGs and matching precached URLs", async () => {
  const output = new URL("../pages-dist/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", output), "utf8"));
  const html = await readFile(new URL("index.html", output), "utf8");
  const worker = await readFile(new URL("sw.js", output), "utf8");
  assert.match(html, /apple-touch-icon-flow\.png/);
  assert.doesNotMatch(html, /apple-touch-icon\.png|icon-192\.png/);
  for (const [filename, size] of [["apple-touch-icon-flow.png", 180], ["icon-flow-192.png", 192], ["icon-flow-512.png", 512]]) {
    const png = await readFile(new URL(filename, output));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 2, "RGB artwork must not have a transparent outer border");
    assert.ok(manifest.icons.some(icon => icon.src === `./${filename}` && icon.sizes === `${size}x${size}`));
    assert.ok(worker.includes(`"./${filename}"`), "New icon URL must be precached exactly");
  }
});
