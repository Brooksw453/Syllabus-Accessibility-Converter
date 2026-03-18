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

  // Validate API key before starting stream
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "API key not configured on server." },
      { status: 500 }
    );
  }

  // Make the API call first, then stream the result.
  // This ensures errors (bad key, rate limit, etc.) return proper HTTP errors
  // instead of silently dying mid-stream.
  const anthropic = new Anthropic();

  let stream;
  try {
    stream = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the syllabus text to make ADA compliant:\n\n${text}`,
        },
      ],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    console.error("Anthropic API error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Stream is established — pipe tokens to client
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (error) {
        console.error("Stream error:", error);
        const message =
          error instanceof Error ? error.message : "Stream failed";
        controller.enqueue(
          encoder.encode(`\n__ERROR__: ${message}`)
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
