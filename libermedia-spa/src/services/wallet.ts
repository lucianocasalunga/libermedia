// SHIM — a carteira agora vive em @libernet/wallet-core (fonte única).
// Re-exporta o módulo do pacote para que TODOS os consumidores do LiberMedia
// (CarteiraPage, TopSecretMedia, …) compartilhem a MESMA instância de módulo —
// e portanto o MESMO token em memória. Não duplicar lógica aqui.
export * from '@libernet/wallet-core'
