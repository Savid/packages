// eslint-disable-next-line max-classes-per-file
import { EventEmitter } from 'events';

type ShutDownAsyncFunction = (event?: ShutdownError) => Promise<void>;

const signals: NodeJS.Signals[] = [
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
];

class ShutdownError extends Error {
  code?: string;

  detail?: string;
}

interface ShutdownEvent {
  message?: string;
  name: string;
  code?: string;
  detail?: string;
  stack?: string;
}

type Event = Error | number | object | null | undefined | NodeJS.Signals;

function isError(event?: Event): event is ShutdownError {
  return event instanceof Error;
}

function isEvent(event?: Event): event is ShutdownEvent {
  return typeof event === 'object' && event !== null && 'name' in event;
}

function getEventError(event?: Event): ShutdownError | undefined {
  if (isError(event)) return event;
  if (isEvent(event)) {
    const error = new ShutdownError(event.message ?? event.name);
    error.name = event.name;
    error.code = event.code;
    error.detail = event.detail;
    error.stack = event.stack;
    return error;
  }
  return undefined;
}

function getEventCode(event?: Event): number {
  if (typeof event === 'number') return event;
  if (typeof event !== 'string') return 1;
  const parsed = Number.parseInt(event);
  return !Number.isNaN(parsed) && parsed >= 0 ? parsed : 1;
}

export default class Shutdown {
  static eventEmitter: EventEmitter;

  static asyncFunctions = {} as Record<string, ShutDownAsyncFunction>;

  static {
    this.eventEmitter = new EventEmitter();
  }

  static register(key: string, func: ShutDownAsyncFunction) {
    if (Shutdown.asyncFunctions[key]) return;
    const wrappedFunc = async (eventOrExitCodeOrError?: Event) => {
      if (process.env.NODE_ENV === 'development') setTimeout(() => process.exit(1), 10_000);
      try {
        await func(getEventError(eventOrExitCodeOrError));
      } catch (error) {
        Shutdown.emit('error', {
          error: error instanceof Error ? error : new Error('unknown'),
          register: key,
        });
      }
      process.exit(getEventCode(eventOrExitCodeOrError));
    };
    signals.forEach((evt) => process.on(evt, wrappedFunc));
    process.on('beforeExit', wrappedFunc);
    process.on('uncaughtException', wrappedFunc);
    process.on('unhandledRejection', wrappedFunc);
    Shutdown.asyncFunctions[key] = wrappedFunc;
  }

  static deregister(key: string) {
    if (!Shutdown.asyncFunctions[key]) return;
    signals.forEach((evt) => process.off(evt, Shutdown.asyncFunctions[key]));
    process.off('beforeExit', Shutdown.asyncFunctions[key]);
    process.off('uncaughtException', Shutdown.asyncFunctions[key]);
    process.off('unhandledRejection', Shutdown.asyncFunctions[key]);
    delete Shutdown.asyncFunctions[key];
  }

  static emit(event: 'error', payload: { error: Error; register: string }): void;
  static emit(event: string | symbol, ...args: unknown[]) {
    this.eventEmitter.emit(event, ...args);
  }

  static on(event: 'error', listener: (payload: { error: Error; register: string }) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static on(event: string | symbol, listener: (...args: any[]) => void) {
    this.eventEmitter.on(event, listener);
  }

  static off(event: string | symbol, listener: (...args: unknown[]) => void) {
    this.eventEmitter.off(event, listener);
  }
}
