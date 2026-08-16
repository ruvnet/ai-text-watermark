import type { ReformatEvent } from '../index.d.ts';
export type { ReformatEvent };
export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
export function init(input?: InitInput | Promise<InitInput>): Promise<void>;
export function isReady(): boolean;
export class Reformatter {
  constructor();
  pushSse(provider: 'google' | 'openrouter' | 'metallm' | string, line: string): ReformatEvent[];
  finish(): ReformatEvent[];
  free(): void;
}
