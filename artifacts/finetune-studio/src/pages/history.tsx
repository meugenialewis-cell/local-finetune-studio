import { useListJobs } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Activity, Clock, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function History() {
  const { data: jobs, isLoading } = useListJobs();

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Job History</h1>
          <p className="mt-2 text-muted-foreground text-sm">Past and active training runs.</p>
        </div>
        <Button asChild>
          <Link href="/">New Training Run</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
            <span className="text-muted-foreground text-sm">Loading jobs...</span>
          </div>
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-xl bg-card/50">
          <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium">No training jobs yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-6">Start your first fine-tuning run to see it here.</p>
          <Button asChild variant="outline">
            <Link href="/">Get Started</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="bg-card border border-card-border rounded-xl p-5 hover:border-primary/30 transition-colors group flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-medium text-lg">{job.name}</h3>
                  <div className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider
                    ${job.status === "completed" || job.status === "exported" ? "bg-green-500/10 text-green-500" : ""}
                    ${job.status === "failed" || job.status === "cancelled" ? "bg-destructive/10 text-destructive" : ""}
                    ${job.status === "training" || job.status === "preparing" ? "bg-primary/10 text-primary animate-pulse" : ""}
                    ${job.status === "queued" ? "bg-secondary text-secondary-foreground" : ""}
                  `}>
                    {job.status}
                  </div>
                  {job.simulated && (
                    <div className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-500">SIMULATED</div>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="opacity-70">Model:</span> <span className="text-foreground">{job.modelName}</span>
                  </div>
                  <div>
                    <span className="opacity-70">Dataset:</span> <span className="text-foreground">{job.datasetName}</span>
                  </div>
                  <div>
                    <span className="opacity-70">Started:</span> <span className="text-foreground">{format(new Date(job.createdAt), "MMM d, h:mm a")}</span>
                  </div>
                </div>

                {job.status === "failed" && job.error && (
                  <div className="mt-3 text-sm text-destructive flex items-start gap-2 bg-destructive/5 p-3 rounded-md">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{job.error}</span>
                  </div>
                )}
                
                {job.status === "training" && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-primary font-medium">{job.statusMessage}</span>
                      <span className="text-muted-foreground">Epoch {job.currentEpoch}/{job.totalEpochs} ({Math.round(job.progress)}%)</span>
                    </div>
                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
              
              <div className="ml-8 shrink-0 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  View Details
                </Button>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}