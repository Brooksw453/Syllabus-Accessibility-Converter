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

  // Parse the upload before starting the stream
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
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        // Step 1: Extract text
        send({ status: "extracting" });

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
          send({ status: "error", error: "Could not extract any text from the file." });
          controller.close();
          return;
        }

        // Step 2: Stream AI processing — sends bytes to client to keep connection alive
        send({ status: "processing" });

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
            // Send progress every 20 tokens to keep connection alive
            if (tokenCount % 20 === 0) {
              send({ status: "processing", tokens: tokenCount });
            }
          }
        }

        // Step 3: Parse AI response
        send({ status: "generating" });

        let accessibleDoc;
        try {
          const cleaned = responseText
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          accessibleDoc = JSON.parse(cleaned);
        } catch {
          console.error("AI response was not valid JSON:", responseText.slice(0, 500));
          send({ status: "error", error: "AI returned invalid JSON. Please try again." });
          controller.close();
          return;
        }

        // Step 4: Generate DOCX and send as base64
        const docxBuffer = await generateAccessibleDocx(accessibleDoc);
        const base64 = Buffer.from(docxBuffer).toString("base64");

        send({ status: "complete", file: base64 });
        controller.close();
      } catch (error) {
        console.error("Processing error:", error);
        const message =
          error instanceof Error
            ? error.message
            : "An error occurred while processing the syllabus.";
        try {
          send({ status: "error", error: message });
          controller.close();
        } catch {
          // Stream may already be closed
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
