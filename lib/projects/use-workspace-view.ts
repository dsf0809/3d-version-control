'use client';
import { useReducer } from 'react';
import {
  initialView,
  viewReducer,
  type ViewState,
  type ViewAction,
} from './workspace-state';
/** Project-scoped presentation state is separate from the saved editing selection. */
export function useWorkspaceView(projectId: string) {
  const [states, dispatch] = useReducer(
    (
      states: Record<string, ViewState>,
      event: { projectId: string; action: ViewAction },
    ) => ({
      ...states,
      [event.projectId]: viewReducer(
        states[event.projectId] || initialView,
        event.action,
      ),
    }),
    {},
  );
  return {
    state: states[projectId] || initialView,
    dispatch: (action: ViewAction) => dispatch({ projectId, action }),
  };
}
