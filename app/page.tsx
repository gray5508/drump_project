"use client";

import { useMemo, useState } from "react";
import scoreData from "./measures.json";

const palettes = [
  { id: "blue", name: "专注蓝", fill: "rgba(73, 111, 236, 0.18)", border: "#496fec" },
  { id: "yellow", name: "练习黄", fill: "rgba(244, 183, 64, 0.24)", border: "#e2a328" },
  { id: "coral", name: "难点红", fill: "rgba(235, 100, 91, 0.2)", border: "#df5e55" },
  { id: "green", name: "完成绿", fill: "rgba(62, 166, 124, 0.2)", border: "#32966c" },
];

export default function Home() {
  const [zoom, setZoom] = useState(100);
  const [activeColor, setActiveColor] = useState(palettes[0].id);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const palette = palettes.find((item) => item.id === activeColor) ?? palettes[0];
  const markedCount = Object.keys(marks).length;

  const markedMeasures = useMemo(
    () => scoreData.measures.filter((measure) => marks[measure.id]),
    [marks],
  );

  function toggleMark(id: string) {
    setMarks((current) => {
      const next = { ...current };
      if (next[id] === activeColor) delete next[id];
      else next[id] = activeColor;
      return next;
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="eyebrow">DRUM FOCUS</p>
            <h1>谱面练习台</h1>
          </div>
        </div>
        <div className="song-heading">
          <span className="status-dot" />
          <div>
            <strong>就让这大雨全部落下</strong>
            <span>容祖儿 · 架子鼓谱</span>
          </div>
        </div>
        <div className="recognition-pill">
          <span>智能识别完成</span>
          <strong>{scoreData.measureCount} 小节</strong>
        </div>
      </header>

      <section className="workspace">
        <div className="control-row">
          <div className="palette-control" aria-label="标记颜色">
            <span className="control-label">标记颜色</span>
            <div className="palette-list">
              {palettes.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  className={`color-chip ${activeColor === color.id ? "is-active" : ""}`}
                  style={{ backgroundColor: color.border }}
                  onClick={() => setActiveColor(color.id)}
                  aria-label={color.name}
                  title={color.name}
                />
              ))}
            </div>
            <span className="active-color-name">{palette.name}</span>
          </div>

          <div className="practice-hint">
            <span className="cursor-symbol" aria-hidden="true">↖</span>
            <span>移动鼠标预览小节，单击添加颜色标记</span>
          </div>

          <div className="view-controls">
            {markedCount > 0 && (
              <button type="button" className="clear-button" onClick={() => setMarks({})}>
                清空 {markedCount} 个标记
              </button>
            )}
            <div className="zoom-control" aria-label="谱面缩放">
              <button type="button" onClick={() => setZoom((value) => Math.max(70, value - 10))} aria-label="缩小">−</button>
              <span>{zoom}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(150, value + 10))} aria-label="放大">＋</button>
            </div>
          </div>
        </div>

        <div className="score-viewport">
          <div className="score-page" style={{ width: `${zoom * 9.1}px` }}>
            <img src="/score.png" alt="《就让这大雨全部落下》架子鼓谱" draggable={false} />
            <div className="measure-layer" aria-label="可选择的小节区域">
              {scoreData.measures.map((measure) => {
                const markedPalette = palettes.find((item) => item.id === marks[measure.id]);
                const rangeLabel = measure.measureStart === measure.measureEnd
                  ? `第 ${measure.measureStart} 小节`
                  : `第 ${measure.measureStart} 至 ${measure.measureEnd} 小节（多小节休止）`;

                return (
                  <button
                    key={measure.id}
                    type="button"
                    className={`measure-region ${markedPalette ? "is-marked" : ""}`}
                    style={{
                      left: `${measure.x}%`,
                      top: `${measure.y}%`,
                      width: `${measure.width}%`,
                      height: `${measure.height}%`,
                      backgroundColor: markedPalette?.fill,
                      borderColor: markedPalette?.border,
                    }}
                    onClick={() => toggleMark(measure.id)}
                    aria-label={`${rangeLabel}，单击标记`}
                    title={rangeLabel}
                  >
                    <span className="measure-label">{measure.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="statusbar">
          <div><span className="status-dot" /> 已识别 {scoreData.systems} 行谱表、{scoreData.regions} 个可选区域</div>
          <div>
            {markedMeasures.length === 0
              ? "当前没有固定标记"
              : `已标记：${markedMeasures.map((measure) => measure.label).join("、")}`}
          </div>
        </footer>
      </section>
    </main>
  );
}
