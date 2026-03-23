export const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3.0 Flash",
    provider: "google",
    description: "Fast and efficient, great for everyday tasks",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Best balance of speed, intelligence, and cost",
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    description: "Most capable Gemini model for complex tasks",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    description: "Fast and cost-effective OpenAI model for everyday chats",
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    description: "Strong general-purpose OpenAI model for complex tasks",
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    description: "Reasoning-focused OpenAI model for harder problem-solving",
  },
];

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
