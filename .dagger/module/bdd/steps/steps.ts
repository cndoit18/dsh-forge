import { When } from './fixtures.js';

When('I exercise the AI gate', async ({ ai }) => {
  const result = await ai.act('exercise the AI gate');
  console.log(`[poc] agent summary: ${result.summary}`);
});
