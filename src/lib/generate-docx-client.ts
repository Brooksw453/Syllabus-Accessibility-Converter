import {
  Document,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

interface TextSegment {
  text: string;
  link?: string;
}

interface ContentBlock {
  type: "paragraph" | "bullet_list" | "numbered_list" | "table";
  text?: string;
  segments?: TextSegment[];
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

interface Section {
  heading: string;
  level: 2 | 3;
  content: ContentBlock[];
}

export interface AccessibleDocument {
  title: string;
  sections: Section[];
}

function buildParagraphChildren(
  block: ContentBlock
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
            }),
          ],
          link: seg.link,
        });
      }
      return new TextRun({ text: seg.text, size: 24 });
    });
  }
  return [new TextRun({ text: block.text || "", size: 24 })];
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

export async function generateAccessibleDocxBlob(
  data: AccessibleDocument
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // Title (H1)
  children.push(
    new Paragraph({
      text: data.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
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
        text: section.heading,
        heading: headingLevel,
        spacing: { before: 240, after: 120 },
      })
    );

    for (const block of section.content) {
      if (block.type === "paragraph") {
        children.push(
          new Paragraph({
            children: buildParagraphChildren(block),
            spacing: { after: 120 },
          })
        );
      } else if (block.type === "bullet_list" && block.items) {
        for (const item of block.items) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: item, size: 24 })],
              bullet: { level: 0 },
              spacing: { after: 60 },
            })
          );
        }
      } else if (block.type === "numbered_list" && block.items) {
        const ref = `num-list-${currentNumbering}`;
        currentNumbering++;
        for (const item of block.items) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: item, size: 24 })],
              numbering: { reference: ref, level: 0 },
              spacing: { after: 60 },
            })
          );
        }
      } else if (block.type === "table" && block.headers && block.rows) {
        const headerRow = new TableRow({
          tableHeader: true,
          children: block.headers.map(
            (header) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: header, bold: true, size: 24 }),
                    ],
                  }),
                ],
                borders: cellBorders,
              })
          ),
        });

        const dataRows = block.rows.map(
          (row) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: cell, size: 24 })],
                      }),
                    ],
                    borders: cellBorders,
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
      }
    }
  }

  const doc = new Document({
    numbering: {
      config: numberingConfigs,
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
