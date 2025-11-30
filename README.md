# NestJS Queue Boilerplate

A flexible NestJS boilerplate that abstracts queue providers (SQS & RabbitMQ), allowing you to swap implementations via environment variables without changing code.

## 🚀 Getting Started

> **Quick Start:** If you want to run this in an easier way, simply run the demo script:
> ```bash
> ./demo.sh
> ```
> This script will handle infrastructure, app startup, and verification automatically.

### 1. Start Infrastructure
Start LocalStack (SQS) and RabbitMQ using Docker Compose.
```bash
docker-compose up -d
```
*Note: The setup includes a script that automatically creates `my-queue` in LocalStack.*

### 2. Install Dependencies
```bash
yarn install
```

### 3. Run the Application
By default, the app uses **SQS**.
```bash
# Run with SQS (default)
yarn start:dev

# Run with RabbitMQ
QUEUE_TYPE=RABBITMQ yarn start:dev
```

---

## 🧪 How to Test

### Publish a Message
You can use `curl` to send a message to the API. The app will publish it to the queue, and the listener will immediately pick it up and log it.

```bash
curl -X POST http://localhost:3000/publish \
   -H "Content-Type: application/json" \
   -d '{"hello": "world", "timestamp": 12345}'
```

**Expected Output in Terminal:**
```text
[AppController] Publishing to my-queue...
[SqsQueueClient] Message published to SQS queue my-queue
[SqsQueueClient] Subscribing to SQS queue my-queue
[AppController] 📢 RECEIVED MESSAGE: {"id":"...","payload":{"hello":"world","timestamp":12345},"timestamp":...,"provider":"SQS"}
```

---

## ⚙️ Configuration

The application enforces strict configuration validation. You must provide the following environment variables based on your `QUEUE_TYPE`.

| Variable | Required For | Description |
| :--- | :--- | :--- |
| `QUEUE_TYPE` | All | Comma-separated list: `SQS`, `RABBITMQ` (Default: `SQS`) |
| `AWS_REGION` | SQS | AWS Region (e.g., `us-east-1`) |
| `SQS_ENDPOINT` | SQS (Local) | URL for LocalStack (e.g., `http://localhost:4566`) |
| `AWS_ACCESS_KEY_ID` | SQS | AWS Access Key |
| `AWS_SECRET_ACCESS_KEY` | SQS | AWS Secret Key |
| `RABBITMQ_URL` | RabbitMQ | Connection string (e.g., `amqp://guest:guest@localhost:5672`) |

---

## 🏗 Architecture & Best Practices

### 1. Queue Abstraction (Polymorphism)
The application uses a **Dynamic Module** (`QueueModule`) that inspects the `QUEUE_TYPE` environment variable to inject the correct implementation of the abstract `QueueClient`.
- `QUEUE_TYPE=SQS`: Injects `SqsQueueClient`.
- `QUEUE_TYPE=RABBITMQ`: Injects `RabbitMqQueueClient`.
- `QUEUE_TYPE=SQS,RABBITMQ`: Injects `MultiQueueClient` (Fan-out pattern).

### 2. Idempotency (SRP & Scalability)
To prevent duplicate message processing, the system uses a dedicated `IdempotencyStore` abstraction.
- **Default:** `InMemoryIdempotencyStore` (Good for development/testing).
- **Production:** You should implement a `RedisIdempotencyStore` (or similar) extending the `IdempotencyStore` abstract class. This ensures state is shared across multiple instances (horizontal scaling).

### 3. Type Safety
Messages are strictly typed using Generics:
```typescript
interface QueueMessage<T> {
  id: string;       // Unique ID for idempotency
  payload: T;       // Your actual data
  timestamp: number;
}
```
The `AppController` automatically wraps your request body into this structure before publishing.

## Dead Letter Queues (DLQ)

This boilerplate implements retry logic for publishing messages. However, for **consuming** messages, if the handler fails repeatedly, the message might be lost or cause an infinite loop depending on the provider's default behavior.

**Recommendation:** You should configure **Dead Letter Queues (DLQ)** at the infrastructure level (AWS SQS or RabbitMQ configuration). This ensures that messages that fail processing after a certain number of attempts are moved to a separate queue for manual inspection, rather than being lost.

### Two Factor App & Configuration
Configuration is strictly separated from code.
- **Docker**: Handles infrastructure state.
- **Environment Variables**: Control application behavior (`QUEUE_TYPE`, `AWS_REGION`, etc.).
- **Code**: Remains agnostic of the underlying provider.

### Testing Strategy
To test this effectively:
1.  **Unit Tests**: Mock `QueueClient` to test your business logic without real queues.
2.  **E2E Tests**: Use the provided `docker-compose` environment. The generic `QueueClient` interface makes it easy to swap in an `InMemoryQueueClient` for fast local testing without Docker if needed.
