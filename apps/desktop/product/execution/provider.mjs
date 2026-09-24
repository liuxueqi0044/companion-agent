/** A trusted owner injects a provider. The default never starts generation. */
export const UnavailableProvider = Object.freeze({
  configured:false,
  async respond() { throw new Error('model_not_configured') },
})

export function providerReply(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !['decision','displayableSummary'].includes(key)) ||
    !value.decision || typeof value.decision !== 'object' || Array.isArray(value.decision) ||
    (value.displayableSummary !== undefined && value.displayableSummary !== null &&
      (typeof value.displayableSummary !== 'string' ||
       Buffer.byteLength(value.displayableSummary,'utf8') > 16 * 1024))) return null
  return {decision:structuredClone(value.decision),
    displayableSummary:value.displayableSummary ?? null}
}
