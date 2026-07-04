// Assinatura — planos + pagamento Lightning. Usa os endpoints já existentes do
// backend (sem mudança no servidor):
//   POST /api/invoice/<plan_id>?months=N  → { status, bolt11, checking_id, amount_sats, months }
//   GET  /api/invoice/check/<checking_id> → { status, paid }
//   POST /api/upgrade-plan { npub, plan_id, checking_id, months } → aplica o plano
// Os planos espelham config/plans.json do v2.0 (não há API JSON de planos; quando
// houver /api/plans, trocar PLANS por fetch — exige restart do backend).
import { api } from './api'

export interface Plan {
  id: string
  icon: string
  name: string
  storage_gb: number
  price_usd: number
  amount_sats: number
  description: string
}

export const PLANS: Plan[] = [
  { id: 'free', icon: 'gift', name: 'Free', storage_gb: 3, price_usd: 0, amount_sats: 0, description: 'Gratuito, para começar e apoiar o projeto voluntariamente.' },
  { id: 'starter', icon: 'sparkles', name: 'Starter', storage_gb: 10, price_usd: 1.0, amount_sats: 1499, description: 'Ideal para uso leve, com upload esporádico.' },
  { id: 'standard', icon: 'star', name: 'Standard', storage_gb: 25, price_usd: 2.0, amount_sats: 2997, description: 'Perfeito para usuários casuais e pequenos criadores.' },
  { id: 'plus', icon: 'crown', name: 'Plus', storage_gb: 50, price_usd: 4.0, amount_sats: 5995, description: 'Armazenamento estável para uploads regulares.' },
  { id: 'pro', icon: 'rocket', name: 'Pro', storage_gb: 100, price_usd: 8.0, amount_sats: 11990, description: 'Criadores de conteúdo profissionais.' },
  { id: 'business', icon: 'users', name: 'Business', storage_gb: 250, price_usd: 20.0, amount_sats: 29974, description: 'Armazenamento premium, prioridade total e suporte dedicado.' },
]

// Períodos com desconto (o backend calcula o preço final via _calculate_subscription_price).
export const PERIODS = [
  { months: 1, label: '1 mês' },
  { months: 2, label: '2 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 ano' },
] as const

export interface InvoiceResult {
  status: 'ok' | 'free' | 'error'
  bolt11?: string
  checking_id?: string
  amount_sats?: number
  months?: number
  error?: string
}

export async function createInvoice(planId: string, months: number, npub: string | null): Promise<InvoiceResult> {
  return api.post<InvoiceResult>(`/api/invoice/${planId}?months=${months}`, { npub: npub ?? '' })
}

export async function checkInvoice(checkingId: string): Promise<boolean> {
  const res = await api.get<{ status: string; paid?: boolean }>(`/api/invoice/check/${checkingId}`)
  return !!res.paid
}

export async function upgradePlan(
  npub: string,
  planId: string,
  checkingId: string,
  months: number,
): Promise<boolean> {
  try {
    const res = await api.post<{ status: string }>('/api/upgrade-plan', {
      npub,
      plan_id: planId,
      checking_id: checkingId,
      months,
    })
    return res.status === 'ok' || res.status === 'success'
  } catch {
    return false
  }
}
