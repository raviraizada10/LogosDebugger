import { parser, useStreamStore } from './streamStore';

const mockStreamText = [
  // 1. Initial thinking process
  "<thought>Analyzing incoming request payload for /api/v1/checkout. ",
  "Validating fields: { userId: 2049, cartId: 'cart_87a3b' }... ",
  "Payload syntax is clean. Initiating user session authentication trace. </thought>\n",
  
  // 2. Call auth middleware
  "<call name=\"authMiddleware\" args=\"{\\\"userId\\\": 2049, \\\"role\\\": \\\"pro_tier\\\"}\">",
  "Extracting JWT token from Authorization header... ",
  "Verifying signature with RSA-256 public key... ",
  "Signature verified. Active session found in Redis. ",
  "Querying Database to fetch user limits and tier status... \n",

  // 3. Database read
  "<call name=\"dbQuery\" args=\"{\\\"sql\\\": \\\"SELECT * FROM users WHERE id = 2049\\\"}\">",
  "Acquiring database connection pool client... ",
  "Query execution plan cached. Executing raw index scan. ",
  "Row retrieved. Status: ACTIVE, Tier: PRO. </call>\n",
  
  "User ledger accounts and balances loaded successfully. </call>\n",

  // 4. Rate Limiter check
  "<thought>Authentication completed. User is verified. Checking API rate limit quotas. </thought>\n",
  "<call name=\"rateLimiter\" args=\"{\\\"window\\\": \\\"60s\\\", \\\"limit\\\": 1000}\">",
  "Redis sliding window counter check... ",
  "Current consumption: 14/1000. Limit check PASSED. </call>\n",

  // 5. User service check
  "<thought>Quotas validated. Forwarding checkout payload to User Service for inventory locks. </thought>\n",
  "<call name=\"userService\" args=\"{\\\"sku\\\": \\\"GEMMA-4X\\\", \\\"quantity\\\": 1}\">",
  "Checking stock ledger for GEMMA-4X... ",
  "Inventory validated. Available stock: 42 left. ",
  "Reserving 1 item. Inventory locked. </call>\n",

  // 6. Payment processing fails
  "<thought>Inventory reserved. Initializing charge processing via Payment Gateway. </thought>\n",
  "<call name=\"paymentGateway\" args=\"{\\\"amount\\\": 299.00, \\\"currency\\\": \\\"USD\\\"}\">",
  "Establishing secure TLS 1.3 socket with payment network... ",
  "SSL handshakes successful. Posting transaction charge... ",
  "Charge authorization failed. Bank response: INSUFFICIENT_FUNDS. ",
  "Stripe Error code: card_declined. </call>\n",

  // 7. API Gateway handles error and rollbacks
  "<thought>Payment failed with insufficient funds. Rollbacking transaction state immediately to maintain ledger consistency. ",
  "Cancelling inventory lock for SKU GEMMA-4X. </thought>\n",
  
  // 8. Rollback service call
  "<call name=\"userServiceRollback\" args=\"{\\\"sku\\\": \\\"GEMMA-4X\\\"}\">",
  "Releasing inventory lock. Incrementing SKU count: 42 -> 43. ",
  "Database transaction rolled back. Lock cleared. </call>\n",

  // 9. Analytics queue push
  "<thought>Inventory lock released. Publishing transaction analytics failed payload. </thought>\n",
  "<call name=\"analyticsQueue\" args=\"{\\\"routingKey\\\": \\\"checkout.failed\\\"}\">",
  "Connecting to RabbitMQ broker... ",
  "Encoding JSON failure report. Message published and amqp.acknowledged. </call>\n",

  // 10. Gateway responds with error code
  "<thought>Rollbacks complete. Responding to client with HTTP 402 Payment Required error payload. </thought>",
  "<response>{\"status\": 402, \"error\": \"card_declined\", \"message\": \"Your transaction failed due to insufficient funds.\"} </response>"
];

let simulationInterval: NodeJS.Timeout | null = null;

export function runTraceSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }

  // Reset the production store
  useStreamStore.getState().resetStore();
  useStreamStore.getState().setPlaybackState('playing');
  useStreamStore.getState().setIsStreaming(true);

  let chunkIndex = 0;
  let wordIndex = 0;
  let words: string[] = [];

  // Segment text into single-word chunks to simulate character-by-character real streaming
  const nextChunkText = mockStreamText[chunkIndex];
  words = nextChunkText.split(/(\s+)/);

  simulationInterval = setInterval(() => {
    const { playbackState } = useStreamStore.getState();
    if (playbackState === 'paused') return;
    if (playbackState === 'stopped') {
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      return;
    }

    if (wordIndex < words.length) {
      const word = words[wordIndex];
      parser.write(word);
      wordIndex++;

      // Automatically push some mock variables or logs during steps
      const activeNodeId = useStreamStore.getState().activeNodeId;
      if (activeNodeId) {
        // Trigger occasional logs/mutations to showcase real-time variable bindings
        if (word.includes('SELECT')) {
          useStreamStore.getState().addLog({
            level: 'info',
            message: 'DB execution index scan hit: PRIMARY KEY',
            nodeId: activeNodeId
          });
        }
        if (word.includes('PRO')) {
          useStreamStore.getState().addVariableMutation({
            variableName: 'user.tier',
            oldValue: 'guest',
            newValue: 'pro',
            nodeId: activeNodeId
          });
        }
        if (word.includes('14/1000')) {
          useStreamStore.getState().addVariableMutation({
            variableName: 'rate.limitUsed',
            oldValue: 13,
            newValue: 14,
            nodeId: activeNodeId
          });
        }
        if (word.includes('INSUFFICIENT_FUNDS')) {
          useStreamStore.getState().addLog({
            level: 'error',
            message: 'Stripe POST /charges -> HTTP 402 Declined',
            nodeId: activeNodeId
          });
          useStreamStore.getState().addVariableMutation({
            variableName: 'payment.status',
            oldValue: 'authorizing',
            newValue: 'declined',
            nodeId: activeNodeId
          });
        }
      }
    } else {
      chunkIndex++;
      if (chunkIndex < mockStreamText.length) {
        const nextText = mockStreamText[chunkIndex];
        words = nextText.split(/(\s+)/);
        wordIndex = 0;
      } else {
        clearInterval(simulationInterval!);
        simulationInterval = null;
        useStreamStore.getState().setIsStreaming(false);
        useStreamStore.getState().setPlaybackState('stopped');
      }
    }
  }, 40); // Fast word delivery (~25 FPS) for highly dynamic flow canvas pulsing!
}

export function stopTraceSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  useStreamStore.getState().setPlaybackState('stopped');
  useStreamStore.getState().setIsStreaming(false);
}
