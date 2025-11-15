import type WebSocket from 'ws';
import type { PrismaClient } from 'db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

interface OrderData {
  orderId: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  orderType: string;
}

export async function handleOrder(orderId: string, connection: WebSocket, prisma: PrismaClient, orderQueue: Queue, redisSub: Redis) {
    const order = await prisma.orders.findUnique({
        where: { id: orderId },
    });

    if (!order) {
        connection.send(JSON.stringify({ error: 'Order not found' }));
        connection.close();
        return;
    }

    if (order.status === "confirmed") {
        console.log(`[${order.id}] => Status : ${order.status}`);
        connection.close();
    }

    const channel = `order:${order.id}`;
    await redisSub.subscribe(channel);

    const handleMessage = async (ch: string, msg: string) => {
        if (ch !== channel) return;

        const update = JSON.parse(msg);
        connection.send(msg);

        console.log(`[${update.orderId}] => Status : ${update.status}`);

        if (update.status === 'confirmed' || update.status === 'failed') {
            redisSub.off('message', handleMessage);
            await redisSub.unsubscribe(channel);
            connection.close();
        }
    };

    redisSub.on('message', handleMessage);

    connection.on('close', async () => {
        redisSub.off('message', handleMessage);
        await redisSub.unsubscribe(channel);
    });
}