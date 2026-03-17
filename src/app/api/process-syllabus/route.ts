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

  // Stream the AI response as SSE to keep connection alive,
  // then send the final JSON for client-side DOCX generation
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
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
            if (tokenCount % 15 === 0) {
              sendEvent({ status: "processing", tokens: tokenCount });
            }
          }
        }

        // Clean up and parse the AI response
        const cleaned = responseText
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        let accessibleDoc;
        try {
          accessibleDoc = JSON.parse(cleaned);
        } catch {
          console.error("AI JSON parse failed:", cleaned.slice(0, 500));
          sendEvent({ status: "error", error: "AI returned invalid JSON. Please try again." });
          controller.close();
          return;
        }

        // Send the parsed document JSON to the client for DOCX generation
        sendEvent({ status: "complete", document: accessibleDoc });
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
          // Stream already closed
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
