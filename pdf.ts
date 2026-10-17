const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const ascii = (value: string) =>
  value
    .replace(/\u20b9/g, "Rs.")
    .replace(/\u20ac/g, "EUR ")
    .replace(/\u00a3/g, "GBP ")
    .replace(/\u00a5/g, "JPY ")
    .replace(/[^\x20-\x7e]/g, "?");

const escapePdf = (value: string) =>
  ascii(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const textWidth = (value: string, size: number, bold: boolean) =>
  ascii(value).length * size * (bold ? 0.56 : 0.5);

type Color = [number, number, number];

const GRAY: Color = [0.42, 0.45, 0.5];
const DARK: Color = [0.07, 0.09, 0.15];
const LINE: Color = [0.85, 0.87, 0.9];

export class ReportPdf {
  readonly width = PAGE_WIDTH;
  readonly height = PAGE_HEIGHT;
  readonly margin: number;

  private pages: string[][] = [[]];
  private pageIndex = 0;
  private y: number;

  constructor(margin = 40) {
    this.margin = margin;
    this.y = margin;
  }

  private ensure(space: number) {
    if (this.y + space > this.height - this.margin) {
      this.pages.push([]);
      this.pageIndex += 1;
      this.y = this.margin;
    }
  }

  private push(op: string) {
    this.pages[this.pageIndex].push(op);
  }

  text(
    value: string,
    options: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: Color;
      align?: "left" | "right";
    } = {}
  ) {
    const size = options.size ?? 11;
    const bold = options.bold ?? false;
    const color = options.color ?? DARK;
    const x = options.x ?? this.margin;

    this.ensure(size + 4);

    const font = bold ? "/F2" : "/F1";
    const tx =
      options.align === "right" ? x - textWidth(value, size, bold) : x;
    const ty = this.height - this.y;

    this.push(
      `BT ${color[0]} ${color[1]} ${color[2]} rg ${font} ${size} Tf 1 0 0 1 ${tx.toFixed(
        2
      )} ${ty.toFixed(2)} Tm (${escapePdf(value)}) Tj ET`
    );

    return this;
  }

  line(x1: number, x2: number, color: Color = LINE) {
    const y = this.height - this.y;
    this.push(
      `${color[0]} ${color[1]} ${color[2]} RG 0.6 w ${x1.toFixed(
        2
      )} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`
    );
    return this;
  }

  gap(amount: number) {
    this.y += amount;
    return this;
  }

  get cursor() {
    return this.y;
  }

  build(): Blob {
    const pageCount = this.pages.length;
    const total = 4 + pageCount * 2;
    const objects: string[] = new Array(total + 1);

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    const kids: number[] = [];

    this.pages.forEach((ops, index) => {
      const contentNum = 5 + index * 2;
      const pageNum = 6 + index * 2;
      kids.push(pageNum);

      const stream = ops.join("\n");
      objects[contentNum] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      objects[pageNum] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`;
    });

    objects[2] = `<< /Type /Pages /Kids [${kids
      .map((num) => `${num} 0 R`)
      .join(" ")}] /Count ${pageCount} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];

    for (let i = 1; i <= total; i += 1) {
      offsets[i] = pdf.length;
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${total + 1}\n`;
    pdf += `0000000000 65535 f \n`;

    for (let i = 1; i <= total; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i += 1) {
      bytes[i] = pdf.charCodeAt(i) & 0xff;
    }

    return new Blob([bytes], { type: "application/pdf" });
  }
}
