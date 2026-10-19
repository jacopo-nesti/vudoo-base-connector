export function statusTone(status) {
  if (['READY','BASE_READY','SUCCESS','SYNCED','ACTIVE','active','connected'].includes(status)) return 'ready';
  if (['ERROR','BLOCKING_ERROR','FAILED','failed','blocked','MISSING_REQUIRED_DATA','INVALID_VALUE','INVALID_EAN'].includes(status)) return 'blocked';
  if (['MISSING_DATA','UNMAPPED_CATEGORY','WARNING','uncertain'].includes(status)) return 'pending';
  return 'neutral';
}
