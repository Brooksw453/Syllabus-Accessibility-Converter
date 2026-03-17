import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import Anthropic from "@anthropic-ai/sdk";

// Edge Runtime: no Node.js serverless timeout issues,
// native streaming support, keeps connection alive properly.
export const runtime = "edge";

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { text } = body;
  if (!text?.trim()) {
    return NextResponse.json(
      { error: "No text content provided." },
      { status: 400 }
    );
  }

  // Stream AI tokens directly to client as plain text.
  // Edge Runtime handles streaming natively without buffering or early termination.
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
              content: `Here is the syllabus text to make ADA compliant:\n\n${text}`,
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
        // Send error as plain text so client can detect it
        controller.enqueue(
          encoder.encode("\n__ERROR__: Processing failed on the server.")
        );
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
