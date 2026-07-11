import { useWizard } from "./wizard-context";
import { useGetJob, useExportJob, useGetModel, getGetJobQueryKey, getGetModelQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Box, Download, Settings2, Package, ArrowRight, RotateCcw, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

export function Step5Export() {
  const { jobId, setCurrentStep } = useWizard();
  const { data: job, refetch } = useGetJob(jobId || "", {
    query: {
      enabled: !!jobId,
      queryKey: getGetJobQueryKey(jobId || ""),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "exporting" ? 1500 : false;
      },
    },
  });
  const { data: model } = useGetModel(job?.modelId || "", {
    query: {
      enabled: !!job?.modelId,
      queryKey: getGetModelQueryKey(job?.modelId || ""),
    },
  });
  const exportJob = useExportJob();
  const [format, setFormat] = useState<"gguf" | "ollama">("gguf");

  const exportFormats = model?.exportFormats;
  const ggufAvailable = !exportFormats || exportFormats.includes("gguf");
  const ollamaAvailable = !exportFormats || exportFormats.includes("ollama");
  const noExportAvailable = !!exportFormats && exportFormats.length === 0;

  // If the selected format isn't available for this model's architecture,
  // switch to one that is.
  useEffect(() => {
    if (!exportFormats || exportFormats.length === 0) return;
    if (format === "gguf" && !ggufAvailable) setFormat("ollama");
    if (format === "ollama" && !ollamaAvailable) setFormat("gguf");
  }, [exportFormats, format, ggufAvailable, ollamaAvailable]);

  const handleExport = () => {
    if (!jobId) return;
    exportJob.mutate({
      jobId,
      data: { format }
    }, {
      onSuccess: () => {
        refetch();
      }
    });
  };

  if (!job) return null;

  const isExporting = job.status === "exporting" || exportJob.isPending;
  const isExported = job.status === "exported";

  if (noExportAvailable) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8">
          <h2 className="text-2xl font-light tracking-tight mb-2">Training Complete</h2>
          <p className="text-muted-foreground text-sm">Your fine-tuned adapter is saved. Here's how to use it with this model.</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-2">GGUF and Ollama packaging aren't available for this architecture yet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {job.modelName} is a fast-weights model, and the packaging tools that produce GGUF files and Ollama
                models don't support converting its fused weights yet. Nothing is lost — your fine-tuned adapter is
                saved on your Mac and runs natively with MLX.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To chat with your fine-tuned model, run this in Terminal on your Mac:
              </p>
              <pre className="mt-2 rounded-md bg-background border border-border p-3 text-xs overflow-x-auto">
                <code>python3 -m mlx_lm.generate --model &lt;base model folder&gt; --adapter-path &lt;adapter folder&gt; --prompt "Hello!"</code>
              </pre>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-8 border-t border-border">
          <Button variant="ghost" asChild>
            <Link href="/history">View Job History</Link>
          </Button>
          <Button variant="outline" onClick={() => {
            setCurrentStep(1);
            window.location.reload(); // Simple state reset for new run
          }}>
            <RotateCcw className="w-4 h-4 mr-2" /> Start New Run
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-light tracking-tight mb-2">Export Model</h2>
        <p className="text-muted-foreground text-sm">Your model is fully trained. Export it to a usable format for local inference.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div 
          className={`border rounded-xl p-6 transition-all ${
            !ggufAvailable
              ? "border-border bg-card opacity-50 cursor-not-allowed"
              : format === "gguf"
                ? "border-primary bg-primary/5 shadow-md cursor-pointer"
                : "border-border bg-card hover:border-primary/50 cursor-pointer"
          }`}
          onClick={() => ggufAvailable && !isExporting && !isExported && setFormat("gguf")}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded bg-primary/20 text-primary`}>
              <Box className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium">GGUF Format</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Standard format for local inference. Compatible with LM Studio, llama.cpp, and Jan.
          </p>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2"><ArrowRight className="w-3 h-3 text-primary" /> Single file deployment</li>
            <li className="flex items-center gap-2"><ArrowRight className="w-3 h-3 text-primary" /> Highly optimized for Apple Silicon</li>
            <li className="flex items-center gap-2"><ArrowRight className="w-3 h-3 text-primary" /> Int4 quantization applied</li>
          </ul>
          {!ggufAvailable && (
            <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">Not available for this model's architecture.</p>
          )}
        </div>

        <div 
          className={`border rounded-xl p-6 transition-all ${
            !ollamaAvailable
              ? "border-border bg-card opacity-50 cursor-not-allowed"
              : format === "ollama"
                ? "border-primary bg-primary/5 shadow-md cursor-pointer"
                : "border-border bg-card hover:border-primary/50 cursor-pointer"
          }`}
          onClick={() => ollamaAvailable && !isExporting && !isExported && setFormat("ollama")}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded bg-primary/20 text-primary`}>
              <Package className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium">Ollama Modelfile</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Directly register the model with your local Ollama installation for easy CLI use.
          </p>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2"><ArrowRight className="w-3 h-3 text-primary" /> Seamless Ollama integration</li>
            <li className="flex items-center gap-2"><ArrowRight className="w-3 h-3 text-primary" /> Generates optimal Modelfile</li>
            <li className="flex items-center gap-2"><ArrowRight className="w-3 h-3 text-primary" /> Ready for API usage immediately</li>
          </ul>
          {!ollamaAvailable && (
            <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">Not available for this model's architecture.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-8 bg-card border border-card-border rounded-xl">
        {isExported ? (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto">
              <Download className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-medium mb-2">Ready for Download</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">Your model has been compiled to {job.exportFormat?.toUpperCase()} and is ready to use.</p>
            </div>
            <Button size="lg" asChild className="px-8">
              <a href={`/api/jobs/${jobId}/export/download`} download>
                <Download className="w-5 h-5 mr-2" /> Download {job.exportFormat?.toUpperCase()}
              </a>
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-6 w-full max-w-md">
            <Settings2 className={`w-12 h-12 mx-auto text-muted-foreground/50 ${isExporting ? 'animate-spin' : ''}`} />
            <div>
              <h3 className="text-xl font-medium mb-2">{isExporting ? 'Exporting Model...' : 'Ready to Export'}</h3>
              <p className="text-muted-foreground text-sm">
                {isExporting 
                  ? 'Compiling weights and applying final optimizations. This may take a minute.'
                  : `Export the fine-tuned adapter merged with ${job.modelName} into a standalone format.`}
              </p>
            </div>
            
            {!isExporting && (
              <Button size="lg" className="w-full" onClick={handleExport}>
                Compile & Export as {format.toUpperCase()}
              </Button>
            )}

            {exportJob.isError && !isExporting && (
              <p className="text-sm text-destructive">
                {(exportJob.error as { data?: { message?: string } } | null)?.data?.message ||
                  (exportJob.error as Error | null)?.message ||
                  "Export failed. Please try again."}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-8 mt-8 border-t border-border">
        <Button variant="ghost" asChild>
          <Link href="/history">View Job History</Link>
        </Button>
        <Button variant="outline" onClick={() => {
          setCurrentStep(1);
          window.location.reload(); // Simple state reset for new run
        }}>
          <RotateCcw className="w-4 h-4 mr-2" /> Start New Run
        </Button>
      </div>
    </div>
  );
}
