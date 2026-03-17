import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".docx") && !fileName.endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a .docx or .pdf file." },
      { status: 400 }
    );
  }

  // Extract text before starting the stream
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  let extractedText: string;

  try {
    if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      extractedText = pdfData.text;
      await parser.destroy();
    }
  } catch (err) {
    console.error("Text extraction error:", err);
    return NextResponse.json(
      { error: "Failed to extract text from the file." },
      { status: 500 }
    );
  }

  if (!extractedText.trim()) {
    return NextResponse.json(
      { error: "Could not extract any text from the file." },
      { status: 400 }
    );
  }

  // Stream AI tokens directly to the client as plain text.
  // No markers, no protocol — just raw AI output.
  // The browser's res.text() accumulates everything automatically.
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const anthropic = new Anthropic();
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16384,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Here is the syllabus text to make ADA compliant:\n\n${extractedText}`,
            },
          ],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (error) {
        console.error("Processing error:", error);
        // If we haven't sent anything yet, this won't help much,
        // but at least log it server-side
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
