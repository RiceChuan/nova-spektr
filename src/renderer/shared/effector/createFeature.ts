import {
  type Event,
  type Scope,
  type Store,
  createDomain,
  createStore,
  restore as effectorRestore,
  sample,
} from 'effector';
import { createGate, useGate } from 'effector-react';
import { readonly } from 'patronum';

import { type AnyIdentifier, type InferHandlerBody, isSlotIdentifier, normalizeSlotHandler } from '@/shared/di';
import { nonNullable, nullable } from '@/shared/lib/utils';

// TODO implement feature start when enable flag goes `true` and feature supposed to be started.
// TODO implement features dependency graph (and somehow merge it with input store, i like that idea).

type Params<T> = {
  name: `${Uncapitalize<string>}/${Uncapitalize<string>}`;
  enable?: Store<boolean>;
  input?: Store<T | null>;
  filter?: (input: T) => IdleState | Omit<FailedState<T>, 'data'> | null;
  scope?: Scope;
};

type BootstrapParams = { reason: 'external' | 'gate' | 'enable' };
type ErrorType = 'fatal' | 'error' | 'warning';

type FailedStateParams = { error: Error; type: ErrorType };

type IdleState = { status: 'idle' };
type StartingState = { status: 'starting' };
type RunningState<T> = { status: 'running'; data: T };
type FailedState<T> = { status: 'failed'; data: T | null } & FailedStateParams;

type State<T> = IdleState | StartingState | RunningState<T> | FailedState<T>;

export type Feature<T> = ReturnType<typeof createFeature<T>>;

const calculateState = <T>(data: T | null, filter: Params<T>['filter']): State<T> => {
  if (nullable(data)) {
    return { status: 'starting' };
  }

  if (filter) {
    const filterResult = filter(data);
    if (filterResult === null) {
      return { status: 'running', data };
    }
    if (filterResult.status === 'idle') {
      return filterResult;
    }
    if (filterResult.status === 'failed') {
      return { status: 'failed', data, error: filterResult.error, type: filterResult.type };
    }
  }

  return { status: 'running', data };
};

export const createFeature = <T = object>({
  name,
  filter,
  // @ts-expect-error dynamic value
  input = createStore({}),
  enable = createStore(true),
  scope,
}: Params<T>) => {
  const domain = createDomain(name);

  const start = domain.createEvent('start');
  const bootstrap = domain.createEvent<BootstrapParams>('bootstrap');
  const stop = domain.createEvent('stop');
  const fail = domain.createEvent<FailedStateParams>('fail');
  const restore = domain.createEvent('restore');

  const $input = domain.createStore<T | null>(null);
  const $state = domain.createStore<State<T>>({ status: 'idle' }, { name: 'state' });
  const $status = $state.map((x) => x.status);
  const $bootstrapParams = effectorRestore(bootstrap, null);
  const $runWasRequested = domain.createStore(false);

  const running = domain.createEvent<T>('running');
  const failed = $status.updates.filter({ fn: (x) => x === 'failed' });
  const stopped = $status.updates.filter({ fn: (x) => x === 'idle' || x === 'failed' });

  const isRunning = $status.map((x) => x === 'running');
  const isStarting = $status.map((x) => x === 'starting');
  const isFailed = $status.map((x) => x === 'failed');

  const inputFulfill = input.updates.filter({ fn: nonNullable }) as Event<T>;

  // Status management

  sample({
    clock: start,
    fn: (): BootstrapParams => ({ reason: 'external' }),
    target: bootstrap,
  });

  sample({
    clock: bootstrap,
    source: { data: input, status: $status, enable },
    filter: ({ status, enable }) => enable && status !== 'starting' && status !== 'running',
    fn: ({ data }) => calculateState(data, filter),
    target: $state,
  });

  sample({
    clock: stop,
    fn: (): IdleState => ({ status: 'idle' }),
    target: [$state, $bootstrapParams.reinit],
  });

  sample({
    clock: restore,
    source: input,
    filter: isFailed,
    fn: (data) => calculateState(data, filter),
    target: $state,
  });

  sample({
    clock: fail,
    source: input,
    fn: (data, { error, type }): State<T> => ({ status: 'failed', data, error, type }),
    target: $state,
  });

  // Enable flag management

  sample({
    clock: start,
    source: enable,
    filter: (enable) => !enable,
    fn: () => true,
    target: $runWasRequested,
  });

  sample({
    clock: stop,
    fn: () => false,
    target: $runWasRequested,
  });

  sample({
    clock: enable,
    source: $runWasRequested,
    filter: (wasRequested, enable) => wasRequested && enable,
    fn: (): BootstrapParams => ({ reason: 'enable' }),
    target: bootstrap,
  });

  sample({
    clock: enable,
    filter: (enable) => !enable,
    target: stop,
  });

  // Input data management

  sample({
    clock: inputFulfill,
    filter: isStarting,
    fn: (data) => calculateState(data, filter),
    target: $state,
  });

  sample({
    clock: $state,
    filter: ({ status }) => status === 'running',
    fn: (state) => (state as RunningState<T>).data,
    target: running,
  });

  sample({
    clock: input.updates,
    filter: isRunning,
    fn: (data) => calculateState(data, filter),
    target: $state,
  });

  sample({
    clock: $state,
    fn: (state) => (state.status === 'running' ? state.data : state.status === 'failed' ? state.data : null),
    target: $input,
  });

  // Gate management

  const gate = createGate(name ? `${name}/gate` : undefined);
  const $gatesOpened = domain.createStore(0, { name: 'gatesOpened' });

  $gatesOpened.on(gate.open, (x) => x + 1);
  $gatesOpened.on(gate.close, (x) => x - 1);

  sample({
    clock: $gatesOpened,
    filter: (x) => x === 1,
    fn: (): BootstrapParams => ({ reason: 'gate' }),
    target: bootstrap,
  });

  sample({
    clock: $gatesOpened,
    source: $bootstrapParams,
    filter: (params, x) => x === 0 && nonNullable(params) && params.reason === 'gate',
    target: stop,
  });

  // DI integration

  const registerIdentifier = domain.createEvent<AnyIdentifier>();
  const $identifiers = domain.createStore<AnyIdentifier[]>([]);

  const triggerIdentifiersFx = domain.createEffect((identifiers: AnyIdentifier[]) => {
    for (const identifier of identifiers) {
      identifier.updateHandlers();
    }
  });

  sample({
    clock: registerIdentifier,
    source: $identifiers,
    fn: (list, item) => list.concat(item),
    target: $identifiers,
  });

  sample({
    clock: $status,
    source: $identifiers,
    target: triggerIdentifiersFx,
  });

  const inject = <T extends AnyIdentifier>(identifier: T, body: InferHandlerBody<T>) => {
    registerIdentifier(identifier);

    // special wrapper for views - we trying to start feature on render
    if (isSlotIdentifier(identifier)) {
      const slotHandlerBody = normalizeSlotHandler(body as InferHandlerBody<typeof identifier>);
      const handler = {
        order: slotHandlerBody.order,
        render: (props: never) => {
          useGate(gate);

          return slotHandlerBody.render(props);
        },
      };

      identifier.registerHandler({
        key: `feature: ${name}`,
        // TODO create correct feature toggle using effector tools
        // eslint-disable-next-line effector/no-getState
        available: () => (scope ? scope.getState(enable) : enable.getState()),
        body: handler,
      });
    } else {
      identifier.registerHandler({
        key: `feature: ${name}`,
        available: () => {
          // TODO create correct feature toggle using effector tools
          // eslint-disable-next-line effector/no-getState
          const isFeatureEnabled = scope ? scope.getState(enable) : enable.getState();
          // eslint-disable-next-line effector/no-getState
          const isFeatureRunning = scope ? scope.getState(isRunning) : isRunning.getState();

          return isFeatureEnabled && isFeatureRunning;
        },
        body,
      });
    }
  };

  // Combine

  return {
    name,

    status: readonly($status),
    state: readonly($state),
    input: readonly($input),

    running: readonly(running),
    stopped: readonly(stopped),
    failed: readonly(failed),

    isRunning: readonly(isRunning),
    isStarting: readonly(isStarting),
    isFailed: readonly(isFailed),

    gate,

    start,
    stop,
    fail,
    restore,

    inject,
  };
};
