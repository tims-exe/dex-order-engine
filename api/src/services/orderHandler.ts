import type WebSocket from 'ws';
import type { PrismaClient } from 'db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';


const OrderSchema = z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amount: z.coerce.number(),
    orderType: z.enum(['market', 'limit', 'sniper']),
});


export async function handleOrderMessage(rawMsg: WebSocket.RawData, connection: WebSocket, prisma: PrismaClient, orderQueue: Queue, redisSub: Redis) {
    let body;
    // validate body
    try {
        body = JSON.parse(rawMsg.toString());
    } catch {
        connection.send(JSON.stringify({ error: 'Invalid payload' }));
        connection.close();
        return;
    }

    const parsed = OrderSchema.safeParse(body);
    if (!parsed.success) {
        connection.send(JSON.stringify({ error: 'Invalid order data' }));
        connection.close();
        return;
    }

    body = parsed.data;

    // push to db
    const order = await prisma.orders.create({
        data: {
            tokenIn: body.tokenIn,
            tokenOut: body.tokenOut,
            amount: body.amount,
            orderType: body.orderType,
            status: 'pending',
        },
    });

    connection.send(
        JSON.stringify({
            orderId: order.id,
            status: 'pending',
            message: 'Order received and queued',
        })
    );

    await orderQueue.add('execute-order', { orderId: order.id, ...body });

    const channel = `order:${order.id}`;
    await redisSub.subscribe(channel);

    const handleMessage = async (ch: string, msg: string) => {
        if (ch !== channel) return;

        const update = JSON.parse(msg);
        connection.send(msg);

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