import { describe, expect, it, vi } from 'vitest';
import {
  PipelineRuntimeService,
  getPipelineRuntimeKey,
} from '../src/services/pipelineRuntimeService';

const selectedTasks = [
  {
    id: 'prepare',
    name: 'prepare',
    command: 'echo prepare',
    description: 'Prepare the run',
  },
  {
    id: 'execute',
    name: 'execute',
    command: 'echo execute',
    description: 'Execute the run',
  },
];

describe('PipelineRuntimeService multi-instance identity', () => {
  it('uses a draft key only when no runId is present', () => {
    expect(getPipelineRuntimeKey('hibist', 'module-a')).toBe('hibist:module-a:draft');
    expect(getPipelineRuntimeKey('hibist', 'module-a', 'exec_1_1')).toBe('exec_1_1');
  });

  it('creates a separate runtime for repeated starts of the same module', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new PipelineRuntimeService({
      onUpdate: vi.fn(),
      onHistory: vi.fn(),
      openTerminal: vi.fn(),
    });

    const first = service.startRuntime(
      'hibist',
      'module-a',
      'Hibist',
      undefined,
      undefined,
      undefined,
      undefined,
      selectedTasks,
    );
    const second = service.startRuntime(
      'hibist',
      'module-a',
      'Hibist',
      undefined,
      undefined,
      undefined,
      undefined,
      selectedTasks,
    );

    expect(first.runId).toBeTruthy();
    expect(second.runId).toBeTruthy();
    expect(second.runId).not.toBe(first.runId);
    expect(
      service.getRuntimes().filter(
        (runtime) => runtime.flowKey === 'hibist' && runtime.moduleKey === 'module-a' && runtime.runId,
      ),
    ).toHaveLength(2);

    service.selectTask('hibist', 'module-a', first.runId!, 'execute');
    const firstAfterSelection = service.getRuntimes().find((runtime) => runtime.runId === first.runId);
    const secondAfterSelection = service.getRuntimes().find((runtime) => runtime.runId === second.runId);
    expect(firstAfterSelection?.selectedTaskId).toBe('execute');
    expect(secondAfterSelection?.selectedTaskId).toBe('prepare');
    consoleError.mockRestore();
  });
});
