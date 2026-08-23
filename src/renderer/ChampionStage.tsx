import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"

/**
 * The champion, idling on a pedestal.
 *
 * ⚠️ Three decoders, all of them REQUIRED by the file rather than optional
 * optimisations — the glTF lists KHR_mesh_quantization, EXT_meshopt_compression
 * and KHR_texture_basisu under extensionsRequired. Miss any one and the load
 * fails outright rather than degrading, which is why they are wired before
 * anything else and why the transcoder is shipped as real files.
 *
 * The materials are KHR_materials_unlit, so there are no lights in this scene
 * and there should not be: the model carries the game's own shading baked in,
 * and lighting it again would be lighting it twice.
 *
 * The renderer is torn down completely on unmount — context, geometries,
 * textures. A WebGL context left behind by a screen the player closed is a
 * context the driver keeps, and there are only so many.
 */
type Props = {
  championId: string
  championKey: number
  className?: string
}

/** Riot's own animation names. Idle1 is the one every champion has; the rest
 *  exist on some and not others, so the fallback chain matters. */
const IDLE = ["Idle1", "idle1", "Idle", "idle", "Idle2"]

export default function ChampionStage({ championId, championKey, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let raf = 0
    let renderer: THREE.WebGLRenderer | null = null
    let mixer: THREE.AnimationMixer | null = null
    let ktx2: KTX2Loader | null = null
    const scene = new THREE.Scene()
    const clock = new THREE.Clock()

    // Clip planes are set from the model once it is measured, NOT here: these
    // files come out about one unit tall, and a near plane of 1 on a one-unit
    // model clips the whole champion away. Measured, not assumed.
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)

    const start = async () => {
      const buf = await window.desktop.model(championId, championKey).catch(() => null)
      if (disposed) return
      if (!buf) return setState("failed")

      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        host.appendChild(renderer.domElement)
        renderer.domElement.style.width = "100%"
        renderer.domElement.style.height = "100%"
        renderer.domElement.style.display = "block"

        ktx2 = new KTX2Loader()
          // Real files, kept under their own names in public/basis: the loader
          // appends the filenames to this path, so a hashed asset URL would not
          // do.
          .setTranscoderPath("./basis/")
          .detectSupport(renderer)

        const loader = new GLTFLoader()
        loader.setKTX2Loader(ktx2)
        loader.setMeshoptDecoder(MeshoptDecoder)

        const gltf = await loader.parseAsync(buf, "")
        if (disposed) return

        const model = gltf.scene

        // Framed from the bounding box, never from a constant. These come out
        // around 1-2 units tall — verified, not assumed — and a champion is
        // anywhere from Teemo to Cho'Gath, so every distance below is a
        // multiple of the measured height.
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const centre = box.getCenter(new THREE.Vector3())
        // Guarded against zero, not against "small": these models are about a
        // unit tall, so clamping to 1 would silently re-frame every champion
        // shorter than that.
        const height = Math.max(1e-4, size.y)

        model.position.sub(centre)
        model.position.y += height / 2 // stand it ON the pedestal, not through it

        const rig = new THREE.Group()
        rig.add(model)
        scene.add(rig)

        camera.position.set(0, height * 0.62, height * 2.15)
        camera.lookAt(0, height * 0.48, 0)
        camera.near = height / 60
        camera.far = height * 60
        camera.updateProjectionMatrix()

        scene.add(pedestal(Math.max(size.x, size.z) * 0.62))

        const clip =
          IDLE.map((n) => gltf.animations.find((a) => a.name === n)).find(Boolean) ??
          gltf.animations[0]
        if (clip) {
          mixer = new THREE.AnimationMixer(model)
          mixer.clipAction(clip).play()
        }

        const resize = () => {
          const r = host.getBoundingClientRect()
          if (!renderer || r.width < 2 || r.height < 2) return
          renderer.setSize(r.width, r.height, false)
          camera.aspect = r.width / r.height
          camera.updateProjectionMatrix()
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(host)

        setState("ready")

        const frame = () => {
          raf = requestAnimationFrame(frame)
          if (document.hidden || !renderer) return
          const dt = clock.getDelta()
          mixer?.update(dt)
          // A slow turn, so the model is a subject rather than a photograph.
          rig.rotation.y += dt * 0.22
          renderer.render(scene, camera)
        }
        raf = requestAnimationFrame(frame)

        return () => ro.disconnect()
      } catch (e) {
        console.error("[stage]", e)
        if (!disposed) setState("failed")
      }
    }

    void start()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      mixer?.stopAllAction()
      ktx2?.dispose()
      // Everything the GPU is holding, by hand: three does not do this for you
      // and a leaked context is one the driver keeps.
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose?.()
      })
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [championId, championKey])

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />

      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.24em] text-flash/25">
            {state === "loading" ? "summoning" : "no model for this champion"}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The pedestal.
 *
 * Rings rather than a solid plinth: the app draws in line, and a shaded
 * cylinder under an unlit model would be the only object in the scene
 * pretending there is a light.
 */
function pedestal(radius: number): THREE.Group {
  const g = new THREE.Group()
  const jade = 0x00d992

  const ring = (r: number, opacity: number) => {
    const geo = new THREE.RingGeometry(r * 0.985, r, 96)
    const mat = new THREE.MeshBasicMaterial({
      color: jade,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    return mesh
  }

  g.add(ring(radius, 0.55))
  g.add(ring(radius * 1.22, 0.22))
  g.add(ring(radius * 1.5, 0.09))

  // Four ticks on the diagonals — the same mark the overlay uses at the point
  // where a line changes its mind.
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 4) + (i * Math.PI) / 2
    const geo = new THREE.PlaneGeometry(radius * 0.06, radius * 0.06)
    const mat = new THREE.MeshBasicMaterial({ color: jade, transparent: true, opacity: 0.5, depthWrite: false })
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = Math.PI / 4
    // Just clear of the rings, in the model's own units — a fixed offset would
    // be under the floor on one champion and at head height on another.
    m.position.set(Math.cos(a) * radius * 1.22, radius * 0.004, Math.sin(a) * radius * 1.22)
    g.add(m)
  }

  return g
}
