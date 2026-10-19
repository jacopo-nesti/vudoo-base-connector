export const settingHelpContent = Object.freeze({
  vudooResultsLimit: 'Numero massimo di prodotti richiesti durante il caricamento di un catalogo Vudoo. Aumentare il valore permette di caricare cataloghi più grandi, ma può aumentare tempi di caricamento e quantità di dati elaborati.',
  vudooTimeoutMs: 'Tempo massimo di attesa della risposta Vudoo. Un catalogo grande o una connessione lenta possono richiedere più tempo.',
  dryRun: 'Reale: le operazioni di import possono modificare Base.com. Simulazione: payload, preflight e report vengono generati normalmente, ma nessuna modifica viene inviata a Base.com.',
  testMode: 'Limita l’elaborazione a un prodotto. Questo limite non impedisce le scritture: verifica sempre se la modalità operativa è Reale o Simulazione.',
  unmappedCategoryPolicy: 'Impostazione legacy mantenuta per compatibilità. La categoria non mappata non blocca l’import Base.com.',
  baseApiRequestsPerMinute: 'Numero massimo di richieste Base.com che l’app pianifica al minuto. Aumentalo solo se la quota API del tuo account lo consente.',
  baseApiReadAttempts: 'Numero massimo di tentativi per le letture Base.com che falliscono temporaneamente. Le scritture non vengono ritentate automaticamente.',
  baseApiRetryDelayMs: 'Attesa iniziale tra i tentativi di lettura Base.com dopo un errore temporaneo.',
  baseApiRateLimitDelayMs: 'Pausa applicata dopo una risposta Base.com che segnala il superamento del limite di richieste.',
});
