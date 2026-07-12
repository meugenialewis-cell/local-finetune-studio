import { useWizard } from "./wizard-context";
import { useGetJob, useCancelJob, getGetJobQueryKey } from "@workspace/api-client-react";
import { useJobEventsSSE } from "@/lib/sse";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, XCircle, RotateCcw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function Step4Training() {
  const { jobId, setCurrentStep } = useWizard();
  const { data: jobInitial, isLoading } = useGetJob(jobId || "", {
    query: { enabled: !!jobId, queryKey: getGetJobQueryKey(jobId || "") },
  });
  const { data: liveJob, connectionStatus } = useJobEventsSSE(jobId || undefined);
  const cancelJob = useCancelJob();
  const reconnecting = connectionStatus === "reconnecting";

  // Merge live data over initial data
  const job = { ...jobInitial, ...liveJob };

  if (isLoading && !job.id) {
    return <div className="py-20 text-center text-muted-foreground animate-pulse">Initializing training environment...</div>;
  }

  const isComplete = job.status === "completed" || job.status === "exported" || job.status === "exporting";
  const isFailed = job.status === "failed";
  const isCancelled = job.status === "cancelled";
  const isTraining = job.status === "training" || job.status === "preparing" || job.status === "queued";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-light tracking-tight mb-2">Training Status</h2>
        <p className="text-muted-foreground text-sm">Monitor your model's fine-tuning progress.</p>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-8 mb-8 relative overflow-hidden">
        {reconnecting ? (
          <div className="absolute top-0 inset-x-0 bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 text-xs font-semibold py-1 text-center tracking-widest uppercase" data-testid="banner-reconnecting">
            Connection lost — reconnecting…
          </div>
        ) : job.simulated ? (
          <div className="absolute top-0 inset-x-0 bg-yellow-500/10 text-yellow-500 text-xs font-semibold py-1 text-center tracking-widest uppercase">
            Simulation Mode Active
          </div>
        ) : null}
        
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start pt-4">
          <div className="shrink-0 relative">
            <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center bg-background
              ${isComplete ? 'border-green-500 text-green-500' : ''}
              ${isFailed || isCancelled ? 'border-destructive text-destructive' : ''}
              ${isTraining ? 'border-primary text-primary' : ''}
            `}>
              {isComplete ? (
                <CheckCircle2 className="w-12 h-12" />
              ) : isFailed || isCancelled ? (
                <XCircle className="w-12 h-12" />
              ) : (
                <div className="text-center">
                  <div className="text-3xl font-light">{Math.round(job.progress || 0)}<span className="text-xl">%</span></div>
                </div>
              )}
            </div>
            
            {isTraining && (
              <svg className="absolute inset-0 w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="4" strokeDasharray="289" strokeDashoffset={289 - (289 * (job.progress || 0)) / 100} className="text-primary transition-all duration-500" />
              </svg>
            )}
          </div>

          <div className="flex-1 space-y-6 w-full">
            <div>
              <h3 className="text-xl font-medium mb-1">{job.name}</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded font-medium uppercase tracking-wider text-[10px]
                  ${isComplete ? 'bg-green-500/10 text-green-500' : ''}
                  ${isFailed || isCancelled ? 'bg-destructive/10 text-destructive' : ''}
                  ${isTraining ? 'bg-primary/10 text-primary animate-pulse' : ''}
                `}>
                  {job.status}
                </span>
                <span className="text-muted-foreground">
                  • {reconnecting ? "Reconnecting to the live progress stream…" : job.statusMessage}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-secondary/50 border border-border/50 text-sm">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Epoch</div>
                <div className="font-mono text-foreground font-medium">{job.currentEpoch || 0} / {job.totalEpochs || '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Loss</div>
                <div className="font-mono text-foreground font-medium">{job.loss !== null && job.loss !== undefined ? job.loss.toFixed(4) : '-.----'}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Time Left</div>
                <div className="font-mono text-foreground font-medium">
                  {job.etaSeconds !== null && job.etaSeconds !== undefined 
                    ? `${Math.floor(job.etaSeconds / 60)}m ${job.etaSeconds % 60}s` 
                    : '--:--'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Base Model</div>
                <div className="text-foreground font-medium truncate" title={job.modelName}>{job.modelName}</div>
              </div>
            </div>

            {job.lossHistory && job.lossHistory.length > 1 && (
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Training Loss</div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={job.lossHistory.map((loss, i) => ({ step: i + 1, loss }))}>
                      <XAxis dataKey="step" hide />
                      <YAxis domain={["auto", "auto"]} hide />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                        formatter={(value: number) => [value.toFixed(3), "Loss"]}
                        labelFormatter={(label) => `Step ${label}`}
                      />
                      <Line type="monotone" dataKey="loss" stroke="currentColor" className="text-primary" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {(isFailed || isCancelled) && job.error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-1">Training {isCancelled ? "Cancelled" : "Failed"}</div>
                  <div className="opacity-90 leading-relaxed">{job.error}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {job.logs && job.logs.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border/50">
            <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Activity Log
            </div>
            <div className="bg-background border border-border/50 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1">
              {job.logs.slice(-30).map((line, i) => (
                <div key={i} className="text-muted-foreground">{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t border-border">
        <div>
          {isTraining && (
            <Button 
              variant="outline" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => {
                if (job.id && confirm("Are you sure you want to cancel this training run?")) {
                  cancelJob.mutate({ jobId: job.id });
                }
              }}
              disabled={cancelJob.isPending}
            >
              {cancelJob.isPending ? "Cancelling..." : "Cancel Training"}
            </Button>
          )}
          {(isFailed || isCancelled) && (
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <RotateCcw className="w-4 h-4 mr-2" /> Start New Run
            </Button>
          )}
        </div>
        <Button 
          size="lg" 
          onClick={() => setCurrentStep(5)}
          disabled={!isComplete}
          className={isComplete ? "animate-pulse" : ""}
        >
          Continue to Export <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}