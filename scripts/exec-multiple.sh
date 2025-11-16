#!/bin/bash

run_parallel() {
  echo "Running 3 orders simultaneously..."

  order_task() {
    resp=$(curl -s -X POST http://localhost:3000/api/orders/execute \
      -H "Content-Type: application/json" \
      -d '{"tokenIn":"ETH","tokenOut":"USDT","amount":1,"orderType":"market"}')

    id=$(echo "$resp" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
    echo "Order ID: $id"

    websocat "ws://localhost:3000/api/orders/execute/$id" | while read -r line; do
      orderId=$(echo "$line" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
      status=$(echo "$line" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')

      [[ "$status" == "confirmed" || "$status" == "failed" ]] && break
    done
  }

  order_task &
  order_task &
  order_task &
  wait
}

run_parallel
