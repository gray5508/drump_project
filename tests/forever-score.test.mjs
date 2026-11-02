import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("永远都会在谱面覆盖 55 小节并与两页拼接图对齐", () => {
  const root = new URL("../谱面练习台-离线版/", import.meta.url);
  const window = {};
  runInNewContext(readFileSync(new URL("forever-measures.js", root), "utf8"), { window });
  const score = window.FOREVER_SCORE_DATA;
  assert.deepEqual([...score.measures.map(({ measureStart }) => measureStart)], Array.from({ length: 55 }, (_, index) => index + 1));
  assert.equal(score.systems, 15);
  assert.equal(score.regions, score.measures.length);
  for (const { x, y, width, height } of score.measures) {
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 100 && y + height <= 100);
  }
  const png = readFileSync(new URL("assets/forever-score.png", root));
  assert.ok(Math.abs(png.readUInt32BE(16) / png.readUInt32BE(20) - score.pageWidth / score.pageHeight) < 0.001);
  assert.ok(statSync(new URL("assets/forever.mp3", root)).size > 0);
});
