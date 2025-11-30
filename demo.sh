#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[DEMO] $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; cat app.log; exit 1; }

# Generic wait function to replace sleeps
wait_for() {
  local name=$1
  local cmd=$2
  local max_retries=${3:-30}
  local sleep_time=${4:-1}
  
  log "Waiting for $name..."
  local count=0
  while [ $count -lt $max_retries ]; do
    if eval "$cmd"; then
      echo "" # Newline after dots
      success "$name is ready."
      return 0
    fi
    sleep $sleep_time
    count=$((count+1))
    echo -n "."
  done
  echo ""
  error "Timeout waiting for $name."
}

# Cleanup function to run on exit
cleanup() {
  log "Cleaning up..."
  if [ -n "$APP_PID" ]; then
    kill $APP_PID 2>/dev/null || true
  fi
  docker compose down >/dev/null 2>&1
  rm -f app.log
  success "Cleanup complete."
}
trap cleanup EXIT

# 1. Start Infrastructure
# 1. Start Infrastructure

# Aggressive cleanup of potential zombies
docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up -d

# 2. Wait for Services
# We check for readiness immediately without arbitrary sleeps

# LocalStack
log "Run sqs..."
wait_for "LocalStack" "docker compose logs localstack 2>&1 | grep -q 'Ready.'" 30 1

# SQS Queue (LocalStack script creates it)
wait_for "SQS Queue 'my-queue'" "docker exec \$(docker compose ps -q localstack) awslocal sqs get-queue-url --queue-name my-queue >/dev/null 2>&1" 20 1

# RabbitMQ
log "Run rabbitmq..."
wait_for "RabbitMQ" "docker exec \$(docker compose ps -q rabbitmq) rabbitmqctl status >/dev/null 2>&1" 40 1

# 3. Start App
log "Starting NestJS App (SQS + RabbitMQ)..."
# Kill port 3000 if used
pid=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$pid" ]; then
  log "Killing process $pid on port 3000"
  kill -9 $pid 2>/dev/null || true
fi

export QUEUE_TYPE="SQS,RABBITMQ"
export AWS_REGION="us-east-1"
export SQS_ENDPOINT="http://localhost:4566"
export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"
export RABBITMQ_URL="amqp://guest:guest@localhost:5672"

yarn start > app.log 2>&1 &
APP_PID=$!

wait_for "NestJS App (Port 3000)" "nc -z localhost 3000" 60 1

# 4. Send & Verify
log "Publish message 1..."
ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
PAYLOAD='{"msg": "Hello World", "ts": "'$(date +%s)'", "id": "'$ID'"}'
curl -s -X POST http://localhost:3000/publish \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

log "Publish message 2 (Duplicate ID)..."
curl -s -X POST http://localhost:3000/publish \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

log "Publish message 3 (New ID)..."
ID2=$(uuidgen | tr '[:upper:]' '[:lower:]')
PAYLOAD2='{"msg": "Hello World 2", "ts": "'$(date +%s)'", "id": "'$ID2'"}'
curl -s -X POST http://localhost:3000/publish \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD2"

log "Verifying logs..."
# We expect 2 received messages (Message 1 and Message 3)
wait_for "Message 1 Receipt" "grep -q '$ID' app.log" 10 1
wait_for "Message 3 Receipt" "grep -q '$ID2' app.log" 10 1

# Show the success log
grep "RECEIVED MESSAGE" app.log
echo ""
log "Verifying duplicates ignored..."
grep "Duplicate message detected" app.log
