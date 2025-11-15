import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { processOrder } from './orderProcessor';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'order-execution',
  async (job) => {
    console.log(`Processing order: ${job.data.orderId}`);
    await processOrder(job.data, redis);
  },
  {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000,
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Order ${job.data.orderId} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Order ${job?.data?.orderId} failed:`, err.message);
});

console.log('worker started');