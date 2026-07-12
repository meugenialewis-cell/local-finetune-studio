export type ModelArchitecture = "transformer" | "ssm" | "linear-attention" | "hybrid";
export type FineTuneSupport = "supported" | "experimental" | "none";
export type ExportFormat = "ollama" | "gguf";

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
  architecture: ModelArchitecture;
  fineTuneSupport: FineTuneSupport;
  // GGUF export fuses with mlx_lm.fuse and then converts with the vendored
  // llama.cpp converter (scripts/vendor/convert_hf_to_gguf.py). We have
  // verified the llama/mistral/mixtral families end to end; other families
  // keep only the Ollama Modelfile flow and fast-weights architectures ship
  // with an empty list until they are verified. Keep in sync with
  // GGUF_MODEL_TYPES in scripts/export_model.py.
  exportFormats: ExportFormat[];
  repoId: string;
}

const TRANSFORMER_DEFAULTS = {
  architecture: "transformer" as const,
  fineTuneSupport: "supported" as const,
  exportFormats: ["gguf", "ollama"] as ExportFormat[],
};

const FAST_WEIGHTS_DEFAULTS = {
  fineTuneSupport: "experimental" as const,
  exportFormats: [] as ExportFormat[],
};

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
    ...TRANSFORMER_DEFAULTS,
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
    ...TRANSFORMER_DEFAULTS,
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
    ...TRANSFORMER_DEFAULTS,
    exportFormats: ["ollama"],
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
    ...TRANSFORMER_DEFAULTS,
    exportFormats: ["ollama"],
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
    ...TRANSFORMER_DEFAULTS,
    exportFormats: ["ollama"],
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
    ...TRANSFORMER_DEFAULTS,
    exportFormats: ["ollama"],
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
    ...TRANSFORMER_DEFAULTS,
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
    ...TRANSFORMER_DEFAULTS,
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
    ...TRANSFORMER_DEFAULTS,
    repoId: "mlx-community/Mixtral-8x7B-Instruct-v0.1-4bit",
  },
  {
    id: "kimi-dev-72b",
    name: "Kimi Dev 72B",
    family: "Kimi",
    parameterCount: "72B",
    sizeCategory: "large",
    sizeGb: 40,
    description: "Moonshot AI's coding-focused Kimi model. Strong at code and reasoning.",
    recommendedUse: "For advanced coding assistants, once you're comfortable with the basics.",
    memoryGuidance: "One of the biggest models here — uses a large portion of your Mac's 128GB, so close other heavy apps before training.",
    ...TRANSFORMER_DEFAULTS,
    exportFormats: ["ollama"],
    repoId: "mlx-community/Kimi-Dev-72B-4bit",
  },
  {
    id: "mamba2-1.3b",
    name: "Mamba2 1.3B",
    family: "Mamba",
    parameterCount: "1.3B",
    sizeCategory: "small",
    sizeGb: 0.8,
    description:
      "A fast-weights state space model. Instead of a growing attention cache, it keeps a fixed-size internal memory it updates as it reads — so long inputs don't slow it down.",
    recommendedUse: "Try the fast-weights approach on quick experiments with long documents.",
    memoryGuidance: "Tiny — comfortable on any modern Mac.",
    architecture: "ssm",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/mamba2-1.3b-4bit",
  },
  {
    id: "falcon3-mamba-7b",
    name: "Falcon3 Mamba 7B",
    family: "Falcon",
    parameterCount: "7B",
    sizeCategory: "medium",
    sizeGb: 4.1,
    description:
      "TII's instruction-tuned pure Mamba model — a full-size chat assistant built entirely on fast-weights state space layers, with no attention cache.",
    recommendedUse: "A capable fast-weights chat model for long-context assistants.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory.",
    architecture: "ssm",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/Falcon3-Mamba-7B-Instruct-4bits",
  },
  {
    id: "mamba-codestral-7b",
    name: "Mamba Codestral 7B",
    family: "Mistral",
    parameterCount: "7B",
    sizeCategory: "medium",
    sizeGb: 4.1,
    description:
      "Mistral's coding model built on the Mamba2 state space architecture — strong code generation with constant-memory long-context handling.",
    recommendedUse: "Fine-tune a fast-weights model on your own code style or snippets.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory.",
    architecture: "ssm",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/Mamba-Codestral-7B-v0.1-4bit",
  },
  {
    id: "rwkv7-2.9b",
    name: "RWKV-7 2.9B",
    family: "RWKV",
    parameterCount: "2.9B",
    sizeCategory: "small",
    sizeGb: 2.2,
    description:
      "The linear-attention RNN family closest to the original 'fast weights' idea: its recurrent state acts as an associative memory updated on every token.",
    recommendedUse: "Explore the classic fast-weights architecture on chat-style data.",
    memoryGuidance: "Comfortable on any modern Mac.",
    architecture: "linear-attention",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mollysama/rwkv7-2.9B-g1d-20260131-ctx8192-mlx-6bit",
  },
  {
    id: "jamba-reasoning-3b",
    name: "Jamba Reasoning 3B",
    family: "Jamba",
    parameterCount: "3B",
    sizeCategory: "small",
    sizeGb: 1.8,
    description:
      "AI21's hybrid model that interleaves Mamba fast-weights layers with a few attention layers — a middle ground between transformers and pure state space models.",
    recommendedUse: "A strong small reasoning model with fast-weights efficiency.",
    memoryGuidance: "Comfortable on any modern Mac.",
    architecture: "hybrid",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/AI21-Jamba-Reasoning-3B-4bit",
  },
  {
    id: "falcon-h1-7b",
    name: "Falcon-H1 7B",
    family: "Falcon",
    parameterCount: "7B",
    sizeCategory: "medium",
    sizeGb: 4.3,
    description:
      "TII's hybrid that runs attention and Mamba fast-weights heads side by side in every layer — transformer quality with state-space efficiency.",
    recommendedUse: "A lightweight hybrid to compare directly against pure transformers of the same size.",
    memoryGuidance: "Runs smoothly on your Mac's 128GB of memory.",
    architecture: "hybrid",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/Falcon-H1-7B-Instruct-4bit",
  },
  {
    id: "granite-4.0-h-small",
    name: "Granite 4.0 H Small",
    family: "Granite",
    parameterCount: "32B (9B active, mixture of experts)",
    sizeCategory: "large",
    sizeGb: 18.1,
    description:
      "IBM's enterprise hybrid: mostly Mamba2 fast-weights layers with a few attention layers, plus a mixture-of-experts design so only 9B parameters run per token.",
    recommendedUse: "A serious mid-size hybrid for assistants that read long documents.",
    memoryGuidance: "Runs comfortably on your Mac's 128GB of memory with room to spare.",
    architecture: "hybrid",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/granite-4.0-h-small-4bit",
  },
  {
    id: "kimi-linear-48b",
    name: "Kimi Linear 48B",
    family: "Kimi",
    parameterCount: "48B (3B active, mixture of experts)",
    sizeCategory: "large",
    sizeGb: 27.6,
    description:
      "Moonshot AI's hybrid built on Kimi Delta Attention — three fast-weights layers for every one full-attention layer, updating a compact memory as it reads.",
    recommendedUse: "A large, modern hybrid for long-context assistants and research-style tasks.",
    memoryGuidance: "A big download (~28GB). Fits easily in your Mac's 128GB, but close other heavy apps while training.",
    architecture: "hybrid",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit",
  },
  {
    id: "qwen3-next-80b",
    name: "Qwen3-Next 80B",
    family: "Qwen",
    parameterCount: "80B (3B active, mixture of experts)",
    sizeCategory: "large",
    sizeGb: 44.9,
    description:
      "The flagship open hybrid: Gated DeltaNet fast-weights layers carry most of the work, with gated attention layers interleaved. 80B parameters total, only 3B active per token.",
    recommendedUse: "The most capable fast-weights model that fits on your Mac — for your most ambitious projects.",
    memoryGuidance: "The biggest model here (~45GB download). Your 128GB handles it, but close everything else while training.",
    architecture: "hybrid",
    ...FAST_WEIGHTS_DEFAULTS,
    repoId: "mlx-community/Qwen3-Next-80B-A3B-Instruct-4bit",
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
