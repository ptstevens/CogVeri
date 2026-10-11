import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  EvaluationCriteria,
  RubricStep,
  RubricBuilderState,
  RubricBuilderAction,
} from '../../types/rubric.types';

const initialEvaluationCriteria: EvaluationCriteria = {
  version: '1.0',
  rubricSteps: [],
  passingScore: 70,
  scoringMethod: 'weighted',
  autoAnalyze: true,
};

const initialState: RubricBuilderState = {
  evaluationCriteria: initialEvaluationCriteria,
  isDirty: false,
  validationErrors: {},
  activeStepId: null,
  previewMode: false,
};

function rubricReducer(state: RubricBuilderState, action: RubricBuilderAction): RubricBuilderState {
  switch (action.type) {
    case 'SET_CRITERIA': {
      return {
        ...state,
        evaluationCriteria: action.payload,
        isDirty: false,
        validationErrors: {},
      };
    }

    case 'UPDATE_METADATA': {
      return {
        ...state,
        isDirty: true,
        evaluationCriteria: {
          ...state.evaluationCriteria,
          ...action.payload,
        },
      };
    }

    case 'ADD_STEP': {
      const newStep: RubricStep = {
        id: uuidv4(),
        order: state.evaluationCriteria.rubricSteps.length + 1,
        title: '',
        description: '',
        evidenceType: 'both',
        weight: 5,
        isRequired: true,
        isCollapsed: false,
        ...action.payload,
      };
      return {
        ...state,
        isDirty: true,
        evaluationCriteria: {
          ...state.evaluationCriteria,
          rubricSteps: [...state.evaluationCriteria.rubricSteps, newStep],
        },
        activeStepId: newStep.id,
      };
    }

    case 'UPDATE_STEP': {
      const { id, updates } = action.payload;
      return {
        ...state,
        isDirty: true,
        evaluationCriteria: {
          ...state.evaluationCriteria,
          rubricSteps: state.evaluationCriteria.rubricSteps.map((step) =>
            step.id === id ? { ...step, ...updates } : step
          ),
        },
      };
    }

    case 'DELETE_STEP': {
      const filteredSteps = state.evaluationCriteria.rubricSteps.filter(
        (step) => step.id !== action.payload
      );
      const reorderedSteps = filteredSteps.map((step, index) => ({
        ...step,
        order: index + 1,
      }));
      return {
        ...state,
        isDirty: true,
        evaluationCriteria: {
          ...state.evaluationCriteria,
          rubricSteps: reorderedSteps,
        },
        activeStepId: state.activeStepId === action.payload ? null : state.activeStepId,
      };
    }

    case 'DUPLICATE_STEP': {
      const stepToDuplicate = state.evaluationCriteria.rubricSteps.find(
        (step) => step.id === action.payload
      );
      if (!stepToDuplicate) return state;

      const newStep: RubricStep = {
        ...stepToDuplicate,
        id: uuidv4(),
        order: state.evaluationCriteria.rubricSteps.length + 1,
        title: `${stepToDuplicate.title} (Copy)`,
      };
      return {
        ...state,
        isDirty: true,
        evaluationCriteria: {
          ...state.evaluationCriteria,
          rubricSteps: [...state.evaluationCriteria.rubricSteps, newStep],
        },
        activeStepId: newStep.id,
      };
    }

    case 'REORDER_STEPS': {
      const { activeId, overId } = action.payload;
      const steps = [...state.evaluationCriteria.rubricSteps];
      const activeIndex = steps.findIndex((s) => s.id === activeId);
      const overIndex = steps.findIndex((s) => s.id === overId);

      if (activeIndex === -1 || overIndex === -1) return state;

      const [movedStep] = steps.splice(activeIndex, 1);
      steps.splice(overIndex, 0, movedStep);

      const reorderedSteps = steps.map((step, index) => ({
        ...step,
        order: index + 1,
      }));

      return {
        ...state,
        isDirty: true,
        evaluationCriteria: {
          ...state.evaluationCriteria,
          rubricSteps: reorderedSteps,
        },
      };
    }

    case 'SET_ACTIVE_STEP': {
      return {
        ...state,
        activeStepId: action.payload,
      };
    }

    case 'TOGGLE_PREVIEW': {
      return {
        ...state,
        previewMode: action.payload ?? !state.previewMode,
      };
    }

    case 'RESET_DIRTY': {
      return {
        ...state,
        isDirty: false,
      };
    }

    case 'SET_VALIDATION_ERRORS': {
      return {
        ...state,
        validationErrors: action.payload,
      };
    }

    default:
      return state;
  }
}

interface RubricBuilderContextValue {
  state: RubricBuilderState;
  dispatch: React.Dispatch<RubricBuilderAction>;
  addStep: (partial?: Partial<RubricStep>) => void;
  updateStep: (id: string, updates: Partial<RubricStep>) => void;
  deleteStep: (id: string) => void;
  duplicateStep: (id: string) => void;
  reorderSteps: (activeId: string, overId: string) => void;
  setActiveStep: (id: string | null) => void;
  updateMetadata: (updates: Partial<EvaluationCriteria>) => void;
  validateRubric: () => boolean;
  setCriteria: (criteria: EvaluationCriteria) => void;
}

const RubricBuilderContext = createContext<RubricBuilderContextValue | null>(null);

interface RubricBuilderProviderProps {
  children: ReactNode;
  initialCriteria?: EvaluationCriteria;
}

export function RubricBuilderProvider({ children, initialCriteria }: RubricBuilderProviderProps) {
  const [state, dispatch] = useReducer(rubricReducer, {
    ...initialState,
    evaluationCriteria: initialCriteria || initialEvaluationCriteria,
  });

  const addStep = useCallback((partial?: Partial<RubricStep>) => {
    dispatch({ type: 'ADD_STEP', payload: partial });
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<RubricStep>) => {
    dispatch({ type: 'UPDATE_STEP', payload: { id, updates } });
  }, []);

  const deleteStep = useCallback((id: string) => {
    dispatch({ type: 'DELETE_STEP', payload: id });
  }, []);

  const duplicateStep = useCallback((id: string) => {
    dispatch({ type: 'DUPLICATE_STEP', payload: id });
  }, []);

  const reorderSteps = useCallback((activeId: string, overId: string) => {
    dispatch({ type: 'REORDER_STEPS', payload: { activeId, overId } });
  }, []);

  const setActiveStep = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_STEP', payload: id });
  }, []);

  const updateMetadata = useCallback((updates: Partial<EvaluationCriteria>) => {
    dispatch({ type: 'UPDATE_METADATA', payload: updates });
  }, []);

  const setCriteria = useCallback((criteria: EvaluationCriteria) => {
    dispatch({ type: 'SET_CRITERIA', payload: criteria });
  }, []);

  const validateRubric = useCallback((): boolean => {
    const errors: Record<string, string[]> = {};
    const { rubricSteps } = state.evaluationCriteria;

    if (rubricSteps.length === 0) {
      errors.general = ['At least one step is required'];
    }

    rubricSteps.forEach((step, _index) => {
      const stepErrors: string[] = [];

      if (!step.title.trim()) {
        stepErrors.push('Title is required');
      }

      if (step.evidenceType === 'speech' || step.evidenceType === 'both') {
        const speech = step.speechCriteria;
        if (
          !speech ||
          (speech.requiredKeywords.length === 0 && speech.requiredPhrases.length === 0)
        ) {
          stepErrors.push('Speech criteria requires at least one keyword or phrase');
        }
      }

      if (step.evidenceType === 'visual' || step.evidenceType === 'both') {
        const visual = step.visualCriteria;
        if (
          !visual ||
          (visual.expectedElements.length === 0 && visual.expectedActions.length === 0)
        ) {
          stepErrors.push('Visual criteria requires at least one element or action');
        }
      }

      if (stepErrors.length > 0) {
        errors[step.id] = stepErrors;
      }
    });

    dispatch({ type: 'SET_VALIDATION_ERRORS', payload: errors });
    return Object.keys(errors).length === 0;
  }, [state.evaluationCriteria]);

  return (
    <RubricBuilderContext.Provider
      value={{
        state,
        dispatch,
        addStep,
        updateStep,
        deleteStep,
        duplicateStep,
        reorderSteps,
        setActiveStep,
        updateMetadata,
        validateRubric,
        setCriteria,
      }}
    >
      {children}
    </RubricBuilderContext.Provider>
  );
}

export function useRubricBuilder() {
  const context = useContext(RubricBuilderContext);
  if (!context) {
    throw new Error('useRubricBuilder must be used within RubricBuilderProvider');
  }
  return context;
}
