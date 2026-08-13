import { Capacitor } from '@capacitor/core'
import { TapToPayDarkMode } from '@capgo/capacitor-stripe-terminal/dist/esm/definitions'
import { TerminalEventsEnum } from '@capgo/capacitor-stripe-terminal/dist/esm/events.enum'
import { TerminalConnectTypes } from '@capgo/capacitor-stripe-terminal/dist/esm/stripe.enum'
import type { StripeTerminalConfig } from './stripe-connector'
import { createStripeConnectionToken } from './stripe-terminal-api'

export function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function tapToPaySupported() {
  return isAndroidNative()
}

type TerminalModule = typeof import('@capgo/capacitor-stripe-terminal')

let pluginPromise: Promise<TerminalModule | null> | null = null
let initialized = false
let tokenListenerAttached = false

async function loadPlugin() {
  if (!tapToPaySupported()) return null
  pluginPromise ??= import('@capgo/capacitor-stripe-terminal').catch(() => null)
  return pluginPromise
}

export async function initTapToPay(config: StripeTerminalConfig) {
  const plugin = await loadPlugin()
  if (!plugin) throw new Error('Tap to Pay is only available in the Fran POS Android app')

  if (!tokenListenerAttached) {
    await plugin.StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
      try {
        const { secret } = await createStripeConnectionToken(config.location_id)
        await plugin.StripeTerminal.setConnectionToken({ token: secret })
      } catch (error) {
        await plugin.StripeTerminal.setConnectionToken({ token: '' }).catch(() => {})
        console.error(error)
      }
    })
    tokenListenerAttached = true
  }

  if (!initialized) {
    await plugin.StripeTerminal.initialize({ isTest: config.simulated })
    initialized = true
  }

  await plugin.StripeTerminal.setTapToPayUxConfiguration({
    colors: {
      primary: '#FFE14D',
      success: '#2D8A5E',
      error: '#C43A3A',
    },
    darkMode: TapToPayDarkMode.Light,
    tapZone: { type: 'default' },
  }).catch(() => {})

  return plugin
}

export async function collectTapToPay(input: {
  config: StripeTerminalConfig
  clientSecret: string
  onStatus?: (message: string) => void
}) {
  const plugin = await initTapToPay(input.config)
  if (!plugin) throw new Error('Tap to Pay is only available in the Fran POS Android app')
  if (!input.config.location_id) throw new Error('Set a Stripe Terminal location before using Tap to Pay')

  input.onStatus?.('Connecting Tap to Pay on this device…')
  const { readers } = await plugin.StripeTerminal.discoverReaders({
    type: TerminalConnectTypes.TapToPay,
    locationId: input.config.location_id,
  })
  const reader = readers[0]
  if (!reader) throw new Error('This Android device is not eligible for Tap to Pay (NFC, Android 13+, Play services).')

  await plugin.StripeTerminal.connectReader({
    reader,
    autoReconnectOnUnexpectedDisconnect: true,
    merchantDisplayName: input.config.merchant_display_name,
  })

  try {
    input.onStatus?.('Hold the card or phone to the back of this device…')
    await plugin.StripeTerminal.collectPaymentMethod({ paymentIntent: input.clientSecret })
    input.onStatus?.('Authorizing…')
    await plugin.StripeTerminal.confirmPaymentIntent()
  } catch (error) {
    await plugin.StripeTerminal.cancelCollectPaymentMethod().catch(() => {})
    throw error
  }
}

export async function cancelTapToPay() {
  const plugin = await loadPlugin()
  if (!plugin) return
  await plugin.StripeTerminal.cancelCollectPaymentMethod().catch(() => {})
}
