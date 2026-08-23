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

/**
 * The idle clip.
 *
 * ⚠️ Searched, not looked up. A list of exact names missed champions whose
 * clips are named differently — and the fallback was animations[0], which on
 * Nocturne is "Attack1", so the recap opened on a champion swinging at
 * nothing. Anything matching /idle/ is an idle; the exact "Idle1" is merely
 * preferred among them.
 */
function idleClip(clips: { name: string }[]): { name: string } | undefined {
  const idles = clips.filter((c) => /idle/i.test(c.name))
  return (
    idles.find((c) => /^idle_?1$/i.test(c.name)) ??
    idles.find((c) => /^idle/i.test(c.name)) ??
    idles[0] ??
    // No idle at all: better a still pose than a champion mid-attack.
    undefined
  )
}

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

        // ⚠️ POSE FIRST, then measure. Bounds mean nothing until the bones
        // are where the idle puts them.
        const clip = idleClip(gltf.animations) as THREE.AnimationClip | undefined
        if (clip) {
          mixer = new THREE.AnimationMixer(model)
          mixer.clipAction(clip).play()
          mixer.update(0.5)
        }
        model.updateMatrixWorld(true)

        const box = posedBounds(model)
        const size = box.getSize(new THREE.Vector3())

        /**
         * ⚠️ The model is NOT moved. Measured on real files: centre.x is 0 and
         * min.y is 0 on every grounded champion, so Riot authors these with the
         * origin at the ground contact point, already centred. The game places
         * them exactly this way.
         *
         * It used to be re-centred on the bounding box, and that is what put
         * Ambessa off her pedestal: her unposed box is 4.4 x 2.9 with its
         * centre 0.45 forward, so "centring" shoved her backwards off a
         * pedestal that was already right. Nocturne floats a unit off the
         * ground and SHOULD — he is a wraith — which a floor-snap would also
         * have broken.
         */
        const rig = new THREE.Group()
        rig.add(model)
        scene.add(rig)

        // Top of the silhouette above the ground, which is what "how tall is
        // this champion" means for framing.
        const height = Math.max(1e-4, box.max.y)

        // Further back and looking higher: the champion should sit IN the
        // panel with air around it, not fill the frame.
        camera.position.set(0, height * 0.78, height * 3.1)
        camera.lookAt(0, height * 0.42, 0)
        camera.near = height / 60
        camera.far = height * 60
        camera.updateProjectionMatrix()

        // The smaller of the real footprint and a share of the height. The
        // footprint alone is too wide for a champion who leans (Nocturne's
        // posed depth is 1.5 while he is 1.56 tall); the height alone ignores
        // how much floor a champion actually covers.
        const footprint = Math.max(size.x, size.z) / 2
        rig.add(pedestal(Math.min(footprint, height * 0.32)))

        if (!clip) {
          console.log("[stage] no idle among:", gltf.animations.map((a) => a.name).join(", "))
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
 * A bounding box that matches what is ON SCREEN.
 *
 * ⚠️ Box3.setFromObject is the wrong tool here and cost three rounds of bugs.
 * On a SkinnedMesh it unions geometry bounds from the BIND POSE, which for
 * Ambessa is 4.4 x 2.9 x 1.6 — a T-pose with the arms out — against a real
 * posed silhouette of 1.1 x 2.0 x 1.0. Every number taken from it was wrong:
 * the pedestal came out twice too wide, the "centring" shifted champions off
 * it, and the height used for framing was a third too large.
 *
 * SkinnedMesh.computeBoundingBox() applies the current bone transforms, so it
 * describes the pose the viewer is actually looking at — provided the mixer has
 * been advanced first.
 */
function posedBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()

  root.traverse((o) => {
    const mesh = o as THREE.Mesh & { isSkinnedMesh?: boolean; boundingBox?: THREE.Box3 | null }
    if (!(mesh as THREE.Mesh).isMesh) return

    let local: THREE.Box3 | null | undefined
    if (mesh.isSkinnedMesh) {
      ;(mesh as unknown as THREE.SkinnedMesh).computeBoundingBox()
      local = mesh.boundingBox
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      local = mesh.geometry.boundingBox
    }
    if (local) box.union(local.clone().applyMatrix4(mesh.matrixWorld))
  })

  return box
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
