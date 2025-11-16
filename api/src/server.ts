import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import orderRoutes from './routes/order.js'
import { prisma } from 'db';

const fastify = Fastify()

const redis = new Redis(process.env.REDIS_URL!);
const redisSub = new Redis(process.env.REDIS_URL!);

const orderQueue = new Queue('order-execution', {
  connection: new Redis(process.env.REDIS_URL!)
});


fastify.register(websocket);

fastify.register(orderRoutes, { prisma, orderQueue, redisSub });


const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running at port 3000');
  } catch (err) {
    console.error(err);
  }
};

start();