import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const fastify = Fastify()

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const redisSub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
});

const orderQueue = new Queue('order-execution', {
  connection: redis,
});

fastify.register(websocket);


const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running at port 3000');
  } catch (err) {
    fastify.log.error(err);
  }
};

start();