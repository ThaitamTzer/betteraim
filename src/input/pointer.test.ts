import { describe, expect, it } from 'vitest'
import { canonicalButton, isChromium } from './pointer'

describe('isChromium', () => {
  it('is true for Chrome, Edge and Opera, whose raw counts are the verified path, and false for Firefox and Safari', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
    expect(isChromium(chrome)).toBe(true)
    expect(isChromium(`${chrome} Edg/156.0.0.0`)).toBe(true)
    expect(isChromium(`${chrome} OPR/120.0.0.0`)).toBe(true)
    expect(isChromium('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0')).toBe(false)
    expect(isChromium('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15')).toBe(false)
  })
})

describe('canonicalButton', () => {
  it('leaves every button alone while the fire button is the default', () => {
    for (const button of [0, 1, 2, 3, 4]) expect(canonicalButton(button, 0)).toBe(button)
  })

  it('turns the bound button into button 0 and the old button 0 into a button that does not fire', () => {
    expect(canonicalButton(2, 2)).toBe(0)
    expect(canonicalButton(0, 2)).toBe(2)
    expect(canonicalButton(1, 2)).toBe(1)
  })
})
