import { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from 'db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { handleOrderMessage } from '../services/orderHandler';

interface RouteType {
  prisma: PrismaClient;
  orderQueue: Queue;
  redisSub: Redis;
}

const orderRoutes: FastifyPluginAsync<RouteType> = async (fastify, opts) => {
  const { prisma, orderQueue, redisSub } = opts;

  fastify.get('/api/orders/execute', { websocket: true }, (connection, req) => {
    connection.on('message', (rawMsg) => {
      handleOrderMessage(rawMsg, connection, prisma, orderQueue, redisSub).catch(err => {
        connection.send(JSON.stringify({ error: err.message }));
        connection.close();
      });
    });
  });
};


export default orderRoutes;
