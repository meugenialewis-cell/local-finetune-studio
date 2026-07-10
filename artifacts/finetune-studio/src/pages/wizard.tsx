import { WizardProvider, useWizard } from "../components/wizard/wizard-context";
import { Step1Model } from "../components/wizard/step-1-model";
import { Step2Dataset } from "../components/wizard/step-2-dataset";
import { Step3Preset } from "../components/wizard/step-3-preset";
import { Step4Training } from "../components/wizard/step-4-training";
import { Step5Export } from "../components/wizard/step-5-export";

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
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  );
}