/**
 * Tipos mínimos de la capacidad `sample` de los Artifacts de claude.ai (contrato 0.2.96).
 * Fuera de claude.ai (archivo local, `npm run preview`) no existe `window.claude`:
 * el asistente se muestra como «disponible al abrir desde Claude» y el resto de la app sigue igual.
 */
export namespace Claude {
  export namespace sample {
    export interface SampleTool {
      name: string;
      description: string;
      inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
      execute(input: { [name: string]: unknown }, context: { signal: AbortSignal }): unknown;
    }
    export interface SampleMessage {
      role: 'user' | 'assistant';
      content: string;
    }
    export interface SampleError {
      code: string;
      message: string;
      text?: string;
    }
    export interface Options {
      onText?: (u: { text: string; delta: string }) => void;
      signal?: AbortSignal;
      tools?: SampleTool[];
      modelTier?: 'quick' | 'default' | 'complex';
      cache?: boolean;
    }
    export interface Limits {
      tools?: { maxCount: number };
    }
  }
  export interface SampleFn {
    (input: string | sample.SampleMessage[], options?: sample.Options): Promise<{ text: string; truncated: boolean }>;
    limits(): Promise<sample.Limits>;
  }
}

declare global {
  interface Window {
    claude?: { use(name: 'sample'): Promise<Claude.SampleFn | null> };
  }
}

let cached: Promise<Claude.SampleFn | null> | null = null;
/** Resuelve la función `sample`, o null si esta vista no puede usarla. Nunca lanza. */
export function getSample(): Promise<Claude.SampleFn | null> {
  if (!cached) {
    cached = (async () => {
      try {
        if (!window.claude?.use) return null;
        return await window.claude.use('sample');
      } catch {
        return null;
      }
    })();
  }
  return cached;
}
