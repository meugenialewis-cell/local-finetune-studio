import { useEffect, useRef, useState } from "react";
import {
  useListChatSessions,
  useGetChatSession,
  useCreateChatSession,
  useDeleteChatSession,
  useSendChatMessage,
  useListModels,
  useListJobs,
  useGetSystemStatus,
  getListChatSessionsQueryKey,
  getGetChatSessionQueryKey,
  getDownloadChatTranscriptUrl,
} from "@workspace/api-client-react";
import type { ChatSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Download,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChatSessionSSE } from "@/lib/sse";
import { TranscriptsToDatasetDialog } from "@/components/chat/transcripts-to-dataset-dialog";

export default function Chat() {
  const queryClient = useQueryClient();
  const { data: sessions } = useListChatSessions();
  const { data: models } = useListModels();
  const { data: jobs } = useListJobs();
  const { data: systemStatus } = useGetSystemStatus();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);

  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });

  const readyModels = (models ?? []).filter((m) => m.status === "ready");
  const eligibleForDataset = (sessions ?? []).filter((s) => s.messageCount >= 2);

  return (
    <div className="h-full flex">
      {/* Transcript list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-card/30">
        <div className="p-4 border-b border-border space-y-2">
          <Button
            className="w-full"
            variant={selectedId === null ? "default" : "secondary"}
            onClick={() => setSelectedId(null)}
            data-testid="button-new-chat"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {(sessions ?? []).length === 0 ? (
            <div className="text-center p-6 text-sm text-muted-foreground">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
              No conversations yet. Every chat is automatically saved here as a transcript.
            </div>
          ) : (
            (sessions ?? []).map((s) => (
              <div
                key={s.id}
                className={`group rounded-lg p-3 cursor-pointer border transition-colors ${
                  selectedId === s.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-accent/50"
                }`}
                onClick={() => setSelectedId(s.id)}
                data-testid={`session-item-${s.id}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {s.jobName ? `${s.modelName} + fine-tune` : s.modelName}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {s.messageCount} messages ·{" "}
                      {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={getDownloadChatTranscriptUrl(s.id)}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                      title="Download transcript"
                      data-testid={`button-download-${s.id}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive"
                      title="Delete conversation"
                      data-testid={`button-delete-${s.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession.mutate(
                          { sessionId: s.id },
                          {
                            onSuccess: () => {
                              if (selectedId === s.id) setSelectedId(null);
                              invalidateSessions();
                            },
                          },
                        );
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-border">
          <Button
            variant="outline"
            className="w-full"
            disabled={eligibleForDataset.length === 0}
            onClick={() => setDatasetDialogOpen(true)}
            data-testid="button-turn-into-dataset"
          >
            <Library className="w-4 h-4 mr-2" />
            Turn into Dataset
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Curate saved conversations into training data — the model's experience becomes its
            memories.
          </p>
        </div>
      </div>

      {/* Main area */}
      {selectedId ? (
        <ChatView key={selectedId} sessionId={selectedId} onChanged={invalidateSessions} />
      ) : (
        <NewChatPanel
          readyModels={readyModels}
          jobs={jobs ?? []}
          simulationMessage={systemStatus?.simulationMode ? systemStatus.message : null}
          creating={createSession.isPending}
          error={createSession.isError}
          onStart={(modelId, jobId) =>
            createSession.mutate(
              { data: { modelId, jobId: jobId ?? null } },
              {
                onSuccess: (data) => {
                  invalidateSessions();
                  setSelectedId(data.id);
                },
              },
            )
          }
        />
      )}

      <TranscriptsToDatasetDialog
        open={datasetDialogOpen}
        onOpenChange={setDatasetDialogOpen}
        sessions={eligibleForDataset}
      />
    </div>
  );
}

function NewChatPanel({
  readyModels,
  jobs,
  simulationMessage,
  creating,
  error,
  onStart,
}: {
  readyModels: { id: string; name: string; parameterCount: string }[];
  jobs: { id: string; name: string; modelId: string; status: string }[];
  simulationMessage: string | null;
  creating: boolean;
  error: boolean;
  onStart: (modelId: string, jobId: string | null) => void;
}) {
  const [modelId, setModelId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("base");

  const fineTunes = jobs.filter(
    (j) => j.modelId === modelId && (j.status === "completed" || j.status === "exported"),
  );

  useEffect(() => {
    setJobId("base");
  }, [modelId]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-light tracking-tight mb-2">Chat with a Model</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Talk to any downloaded model — with or without a fine-tune applied. Every conversation is
          saved to disk as a transcript, ready to become training data later.
        </p>

        {simulationMessage && (
          <div className="mb-5 text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 leading-snug">
            {simulationMessage}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Model
            </label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger data-testid="select-chat-model">
                <SelectValue
                  placeholder={
                    readyModels.length === 0 ? "No downloaded models yet" : "Choose a model"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {readyModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.parameterCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {readyModels.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Download a model first from the New Training Run wizard.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Fine-tune (optional)
            </label>
            <Select value={jobId} onValueChange={setJobId} disabled={!modelId}>
              <SelectTrigger data-testid="select-chat-finetune">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base model — no fine-tune</SelectItem>
                {fineTunes.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modelId && fineTunes.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                No completed fine-tunes of this model yet.
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Couldn't start the chat. Make sure the model has finished downloading.</span>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!modelId || creating}
            onClick={() => onStart(modelId, jobId === "base" ? null : jobId)}
            data-testid="button-start-chat"
          >
            {creating ? "Starting…" : "Start Chat"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatView({ sessionId, onChanged }: { sessionId: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const live = useChatSessionSSE(sessionId);
  const { data: fetched } = useGetChatSession(sessionId);
  const session: Partial<ChatSession> = live.id === sessionId ? live : (fetched ?? {});

  const sendMessage = useSendChatMessage();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = session.messages ?? [];
  const generating = session.generating ?? false;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Keep the session list fresh once a reply finishes.
  const prevGenerating = useRef(generating);
  useEffect(() => {
    if (prevGenerating.current && !generating) {
      onChanged();
      queryClient.invalidateQueries({ queryKey: getGetChatSessionQueryKey(sessionId) });
    }
    prevGenerating.current = generating;
  }, [generating, onChanged, queryClient, sessionId]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || generating) return;
    setInput("");
    sendMessage.mutate(
      { sessionId, data: { content } },
      {
        onSuccess: () => onChanged(),
      },
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate" data-testid="text-chat-title">
            {session.title ?? "Chat"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {session.modelName}
            {session.jobName ? ` · fine-tune: ${session.jobName}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.simulated && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded" data-testid="badge-simulated">
              Simulated
            </span>
          )}
          {session.jobName && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Fine-tuned
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground pt-16">
            Say something to start the conversation. It'll be saved to this session's transcript
            automatically.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-card-border rounded-bl-sm"
              }`}
              data-testid={`message-${m.role}-${i}`}
            >
              {m.content}
              {m.role === "assistant" && generating && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </div>
            {m.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-secondary text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {generating && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-card border border-card-border rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        {session.error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2 items-start max-w-lg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{session.error}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={generating ? "Waiting for the reply…" : "Type a message…"}
            className="min-h-[44px] max-h-40 resize-none"
            rows={1}
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={!input.trim() || generating || sendMessage.isPending}
            onClick={handleSend}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Auto-saved to your transcript library — curate it into a dataset any time.
        </p>
      </div>
    </div>
  );
}
