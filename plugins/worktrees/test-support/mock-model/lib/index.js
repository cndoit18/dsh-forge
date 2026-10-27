export const name = 'worktree-e2e-mock-model'
export const inject = ['llm']

const responseText = '这是 BDD mock model 的确定性助手回复，用于验证真实聊天、分叉和状态刷新。'

export function apply(ctx) {
  ctx.llm.registerAdapter(['e2e-mock'], {
    providerInfo(provider) { return { id: provider, name: 'BDD Mock Provider' } },
    providerRetryPolicy() { return undefined },
    async listModels(provider) { return [{ provider, id: 'bdd', name: 'BDD Mock Model' }] },
    async resolveModel(provider, model) {
      return { provider, id: model, name: 'BDD Mock Model', context: { contextWindow: 128_000 } }
    },
    async prepareCall(provider, model, signal) {
      return { model: await this.resolveModel(provider, model, signal), stream: options => this.stream(options) }
    },
    async *stream() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      for (const text of responseText) yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: responseText } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: responseText.length } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
}
