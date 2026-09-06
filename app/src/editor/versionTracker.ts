interface VersionRef { current: number; }

export interface DocumentVersionTracker {
  /** Two parallel counters used to know which side changed since last save. */
  readonly projectChanged: VersionRef;
  readonly sceneChanged: VersionRef;
  /** Versions acknowledged by the server; everything beyond these is dirty. */
  readonly projectSaved: VersionRef;
  readonly sceneSaved: VersionRef;
  /** Single boolean derived from the four counters above. */
  isDirty(): boolean;
  /** Invalidate the saved versions for both project and scene. */
  markProjectChanged(): void;
  markSceneChanged(): void;
  /** Accept the current change versions as the new saved baseline. */
  markCurrentStateSaved(): void;
  /** Reset every counter back to zero, used after a fresh disk reload. */
  resetAll(): void;
  /** Snapshot the change versions at one instant for later equality checks. */
  snapshot(): { projectVersion: number; sceneVersion: number };
}

function emptyRef(): VersionRef { return { current: 0 }; }

export function createDocumentVersionTracker(): DocumentVersionTracker {
  const projectChanged = emptyRef();
  const sceneChanged = emptyRef();
  const projectSaved = emptyRef();
  const sceneSaved = emptyRef();

  return {
    projectChanged,
    sceneChanged,
    projectSaved,
    sceneSaved,
    isDirty() {
      return (
        projectChanged.current > projectSaved.current ||
        sceneChanged.current > sceneSaved.current
      );
    },
    markProjectChanged() {
      projectChanged.current += 1;
    },
    markSceneChanged() {
      sceneChanged.current += 1;
    },
    markCurrentStateSaved() {
      projectSaved.current = projectChanged.current;
      sceneSaved.current = sceneChanged.current;
    },
    resetAll() {
      projectChanged.current = 0;
      sceneChanged.current = 0;
      projectSaved.current = 0;
      sceneSaved.current = 0;
    },
    snapshot() {
      return {
        projectVersion: projectChanged.current,
        sceneVersion: sceneChanged.current,
      };
    },
  };
}