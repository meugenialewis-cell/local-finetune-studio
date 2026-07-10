import { createContext, useContext, useState, ReactNode } from "react";

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
}

const WizardContext = createContext<WizardState | undefined>(undefined);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [modelId, setModelId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobName, setJobName] = useState<string>("");

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
