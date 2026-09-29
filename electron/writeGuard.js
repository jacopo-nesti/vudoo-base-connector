export function createWriteGuard() {
  let importInProgress = false;

  return {
    isBusy: () => importInProgress,
    async run(operation) {
      if (importInProgress) throw new Error('Un’importazione o sincronizzazione è già in corso.');
      importInProgress = true;
      try {
        return await operation();
      } finally {
        importInProgress = false;
      }
    },
  };
}
