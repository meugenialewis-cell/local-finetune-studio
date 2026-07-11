import { useState } from "react";
import {
  getChatSession,
  useCreateDatasetFromTranscripts,
  getListDatasetsQueryKey,
} from "@workspace/api-client-react";
import type { ChatSession, ChatMessage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Brain, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Exchange {
  prompt: string;
  response: string;
}

/** Mirrors the server-side pairing: each user message + the assistant reply that followed. */
function extractExchanges(messages: ChatMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== "user") continue;
    const next = messages[i + 1];
    if (next && next.role === "assistant" && next.content.trim().length > 0) {
      exchanges.push({ prompt: msg.content, response: next.content });
    }
  }
  return exchanges;
}

interface SessionSummary {
  id: string;
  title: string;
  modelName: string;
  messageCount: number;
  createdAt: string;
}

export function TranscriptsToDatasetDialog({
  open,
  onOpenChange,
  sessions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionSummary[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createDataset = useCreateDatasetFromTranscripts();

  const [step, setStep] = useState<"select" | "curate">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<ChatSession[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [memoryFraming, setMemoryFraming] = useState(true);

  const reset = () => {
    setStep("select");
    setSelectedIds(new Set());
    setDetails([]);
    setDiscarded(new Set());
    setName("");
    setMemoryFraming(true);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleSession = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goToCurate = async () => {
    setLoadingDetails(true);
    try {
      const loaded = await Promise.all([...selectedIds].map((id) => getChatSession(id)));
      setDetails(loaded);
      if (!name) {
        setName(`Memories — ${format(new Date(), "MMM d, yyyy")}`);
      }
      setStep("curate");
    } catch {
      toast({
        title: "Couldn't load conversations",
        description: "One of the selected transcripts couldn't be read. Try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const keptCount = details.reduce(
    (sum, d) =>
      sum +
      extractExchanges(d.messages).filter((_, i) => !discarded.has(`${d.id}:${i}`)).length,
    0,
  );

  const firstKept: { exchange: Exchange; createdAt: string } | null = (() => {
    for (const d of details) {
      const exchanges = extractExchanges(d.messages);
      for (let i = 0; i < exchanges.length; i++) {
        if (!discarded.has(`${d.id}:${i}`)) return { exchange: exchanges[i]!, createdAt: d.createdAt };
      }
    }
    return null;
  })();

  const handleCreate = () => {
    const selections = details
      .map((d) => ({
        sessionId: d.id,
        exchangeIndices: extractExchanges(d.messages)
          .map((_, i) => i)
          .filter((i) => !discarded.has(`${d.id}:${i}`)),
      }))
      .filter((s) => s.exchangeIndices.length > 0);

    createDataset.mutate(
      { data: { name: name.trim(), memoryFraming, selections } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
          toast({
            title: "Dataset created",
            description: `"${data.name}" (${data.rowCount} examples) is now available in the training wizard.`,
          });
          handleOpenChange(false);
        },
        onError: () => {
          toast({
            title: "Couldn't create the dataset",
            description: "Make sure at least one exchange is kept and the dataset has a name.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Turn Conversations into Training Data</DialogTitle>
              <DialogDescription>
                Pick the conversations worth remembering. Next you'll review each exchange and
                decide what makes the cut — you are the model's filter.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {sessions.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 cursor-pointer"
                  data-testid={`dataset-session-${s.id}`}
                >
                  <Checkbox
                    checked={selectedIds.has(s.id)}
                    onCheckedChange={() => toggleSession(s.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.modelName} · {s.messageCount} messages ·{" "}
                      {format(new Date(s.createdAt), "MMM d, yyyy")}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={goToCurate}
                disabled={selectedIds.size === 0 || loadingDetails}
                data-testid="button-curate-continue"
              >
                {loadingDetails && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Review Exchanges
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Curate the Memories</DialogTitle>
              <DialogDescription>
                Uncheck anything that shouldn't become part of the model. {keptCount} exchange
                {keptCount === 1 ? "" : "s"} kept.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1">
              {details.map((d) => {
                const exchanges = extractExchanges(d.messages);
                if (exchanges.length === 0) return null;
                return (
                  <div key={d.id}>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                      {d.title}
                    </div>
                    <div className="space-y-2">
                      {exchanges.map((ex, i) => {
                        const key = `${d.id}:${i}`;
                        const kept = !discarded.has(key);
                        return (
                          <label
                            key={key}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-opacity ${
                              kept ? "border-border" : "border-border/50 opacity-50"
                            }`}
                            data-testid={`exchange-${d.id}-${i}`}
                          >
                            <Checkbox
                              checked={kept}
                              onCheckedChange={() =>
                                setDiscarded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              className="mt-0.5"
                            />
                            <div className="min-w-0 text-xs space-y-1">
                              <p className="line-clamp-2">
                                <span className="text-muted-foreground font-medium">You: </span>
                                {ex.prompt}
                              </p>
                              <p className="line-clamp-2 text-muted-foreground">
                                <span className="font-medium">Model: </span>
                                {ex.response}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-primary" />
                    Frame as memories
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    Each example is presented to the model as its own remembered experience instead
                    of an anonymous instruction.
                  </p>
                </div>
                <Switch
                  checked={memoryFraming}
                  onCheckedChange={setMemoryFraming}
                  data-testid="switch-memory-framing"
                />
              </div>

              {firstKept && (
                <div className="rounded-lg bg-secondary/50 border border-border p-3 text-[11px] leading-snug">
                  <div className="text-muted-foreground font-medium mb-1">
                    Example of what the model will train on:
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap">
                    {memoryFraming
                      ? `[Memory from ${format(new Date(firstKept.createdAt), "MMMM d, yyyy")}] You are recalling an experience from one of your own past conversations. At the time, someone said to you: "${firstKept.exchange.prompt}"\nDrawing on that remembered experience, this is how you responded:`
                      : firstKept.exchange.prompt}
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  Dataset name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Memories — first week"
                  data-testid="input-dataset-name"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={keptCount === 0 || !name.trim() || createDataset.isPending}
                data-testid="button-create-dataset"
              >
                {createDataset.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Dataset ({keptCount})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
