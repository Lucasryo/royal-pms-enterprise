import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));

const documents = [
  {
    source: 'royal-pms-telegram-qr-tecnico.md',
    output: 'royal-pms-telegram-qr-tecnico.pdf',
    title: 'Royal PMS - Telegram, Chamados QR e Vinculo PMS',
    subtitle: 'Documento tecnico de continuidade operacional',
  },
  {
    source: 'royal-pms-telegram-qr-operacional.md',
    output: 'royal-pms-telegram-qr-operacional.pdf',
    title: 'Royal PMS - Manual de Uso QR Telegram e Chamados',
    subtitle: 'Passo a passo operacional para novos colaboradores',
  },
];

const pageSize = [595.28, 841.89];
const margin = 52;
const footerY = 28;
const contentWidth = pageSize[0] - margin * 2;
const lineGap = 4;

function clean(line) {
  return line
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/, '- ')
    .replace(/^\s*\d+\.\s+/, (match) => match.trimEnd() + ' ')
    .replace(/\s+/g, ' ')
    .trimEnd();
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) lines.push(current);

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }

    let chunk = '';
    for (const char of word) {
      const attempt = chunk + char;
      if (font.widthOfTextAtSize(attempt, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = attempt;
      }
    }
    current = chunk;
  }

  if (current) lines.push(current);
  return lines;
}

function drawFooter(page, pageNumber, font) {
  page.drawText(`Royal PMS | Documento interno | Pagina ${pageNumber}`, {
    x: margin,
    y: footerY,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function isTableLine(line) {
  return /^\|.*\|$/.test(line.trim());
}

function isFence(line) {
  return line.trim().startsWith('```');
}

async function renderMarkdownToPdf(config) {
  const md = readFileSync(join(__dirname, config.source), 'utf8').replace(/\r\n/g, '\n');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(config.title);
  pdfDoc.setSubject(config.subtitle);
  pdfDoc.setAuthor('Royal PMS');
  pdfDoc.setProducer('Royal PMS documentation generator');
  pdfDoc.setCreator('docs/telegram-qr/generate-pdfs.mjs');

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  let page = pdfDoc.addPage(pageSize);
  let pageNumber = 1;
  let y = pageSize[1] - margin;
  let inCode = false;

  function addPage() {
    drawFooter(page, pageNumber, regular);
    page = pdfDoc.addPage(pageSize);
    pageNumber += 1;
    y = pageSize[1] - margin;
  }

  function ensureSpace(height) {
    if (y - height < footerY + 20) addPage();
  }

  function drawBlock(text, options = {}) {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const color = options.color ?? rgb(0.12, 0.12, 0.12);
    const indent = options.indent ?? 0;
    const before = options.before ?? 0;
    const after = options.after ?? 0;
    const maxWidth = contentWidth - indent;
    const lines = wrapText(text, font, size, maxWidth);
    const lineHeight = size + lineGap;

    ensureSpace(before + lines.length * lineHeight + after);
    y -= before;
    for (const line of lines) {
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font,
        color,
      });
      y -= lineHeight;
    }
    y -= after;
  }

  const lines = md.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (isFence(line)) {
      inCode = !inCode;
      continue;
    }

    if (!line.trim()) {
      y -= inCode ? 3 : 7;
      if (y < footerY + 20) addPage();
      continue;
    }

    if (inCode) {
      drawBlock(line, { size: 8.5, font: mono, indent: 10, before: 1, after: 1, color: rgb(0.18, 0.18, 0.18) });
      continue;
    }

    if (line.startsWith('# ')) {
      drawBlock(clean(line.slice(2)), { size: 20, font: bold, before: 4, after: 8, color: rgb(0.05, 0.18, 0.32) });
      continue;
    }

    if (line.startsWith('## ')) {
      drawBlock(clean(line.slice(3)), { size: 13, font: bold, before: 10, after: 4, color: rgb(0.08, 0.25, 0.42) });
      continue;
    }

    if (isTableLine(line)) {
      if (/^\|\s*-+/.test(line)) continue;
      drawBlock(clean(line), { size: 7.4, font: mono, before: 1, after: 1, color: rgb(0.08, 0.08, 0.08) });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      drawBlock(clean(line), { size: 10, font: regular, indent: 12, before: 1, after: 1 });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      drawBlock(clean(line), { size: 10, font: regular, indent: 12, before: 1, after: 1 });
      continue;
    }

    drawBlock(clean(line), { size: 10, font: regular, before: 1, after: 2 });
  }

  drawFooter(page, pageNumber, regular);
  const pdfBytes = await pdfDoc.save();
  writeFileSync(join(__dirname, config.output), pdfBytes);
  console.log(`Generated ${config.output}`);
}

for (const doc of documents) {
  await renderMarkdownToPdf(doc);
}
