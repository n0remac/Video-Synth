export type StageModule = {
  id: string
  update(dt: number): void
  dispose(): void
}

export type InputReceivingModule<TInput> = StageModule & {
  receiveInput(input: TInput): void
}
