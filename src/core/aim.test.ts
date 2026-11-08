import { describe, expect, it } from 'vitest'
import { aimDelta, angleBetween, degreesPerCount, offsetAim, verticalFovDeg } from './aim'

describe('degreesPerCount', () => {
  it('is 360 / (cm/360 x DPI / 2.54): 0.045 at 25.4 cm/360 and 800 DPI', () => {
    expect(degreesPerCount(25.4, 800)).toBeCloseTo(0.045, 12)
  })
})

describe('angular geometry', () => {
  it('measures true angular distance, not flat yaw/pitch distance', () => {
    expect(angleBetween({ yaw: 0, pitch: 0 }, { yaw: 90, pitch: 0 })).toBeCloseTo(90, 9)
    // near straight up, 180 degrees of yaw is only 2 degrees apart
    expect(angleBetween({ yaw: 0, pitch: 89 }, { yaw: 180, pitch: 89 })).toBeCloseTo(2, 9)
  })

  it('offsets along a bearing on the sphere (0 up, 90 right) keeping the distance', () => {
    const right = offsetAim({ yaw: 0, pitch: 0 }, 30, 90)
    expect(right.yaw).toBeCloseTo(30, 9)
    expect(right.pitch).toBeCloseTo(0, 9)
    const up = offsetAim({ yaw: 10, pitch: 0 }, 20, 0)
    expect(up.yaw).toBeCloseTo(10, 9)
    expect(up.pitch).toBeCloseTo(20, 9)
    const from = { yaw: -120, pitch: 35 }
    expect(angleBetween(from, offsetAim(from, 47, 213))).toBeCloseTo(47, 9)
  })

  it('takes the short way round for the yaw to turn', () => {
    expect(aimDelta({ yaw: 170, pitch: 0 }, { yaw: -170, pitch: 10 })).toEqual({ yaw: 20, pitch: 10 })
  })
})

describe('verticalFovDeg', () => {
  it('converts a horizontal FOV for the screen aspect and passes a vertical one through', () => {
    expect(verticalFovDeg({ degrees: 103, axis: 'horizontal' }, 16 / 9)).toBeCloseTo(70.5, 1)
    expect(verticalFovDeg({ degrees: 70, axis: 'vertical' }, 16 / 9)).toBe(70)
  })
})
