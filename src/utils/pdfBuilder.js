const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function decodeBase64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  writeBytes(bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  writeText(text) {
    this.writeBytes(new TextEncoder().encode(text));
  }

  toUint8Array() {
    const output = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
}

/**
 * 把若干整页 JPEG 图片组装成图片型 PDF 文件（每页一张图）。
 * pages: [{ dataUrl: "data:image/jpeg;base64,...", width, height }]
 * 返回 Uint8Array 的 PDF 字节。
 */
export function buildImagePdf(pages) {
  const count = pages.length;
  const writer = new ByteWriter();
  writer.writeText("%PDF-1.4\n");
  writer.writeBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const objectOffsets = [];

  objectOffsets.push(writer.length);
  writer.writeText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  objectOffsets.push(writer.length);
  const kids = [];
  for (let i = 0; i < count; i += 1) {
    kids.push(`${3 + i * 3} 0 R`);
  }
  writer.writeText(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${count} >>\nendobj\n`);

  for (let i = 0; i < count; i += 1) {
    const page = pages[i];
    const pageNum = 3 + i * 3;
    const imageNum = 4 + i * 3;
    const contentNum = 5 + i * 3;
    const imageBytes = decodeBase64ToBytes(page.dataUrl.split(",")[1]);

    objectOffsets.push(writer.length);
    writer.writeText(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`,
    );

    objectOffsets.push(writer.length);
    writer.writeText(
      `${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    );
    writer.writeBytes(imageBytes);
    writer.writeText("\nendstream\nendobj\n");

    objectOffsets.push(writer.length);
    const content = `q\n${A4_WIDTH} 0 0 ${A4_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`;
    writer.writeText(
      `${contentNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`,
    );
  }

  const xrefOffset = writer.length;
  const objectCount = 2 + count * 3;
  let xref = `xref\n0 ${objectCount}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 0; i < objectCount; i += 1) {
    xref += `${String(objectOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  writer.writeText(xref);
  writer.writeText(
    `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return writer.toUint8Array();
}