import { useSyncExternalStore } from 'react'
import { getCommissions, subscribeCommissions } from './commissions.js'

/**
 * Live read of the saved commission rates. Every fee field on the Wheel tab
 * pre-fills from this, so editing the rates in Commission settings re-prices
 * open modals immediately instead of waiting for a remount.
 */
export function useCommissions() {
  return useSyncExternalStore(subscribeCommissions, getCommissions, getCommissions)
}
