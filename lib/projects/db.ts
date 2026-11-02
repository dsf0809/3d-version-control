import { runtime } from '../server/runtime';
import { ProjectStore } from './store';
export function projectStore() {
  return new ProjectStore(runtime().db);
}
