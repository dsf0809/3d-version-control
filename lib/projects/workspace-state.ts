export type ViewState = {
  comparison: { from: string; to: string } | null;
  viewer: {
    mode: 'original' | 'comparison';
    focus: boolean;
    hiddenProposal: string | null;
    highlightId: string | null;
  };
};
export const initialView: ViewState = {
  comparison: null,
  viewer: {
    mode: 'original',
    focus: false,
    hiddenProposal: null,
    highlightId: null,
  },
};
export type ViewAction =
  | { type: 'comparison'; value: ViewState['comparison'] }
  | { type: 'viewer'; value: Partial<ViewState['viewer']> };
export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'comparison')
    return {
      ...state,
      comparison: action.value,
      viewer: { ...state.viewer, highlightId: null },
    };
  return { ...state, viewer: { ...state.viewer, ...action.value } };
}
/** Guards asynchronous work so an older load cannot replace newer navigation. */
export class NavigationSequence {
  private value = 0;
  next() {
    return ++this.value;
  }
  current() {
    return this.value;
  }
  isCurrent(token: number) {
    return token === this.value;
  }
}
