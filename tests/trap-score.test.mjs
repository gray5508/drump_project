import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("陷阱谱面覆盖全部 81 小节并与图片对齐", () => {
  const root = new URL("../谱面练习台-离线版/", import.meta.url);
  const window = {};
  runInNewContext(readFileSync(new URL("trap-measures.js", root), "utf8"), { window });
  const score = window.TRAP_SCORE_DATA;
  const bars = score.measures.flatMap(({ measureStart, measureEnd }) =>
    Array.from({ length: measureEnd - measureStart + 1 }, (_, index) => measureStart + index)
  );
  assert.deepEqual([...bars], Array.from({ length: 81 }, (_, index) => index + 1));
  assert.equal(score.systems, 20);
  assert.equal(score.regions, score.measures.length);
  for (const { x, y, width, height } of score.measures) {
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 100 && y + height <= 100);
  }
  const png = readFileSync(new URL("assets/trap-score.png", root));
  assert.ok(Math.abs(png.readUInt32BE(16) / png.readUInt32BE(20) - score.pageWidth / score.pageHeight) < 0.001);
  assert.ok(statSync(new URL("assets/trap.mp3", root)).size > 0);
});
