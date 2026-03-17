import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { generateAccessibleDocx } from "@/lib/generate-docx";
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

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        // SSE format: "data: ...\n\n"
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Step 1: Extract text
        sendEvent({ status: "extracting" });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let extractedText: string;

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

        if (!extractedText.trim()) {
          sendEvent({ status: "error", error: "Could not extract any text from the file." });
          controller.close();
          return;
        }

        // Step 2: Stream AI processing
        sendEvent({ status: "processing" });

        const anthropic = new Anthropic();
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8096,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Here is the syllabus text to make ADA compliant:\n\n${extractedText}`,
            },
          ],
        });

        let responseText = "";
        let tokenCount = 0;

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            responseText += event.delta.text;
            tokenCount++;
            // Send keepalive every 15 tokens
            if (tokenCount % 15 === 0) {
              sendEvent({ status: "processing", tokens: tokenCount });
            }
          }
        }

        // Step 3: Parse AI response
        sendEvent({ status: "generating" });

        let accessibleDoc;
        try {
          const cleaned = responseText
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          accessibleDoc = JSON.parse(cleaned);
        } catch {
          console.error("AI JSON parse failed. First 500 chars:", responseText.slice(0, 500));
          sendEvent({ status: "error", error: "AI returned invalid JSON. Please try again." });
          controller.close();
          return;
        }

        // Step 4: Generate DOCX
        const docxBuffer = await generateAccessibleDocx(accessibleDoc);
        const base64 = Buffer.from(docxBuffer).toString("base64");

        // Send file in chunks to avoid huge single SSE message
        const CHUNK_SIZE = 32768; // 32KB chunks
        const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          sendEvent({
            status: "file_chunk",
            chunk,
            index: i,
            total: totalChunks,
          });
        }

        sendEvent({ status: "complete" });
        controller.close();
      } catch (error) {
        console.error("Processing error:", error);
        const message =
          error instanceof Error
            ? error.message
            : "An error occurred while processing the syllabus.";
        try {
          sendEvent({ status: "error", error: message });
        } catch {
          // Stream may already be closed
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
