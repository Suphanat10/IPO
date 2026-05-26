"use client";

import * as React from "react";
import { Box } from "@mui/material";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

function buildCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 92;

  for (let i = 0; i < count; i++) {
    const trend = i * 0.55;
    const wave = Math.sin(i * 0.72) * 5.6 + Math.cos(i * 0.29) * 3.4;
    const open = price;
    const close = 92 + trend + wave + Math.sin(i * 1.37) * 2.1;
    const high = Math.max(open, close) + 3.8 + Math.sin(i * 0.41) * 1.5;
    const low = Math.min(open, close) - 3.3 - Math.cos(i * 0.53) * 1.2;
    const volume = 0.35 + Math.abs(close - open) / 11 + (i % 6 === 0 ? 0.34 : 0);

    candles.push({ open, close, high, low, volume: Math.min(1, volume) });
    price = close;
  }

  return candles;
}

function drawStockScene(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0a1929");
  gradient.addColorStop(0.56, "#10233a");
  gradient.addColorStop(1, "#06101c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const rightStart = width * 0.34;
  const chartW = width * 0.72;
  const chartH = height * 0.68;
  const chartTop = height * 0.12;
  const chartBottom = chartTop + chartH;
  const drift = (time * 0.018) % 42;

  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = "rgba(125, 211, 252, 0.34)";
  ctx.lineWidth = 1;
  for (let x = rightStart - drift; x < width + 60; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, chartTop - 28);
    ctx.lineTo(x, chartBottom + 20);
    ctx.stroke();
  }
  for (let y = chartTop; y <= chartBottom; y += chartH / 6) {
    ctx.beginPath();
    ctx.moveTo(rightStart - 42, y);
    ctx.lineTo(width + 30, y);
    ctx.stroke();
  }
  ctx.restore();

  const candles = buildCandles(38);
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const scaleY = (value: number) => chartBottom - ((value - min) / (max - min)) * chartH;
  const gap = chartW / (candles.length - 1);

  ctx.save();
  ctx.translate(width * 0.16, 0);

  const line = new Path2D();
  candles.forEach((candle, index) => {
    const x = rightStart + index * gap;
    const y = scaleY(candle.close);
    if (index === 0) line.moveTo(x, y);
    else line.lineTo(x, y);
  });

  const area = new Path2D(line);
  area.lineTo(rightStart + (candles.length - 1) * gap, chartBottom + 18);
  area.lineTo(rightStart, chartBottom + 18);
  area.closePath();
  const areaFill = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
  areaFill.addColorStop(0, "rgba(34, 197, 94, 0.22)");
  areaFill.addColorStop(1, "rgba(34, 197, 94, 0)");
  ctx.fillStyle = areaFill;
  ctx.fill(area);

  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(34, 197, 94, 0.92)";
  ctx.stroke(line);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(167, 243, 208, 0.86)";
  ctx.stroke(line);

  candles.forEach((candle, index) => {
    const x = rightStart + index * gap;
    const open = scaleY(candle.open);
    const close = scaleY(candle.close);
    const high = scaleY(candle.high);
    const low = scaleY(candle.low);
    const up = candle.close >= candle.open;
    const color = up ? "rgba(34, 197, 94, 0.78)" : "rgba(244, 63, 94, 0.58)";
    const bodyTop = Math.min(open, close);
    const bodyHeight = Math.max(5, Math.abs(close - open));
    const volHeight = 58 * candle.volume;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, high);
    ctx.lineTo(x, low);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x - 5.5, bodyTop, 11, bodyHeight);
    ctx.fillStyle = up ? "rgba(34, 197, 94, 0.24)" : "rgba(244, 63, 94, 0.2)";
    ctx.fillRect(x - 7, chartBottom + 34 - volHeight, 14, volHeight);
  });

  const pulseIndex = Math.floor((time * 0.018) % candles.length);
  const pulse = candles[pulseIndex];
  if (pulse) {
    const x = rightStart + pulseIndex * gap;
    const y = scaleY(pulse.close);
    ctx.fillStyle = "rgba(56, 189, 248, 0.96)";
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
    ctx.lineWidth = 18 + Math.sin(time * 0.05) * 5;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
  ctx.fillRect(width * 0.68, height * 0.18, 116, 30);
  ctx.fillStyle = "rgba(34, 197, 94, 0.18)";
  ctx.fillRect(width * 0.73, height * 0.31, 148, 30);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillText("SET +1.8%", width * 0.68 + 14, height * 0.18 + 20);
  ctx.fillText("IPO IDX +3.2%", width * 0.73 + 14, height * 0.31 + 20);
  ctx.restore();
}

export default function StockHeroBackground({ children }: { children: React.ReactNode }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let animationId = 0;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const targetCanvas = canvas;
    const context = ctx;

    function resize() {
      const rect = targetCanvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      targetCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
      targetCanvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawStockScene(context, rect.width, rect.height, frame);
    }

    function animate() {
      const rect = targetCanvas.getBoundingClientRect();
      frame += media.matches ? 0 : 1;
      drawStockScene(context, rect.width, rect.height, frame);
      animationId = window.requestAnimationFrame(animate);
    }

    resize();
    animationId = window.requestAnimationFrame(animate);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0a1929",
        borderBottom: "1px solid rgba(56,189,248,0.1)",
      }}
    >
      <Box
        component="canvas"
        ref={canvasRef}
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(10,25,41,0.98) 0%, rgba(10,25,41,0.84) 47%, rgba(10,25,41,0.54) 100%)",
        }}
      />
      <Box sx={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Box>
  );
}
