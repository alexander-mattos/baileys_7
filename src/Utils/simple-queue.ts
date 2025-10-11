/**
 * Tiny FIFO queue with concurrency=1 that matches minimal API of p-queue used in this project.
 * Implemented in TypeScript so it compiles to CommonJS for runtime.
 */
export class SimpleQueue {
  private running = false
  private tasks: Array<{ fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }> = []

  add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.tasks.push({ fn, resolve, reject })
      this.next()
    })
  }

  private next() {
    if (this.running) return
    const item = this.tasks.shift()
    if (!item) return
    this.running = true
    Promise.resolve()
      .then(() => item.fn())
      .then(res => {
        this.running = false
        item.resolve(res)
        this.next()
      })
      .catch(err => {
        this.running = false
        item.reject(err)
        this.next()
      })
  }
}

export default SimpleQueue
