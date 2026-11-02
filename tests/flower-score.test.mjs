import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("鲜花谱面覆盖 136 小节并与四页拼接图对齐", () => {
  const root = new URL("../谱面练习台-离线版/", import.meta.url);
  const window = {};
  runInNewContext(readFileSync(new URL("flower-measures.js", root), "utf8"), { window });
  const score = window.FLOWER_SCORE_DATA;
  const bars = score.measures.flatMap(({ measureStart, measureEnd }) =>
    Array.from({ length: measureEnd - measureStart + 1 }, (_, index) => measureStart + index)
  );
  assert.deepEqual([...bars], Array.from({ length: 136 }, (_, index) => index + 1));
  assert.equal(score.systems, 33);
  assert.equal(score.regions, score.measures.length);
  assert.equal(score.measures[0].label, "1-10");
  assert.equal(score.measures.at(-1).label, "135-136");
  for (const { x, y, width, height } of score.measures) {
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 100 && y + height <= 100);
  }
  const png = readFileSync(new URL("assets/flower-score.png", root));
  assert.ok(Math.abs(png.readUInt32BE(16) / png.readUInt32BE(20) - score.pageWidth / score.pageHeight) < 0.001);
  assert.ok(statSync(new URL("assets/flower.mp3", root)).size > 0);
});
