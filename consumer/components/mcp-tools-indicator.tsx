"use client";

import { WrenchIcon } from "lucide-react";
import { memo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

type MCPToolsResponse = {
  tools: { name: string; description: string }[];
  connected: boolean;
};

function PureMCPToolsIndicator() {
  const { data, isLoading } = useSWR<MCPToolsResponse>(
    "/api/mcp-tools",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  if (isLoading || !data?.connected) {
    return null;
  }

  const toolCount = data.tools.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-default items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground">
            <WrenchIcon className="size-3.5" />
            <span>
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
            <span className="size-1.5 rounded-full bg-green-500" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="mb-1 font-medium">Connected MCP Tools</p>
          <ul className="space-y-0.5 text-xs">
            {data.tools.map((tool) => (
              <li key={tool.name} className="text-muted-foreground">
                <span className="font-mono text-foreground">{tool.name}</span>
                {tool.description && (
                  <span>
                    {" "}
                    &mdash; {tool.description.slice(0, 80)}
                    {tool.description.length > 80 ? "..." : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const MCPToolsIndicator = memo(PureMCPToolsIndicator);
