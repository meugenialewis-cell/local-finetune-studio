import { useListModels, useStartModelDownload, getGetModelQueryKey } from "@workspace/api-client-react";
import { useWizard } from "./wizard-context";
import { useModelDownloadSSE } from "@/lib/sse";
import { CheckCircle2, Download, AlertCircle, Box, HardDrive, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

export function Step1Model() {
  const { data: models, isLoading } = useListModels();
  const { modelId, setModelId, setCurrentStep } = useWizard();
  const startDownload = useStartModelDownload();
  const queryClient = useQueryClient();

  const selectedModelStream = useModelDownloadSSE(modelId || undefined);

  if (isLoading) {
    return <div className="text-center py-20 animate-pulse text-muted-foreground">Loading models...</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-light tracking-tight mb-2">Select a Base Model</h2>
        <p className="text-muted-foreground text-sm">Choose the foundation for your fine-tuning. Larger models offer better reasoning but require more memory.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-8">
        {models?.map((model) => {
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