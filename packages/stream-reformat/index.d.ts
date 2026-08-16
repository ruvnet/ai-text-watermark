export interface ReformatEvent {
  /** Which reformatted channel this text belongs to. */
  channel: 'answer' | 'thinking';
  text: string;
}
export class Reformatter {
  constructor();
  /** Parse + reformat one SSE line. `provider`: 'google' | 'openrouter' | 'metallm'. */
  pushSse(provider: 'google' | 'openrouter' | 'metallm' | string, line: string): ReformatEvent[];
  /** Flush buffered answer text at end-of-stream. */
  finish(): ReformatEvent[];
  free(): void;
}
