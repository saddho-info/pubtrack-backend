export class Queue {
  add = jest.fn().mockResolvedValue({ id: 'job_mock' });
}

export class Worker {
  close = jest.fn();
}

export type Job<T = unknown> = {
  name: string;
  data: T;
  id?: string;
};

export default { Queue, Worker };
