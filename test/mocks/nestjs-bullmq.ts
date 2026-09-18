export class Queue {
  add = jest.fn().mockResolvedValue({ id: 'job_mock' });
  close = jest.fn();
}

export class WorkerHost {
  // Nest BullMQ processors extend this in production.
}

export function Processor(_name?: string): ClassDecorator {
  return () => undefined;
}

export const BullModule = {
  forRoot: () => ({
    module: class MockBullRootModule {},
    providers: [],
    exports: [],
  }),
  registerQueue: (options: { name: string }) => ({
    module: class MockBullQueueModule {},
    providers: [
      {
        provide: `BullQueue_${options.name}`,
        useValue: new Queue(),
      },
    ],
    exports: [`BullQueue_${options.name}`],
  }),
};

export default { BullModule, Queue, WorkerHost, Processor };
