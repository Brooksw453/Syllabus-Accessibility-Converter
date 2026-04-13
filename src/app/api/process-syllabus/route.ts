import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, getEmailCookieName } from "@/lib/auth";
import { checkRateLimit, recordUsage } from "@/lib/rate-limit";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail =
    request.cookies.get(getEmailCookieName())?.value ?? "unknown";

  // Rate limit: 5 documents per hour per email (admins are unlimited)
  const { allowed, remaining, resetInSeconds } = await checkRateLimit(userEmail);
  if (!allowed) {
    return NextResponse.json(
      {
        error: `Rate limit reached. You can convert 5 documents per hour. Try again in ${Math.ceil(resetInSeconds / 60)} minutes.`,
        remaining,
        resetInSeconds,
      },
      { status: 429 }
    );
  }

  let body: {
    text: string;
    fileName?: string;
    images?: { id: string; base64: string; contentType: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { text, fileName, images } = body;
  if (!text?.trim()) {
    return NextResponse.json(
      { error: "No text content provided." },
      { status: 400 }
    );
  }

  console.log(
    `[USAGE] time=${new Date().toISOString()} | email=${userEmail} | file=${fileName ?? "unknown"}`
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured on server." },
      { status: 500 }
    );
  }

  let apiRes: Response;
  try {
    apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 32768,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              images && images.length > 0
                ? [
                    {
                      type: "text" as const,
                      text: `Here is the document text to make ADA compliant:\n\n${text}`,
                    },
                    {
                      type: "text" as const,
                      text: `The document contains ${images.length} image(s) marked as ${images.map((i) => `[${i.id}]`).join(", ")}. Below are the actual images — examine each one to generate descriptive alt text.`,
                    },
                    ...images.flatMap((img) => [
                      { type: "text" as const, text: `${img.id}:` },
                      {
                        type: "image" as const,
                        source: {
                          type: "base64" as const,
                          media_type: img.contentType,
                          data: img.base64,
                        },
                      },
                    ]),
                  ]
                : `Here is the document text to make ADA compliant:\n\n${text}`,
          },
        ],
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network error";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!apiRes.ok) {
    const errBody = await apiRes.text();
    let message = `Anthropic API error (${apiRes.status})`;
    try {
      const parsed = JSON.parse(errBody);
      message = parsed?.error?.message || message;
    } catch {
      // use default message
    }
    return NextResponse.json({ error: message }, { status: apiRes.status });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const reader = apiRes.body!.getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta"
              ) {
                controller.enqueue(encoder.encode(event.delta.text));
              }
            } catch {
              // skip malformed SSE chunks
            }
          }
        }

        // Record usage only after successful completion
        await recordUsage(userEmail, fileName ?? "unknown");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Stream failed";
        controller.enqueue(encoder.encode(`\n__ERROR__: ${message}`));
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
