import { Redis } from 'ioredis';
import { dexHandler } from './services/dexHandler.js';
import { prisma } from 'db';

const handler = new dexHandler();

interface OrderData {
  orderId: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  orderType: string;
}

async function publishStatus(redis: Redis, orderId: string, status: string, message: string, data?: Record<string, any>) {

  const update = { orderId, status, message, ...(data ?? {}) };
  await redis.publish(`order:${orderId}`, JSON.stringify(update));

  if (data) {
    await prisma.orders.update({
      where: { id: orderId },
      data: { status, ...data },
    });
  } else {
    await prisma.orders.update({
      where: { id: orderId },
      data: { status },
    });
  }

  console.log(`\n${orderId} -  Status: ${status} - ${message}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processOrder(orderData: OrderData, redis: Redis) {
  const { orderId, tokenIn, tokenOut, amount } = orderData;
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;

      // status : routing
      await publishStatus(
        redis,
        orderId,
        'routing',
        'Comparing prices on Raydium and Meteora'
      );

      const bestRoute = await handler.getBestRoute(tokenIn, tokenOut, amount);

      console.log(`${orderId} - Selected DEX: ${bestRoute.dex}, price = ${bestRoute.price}`);

      // status : building
      await publishStatus(
        redis,
        orderId,
        'building',
        `Building transaction for ${bestRoute.dex}`,
        { selectedDex: bestRoute.dex }
      );

      await sleep(500);

      // status : submitted
      await publishStatus(
        redis,
        orderId,
        'submitted',
        'Transaction sent to network'
      );

      const result = await handler.executeSwap(bestRoute.dex, {
        tokenIn,
        tokenOut,
        amount,
      });

      // status : confirmed
      await publishStatus(
        redis,
        orderId,
        'confirmed',
        'Transaction successful',
        {
          txHash: result.txHash,
          executedPrice: result.executedPrice,
          selectedDex: bestRoute.dex,
        }
      );

      return;

    } catch (error) {
      console.error(`${orderId} - Attempt ${attempt} failed:`, error);

      if (attempt >= maxRetries) {
        // status : failed
        await publishStatus(
          redis,
          orderId,
          'failed',
          'Order execution failed',
          { errorMessage: error }
        );
        throw error;
      }

      console.log(`${orderId} -  Retrying`);
      await sleep(1000);
    }
  }
}
