import { describe, expect, it } from 'vitest'
import { canonicalButton } from './pointer'

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
