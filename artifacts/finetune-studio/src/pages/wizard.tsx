import { useEffect, useMemo, useRef } from "react";
import { useSearch } from "wouter";
import { useListModels, useListDatasets, useListPresets } from "@workspace/api-client-react";
import { WizardProvider, useWizard, WizardInitialSelection } from "../components/wizard/wizard-context";
import { getLastUsedPresetId } from "../lib/last-preset";
import { Step1Model } from "../components/wizard/step-1-model";
import { Step2Dataset } from "../components/wizard/step-2-dataset";
import { Step3Preset } from "../components/wizard/step-3-preset";
import { Step4Training } from "../components/wizard/step-4-training";
import { Step5Export } from "../components/wizard/step-5-export";

/**
 * When the wizard is opened with preselected choices (e.g. "Start training with
 * this dataset" after creating a memories dataset), verify those choices against
 * the live model/dataset/preset lists once they load, drop anything invalid, and
 * jump the user to the furthest step their valid selections allow.
 */
function PrefillReconciler() {
  const { modelId, setModelId, datasetId, setDatasetId, presetId, setPresetId, setCurrentStep } =
    useWizard();
  const { data: models, isFetching: modelsFetching } = useListModels();
  const { data: datasets, isFetching: datasetsFetching } = useListDatasets();
  const { data: presets, isFetching: presetsFetching } = useListPresets();
  const reconciled = useRef(false);

  useEffect(() => {
    // Wait for *fresh* lists — cached data from an earlier visit may predate
    // the just-created dataset and would wrongly drop the prefill.
    if (
      reconciled.current ||
      !models || modelsFetching ||
      !datasets || datasetsFetching ||
      !presets || presetsFetching
    )
      return;
    reconciled.current = true;

    const modelOk = !!modelId && models.some((m) => m.id === modelId && m.status === "ready");
    const datasetOk =
      !!datasetId && datasets.some((d) => d.id === datasetId && d.status === "ready");
    const presetOk = !!presetId && presets.some((p) => p.id === presetId);

    if (!modelOk) setModelId(null);
    if (!datasetOk) setDatasetId(null);
    if (!presetOk) setPresetId(null);

    setCurrentStep(modelOk ? (datasetOk ? 3 : 2) : 1);
  }, [models, datasets, presets, modelsFetching, datasetsFetching, presetsFetching, modelId, datasetId, presetId, setModelId, setDatasetId, setPresetId, setCurrentStep]);

  return null;
}

function WizardContent() {
  const { currentStep } = useWizard();

  const steps = [
    { id: 1, name: "Base Model" },
    { id: 2, name: "Dataset" },
    { id: 3, name: "Preset" },
    { id: 4, name: "Training" },
    { id: 5, name: "Export" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Wizard Header */}
      <header className="px-8 py-8 border-b border-border bg-card shrink-0">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-light tracking-tight">New Training Run</h1>
              <p className="text-sm text-muted-foreground mt-2">Configure and start a local fine-tuning job.</p>
            </div>
            <div className="text-sm font-medium text-primary bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
              Step {currentStep} of {steps.length}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div 
                  className={`flex flex-col gap-2.5 flex-1 transition-colors duration-300 ${
                    currentStep === step.id 
                      ? "text-primary" 
                      : currentStep > step.id 
                        ? "text-foreground" 
                        : "text-muted-foreground opacity-40"
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-widest">{step.name}</div>
                  <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                    currentStep >= step.id ? "bg-primary" : "bg-secondary"
                  }`} />
                </div>
                {idx < steps.length - 1 && (
                  <div className="w-4 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Wizard Body */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto w-full">
          {currentStep === 1 && <Step1Model />}
          {currentStep === 2 && <Step2Dataset />}
          {currentStep === 3 && <Step3Preset />}
          {currentStep === 4 && <Step4Training />}
          {currentStep === 5 && <Step5Export />}
        </div>
      </div>
    </div>
  );
}

export default function Wizard() {
  const search = useSearch();

  const initial = useMemo<WizardInitialSelection | null>(() => {
    const params = new URLSearchParams(search);
    const modelId = params.get("model");
    const datasetId = params.get("dataset");
    if (!modelId && !datasetId) return null;
    return {
      modelId,
      datasetId,
      presetId: getLastUsedPresetId(),
    };
    // Read the URL once on mount — the wizard owns its state afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <WizardProvider initial={initial ?? undefined}>
      {initial && <PrefillReconciler />}
      <WizardContent />
    </WizardProvider>
  );
}
