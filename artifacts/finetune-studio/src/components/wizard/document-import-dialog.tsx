import { useEffect, useState } from "react";
import {
  useConvertDocument,
  useCreateDatasetFromRows,
  getListDatasetsQueryKey,
  type DatasetRow,
  type DocumentConversionMode,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, FileText, Scissors, Trash2, Wand2 } from "lucide-react";

interface DocumentImportDialogProps {
  file: File | null;
  onClose: () => void;
  onCreated: (datasetId: string) => void;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Something went wrong. Please try again.";
}

const MODE_OPTIONS: {
  value: DocumentConversionMode;
  title: string;
  description: string;
  icon: typeof Wand2;
}[] = [
  {
    value: "smart",
    title: "Smart splitting",
    description:
      "Uses your headings and paragraphs to build examples, tidying as it goes — very long sections are split up and tiny fragments merged.",
    icon: Wand2,
  },
  {
    value: "verbatim",
    title: "As-is (keep my formatting)",
    description:
      "Keeps your text exactly as written — nothing merged, split or reworded. Headings (or \"Prompt:\" / \"Response:\" labels) define each example.",
    icon: Scissors,
  },
];

export function DocumentImportDialog({ file, onClose, onCreated }: DocumentImportDialogProps) {
  const queryClient = useQueryClient();
  const convertDocument = useConvertDocument();
  const createDataset = useCreateDatasetFromRows();

  const [stage, setStage] = useState<"mode" | "review">("mode");
  const [mode, setMode] = useState<DocumentConversionMode>("smart");
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (file) {
      setStage("mode");
      setMode("smart");
      setRows([]);
      setWarnings([]);
      setName(file.name.replace(/\.[^.]+$/, ""));
      convertDocument.reset();
      createDataset.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!file) return null;

  const handleConvert = () => {
    convertDocument.mutate(
      { data: { file, mode } },
      {
        onSuccess: (data) => {
          setRows(data.rows.map((r) => ({ ...r })));
          setWarnings(data.warnings);
          setStage("review");
        },
      },
    );
  };

  const updateRow = (index: number, field: keyof DatasetRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const hasEmptyField = rows.some((r) => !r.prompt.trim() || !r.response.trim());
  const canCreate = rows.length > 0 && !hasEmptyField && name.trim().length > 0;

  const handleCreate = () => {
    createDataset.mutate(
      { data: { name: name.trim(), rows } },
      {
        onSuccess: (dataset) => {
          queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
          onCreated(dataset.id);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Convert document to dataset
          </DialogTitle>
          <DialogDescription className="truncate">{file.name}</DialogDescription>
        </DialogHeader>

        {stage === "mode" && (
          <>
            <div className="space-y-3">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors flex gap-3 items-start ${
                    mode === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${mode === option.value ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                    <option.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{option.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{option.description}</div>
                  </div>
                </button>
              ))}
            </div>

            {convertDocument.isError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage(convertDocument.error)}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleConvert} disabled={convertDocument.isPending}>
                {convertDocument.isPending ? "Converting..." : "Convert"}
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === "review" && (
          <>
            <div className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium shrink-0" htmlFor="doc-dataset-name">Dataset name</label>
                <Input
                  id="doc-dataset-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Product manual"
                />
              </div>

              {warnings.length > 0 && (
                <div className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 p-3 rounded-md space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                {rows.length} example{rows.length === 1 ? "" : "s"} will be created. Review and edit them before saving.
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 space-y-3 pr-2">
                {rows.map((row, i) => (
                  <div key={i} className="p-3 rounded-xl border border-border bg-card/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Example {i + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(i)}
                        aria-label={`Delete example ${i + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Prompt</label>
                        <Textarea
                          value={row.prompt}
                          onChange={(e) => updateRow(i, "prompt", e.target.value)}
                          className={`mt-1 text-sm min-h-[70px] ${!row.prompt.trim() ? "border-destructive" : ""}`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Response</label>
                        <Textarea
                          value={row.response}
                          onChange={(e) => updateRow(i, "response", e.target.value)}
                          className={`mt-1 text-sm min-h-[70px] ${!row.response.trim() ? "border-destructive" : ""}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {rows.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    All examples were removed. Go back and convert again, or cancel.
                  </div>
                )}
              </div>

              {createDataset.isError && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage(createDataset.error)}</span>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setStage("mode")}>Back</Button>
              <Button onClick={handleCreate} disabled={!canCreate || createDataset.isPending}>
                {createDataset.isPending ? "Saving..." : `Create dataset (${rows.length})`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
