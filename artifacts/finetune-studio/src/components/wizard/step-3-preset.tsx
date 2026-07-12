import { useWizard } from "./wizard-context";
import { useListPresets, useListJobs, useCreateJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Clock, Sliders, Play, BrainCircuit, AlertCircle, GitBranch } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setLastUsedPresetId } from "@/lib/last-preset";

export function Step3Preset() {
  const { presetId, setPresetId, setCurrentStep, modelId, datasetId, jobName, setJobName, setJobId, parentJobId } = useWizard();
  const { data: presets, isLoading } = useListPresets();
  const { data: jobs } = useListJobs();
  const createJob = useCreateJob();
  const [localJobName, setLocalJobName] = useState(jobName || `Fine-tune ${new Date().toISOString().split('T')[0]}`);

  const parentJob = parentJobId ? (jobs ?? []).find((j) => j.id === parentJobId) : undefined;

  const handleStartTraining = () => {
    if (!modelId || !datasetId || !presetId) return;
    
    setJobName(localJobName);
    
    createJob.mutate({
      data: {
        name: localJobName,
        modelId,
        datasetId,
        presetId,
        parentJobId: parentJobId ?? null
      }
    }, {
      onSuccess: (data) => {
        setLastUsedPresetId(presetId);
        setJobId(data.id);
        setCurrentStep(4);
      }
    });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-light tracking-tight mb-2">Configure Training</h2>
        <p className="text-muted-foreground text-sm">Select a training profile that matches your goals and time constraints.</p>
      </div>

      {parentJob && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-3">
          <GitBranch className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            This run continues from <span className="font-medium text-foreground">{parentJob.name}</span> —
            training starts from that run's result, so the model keeps what it learned and adds
            your new dataset on top. To stay compatible, the LoRA rank of the previous run is kept
            even if the preset below lists a different one.
          </span>
        </div>
      )}

      <div className="mb-8 max-w-md">
        <Label htmlFor="jobName" className="mb-2 block">Name this training run</Label>
        <Input 
          id="jobName" 
          value={localJobName} 
          onChange={(e) => setLocalJobName(e.target.value)} 
          className="bg-card"
          placeholder="e.g. Creative Writing Model v1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-secondary animate-pulse"></div>
          ))
        ) : presets?.map((preset) => {
          const isSelected = presetId === preset.id;
          
          return (
            <div
              key={preset.id}
              className={`relative overflow-hidden flex flex-col rounded-xl border p-6 transition-all cursor-pointer ${
                isSelected 
                  ? "border-primary bg-primary/5 shadow-md" 
                  : "border-border bg-card hover:border-primary/50 hover:bg-card/80"
              }`}
              onClick={() => setPresetId(preset.id)}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2.5 rounded-lg shrink-0 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-lg leading-tight">{preset.name}</h3>
              </div>
              
              <p className="text-sm text-muted-foreground flex-1 mb-6">{preset.description}</p>
              
              <div className="space-y-3 pt-4 border-t border-border/50 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> Estimated time</span>
                  <span className="font-medium text-foreground">{preset.estimatedTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2"><Sliders className="w-4 h-4" /> Epochs</span>
                  <span className="font-medium text-foreground">{preset.epochs}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2"><Sliders className="w-4 h-4" /> LoRA Rank</span>
                  <span className="font-medium text-foreground">{preset.loraRank}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {createJob.isError && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium mb-1">Failed to start training</div>
            <div className="text-sm opacity-90">
              {(createJob.error as { data?: { message?: string } } | null)?.data?.message ??
                "There was a problem initializing the training job. Please check your system status and try again."}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-border">
        <Button variant="ghost" onClick={() => setCurrentStep(2)}>Back</Button>
        <Button 
          size="lg" 
          onClick={handleStartTraining}
          disabled={!presetId || !localJobName.trim() || createJob.isPending}
          className="gap-2"
        >
          {createJob.isPending ? "Starting..." : (
            <>
              <Play className="w-4 h-4" /> Start Training
            </>
          )}
        </Button>
      </div>
    </div>
  );
}