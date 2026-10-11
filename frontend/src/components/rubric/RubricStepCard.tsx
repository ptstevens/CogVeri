import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  MessageSquare,
  Eye,
  Layers,
} from 'lucide-react';
import { RubricStep, EvidenceType } from '../../types/rubric.types';
import { useRubricBuilder } from './RubricBuilderProvider';

interface RubricStepCardProps {
  step: RubricStep;
}

export function RubricStepCard({ step }: RubricStepCardProps) {
  const { updateStep, deleteStep, duplicateStep, setActiveStep, state } = useRubricBuilder();
  const isActive = state.activeStepId === step.id;
  const isExpanded = !step.isCollapsed;
  const errors = state.validationErrors[step.id] || [];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggleExpanded = () => {
    updateStep(step.id, { isCollapsed: !step.isCollapsed });
    if (step.isCollapsed) {
      setActiveStep(step.id);
    }
  };

  const handleEvidenceTypeChange = (type: EvidenceType) => {
    const updates: Partial<RubricStep> = { evidenceType: type };
    if (type === 'speech') {
      updates.speechCriteria = step.speechCriteria || { requiredKeywords: [], requiredPhrases: [] };
    } else if (type === 'visual') {
      updates.visualCriteria = step.visualCriteria || { expectedElements: [], expectedActions: [] };
    } else {
      updates.speechCriteria = step.speechCriteria || { requiredKeywords: [], requiredPhrases: [] };
      updates.visualCriteria = step.visualCriteria || { expectedElements: [], expectedActions: [] };
    }
    updateStep(step.id, updates);
  };

  const evidenceTypeButtons = [
    { type: 'speech' as EvidenceType, icon: MessageSquare, label: 'Speech' },
    { type: 'visual' as EvidenceType, icon: Eye, label: 'Visual' },
    { type: 'both' as EvidenceType, icon: Layers, label: 'Both' },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border-2 transition-all ${
        errors.length > 0
          ? 'border-red-300 bg-red-50'
          : isActive
            ? 'border-primary-400 ring-2 ring-primary-200'
            : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <span className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">
          {step.order}
        </span>

        <div className="flex-1 min-w-0">
          {isExpanded ? (
            <input
              type="text"
              value={step.title}
              onChange={(e) => updateStep(step.id, { title: e.target.value })}
              placeholder="Step title..."
              className="w-full font-medium text-gray-900 bg-transparent border-0 focus:ring-0 p-0"
            />
          ) : (
            <span className="font-medium text-gray-900 truncate block">
              {step.title || 'Untitled Step'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Weight: {step.weight}/10</span>
          <button
            onClick={() => duplicateStep(step.id)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Duplicate step"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => deleteStep(step.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete step"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleExpanded}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={step.description}
              onChange={(e) => updateStep(step.id, { description: e.target.value })}
              placeholder="Describe what this step evaluates..."
              rows={2}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Evidence Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Evidence Type</label>
            <div className="flex gap-2">
              {evidenceTypeButtons.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => handleEvidenceTypeChange(type)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    step.evidenceType === type
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Speech Criteria */}
          {(step.evidenceType === 'speech' || step.evidenceType === 'both') && (
            <SpeechCriteriaEditor step={step} />
          )}

          {/* Visual Criteria */}
          {(step.evidenceType === 'visual' || step.evidenceType === 'both') && (
            <VisualCriteriaEditor step={step} />
          )}

          {/* Weight and Required */}
          <div className="flex gap-6">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weight: {step.weight}/10
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={step.weight}
                onChange={(e) => updateStep(step.id, { weight: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`required-${step.id}`}
                checked={step.isRequired}
                onChange={(e) => updateStep(step.id, { isRequired: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor={`required-${step.id}`} className="text-sm text-gray-700">
                Required for pass
              </label>
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <ul className="text-sm text-red-600 space-y-1">
                {errors.map((error, idx) => (
                  <li key={idx}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpeechCriteriaEditor({ step }: { step: RubricStep }) {
  const { updateStep } = useRubricBuilder();
  const criteria = step.speechCriteria || { requiredKeywords: [], requiredPhrases: [] };

  const addKeyword = (value: string) => {
    if (!value.trim()) return;
    const updated = {
      ...criteria,
      requiredKeywords: [...criteria.requiredKeywords, value.trim()],
    };
    updateStep(step.id, { speechCriteria: updated });
  };

  const removeKeyword = (index: number) => {
    const updated = {
      ...criteria,
      requiredKeywords: criteria.requiredKeywords.filter((_, i) => i !== index),
    };
    updateStep(step.id, { speechCriteria: updated });
  };

  const addPhrase = (value: string) => {
    if (!value.trim()) return;
    const updated = {
      ...criteria,
      requiredPhrases: [...criteria.requiredPhrases, value.trim()],
    };
    updateStep(step.id, { speechCriteria: updated });
  };

  const removePhrase = (index: number) => {
    const updated = {
      ...criteria,
      requiredPhrases: criteria.requiredPhrases.filter((_, i) => i !== index),
    };
    updateStep(step.id, { speechCriteria: updated });
  };

  return (
    <div className="space-y-3 bg-blue-50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-blue-800 flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        Speech Criteria
      </h4>

      <ChipInput
        label="Required Keywords"
        placeholder="Add keyword and press Enter"
        chips={criteria.requiredKeywords}
        onAdd={addKeyword}
        onRemove={removeKeyword}
      />

      <ChipInput
        label="Required Phrases"
        placeholder="Add phrase and press Enter"
        chips={criteria.requiredPhrases}
        onAdd={addPhrase}
        onRemove={removePhrase}
      />
    </div>
  );
}

function VisualCriteriaEditor({ step }: { step: RubricStep }) {
  const { updateStep } = useRubricBuilder();
  const criteria = step.visualCriteria || { expectedElements: [], expectedActions: [] };

  const addElement = (value: string) => {
    if (!value.trim()) return;
    const updated = {
      ...criteria,
      expectedElements: [...criteria.expectedElements, value.trim()],
    };
    updateStep(step.id, { visualCriteria: updated });
  };

  const removeElement = (index: number) => {
    const updated = {
      ...criteria,
      expectedElements: criteria.expectedElements.filter((_, i) => i !== index),
    };
    updateStep(step.id, { visualCriteria: updated });
  };

  const addAction = (value: string) => {
    if (!value.trim()) return;
    const updated = {
      ...criteria,
      expectedActions: [...criteria.expectedActions, value.trim()],
    };
    updateStep(step.id, { visualCriteria: updated });
  };

  const removeAction = (index: number) => {
    const updated = {
      ...criteria,
      expectedActions: criteria.expectedActions.filter((_, i) => i !== index),
    };
    updateStep(step.id, { visualCriteria: updated });
  };

  return (
    <div className="space-y-3 bg-green-50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-green-800 flex items-center gap-2">
        <Eye className="w-4 h-4" />
        Visual Criteria
      </h4>

      <ChipInput
        label="Expected UI Elements"
        placeholder="e.g., Save button, Settings menu"
        chips={criteria.expectedElements}
        onAdd={addElement}
        onRemove={removeElement}
      />

      <ChipInput
        label="Expected Actions"
        placeholder="e.g., Click submit, Navigate to dashboard"
        chips={criteria.expectedActions}
        onAdd={addAction}
        onRemove={removeAction}
      />
    </div>
  );
}

interface ChipInputProps {
  label: string;
  placeholder: string;
  chips: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}

function ChipInput({ label, placeholder, chips, onAdd, onRemove }: ChipInputProps) {
  const [inputValue, setInputValue] = React.useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAdd(inputValue);
      setInputValue('');
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {chips.map((chip, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-sm border"
          >
            {chip}
            <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-500">
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full text-sm rounded border-gray-300 focus:border-primary-500 focus:ring-primary-500"
      />
    </div>
  );
}
