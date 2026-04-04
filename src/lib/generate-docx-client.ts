import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";

interface TextSegment {
  text: string;
  link?: string;
}

interface ContentBlock {
  type: "paragraph" | "bullet_list" | "numbered_list" | "table" | "image";
  text?: string;
  segments?: TextSegment[];
  items?: string[];
  headers?: string[];
  rows?: string[][];
  imageId?: string;
  altText?: string;
}

interface Section {
  heading: string;
  level: 2 | 3;
  content: ContentBlock[];
}

export interface ImageData {
  data: ArrayBuffer;
  contentType: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface AccessibleDocument {
  title: string;
  institution?: string | null;
  sections: Section[];
  changes?: string[];
  images?: Record<string, ImageData>;
}

function buildParagraphChildren(
  block: ContentBlock,
  fontFamily: string
): (TextRun | ExternalHyperlink)[] {
  if (block.segments) {
    return block.segments.map((seg) => {
      if (seg.link) {
        return new ExternalHyperlink({
          children: [
            new TextRun({
              text: seg.text,
              style: "Hyperlink",
              size: 24,
              font: fontFamily,
            }),
          ],
          link: seg.link,
        });
      }
      return new TextRun({ text: seg.text, size: 24, font: fontFamily });
    });
  }
  return [new TextRun({ text: block.text || "", size: 24, font: fontFamily })];
}

const tableBorder = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "000000",
};

const cellBorders = {
  top: tableBorder,
  bottom: tableBorder,
  left: tableBorder,
  right: tableBorder,
};

export type FontOption = "Calibri" | "Arial" | "Times New Roman";

export async function generateAccessibleDocxBlob(
  data: AccessibleDocument,
  fontFamily: FontOption = "Calibri",
  imageDimensions?: Record<string, ImageDimensions>
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // 1.15 line spacing in twips (276 = 240 * 1.15)
  const lineSpacing = { line: 276 };

  // Title (H1)
  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.title, font: fontFamily })],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300, line: 276 },
    })
  );

  let numberingRef = 0;
  const numberingConfigs: {
    reference: string;
    levels: {
      level: number;
      format: "decimal";
      text: string;
      alignment: "start";
    }[];
  }[] = [];

  // Pre-scan for numbered lists
  for (const section of data.sections) {
    for (const block of section.content) {
      if (block.type === "numbered_list" && block.items) {
        numberingConfigs.push({
          reference: `num-list-${numberingRef}`,
          levels: [
            {
              level: 0,
              format: "decimal" as const,
              text: "%1.",
              alignment: "start" as const,
            },
          ],
        });
        numberingRef++;
      }
    }
  }

  let currentNumbering = 0;

  for (const section of data.sections) {
    const headingLevel =
      section.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2;

    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.heading, font: fontFamily })],
        heading: headingLevel,
        spacing: { before: 240, after: 120, ...lineSpacing },
      })
    );

    for (const block of section.content) {
      if (block.type === "paragraph") {
        children.push(
          new Paragraph({
            children: buildParagraphChildren(block, fontFamily),
            spacing: { after: 120, ...lineSpacing },
          })
        );
      } else if (block.type === "bullet_list" && block.items) {
        for (const item of block.items) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: item, size: 24, font: fontFamily })],
              bullet: { level: 0 },
              spacing: { after: 60, ...lineSpacing },
            })
          );
        }
      } else if (block.type === "numbered_list" && block.items) {
        const ref = `num-list-${currentNumbering}`;
        currentNumbering++;
        for (const item of block.items) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: item, size: 24, font: fontFamily })],
              numbering: { reference: ref, level: 0 },
              spacing: { after: 60, ...lineSpacing },
            })
          );
        }
      } else if (block.type === "table" && block.headers && block.rows) {
        const headerShading = {
          fill: "4472C4",
          type: ShadingType.CLEAR,
          color: "auto",
        };
        const altRowShading = {
          fill: "F2F2F2",
          type: ShadingType.CLEAR,
          color: "auto",
        };

        const headerRow = new TableRow({
          tableHeader: true,
          children: block.headers.map(
            (header) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: header, bold: true, size: 24, font: fontFamily, color: "FFFFFF" }),
                    ],
                  }),
                ],
                borders: cellBorders,
                shading: headerShading,
              })
          ),
        });

        const dataRows = block.rows.map(
          (row, rowIndex) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: cell, size: 24, font: fontFamily })],
                      }),
                    ],
                    borders: cellBorders,
                    ...(rowIndex % 2 === 1 ? { shading: altRowShading } : {}),
                  })
              ),
            })
        );

        children.push(
          new Table({
            rows: [headerRow, ...dataRows],
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );

        children.push(new Paragraph({ spacing: { after: 120 } }));
      } else if (block.type === "image" && block.imageId && data.images?.[block.imageId]) {
        const img = data.images[block.imageId];
        const dims = imageDimensions?.[block.imageId] ?? { width: 576, height: 432 };
        const typeMap: Record<string, "jpg" | "png" | "gif" | "bmp"> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/gif": "gif",
          "image/bmp": "bmp",
        };
        const imgType = typeMap[img.contentType] ?? "png";

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: imgType,
                data: img.data,
                transformation: dims,
                altText: {
                  name: block.imageId,
                  description: block.altText || "Image",
                  title: block.altText || "Image",
                },
              }),
            ],
            spacing: { after: 120, ...lineSpacing },
          })
        );
      }
    }
  }

  // Compliance badge footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `\u267F Accessibility compliant \u2014 WCAG 2.2 / Section 508 | Generated by Document Ally on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
          size: 18,
          color: "595959",
          italics: true,
          font: fontFamily,
        }),
      ],
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    })
  );

  const doc = new Document({
    title: data.title,
    creator: "Document Ally",
    description: "Accessible document generated by Document Ally - WCAG 2.2 compliant",
    subject: data.institution || undefined,
    numbering: {
      config: numberingConfigs,
    },
    styles: {
      default: {
        document: {
          run: {
            language: {
              value: "en-US",
            },
            font: fontFamily,
            size: 24,
          },
          paragraph: {
            spacing: { line: 276 },
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
