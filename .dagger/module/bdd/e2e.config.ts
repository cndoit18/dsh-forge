import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { web } from '@e2e-dev/web';
import type { E2EConfig } from 'e2e';

const appUrl = process.env.DSH_APP_URL;
const launchToken = process.env.DSH_TEST_TOKEN;
const baseURL = process.env.E2E_MODEL_BASE_URL;
const modelId = process.env.E2E_MODEL_ID;
if (!appUrl || !launchToken || !baseURL || !modelId) {
  throw new Error('DSH_APP_URL, DSH_TEST_TOKEN, E2E_MODEL_BASE_URL and E2E_MODEL_ID are required');
}

const provider = createOpenAICompatible({
  name: 'bdd-model',
  baseURL,
  supportsStructuredOutputs: true,
  ...(process.env.DSH_MODEL_API_KEY ? { apiKey: process.env.DSH_MODEL_API_KEY } : {}),
});

export default {
  targets: [{
    name: 'web',
    engine: web(),
    app: { url: appUrl },
    video: process.env.E2E_VIDEO === '1' ? 'on' : 'off',
  }],
  agents: { default: { model: provider.chatModel(modelId) } },
  secrets: { 'web-launch-token': launchToken },
  cache: 'off',
  trace: 'off',
  assertionTimeout: 30_000,
  retries: 0,
  workers: 1,
} satisfies E2EConfig;
