"""Extract selectable drum-score measures from vector staff geometry."""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber


def extract(pdf_path: Path) -> dict:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        horizontal: dict[float, list[tuple[float, float]]] = defaultdict(list)

        for line in page.lines:
            dx = abs(line["x1"] - line["x0"])
            dy = abs(line["y1"] - line["y0"])
            if dy < 0.3 and dx > 15:
                horizontal[round(line["top"], 1)].append(
                    (round(min(line["x0"], line["x1"]), 2), round(max(line["x0"], line["x1"]), 2))
                )

        ys = sorted(horizontal)
        systems: list[dict] = []
        for index in range(len(ys) - 4):
            group = ys[index : index + 5]
            if not all(abs(group[i + 1] - group[i] - 5) < 0.2 for i in range(4)):
                continue

            segments = Counter(segment for y in group for segment in horizontal[y])
            common = sorted(segment for segment, count in segments.items() if count == 5)
            if common:
                systems.append({"staffTop": group[0], "segments": common})

        words = page.extract_words()
        starts: list[int] = []
        for index, system in enumerate(systems):
            if index == 0:
                starts.append(1)
                continue
            candidates = [
                int(word["text"])
                for word in words
                if word["text"].isdigit()
                and word["x0"] < 35
                and system["staffTop"] - 22 < word["top"] < system["staffTop"] - 5
            ]
            starts.append(candidates[0] if candidates else starts[-1] + len(systems[index - 1]["segments"]))

        centers = [system["staffTop"] + 10 for system in systems]
        vertical_bounds = [centers[0] - 32]
        vertical_bounds.extend((centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1))
        vertical_bounds.append(centers[-1] + 36)

        measures = []
        for system_index, system in enumerate(systems):
            region_ranges: list[tuple[int, int]]
            start = starts[system_index]
            next_start = starts[system_index + 1] if system_index + 1 < len(starts) else None

            # The opening line contains two multi-measure rests (4 and 11 bars).
            if system_index == 0 and next_start == 22 and len(system["segments"]) == 8:
                region_ranges = [(1, 4), (5, 15)] + [(number, number) for number in range(16, 22)]
            else:
                region_ranges = [(start + offset, start + offset) for offset in range(len(system["segments"]))]

            for region_index, ((x0, x1), (measure_start, measure_end)) in enumerate(
                zip(system["segments"], region_ranges)
            ):
                label = str(measure_start) if measure_start == measure_end else f"{measure_start}-{measure_end}"
                measures.append(
                    {
                        "id": f"system-{system_index + 1}-region-{region_index + 1}",
                        "label": label,
                        "measureStart": measure_start,
                        "measureEnd": measure_end,
                        "system": system_index + 1,
                        "x": round(x0 / page.width * 100, 5),
                        "y": round(vertical_bounds[system_index] / page.height * 100, 5),
                        "width": round((x1 - x0) / page.width * 100, 5),
                        "height": round(
                            (vertical_bounds[system_index + 1] - vertical_bounds[system_index]) / page.height * 100,
                            5,
                        ),
                    }
                )

        return {
            "pageWidth": float(page.width),
            "pageHeight": float(page.height),
            "systems": len(systems),
            "regions": len(measures),
            "measureCount": max(measure["measureEnd"] for measure in measures),
            "measures": measures,
        }


if __name__ == "__main__":
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(extract(source), ensure_ascii=False, indent=2), encoding="utf-8")

