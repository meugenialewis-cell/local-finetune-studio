import { useState, useRef } from "react";
import { useWizard } from "./wizard-context";
import { useListDatasets, useUploadDataset, useDeleteDataset, getListDatasetsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Trash2, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export function Step2Dataset() {
  const { datasetId, setDatasetId, setCurrentStep } = useWizard();
  const { data: datasets, isLoading } = useListDatasets();
  const queryClient = useQueryClient();
  const uploadDataset = useUploadDataset();
  const deleteDataset = useDeleteDataset();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = (file: File) => {
    uploadDataset.mutate({ data: { file, name: file.name } }, {
      onSuccess: (data) => {
        setDatasetId(data.id);
        queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
      }
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-light tracking-tight mb-2">Upload Dataset</h2>
        <p className="text-muted-foreground text-sm">Provide a JSONL file with prompt and response pairs to teach the model its new behavior.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div>
          <div 
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer
              ${dragActive ? 'border-primary bg-primary/5' : 'border-border bg-card/50 hover:border-primary/50 hover:bg-card'}
              ${uploadDataset.isPending ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".jsonl,.json,.csv" 
              onChange={handleFileChange}
            />
            
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
              <UploadCloud className="w-8 h-8" />
            </div>
            
            {uploadDataset.isPending ? (
              <div>
                <h3 className="text-lg font-medium mb-1">Uploading...</h3>
                <p className="text-sm text-muted-foreground">Please wait while we process your dataset.</p>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-medium mb-1">Click or drag file here</h3>
                <p className="text-sm text-muted-foreground mb-4">Accepts CSV or JSONL format (max 50MB)</p>
                <Button variant="secondary" size="sm">Select File</Button>
              </div>
            )}
          </div>
          
          {uploadDataset.isError && (
            <div className="mt-4 text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Failed to upload dataset. Ensure it is a valid JSONL file with 'prompt' and 'response' keys.</span>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Available Datasets</h3>
          
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-20 bg-secondary rounded-xl"></div>
              <div className="h-20 bg-secondary rounded-xl"></div>
            </div>
          ) : datasets && datasets.length > 0 ? (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {datasets.map(dataset => (
                <div 
                  key={dataset.id}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer group ${
                    datasetId === dataset.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border bg-card hover:border-primary/30'
                  }`}
                  onClick={() => {
                    if (dataset.status === 'ready') setDatasetId(dataset.id);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${datasetId === dataset.id ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {dataset.name}
                          {dataset.status === 'validating' && <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded font-semibold uppercase tracking-wider animate-pulse">Validating</span>}
                          {dataset.status === 'invalid' && <span className="text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">Invalid</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {dataset.rowCount} rows • {(dataset.sizeBytes / 1024 / 1024).toFixed(2)} MB • {formatDistanceToNow(new Date(dataset.createdAt), {addSuffix: true})}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {datasetId === dataset.id && dataset.status === 'ready' && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDataset.mutate({ datasetId: dataset.id }, {
                            onSuccess: () => {
                              if (datasetId === dataset.id) setDatasetId(null);
                              queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
                            }
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {dataset.status === 'invalid' && dataset.error && (
                    <div className="mt-3 text-xs text-destructive flex gap-1.5 items-start">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{dataset.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-xl bg-card/30">
              <FileText className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No datasets uploaded yet.</p>
            </div>
          )}
        </div>
      </div>

      {(() => {
        const selected = datasets?.find((d) => d.id === datasetId);
        if (!selected || selected.status !== "ready" || selected.preview.length === 0) return null;
        return (
          <div className="mb-8">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
              Preview — first {Math.min(5, selected.preview.length)} rows
            </h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left font-medium px-4 py-2 w-1/2">Prompt</th>
                    <th className="text-left font-medium px-4 py-2 w-1/2">Response</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.preview.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-4 py-2 align-top text-muted-foreground truncate max-w-xs">{row.prompt}</td>
                      <td className="px-4 py-2 align-top text-muted-foreground truncate max-w-xs">{row.response}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <div className="flex justify-between pt-4 border-t border-border">
        <Button variant="ghost" onClick={() => setCurrentStep(1)}>Back</Button>
        <Button 
          size="lg" 
          onClick={() => setCurrentStep(3)}
          disabled={!datasetId || datasets?.find(d => d.id === datasetId)?.status !== 'ready'}
        >
          Continue to Preset
        </Button>
      </div>
    </div>
  );
}