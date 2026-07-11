import { useListModels, useStartModelDownload, getGetModelQueryKey, getListModelsQueryKey } from "@workspace/api-client-react";
import { useWizard } from "./wizard-context";
import { useModelDownloadSSE } from "@/lib/sse";
import { CheckCircle2, Download, AlertCircle, Box, HardDrive, Zap, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

const ARCH_INFO: Record<string, { label: string; badgeClass: string; fastWeights: boolean }> = {
  transformer: { label: "Transformer", badgeClass: "bg-secondary text-muted-foreground", fastWeights: false },
  ssm: { label: "State Space", badgeClass: "bg-violet-500/10 text-violet-500", fastWeights: true },
  "linear-attention": { label: "Linear Attention", badgeClass: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", fastWeights: true },
  hybrid: { label: "Hybrid", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400", fastWeights: true },
};

type ArchFilter = "all" | "transformer" | "fast-weights";

export function Step1Model() {
  const { data: models, isLoading } = useListModels();
  const { modelId, setModelId, setCurrentStep } = useWizard();
  const startDownload = useStartModelDownload();
  const queryClient = useQueryClient();
  const [archFilter, setArchFilter] = useState<ArchFilter>("all");
  const [showExplainer, setShowExplainer] = useState(false);

  const selectedModelStream = useModelDownloadSSE(modelId || undefined);
  const lastSyncedStatus = useRef<string | undefined>(undefined);

  // Keep the models list cache in sync with the live SSE stream so the
  // "Continue" gating (which reads from the list query) reflects reality.
  useEffect(() => {
    if (!modelId || !selectedModelStream.status) return;
    if (lastSyncedStatus.current === selectedModelStream.status) return;
    lastSyncedStatus.current = selectedModelStream.status;

    queryClient.setQueryData(getGetModelQueryKey(modelId), selectedModelStream);
    if (selectedModelStream.status === "ready" || selectedModelStream.status === "failed") {
      queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
    } else {
      queryClient.setQueryData(getListModelsQueryKey(), (old: any) =>
        Array.isArray(old)
          ? old.map((m) => (m.id === modelId ? { ...m, ...selectedModelStream } : m))
          : old
      );
    }
  }, [modelId, selectedModelStream.status, selectedModelStream.downloadProgress, queryClient]);

  if (isLoading) {
    return <div className="text-center py-20 animate-pulse text-muted-foreground">Loading models...</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-light tracking-tight mb-2">Select a Base Model</h2>
        <p className="text-muted-foreground text-sm">Choose the foundation for your fine-tuning. Larger models offer better reasoning but require more memory.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([
          ["all", "All models"],
          ["transformer", "Transformers"],
          ["fast-weights", "Fast weights"],
        ] as [ArchFilter, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setArchFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              archFilter === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowExplainer((v) => !v)}
          className="ml-auto flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Sparkles className="w-3.5 h-3.5" /> What are fast-weights models?
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExplainer ? "rotate-180" : ""}`} />
        </button>
      </div>

      {showExplainer && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm leading-relaxed text-muted-foreground animate-in fade-in duration-300">
          <p className="mb-2">
            <span className="font-medium text-foreground">Fast-weights models</span> — the ones tagged{" "}
            <span className="text-violet-500 font-medium">State Space</span>,{" "}
            <span className="text-cyan-600 dark:text-cyan-400 font-medium">Linear Attention</span> or{" "}
            <span className="text-amber-600 dark:text-amber-400 font-medium">Hybrid</span> — work differently from
            standard transformers. Instead of keeping an ever-growing record of everything they've read, they maintain a
            fixed-size internal memory that updates with every new word — like fast-changing weights layered on top of the
            model's permanent knowledge.
          </p>
          <p>
            The payoff: long documents don't slow them down or fill up memory. The trade-off: LoRA fine-tuning for them is
            newer territory, so they're marked{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">Experimental</span> here — training works the
            same way, but results are less battle-tested, and exporting to GGUF or Ollama isn't available for them yet.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-8">
        {models?.filter((model) => {
          if (archFilter === "all") return true;
          const fast = ARCH_INFO[model.architecture]?.fastWeights ?? false;
          return archFilter === "fast-weights" ? fast : !fast;
        }).map((model) => {
          const isSelected = modelId === model.id;
          const liveData = isSelected && selectedModelStream.id === model.id ? selectedModelStream : model;
          const isReady = liveData.status === "ready";
          const isDownloading = liveData.status === "downloading";
          const isFailed = liveData.status === "failed";

          return (
            <div
              key={model.id}
              className={`relative overflow-hidden rounded-xl border p-5 transition-all cursor-pointer ${
                isSelected 
                  ? "border-primary bg-primary/5 shadow-md" 
                  : "border-border bg-card hover:border-primary/50 hover:bg-card/80"
              }`}
              onClick={() => {
                if (!isDownloading) setModelId(model.id);
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-4">
                  <div className={`p-3 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    <Box className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-lg">{model.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-secondary text-muted-foreground uppercase tracking-wider">
                        {model.family}
                      </span>
                      {model.architecture !== "transformer" && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${ARCH_INFO[model.architecture]?.badgeClass ?? "bg-secondary text-muted-foreground"}`}>
                          {ARCH_INFO[model.architecture]?.label ?? model.architecture}
                        </span>
                      )}
                      {model.fineTuneSupport === "experimental" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Experimental
                        </span>
                      )}
                      {isReady && <span className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-green-500 bg-green-500/10 px-2 py-0.5 rounded"><CheckCircle2 className="w-3 h-3" /> Ready</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 mb-3 leading-relaxed max-w-2xl">{model.description}</p>
                    
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Zap className="w-3.5 h-3.5" /> {model.parameterCount} Params
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <HardDrive className="w-3.5 h-3.5" /> {model.sizeGb} GB
                      </div>
                      <div className="px-2 py-0.5 rounded bg-background border border-border text-muted-foreground">
                        {model.memoryGuidance}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  {isDownloading ? (
                    <div className="flex flex-col items-end gap-1 w-32">
                      <div className="flex justify-between text-xs w-full text-primary font-medium">
                        <span>Downloading</span>
                        <span>{Math.round(liveData.downloadProgress || 0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${liveData.downloadProgress || 0}%` }} />
                      </div>
                    </div>
                  ) : isFailed ? (
                    <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                      <AlertCircle className="w-4 h-4" /> Failed
                    </div>
                  ) : !isReady && isSelected ? (
                    <Button 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        startDownload.mutate({ modelId: model.id }, {
                          onSuccess: (updatedModel) => {
                            queryClient.setQueryData(getGetModelQueryKey(model.id), updatedModel);
                          }
                        });
                      }}
                      disabled={startDownload.isPending}
                    >
                      <Download className="w-4 h-4 mr-2" /> Download
                    </Button>
                  ) : null}
                  
                  {isReady && isSelected && (
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
              
              {isFailed && liveData.error && (
                <div className="mt-4 text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{liveData.error}. Try downloading again or check your internet connection.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-4 border-t border-border">
        <Button 
          size="lg" 
          onClick={() => setCurrentStep(2)}
          disabled={!modelId || models?.find(m => m.id === modelId)?.status !== "ready"}
        >
          Continue to Dataset
        </Button>
      </div>
    </div>
  );
}