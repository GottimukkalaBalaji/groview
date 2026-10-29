/**
 * PosterHistoryManager handles undo/redo stacks for Fabric.js canvas states.
 * States are stored as JSON strings.
 */
export class PosterHistoryManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxStackSize: number;
  private isProcessing: boolean = false;

  constructor(maxStackSize: number = 25) {
    this.maxStackSize = maxStackSize;
  }

  public get isLocked(): boolean {
    return this.isProcessing;
  }

  public setLock(locked: boolean): void {
    this.isProcessing = locked;
  }

  /**
   * Save a new state snapshot. Clears the redo stack.
   */
  public pushState(jsonState: string): void {
    if (this.isProcessing) return;

    // Do not record identical consecutive states
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === jsonState) {
      return;
    }

    this.undoStack.push(jsonState);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    // New action invalidates the redo branch
    this.redoStack = [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 1; // Need at least initial state + 1 edit
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Pop the current state and return the previous state.
   */
  public undo(): string | null {
    if (!this.canUndo()) return null;

    const currentState = this.undoStack.pop();
    if (currentState) {
      this.redoStack.push(currentState);
    }

    const previousState = this.undoStack[this.undoStack.length - 1];
    return previousState || null;
  }

  /**
   * Pop from redo stack and return the next state.
   */
  public redo(): string | null {
    if (!this.canRedo()) return null;

    const nextState = this.redoStack.pop();
    if (nextState) {
      this.undoStack.push(nextState);
    }

    return nextState || null;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.isProcessing = false;
  }

  public get undoCount(): number {
    return this.undoStack.length;
  }

  public get redoCount(): number {
    return this.redoStack.length;
  }
}
