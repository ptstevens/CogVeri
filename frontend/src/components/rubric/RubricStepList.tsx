import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useRubricBuilder } from './RubricBuilderProvider';
import { RubricStepCard } from './RubricStepCard';

export function RubricStepList() {
  const { state, reorderSteps, addStep } = useRubricBuilder();
  const { rubricSteps } = state.evaluationCriteria;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSteps(active.id as string, over.id as string);
    }
  };

  return (
    <div className="space-y-4">
      {rubricSteps.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 mb-4">No steps added yet</p>
          <button
            onClick={() => addStep()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-5 h-5" />
            Add First Step
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={rubricSteps.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {rubricSteps.map((step) => (
                <RubricStepCard key={step.id} step={step} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {rubricSteps.length > 0 && (
        <button
          onClick={() => addStep()}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Step
        </button>
      )}
    </div>
  );
}
