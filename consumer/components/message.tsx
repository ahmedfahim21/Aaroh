"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { CircleStopIcon, Volume2Icon } from "lucide-react";
import { useState } from "react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  type ToolHeaderProps,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { CartView } from "./commerce/cart-view";
import { CheckoutView } from "./commerce/checkout-view";
import { OrderConfirmation } from "./commerce/order-confirmation";
import { ProductCard } from "./commerce/product-card";
import { ProductGrid } from "./commerce/product-grid";
import { PreviewAttachment } from "./preview-attachment";
import { Weather } from "./weather";

function parseMCPOutput(output: unknown): string | null {
  if (output == null) return null;

  // MCP tools return { content: [{ type: "text", text: "..." }], ... }
  const obj = output as Record<string, unknown>;
  if (obj.content && Array.isArray(obj.content)) {
    const texts = (obj.content as { type?: string; text?: string }[])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);

    if (texts.length > 0) {
      // Try to parse inner JSON for pretty printing
      const combined = texts.join("\n");
      try {
        const parsed = JSON.parse(combined);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return combined;
      }
    }
  }

  // Fallback: stringify as-is
  return JSON.stringify(output, null, 2);
}

function getCommerceData(output: unknown): Record<string, unknown> | null {
  if (output == null) return null;

  // If it's a string, try to parse as JSON directly
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  if (typeof output !== "object") return null;

  // Unwrap MCP format: { content: [{ type: "text", text: "..." }] }
  const obj = output as Record<string, unknown>;
  if (Array.isArray(obj.content)) {
    const texts = (obj.content as { type?: string; text?: string }[])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);
    if (texts.length > 0) {
      try {
        const parsed = JSON.parse(texts.join("\n")) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // Not valid JSON, fall through
      }
    }
  }

  // Direct object (non-MCP format)
  return obj;
}

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  getTranslatedText,
  getTtsAudio,
  playTtsAudio,
  stopTtsAudio,
  isTtsPlaying,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  getTranslatedText?: (messageId: string, partIndex: number) => string | undefined;
  getTtsAudio?: (messageId: string) => string | undefined;
  playTtsAudio?: (messageId: string) => void;
  stopTtsAudio?: () => void;
  isTtsPlaying?: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [showOriginal, setShowOriginal] = useState(false);

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  return (
    <div
      className="group/message fade-in w-full animate-in duration-200"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "w-full":
              (message.role === "assistant" &&
                (message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim()
                ) ||
                  message.parts?.some(
                    (p) =>
                      p.type.startsWith("tool-") ||
                      p.type === "dynamic-tool"
                  ))) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
                />
              ))}
            </div>
          )}

          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning") {
              const hasContent = part.text?.trim().length > 0;
              const isStreaming = "state" in part && part.state === "streaming";
              if (hasContent || isStreaming) {
                return (
                  <MessageReasoning
                    isLoading={isLoading || isStreaming}
                    key={key}
                    reasoning={part.text || ""}
                  />
                );
              }
            }

            if (type === "text") {
              if (mode === "view") {
                const originalText = (part as { text?: string }).text ?? "";
                const translatedText =
                  message.role === "assistant" && getTranslatedText
                    ? getTranslatedText(message.id, index)
                    : undefined;
                const displayText =
                  message.role === "assistant" &&
                  translatedText &&
                  !showOriginal
                    ? translatedText
                    : originalText;
                return (
                  <div className="flex flex-col gap-1" key={key}>
                    <MessageContent
                      className={cn({
                        "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right text-white":
                          message.role === "user",
                        "bg-transparent px-0 py-0 text-left":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                      style={
                        message.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
                    >
                      <Response>{sanitizeText(displayText)}</Response>
                    </MessageContent>
                    {message.role === "assistant" &&
                      translatedText &&
                      originalText !== translatedText && (
                        <button
                          className="text-muted-foreground hover:text-foreground w-fit text-xs underline"
                          onClick={() => setShowOriginal((o) => !o)}
                          type="button"
                        >
                          {showOriginal ? "Show translation" : "Show original"}
                        </button>
                      )}
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-getWeather") {
              const { toolCallId, state } = part;
              const approvalId = (part as { approval?: { id: string } })
                .approval?.id;
              const isDenied =
                state === "output-denied" ||
                (state === "approval-responded" &&
                  (part as { approval?: { approved?: boolean } }).approval
                    ?.approved === false);
              const widthClass = "w-[min(100%,450px)]";

              if (state === "output-available") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Weather weatherAtLocation={part.output} />
                  </div>
                );
              }

              if (isDenied) {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader
                        state="output-denied"
                        type="tool-getWeather"
                      />
                      <ToolContent>
                        <div className="px-4 py-3 text-muted-foreground text-sm">
                          Weather lookup was denied.
                        </div>
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              if (state === "approval-responded") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader state={state} type="tool-getWeather" />
                      <ToolContent>
                        <ToolInput input={part.input} />
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              return (
                <div className={widthClass} key={toolCallId}>
                  <Tool className="w-full" defaultOpen={true}>
                    <ToolHeader state={state} type="tool-getWeather" />
                    <ToolContent>
                      {(state === "input-available" ||
                        state === "approval-requested") && (
                        <ToolInput input={part.input} />
                      )}
                      {state === "approval-requested" && approvalId && (
                        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                          <button
                            className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: false,
                                reason: "User denied weather lookup",
                              });
                            }}
                            type="button"
                          >
                            Deny
                          </button>
                          <button
                            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: true,
                              });
                            }}
                            type="button"
                          >
                            Allow
                          </button>
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if (type === "tool-createDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={part.output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    args={{ ...part.output, isUpdate: true }}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                </div>
              );
            }

            if (type === "tool-requestSuggestions") {
              const { toolCallId, state } = part;
              const isInProgress = [
                "input-streaming",
                "input-available",
                "approval-requested",
                "approval-responded",
              ].includes(state);

              return (
                <Tool defaultOpen={isInProgress} key={toolCallId}>
                  <ToolHeader state={state} type="tool-requestSuggestions" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={
                          "error" in part.output ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {String(part.output.error)}
                            </div>
                          ) : (
                            <DocumentToolResult
                              isReadonly={isReadonly}
                              result={part.output}
                              type="request-suggestions"
                            />
                          )
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            if (type === "dynamic-tool") {
              const dynamicPart = part as {
                toolName: string;
                toolCallId: string;
                state: string;
                input?: unknown;
                output?: unknown;
                errorText?: string;
              };
              if (dynamicPart.state === "output-available") {
                const data = getCommerceData(dynamicPart.output);
                const uiType = (data?._ui as { type?: string } | undefined)?.type;
                switch (uiType) {
                  case "product-grid":
                    return (
                      <div className="w-full" key={dynamicPart.toolCallId}>
                        <ProductGrid data={data as Parameters<typeof ProductGrid>[0]["data"]} />
                      </div>
                    );
                  case "product-detail":
                    return (
                      <div className="w-full" key={dynamicPart.toolCallId}>
                        <ProductCard
                          data={(data as { product: Parameters<typeof ProductCard>[0]["data"] }).product}
                        />
                      </div>
                    );
                  case "cart":
                    return (
                      <div className="w-full" key={dynamicPart.toolCallId}>
                        <CartView data={data as Parameters<typeof CartView>[0]["data"]} />
                      </div>
                    );
                  case "checkout":
                    return (
                      <div className="w-full" key={dynamicPart.toolCallId}>
                        <CheckoutView data={data as Parameters<typeof CheckoutView>[0]["data"]} />
                      </div>
                    );
                  case "order-confirmation":
                    return (
                      <div className="w-full" key={dynamicPart.toolCallId}>
                        <OrderConfirmation data={data as Parameters<typeof OrderConfirmation>[0]["data"]} />
                      </div>
                    );
                  default:
                    break;
                }
              }
              const parsedOutput = parseMCPOutput(dynamicPart.output);

              return (
                <div className="w-full" key={dynamicPart.toolCallId}>
                  <Tool defaultOpen={false}>
                    <ToolHeader
                      state={dynamicPart.state as ToolHeaderProps["state"]}
                      type={`tool-${dynamicPart.toolName}`}
                    />
                    <ToolContent>
                      {dynamicPart.input != null && (
                        <ToolInput input={dynamicPart.input} />
                      )}
                      {dynamicPart.state === "output-available" &&
                        parsedOutput != null && (
                          <ToolOutput
                            errorText={undefined}
                            output={
                              <pre className="overflow-x-auto p-3 font-mono text-xs">
                                {parsedOutput}
                              </pre>
                            }
                          />
                        )}
                      {dynamicPart.state === "output-error" && (
                        <ToolOutput
                          errorText={dynamicPart.errorText}
                          output={null}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if (type.startsWith("tool-")) {
              const toolPart = part as {
                toolCallId?: string;
                state?: string;
                input?: unknown;
                output?: unknown;
                errorText?: string;
              };
              const toolCallId = toolPart.toolCallId ?? key;
              const state = (toolPart.state ?? "output-available") as
                | "input-streaming"
                | "input-available"
                | "approval-requested"
                | "approval-responded"
                | "output-available"
                | "output-error"
                | "output-denied";

              if (state === "output-available") {
                const data = getCommerceData(toolPart.output);
                const uiType = (data?._ui as { type?: string } | undefined)?.type;
                switch (uiType) {
                  case "product-grid":
                    return (
                      <div className="w-full" key={toolCallId}>
                        <ProductGrid data={data as Parameters<typeof ProductGrid>[0]["data"]} />
                      </div>
                    );
                  case "product-detail":
                    return (
                      <div className="w-full" key={toolCallId}>
                        <ProductCard
                          data={(data as { product: Parameters<typeof ProductCard>[0]["data"] }).product}
                        />
                      </div>
                    );
                  case "cart":
                    return (
                      <div className="w-full" key={toolCallId}>
                        <CartView data={data as Parameters<typeof CartView>[0]["data"]} />
                      </div>
                    );
                  case "checkout":
                    return (
                      <div className="w-full" key={toolCallId}>
                        <CheckoutView data={data as Parameters<typeof CheckoutView>[0]["data"]} />
                      </div>
                    );
                  case "order-confirmation":
                    return (
                      <div className="w-full" key={toolCallId}>
                        <OrderConfirmation data={data as Parameters<typeof OrderConfirmation>[0]["data"]} />
                      </div>
                    );
                  default:
                    break;
                }
              }

              const parsedOutput = parseMCPOutput(toolPart.output);

              return (
                <div className="w-full" key={toolCallId}>
                  <Tool defaultOpen={false}>
                    <ToolHeader state={state} type={type} />
                    <ToolContent>
                      {toolPart.input != null && (
                        <ToolInput input={toolPart.input} />
                      )}
                      {state === "output-available" && parsedOutput != null && (
                        <ToolOutput
                          errorText={undefined}
                          output={
                            <pre className="overflow-x-auto p-3 font-mono text-xs">
                              {parsedOutput}
                            </pre>
                          }
                        />
                      )}
                      {state === "output-error" && (
                        <ToolOutput
                          errorText={toolPart.errorText}
                          output={null}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            return null;
          })}

          {message.role === "assistant" &&
            getTtsAudio?.(message.id) &&
            playTtsAudio &&
            (isTtsPlaying && stopTtsAudio ? (
              <button
                className="text-red-500 hover:text-red-600 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                onClick={() => stopTtsAudio()}
                title="Stop playback"
                type="button"
              >
                <CircleStopIcon className="size-4" />
              </button>
            ) : (
              <button
                className="text-muted-foreground hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                onClick={() => playTtsAudio(message.id)}
                title="Play response"
                type="button"
              >
                <Volume2Icon className="size-4" />
              </button>
            ))}
          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1 p-0 text-muted-foreground text-sm">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
