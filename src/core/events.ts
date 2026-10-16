/** Tiny typed event bus. Events are rare (sales, purchases), so listeners get plain objects. */
export class Emitter<M extends { type: string }> {
  private readonly fns: Array<(e: M) => void> = [];

  on(fn: (e: M) => void): () => void {
    this.fns.push(fn);
    return () => {
      const i = this.fns.indexOf(fn);
      if (i >= 0) this.fns.splice(i, 1);
    };
  }

  emit(e: M): void {
    for (let i = 0; i < this.fns.length; i++) (this.fns[i] as (e: M) => void)(e);
  }
}
