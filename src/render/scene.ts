import * as THREE from 'three'
import { directionOf, verticalFovDeg } from '../core'
import type { Fov, RunState } from '../core'

// Targets sit on a sphere of this radius around the camera; their size is derived from the angular radius
// in degrees, so what the core defines in degrees is what is drawn.
const RANGE = 20
const rad = THREE.MathUtils.degToRad

export interface Scene3D {
  draw(state: RunState): void
  dispose(): void
}

/** Draws RunState: a camera at the crosshair's yaw/pitch, one sphere per target. `edgeArrow` points at an off-screen target. */
export function createScene(canvas: HTMLCanvasElement, fov: Fov, edgeArrow: HTMLElement): Scene3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0e13)
  // Plain reference geometry so turning is visible: a geodesic dome and a floor grid.
  scene.add(
    new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(60, 3)),
      new THREE.LineBasicMaterial({ color: 0x1b2433 }),
    ),
  )
  const floor = new THREE.GridHelper(160, 32, 0x2a3850, 0x182131)
  floor.position.y = -15
  scene.add(floor)

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200)
  camera.rotation.order = 'YXZ'

  const geometry = new THREE.SphereGeometry(1, 28, 20)
  const material = new THREE.MeshBasicMaterial({ color: 0xffb35c })
  const meshes = new Map<number, THREE.Mesh>()

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = verticalFovDeg(fov, camera.aspect)
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  const point = new THREE.Vector3()
  const pointArrow = (target: { yaw: number; pitch: number } | undefined) => {
    if (!target) {
      edgeArrow.hidden = true
      return
    }
    const [x, y, z] = directionOf(target)
    point.set(x * RANGE, y * RANGE, z * RANGE).project(camera)
    const behind = point.z > 1
    if (behind) point.set(-point.x, -point.y, point.z)
    const onScreen = !behind && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1
    edgeArrow.hidden = onScreen
    if (onScreen) return
    const scale = Math.max(Math.abs(point.x), Math.abs(point.y), 1e-6)
    edgeArrow.style.left = `${((point.x / scale) * 0.9 * 0.5 + 0.5) * 100}%`
    edgeArrow.style.top = `${(0.5 - (point.y / scale) * 0.9 * 0.5) * 100}%`
    edgeArrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(-point.y, point.x)}rad)`
  }

  return {
    draw(state) {
      // camera yaw is counter-clockwise in three.js and ours is clockwise (right), hence the sign
      camera.rotation.set(rad(state.crosshair.pitch), -rad(state.crosshair.yaw), 0)
      camera.updateMatrixWorld()

      const alive = new Set(state.targets.map((t) => t.id))
      for (const [id, mesh] of meshes) {
        if (alive.has(id)) continue
        scene.remove(mesh)
        meshes.delete(id)
      }
      for (const target of state.targets) {
        let mesh = meshes.get(target.id)
        if (!mesh) {
          mesh = new THREE.Mesh(geometry, material)
          meshes.set(target.id, mesh)
          scene.add(mesh)
        }
        const [x, y, z] = directionOf(target)
        mesh.position.set(x * RANGE, y * RANGE, z * RANGE)
        mesh.scale.setScalar(RANGE * Math.sin(rad(target.radius)))
      }
      pointArrow(state.targets[0])
      renderer.render(scene, camera)
    },
    dispose() {
      observer.disconnect()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose()
          for (const m of [o.material].flat()) m.dispose()
        }
      })
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }
}
