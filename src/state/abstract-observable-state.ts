/**
 * Abstract observable state class that shares subscription notification and batching across state managers.
 */
export abstract class AbstractObservableState {
    private readonly subscribers: Set<() => void> = new Set();

    public subscribe(listener: () => void): () => void {
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
    }

    public notify(): void {
        for (const fn of this.subscribers) {
            fn();
        }
    }
}
