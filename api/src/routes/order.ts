import { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from 'db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { handleOrder } from '../services/orderHandler';
import { z } from 'zod';

interface RouteType {
  prisma: PrismaClient;
  orderQueue: Queue;
  redisSub: Redis;
}

const OrderSchema = z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amount: z.coerce.number(),
    orderType: z.enum(['market', 'limit', 'sniper']),
});

const orderRoutes: FastifyPluginAsync<RouteType> = async (fastify, opts) => {
  const { prisma, orderQueue, redisSub } = opts;

  fastify.post('/api/orders/execute', async (request, response) => {
    const parsedData = OrderSchema.safeParse(request.body)
    
    if (!parsedData.success) {
      return response.code(400).send({
        error: "Invalid order data"
      })
    }

    const body = parsedData.data

    const order = await prisma.orders.create({
      data: {
        tokenIn: body.tokenIn,
        tokenOut: body.tokenOut,
        amount: body.amount,
        orderType: body.orderType,
        status: 'pending',
      },
    });

    await orderQueue.add('execute-order', { 
        orderId: order.id, 
        tokenIn: order.tokenIn,
        tokenOut: order.tokenOut,
        amount: order.amount,
        orderType: order.orderType,
    });

    return response.send({ 
      orderId: order.id 
    });
  })


  fastify.get('/api/orders/execute/:id', { websocket: true }, (connection, req) => {
    const { id } = req.params as { id: string }

    handleOrder(id, connection, prisma, orderQueue, redisSub).catch(err => {
      connection.send(JSON.stringify({ error: err.message }));
      connection.close();
    });
  });
};


export default orderRoutes;
