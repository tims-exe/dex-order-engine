#!/bin/bash

run_one() {
  echo "Running 1 order..."

  response=$(curl -s -X POST http://localhost:3000/api/orders/execute \
    -H "Content-Type: application/json" \
    -d '{"tokenIn":"ETH","tokenOut":"USDT","amount":5,"orderType":"market"}')

  echo "Response: $response"

  orderId=$(echo "$response" | sed -n 's/.*"orderId":"\([^"]*\)".*/\1/p')
  echo "Order ID: $orderId"

  websocat "ws://localhost:3000/api/orders/execute/$orderId" > /dev/null 2>&1
}

run_one