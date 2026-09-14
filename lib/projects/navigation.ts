export type EditingSelection = { branchId: string; revisionId: string };
const prefix = 'form-tab-selection:';
export function readSelection(projectId: string): EditingSelection | undefined {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(prefix + projectId) || 'null',
    );
    if (
      value &&
      typeof value.branchId === 'string' &&
      typeof value.revisionId === 'string'
    )
      return value;
  } catch {
    /* Storage is optional. */
  }
}
export function saveSelection(projectId: string, selection: EditingSelection) {
  try {
    sessionStorage.setItem(prefix + projectId, JSON.stringify(selection));
    sessionStorage.setItem('form-active-project', projectId);
  } catch {
    /* Storage is optional. */
  }
}
export function projectViewURL(
  id: string,
  selection?: Partial<EditingSelection>,
) {
  const params = new URLSearchParams();
  if (selection?.branchId) params.set('branch', selection.branchId);
  if (selection?.revisionId) params.set('revision', selection.revisionId);
  return `/api/projects/${encodeURIComponent(id)}${params.size ? '?' + params : ''}`;
}
