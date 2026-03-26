"use client";

import { Loader2Icon, MicIcon } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function VoiceButton({
  onRecordingComplete,
  isProcessing = false,
  disabled = false,
  status,
}: {
  onRecordingComplete: (blob: Blob) => void;
  isProcessing?: boolean;
  disabled?: boolean;
  status?: string;
}) {
  const {
    startRecording,
    stopRecording,
    isRecording,
    isSupported,
    error,
  } = useVoiceInput();

  const busy = isRecording || isProcessing;
  const isReady = status === "ready";

  const handleClick = async () => {
    if (!isSupported || disabled || !isReady) return;
    if (error) return;

    if (isRecording) {
      const blob = await stopRecording();
      if (blob) onRecordingComplete(blob);
    } else {
      await startRecording();
    }
  };

  if (!isSupported) return null;

  return (
    <Button
      className={cn(
        "aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent",
        isRecording && "bg-red-500/20 text-red-600 hover:bg-red-500/30"
      )}
      data-testid="voice-button"
      disabled={disabled || !isReady || Boolean(error)}
      onClick={(e) => {
        e.preventDefault();
        handleClick();
      }}
      title={error ?? (isRecording ? "Stop recording" : "Start voice input")}
      variant="ghost"
    >
      {isProcessing && !isRecording ? (
        <Loader2Icon className="size-4 animate-spin" style={{ width: 14, height: 14 }} />
      ) : (
        <MicIcon
          className={cn("size-4", isRecording && "animate-pulse")}
          size={14}
          style={{ width: 14, height: 14 }}
        />
      )}
    </Button>
  );
}
