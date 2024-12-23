import { type Effect, type EventCallable, createEffect, createEvent, sample } from 'effector';

/**
 * Triggers target unit on each element of the input list.
 *
 * ```ts
 * const $store = createStore<number[]>([]);
 * const event = createEvent<number>();
 *
 * sample({
 *   clock: $store,
 *   target: series(event),
 * });
 *
 * $store.set([0, 1, 3]);
 * // event will be called 3 times, direct equivalent of
 * // event(0); event(1); event(2)
 * ```
 */
export const series = <T>(target: EventCallable<T> | Effect<T, any>) => {
  const push = createEvent<Iterable<T>>();

  const callFx = createEffect((data: Iterable<T>) => {
    for (const value of data) {
      target(value);
    }
  });

  sample({
    clock: push,
    target: callFx,
  });

  return push;
};
