import { buildImagePdf } from "./pdfBuilder.js";

const PAGE_WIDTH = 1240; // A4 @150dpi
const PAGE_HEIGHT = 1754;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_Y = 84;
const TITLE_Y = 170;
const IMAGE_AREA_TOP = 250;
const IMAGE_AREA_HEIGHT = 1040;
const INFO_TOP = 1340;
const FONT_STACK =
  '"Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "PingFang SC", sans-serif';

async function loadBitmap(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const lines = [];
  let current = "";
  for (const char of String(text)) {
    const candidate = current + char;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  for (const line of lines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function fitImageRect(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function renderActionPage(character, action, index, total) {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");

  // 背景
  context.fillStyle = "#fbfaf6";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  // 页眉
  context.fillStyle = "#ff5c3a";
  context.font = `700 30px ${FONT_STACK}`;
  context.fillText("POSEBOOK · 动作记录", MARGIN, HEADER_Y - 14);
  context.fillStyle = "#7b7d76";
  context.font = `400 26px ${FONT_STACK}`;
  context.fillText(character.name, MARGIN, HEADER_Y + 16);
  context.fillStyle = "#7b7d76";
  context.textAlign = "right";
  context.fillText(`第 ${index} / ${total} 个动作`, PAGE_WIDTH - MARGIN, HEADER_Y);
  context.textAlign = "left";
  context.strokeStyle = "rgba(23,25,22,.14)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(MARGIN, HEADER_Y + 44);
  context.lineTo(PAGE_WIDTH - MARGIN, HEADER_Y + 44);
  context.stroke();

  // 标题区
  context.fillStyle = "#171916";
  context.font = `700 48px ${FONT_STACK}`;
  const titleBottom = drawWrappedText(context, action.name, MARGIN, TITLE_Y, CONTENT_WIDTH, 58) + 10;

  // 图片区底框
  const imageTop = Math.max(IMAGE_AREA_TOP, titleBottom + 40);
  context.fillStyle = "rgba(23,25,22,.05)";
  drawRoundedRect(context, MARGIN, imageTop, CONTENT_WIDTH, IMAGE_AREA_HEIGHT, 18);
  context.fill();

  const bitmap = await loadBitmap(action.image);
  let imageX = MARGIN;
  let imageY = imageTop;
  if (bitmap) {
    const fit = fitImageRect(bitmap.width, bitmap.height, CONTENT_WIDTH - 40, IMAGE_AREA_HEIGHT - 40);
    imageX = MARGIN + Math.round((CONTENT_WIDTH - fit.width) / 2);
    imageY = imageTop + Math.round((IMAGE_AREA_HEIGHT - fit.height) / 2);
    context.drawImage(bitmap, imageX, imageY, fit.width, fit.height);
    bitmap.close();
  } else {
    context.fillStyle = "#7b7d76";
    context.font = `400 30px ${FONT_STACK}`;
    context.textAlign = "center";
    context.fillText("图片加载失败或不可用", PAGE_WIDTH / 2, imageTop + IMAGE_AREA_HEIGHT / 2);
    context.textAlign = "left";
  }

  // 信息区
  let infoY = INFO_TOP;
  const labelStyle = () => {
    context.fillStyle = "#ff5c3a";
    context.font = `700 28px ${FONT_STACK}`;
  };
  const valueStyle = () => {
    context.fillStyle = "#3c3e38";
    context.font = `400 30px ${FONT_STACK}`;
  };
  const rowHeight = 44;

  // 完成状态
  labelStyle();
  const statusLabel = "完成状态：";
  const statusWidth = context.measureText(statusLabel).width;
  context.textAlign = "left";
  context.fillText(statusLabel, MARGIN, infoY);
  valueStyle();
  const completed = Boolean(action.completed);
  context.fillStyle = completed ? "#237354" : "#8a8c85";
  context.fillText(completed ? "已完成" : "未完成", MARGIN + statusWidth + 12, infoY);
  infoY += rowHeight;

  // 来源
  if (action.sourceName) {
    labelStyle();
    context.fillStyle = "#ff5c3a";
    context.fillText("图片来源：", MARGIN, infoY);
    const sourceWidth = context.measureText("图片来源：").width;
    valueStyle();
    infoY = drawWrappedText(
      context,
      action.sourceName,
      MARGIN + sourceWidth + 12,
      infoY,
      CONTENT_WIDTH - sourceWidth - 30,
      rowHeight,
    );
    infoY += 10;
  }

  // 备注
  labelStyle();
  context.fillStyle = "#ff5c3a";
  context.fillText("现场备注：", MARGIN, infoY);
  infoY += rowHeight;
  if (action.notes) {
    valueStyle();
    infoY = drawWrappedText(context, action.notes, MARGIN + 8, infoY, CONTENT_WIDTH - 20, 42);
  } else {
    valueStyle();
    context.fillStyle = "#a8aaa3";
    context.fillText("（无备注）", MARGIN + 8, infoY);
  }

  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), width: canvas.width, height: canvas.height };
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportCharacterActionsPdf(character, { onProgress } = {}) {
  const actions = character.actions || [];
  if (!actions.length) {
    throw new Error("该角色还没有动作记录，无法导出。");
  }

  const pages = [];
  for (let i = 0; i < actions.length; i += 1) {
    const page = await renderActionPage(character, actions[i], i + 1, actions.length);
    pages.push(page);
    onProgress?.(i + 1, actions.length);
  }

  const pdfBytes = buildImagePdf(pages);
  downloadBytes(pdfBytes, `动作记录-${character.name}.pdf`);
  return { pages: pages.length };
}