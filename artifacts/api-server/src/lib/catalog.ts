export interface CatalogModel {
  id: string;
  name: string;
  family: string;
  parameterCount: string;
  sizeCategory: "small" | "medium" | "large";
  sizeGb: number;
  description: string;
  recommendedUse: string;
  memoryGuidance: string;
  repoId: string;
}

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    family: "Llama",
    parameterCount: "1B",
    sizeCategory: "small",
    sizeGb: 2.5,
    description: "Meta's smallest Llama model. Fast to download and fast to fine-tune.",
    recommendedUse: "Great first project — quick experiments and short, focused tasks.",
    memoryGuidance: "Comfortable on any modern Mac, even with other apps open.",
    repoId: "mlx-community/Llama-3.2-1B-Instruct-4bit",
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    family: "Llama",
    parameterCount: "3B",
    sizeCategory: "small",
    sizeGb: 6,
    description: "A step up from the 1B model with noticeably better answers, still light.",
    recommendedUse: "A solid everyday choice for chat-style assistants.",
    memoryGuidance: "Comfortable on any modern Mac.",
    repoId: "mlx-community/Llama-3.2-3B-Instruct-4bit",
  },
  {
    id: "qwen-2.5-1.5b",
    name: "Qwen 2.5 1.5B",
    family: "Qwen",
    parameterCount: "1.5B",
    sizeCategory: "small",
    sizeGb: 3,
    description: "A compact, capable model that's especially strong at following instructions.",
    recommendedUse: "Good for structured tasks like summarizing or reformatting text.",
    memoryGuidance: "Comfortable on any modern Mac.",
    repoId: "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
  },
  {
    id: "gemma-2-2b",
    name: "Gemma 2 2B",
    family: "Gemma",
    parameterCount: "2B",
    sizeCategory: "small",
    sizeGb: 1.8,
    description: "Google's compact Gemma model. Efficient and quick to fine-tune.",
    recommendedUse: "A great lightweight choice for chat and simple instruction-following.",
    memoryGuidance: "Comfortable on any modern Mac, even with other apps open.",
    repoId: "mlx-community/gemma-2-2b-it-4bit",
  },
  {
    id: "gemma-2-9b",
    name: "Gemma 2 9B",
    family: "Gemma",
    parameterCount: "9B",
    sizeCategory: "medium",
    sizeGb: 5.5,
    description: "Google's larger Gemma model, with stronger reasoning and richer answers.",
    recommendedUse: "A strong general-purpose assistant once you've tried a smaller model.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory.",
    repoId: "mlx-community/gemma-2-9b-it-4bit",
  },
  {
    id: "qwen-2.5-7b",
    name: "Qwen 2.5 7B",
    family: "Qwen",
    parameterCount: "7B",
    sizeCategory: "medium",
    sizeGb: 14,
    description: "A larger, noticeably smarter model with room for more nuanced fine-tuning.",
    recommendedUse: "Best for higher-quality assistants once you've tried a smaller model first.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory, with plenty of headroom.",
    repoId: "mlx-community/Qwen2.5-7B-Instruct-4bit",
  },
  {
    id: "mistral-7b",
    name: "Mistral 7B",
    family: "Mistral",
    parameterCount: "7B",
    sizeCategory: "medium",
    sizeGb: 14.5,
    description: "A well-rounded general-purpose model popular for creative and conversational text.",
    recommendedUse: "Good for storytelling, brainstorming, and open-ended chat.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory.",
    repoId: "mlx-community/Mistral-7B-Instruct-v0.3-4bit",
  },
  {
    id: "llama-3.1-8b",
    name: "Llama 3.1 8B",
    family: "Llama",
    parameterCount: "8B",
    sizeCategory: "medium",
    sizeGb: 16,
    description: "Meta's flagship mid-size model — a strong all-around choice for serious projects.",
    recommendedUse: "A great target for a polished, capable personal assistant.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory.",
    repoId: "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
  },
  {
    id: "mixtral-8x7b",
    name: "Mixtral 8x7B",
    family: "Mistral",
    parameterCount: "47B (mixture of experts)",
    sizeCategory: "large",
    sizeGb: 26,
    description: "A large mixture-of-experts model with strong reasoning ability.",
    recommendedUse: "For advanced projects once you're comfortable with the basics.",
    memoryGuidance: "Uses a large chunk of your Mac's 128GB — close other heavy apps while training.",
    repoId: "mlx-community/Mixtral-8x7B-Instruct-v0.1-4bit",
  },
  {
    id: "kimi-dev-72b",
    name: "Kimi Dev 72B",
    family: "Kimi",
    parameterCount: "72B",
    sizeCategory: "large",
    sizeGb: 40,
    description: "Moonshot AI's coding-focused Kimi model — the only Kimi that fits on a Mac. Strong at code and reasoning.",
    recommendedUse: "For advanced coding assistants, once you're comfortable with the basics.",
    memoryGuidance: "One of the biggest models here — uses a large portion of your Mac's 128GB, so close other heavy apps before training.",
    repoId: "mlx-community/Kimi-Dev-72B-4bit",
  },
];

export interface CatalogPreset {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
  epochs: number;
  learningRate: number;
  loraRank: number;
}

export const PRESET_CATALOG: CatalogPreset[] = [
  {
    id: "quick-test",
    name: "Quick test",
    description: "A fast pass to make sure everything works end to end. Good for your very first run.",
    estimatedTime: "A few minutes",
    epochs: 1,
    learningRate: 1e-4,
    loraRank: 4,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "A solid middle ground between speed and quality. The right default for most projects.",
    estimatedTime: "15 to 30 minutes",
    epochs: 3,
    learningRate: 5e-5,
    loraRank: 8,
  },
  {
    id: "best-quality",
    name: "Best quality",
    description: "Trains longer and more carefully for the best results. Worth it once you like your dataset.",
    estimatedTime: "45 minutes or more",
    epochs: 6,
    learningRate: 2e-5,
    loraRank: 16,
  },
];
