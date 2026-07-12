import { createContext, useContext, useState, ReactNode } from "react";

export interface WizardInitialSelection {
  modelId?: string | null;
  datasetId?: string | null;
  presetId?: string | null;
}

interface WizardState {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  modelId: string | null;
  setModelId: (id: string | null) => void;
  datasetId: string | null;
  setDatasetId: (id: string | null) => void;
  presetId: string | null;
  setPresetId: (id: string | null) => void;
  jobId: string | null;
  setJobId: (id: string | null) => void;
  jobName: string;
  setJobName: (name: string) => void;
  parentJobId: string | null;
  setParentJobId: (id: string | null) => void;
}

const WizardContext = createContext<WizardState | undefined>(undefined);

export function WizardProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: WizardInitialSelection;
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [modelId, setModelId] = useState<string | null>(initial?.modelId ?? null);
  const [datasetId, setDatasetId] = useState<string | null>(initial?.datasetId ?? null);
  const [presetId, setPresetId] = useState<string | null>(initial?.presetId ?? null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobName, setJobName] = useState<string>("");
  const [parentJobId, setParentJobId] = useState<string | null>(null);

  return (
    <WizardContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        modelId,
        setModelId,
        datasetId,
        setDatasetId,
        presetId,
        setPresetId,
        jobId,
        setJobId,
        jobName,
        setJobName,
        parentJobId,
        setParentJobId,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
