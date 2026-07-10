import { useState } from "react";
import { useGetSystemStatus } from "@workspace/api-client-react";
import { Terminal, Apple, HardDrive, CheckCircle2, AlertTriangle, Settings2 } from "lucide-react";

export default function Settings() {
  const { data: status, isLoading } = useGetSystemStatus();
  const [copied, setCopied] = useState(false);

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <div className="mb-10">
        <h1 className="text-3xl font-light tracking-tight">System Configuration</h1>
        <p className="mt-2 text-muted-foreground text-sm">Manage your local training environment.</p>
      </div>

      <div className="grid gap-8">
        <section>
          <h2 className="text-xl font-medium mb-4 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Environment Status
          </h2>
          
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Checking system...</div>
            ) : status ? (
              <div className="divide-y divide-border">
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${status.isAppleSilicon ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                      <Apple className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-medium">Apple Silicon Architecture</div>
                      <div className="text-sm text-muted-foreground">Required for MLX hardware acceleration</div>
                    </div>
                  </div>
                  <div>
                    {status.isAppleSilicon ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-destructive" />
                    )}
                  </div>
                </div>

                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${status.trainingBackendReady ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                      <Terminal className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-medium">MLX Training Backend</div>
                      <div className="text-sm text-muted-foreground">{status.message}</div>
                    </div>
                  </div>
                  <div>
                    {status.trainingBackendReady ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div className="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-xs font-medium rounded-full">SIMULATION MODE</div>
                    )}
                  </div>
                </div>

                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${status.freeDiskGb > 20 ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                      <HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-medium">Available Storage</div>
                      <div className="text-sm text-muted-foreground">Base models and datasets require significant space</div>
                    </div>
                  </div>
                  <div className="font-mono text-sm">
                    {Math.round(status.freeDiskGb)} GB Free
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {!status?.trainingBackendReady && (
          <section className="bg-primary/5 border border-primary/20 rounded-xl p-6">
            <h3 className="text-lg font-medium text-primary mb-2">Setup Local Training</h3>
            <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
              You are currently running in simulation mode. To perform real fine-tuning on your Mac, you need to install the MLX training dependencies. Open your terminal and run the following command:
            </p>
            <div className="bg-background/50 border border-border rounded-lg p-4 font-mono text-sm text-foreground overflow-x-auto relative group">
              <code>pip install mlx-lm huggingface_hub</code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText("pip install mlx-lm huggingface_hub");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="absolute top-2 right-2 p-2 bg-card rounded-md border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent text-xs"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Restart the application after installation is complete to exit simulation mode.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}