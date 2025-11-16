import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { processOrder } from './orderProcessor';

const redis = new Redis(process.env.REDIS_URL!);

const worker = new Worker(
  'order-execution',
  async (job) => {
    console.log(`Processing order: ${job.data.orderId}`);
    await processOrder(job.data, redis);
  },
  {
    connection: new Redis(process.env.REDIS_URL!),
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000,
    }
  }
);

worker.on('completed', (job) => {
  console.log(`\nOrder ${job.data.orderId} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Order ${job?.data?.orderId} failed:`, err.message);
});

console.log('worker started');