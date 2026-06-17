"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { ControlSlider } from "@/features/controller/shared/ControlSlider"
import type { ShapeFamily, ShapeMode } from "./shapeGeneratorTypes"
import { shapeFamilyOptions } from "./shapeGeneratorTypes"
import {
  buildShape,
  clearGroup,
  getNearestPolyhedronSideCount,
} from "./shapeGeneratorThree"

type SceneHandle = {
  camera: THREE.PerspectiveCamera
  group: THREE.Group
  renderer: THREE.WebGLRenderer
  render(): void
}

export function ShapeGeneratorView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<SceneHandle | null>(null)
  const [mode, setMode] = useState<ShapeMode>("2d")
  const [shapeFamily, setShapeFamily] = useState<ShapeFamily>("prism")
  const [sides, setSides] = useState(6)
  const [size, setSize] = useState(1.7)
  const [rotation, setRotation] = useState(0)
  const [angleBias, setAngleBias] = useState(0)
  const [sideVariation, setSideVariation] = useState(0)
  const [depth, setDepth] = useState(1.1)
  const [bevel, setBevel] = useState(0.04)
  const [twist, setTwist] = useState(0)
  const [taper, setTaper] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const group = new THREE.Group()
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
    const rimLight = new THREE.DirectionalLight(0xff8f3c, 0.85)
    const fillLight = new THREE.HemisphereLight(0x8ee6ff, 0x050505, 1.2)

    renderer.setClearColor(0x050608, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene.background = new THREE.Color(0x050608)
    scene.add(group)
    camera.position.set(0, 0, 7)
    keyLight.position.set(2.5, 4, 5)
    rimLight.position.set(-4, 2, -3)
    scene.add(keyLight, rimLight, fillLight)

    const render = () => {
      renderer.render(scene, camera)
    }

    const handleResize = () => {
      const width = canvas.clientWidth || window.innerWidth
      const height = canvas.clientHeight || window.innerHeight

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      render()
    }

    sceneRef.current = {
      camera,
      group,
      renderer,
      render,
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      clearGroup(group)
      renderer.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current

    if (!scene) {
      return
    }

    clearGroup(scene.group)
    scene.group.add(
      buildShape({
        family: shapeFamily,
        mode,
        parameters: {
          angleBias,
          bevel,
          depth,
          sideVariation,
          sides,
          size,
          taper,
          twist,
        },
        rotation,
      }),
    )
    scene.camera.position.set(0, mode === "3d" ? 0.35 : 0, 7)
    scene.camera.lookAt(0, 0, 0)
    scene.render()
  }, [
    angleBias,
    bevel,
    depth,
    mode,
    rotation,
    shapeFamily,
    sideVariation,
    sides,
    size,
    taper,
    twist,
  ])

  const isPolygonal3D =
    mode === "3d" && (shapeFamily === "prism" || shapeFamily === "pyramid")
  const isSphere = mode === "3d" && shapeFamily === "sphere"
  const isPolyhedron = mode === "3d" && shapeFamily === "polyhedron"
  const showSides = mode === "2d" || isPolygonal3D || isSphere || isPolyhedron
  const showAngleBias = mode === "2d" || isPolygonal3D
  const showSideVariation = mode === "2d" || isPolygonal3D || isSphere
  const showBevel = mode === "3d" && shapeFamily === "prism"
  const showTwistAndTaper = mode === "3d" && shapeFamily !== "pyramid"
  const sideSliderValue = isPolyhedron
    ? getNearestPolyhedronSideCount(sides)
    : sides
  const sideSliderMin = isPolyhedron ? 4 : 3
  const sideSliderMax = isPolyhedron ? 20 : 24

  return (
    <main className="shape-generator-shell">
      <canvas ref={canvasRef} className="shape-generator-canvas" />

      <header className="shape-generator-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Shape Generator</h1>
        </div>
      </header>

      <section className="shape-control-panel" aria-label="Shape controls">
        <div className="mode-toggle" role="group" aria-label="Shape dimension">
          <button
            type="button"
            data-active={mode === "2d"}
            aria-pressed={mode === "2d"}
            onClick={() => setMode("2d")}
          >
            2D
          </button>
          <button
            type="button"
            data-active={mode === "3d"}
            aria-pressed={mode === "3d"}
            onClick={() => setMode("3d")}
          >
            3D
          </button>
        </div>

        {mode === "3d" ? (
          <label className="control-field">
            <span>Form</span>
            <select
              value={shapeFamily}
              onChange={(event) =>
                setShapeFamily(event.target.value as ShapeFamily)
              }
            >
              {shapeFamilyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showSides ? (
          <ControlSlider
            label={isSphere ? "Segments" : "Sides"}
            value={sideSliderValue}
            min={sideSliderMin}
            max={sideSliderMax}
            step={1}
            onValueChange={(value) =>
              setSides(isPolyhedron ? getNearestPolyhedronSideCount(value) : value)
            }
          />
        ) : null}
        <ControlSlider
          label="Size"
          value={size}
          min={0.7}
          max={2.6}
          step={0.1}
          onValueChange={setSize}
        />
        <ControlSlider
          label="Rotation"
          value={rotation}
          min={0}
          max={360}
          step={1}
          onValueChange={setRotation}
        />
        {showAngleBias ? (
          <ControlSlider
            label="Angle Bias"
            value={angleBias}
            min={-1}
            max={1}
            step={0.01}
            onValueChange={setAngleBias}
          />
        ) : null}
        {showSideVariation ? (
          <ControlSlider
            label="Side Variation"
            value={sideVariation}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setSideVariation}
          />
        ) : null}
        {mode === "3d" ? (
          <>
            <ControlSlider
              label="Depth"
              value={depth}
              min={0.2}
              max={3}
              step={0.1}
              onValueChange={setDepth}
            />
            {showBevel ? (
              <ControlSlider
                label="Bevel"
                value={bevel}
                min={0}
                max={0.18}
                step={0.01}
                onValueChange={setBevel}
              />
            ) : null}
            {showTwistAndTaper ? (
              <>
                <ControlSlider
                  label="Twist"
                  value={twist}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={setTwist}
                />
                <ControlSlider
                  label="Taper"
                  value={taper}
                  min={0.25}
                  max={1.8}
                  step={0.01}
                  onValueChange={setTaper}
                />
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
